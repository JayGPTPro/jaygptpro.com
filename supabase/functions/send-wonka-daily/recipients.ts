// Extracted from index.ts so it can be tested without Deno.serve binding a
// port on import. index.ts imports from here; there is one copy of the logic.

export const SEND_TO_TYPES = ["paid", "family", "admin", "free"];

// ---------------------------------------------------------------------------
// Who is a person, and which address do we actually mail?
//
// allowed_emails holds one row per ADDRESS, not per human. A customer who signs
// in with a different Google account than the one they paid with has two rows,
// linked by primary_email. On 30.8.2026 wonka_r1 held 81 rows for 57 people.
//
// The old filter was `!primary_email`, i.e. "keep only canonical rows". That is
// wrong in one specific way that cost two PAYING customers their mail:
//
//   tc@besttopbuysonline.com -> 9269233@gmail.com -> tpcgolfer@sbcglobal.net
//
// primary_email chains, and the address at the END of that chain has no row in
// wonka_r1 at all. So every row in the chain was dropped as "an alias", and the
// canonical row they pointed at did not exist to be kept. Ted Cheron, $497, and
// j_toshack, both silently unreachable. Nothing errored. The count just read 51.
//
// So: group rows into humans by following the chain to its root, then pick ONE
// address per human that actually EXISTS as a row. Never drop a human because
// the row they point at is missing.
export type Row = {
  email: string; customer_type: string | null; primary_email: string | null;
  welcome_email_sent_at: string | null; created_at: string | null;
};

export // Grouping addresses into people is a CONNECTED COMPONENTS problem, not a walk.
//
// Walking primary_email looks right and is subtly wrong: with a two-way link
// a -> b and b -> a, walking from a stops at b and walking from b stops at a,
// so one person resolves to two roots and gets two copies of every email. A
// tail feeding a cycle (a -> b -> c -> b) is worse, because the answer then
// depends on where you entered. Union-find gives every address in a component
// the same root no matter which one you start from, and a target with no row of
// its own (tpcgolfer@sbcglobal.net) still joins the component that points at it.
class Union {
  private parent = new Map<string, string>();
  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) { this.parent.set(x, x); return x; }
    if (p === x) return x;
    const r = this.find(p);
    this.parent.set(x, r); // path compression
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return;
    // Smaller address wins, so the root is stable across runs and independent
    // of the order Postgres happened to return the rows in.
    if (ra < rb) this.parent.set(rb, ra); else this.parent.set(ra, rb);
  }
}

export function rootOf(email: string, rows: Row[]): string {
  return buildUnion(rows).find(email.toLowerCase().trim());
}

function buildUnion(rows: Row[]): Union {
  const u = new Union();
  for (const r of rows) {
    const e = r.email.toLowerCase().trim();
    u.find(e);
    const p = (r.primary_email || "").toLowerCase().trim();
    if (p) u.union(e, p);
  }
  return u;
}

// One person, the address we will mail them on, and EVERY address they own.
//
// `addresses` exists because the guard table records the address that was
// actually mailed, while `pick` can legitimately move between runs: Ted Cheron
// has no canonical row today so he is mailed on an alias, and the moment anyone
// adds tpcgolfer@sbcglobal.net as a real row the canonical branch starts winning.
// A guard lookup on `pick` alone would then miss, and he would receive a second
// copy of an email he already has. Checking every address he owns cannot miss.
export type Person = { pick: Row; addresses: string[]; all: Row[] };

export function resolveGroups(rows: Row[]): Person[] {
  const live = rows.filter((r) => SEND_TO_TYPES.includes(String(r.customer_type || "paid")));
  const u = buildUnion(live);

  const groups = new Map<string, Row[]>();
  for (const r of live) {
    const k = u.find(r.email.toLowerCase().trim());
    const g = groups.get(k) || [];
    g.push(r);
    groups.set(k, g);
  }

  const out: Person[] = [];
  for (const g of groups.values()) {
    // Prefer the canonical row when one is actually present. Otherwise the alias
    // that already received a welcome, and failing that the oldest row, so the
    // choice is stable between runs and never depends on row order.
    const canonical = g.find((r) => !r.primary_email);
    const welcomed = g.filter((r) => r.welcome_email_sent_at)
      .sort((a, b) => String(a.welcome_email_sent_at).localeCompare(String(b.welcome_email_sent_at)))[0];
    const oldest = [...g].sort((a, b) =>
      String(a.created_at || "").localeCompare(String(b.created_at || "")) ||
      a.email.localeCompare(b.email))[0];
    const pick = canonical || welcomed || oldest;
    if (!pick) continue;
    // Every address in the component, plus any primary_email target that has no
    // row of its own. That target is a real address this person signs in with,
    // and a guard row could have been written against it.
    const addresses = new Set<string>();
    for (const r of g) {
      addresses.add(r.email.toLowerCase().trim());
      const p = (r.primary_email || "").toLowerCase().trim();
      if (p) addresses.add(p);
    }
    out.push({ pick, addresses: [...addresses], all: g });
  }
  return out;
}

// Kept for callers that only want the address list.
export function resolveRecipients(rows: Row[]): Row[] {
  return resolveGroups(rows).map((p) => p.pick);
}

// When did this person become reachable?
//
// Their welcome email, on ANY address they own, not just the one we happen to
// pick. A buyer whose welcome fired on their paying address must not receive
// the preparation email before it, and the pick is not always that address.
//
// A row whose welcome never fired at all (kim@fun.delivery is one) would
// otherwise wait forever, so fall back to when the row was created.
export function readyAtGroup(p: Person): number {
  const welcomes = p.all
    .map((r) => r.welcome_email_sent_at)
    .filter(Boolean)
    .map((t) => Date.parse(String(t)))
    .filter((n) => Number.isFinite(n));
  if (welcomes.length) return Math.min(...welcomes);

  const created = p.all
    .map((r) => r.created_at)
    .filter(Boolean)
    .map((t) => Date.parse(String(t)))
    .filter((n) => Number.isFinite(n));
  return created.length ? Math.min(...created) : NaN;
}
