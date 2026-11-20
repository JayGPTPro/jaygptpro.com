// Jay's private launch board for The Perfect Gift (jaygptpro.com/xmas-dash/).
//
// READ ONLY. This function never writes anywhere: every Stripe call it makes is a GET
// (see index.ts, which has no other way to reach Stripe), it sends no mail and it has no
// database. Everything it shows already lives in Stripe:
//   - an order is a Checkout Session with metadata.project = "christmas_video";
//   - its cards are on that session's metadata (films_01.., two cards per key), written by
//     christmas-films; its free launch bonus is metadata.bonus = "1", frozen at payment;
//   - a Vault free-film claim is metadata.xmas_vault = "1" on the Stripe customer.
//
// Who may read: whoever holds the key. The page sends it in the request body (never in a
// URL, so it is in no log); only its SHA-256 is here, so this public repo holds no secret.

export const KEY_SHA256 = "1533231fe52dcb9896517c53044c04a7c4f7598ce4b577dcaa878a1b27c9853b";

export const VIDEO_PRODUCT = "prod_VdK0ykqQR23ctI";
export const SKILL_PRODUCT = "prod_VdK0WmRf7Cgnvy";
export const PROJECT = "christmas_video";
export const VAULT_COUPON = "VAULT_FIRST_FILM";
// Partners who sell through their own copy of the page and their own Stripe links, which stamp
// metadata.partner on every order (22.11.2026: partner p1, jaygptpro.com/xmas). Listed here so the
// board shows a partner from day one, before the first order.
export const PARTNERS = ["p1"];
// The Vault free Skill (Jay, 20.11.2026; opens with November's Vault episode): a $0 Skill checkout with this
// coupon and metadata.offer "vault_skill". Stripe marks it "paid". It is a claim, not a sale.
export const VAULT_SKILL_COUPON = "VAULT_FREE_SKILL";

const H = 3600;
// Israel is UTC+2 until 26.3.2027 and Pacific is UTC-8 until 14.3.2027, so for this launch
// (orders until 9.12, films until mid-December) both offsets are fixed numbers.
const IL = 2 * H;
const PST = -8 * H;

export const LAUNCH = Date.UTC(2026, 10, 19, 22, 0, 0) / 1000;      // Fri 20.11 00:00 Israel
export const FETCH_FROM = Date.UTC(2026, 10, 17, 0, 0, 0) / 1000;   // the first Christmas links
export const BONUS_START = Date.UTC(2026, 10, 19, 8, 0, 0) / 1000;  // as in christmas-films
export const BONUS_END = Date.UTC(2026, 10, 24, 8, 0, 0) / 1000;
export const KIT_OPEN_AT = Date.UTC(2026, 10, 22, 18, 0, 0) / 1000; // as in stripe-webhook
// The promise to the buyer: each film within 48 hours, counted in business days, from the
// moment its card is saved (buyer mail in stripe-webhook, "Due" row in christmas-films).
export const FILM_HOURS = 48;

// deno-lint-ignore no-explicit-any
type Any = any;

export type Card = { link: string; asin: string; giver: string; receiver: string; savedAt: number | null };
export type Promo = { code: string; coupon: string };
export type Input = { sessions: Any[]; promos: Record<string, Promo>; vault: Any[] | null; vaultError?: string; now: number };

export function ilDay(t: number): string {
  return new Date((t + IL) * 1000).toISOString().slice(0, 10);
}

// 48 business hours: the clock runs Monday to Friday, Pacific time, and stands still on
// Saturday and Sunday. A card saved on Saturday starts the clock on Monday 00:00 Pacific.
export function addBusinessHours(start: number, hours: number): number {
  let t = start, left = hours * H;
  for (let guard = 0; left > 0 && guard < 60; guard++) {
    const local = new Date((t + PST) * 1000);
    const nextMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) / 1000 - PST;
    const dow = local.getUTCDay();
    if (dow === 0 || dow === 6) { t = nextMidnight; continue; }
    const step = Math.min(left, nextMidnight - t);
    t += step; left -= step;
  }
  return t;
}

export function asinOf(link: string): string {
  const m = String(link || "").match(/\/dp\/([A-Z0-9]{10})(?:[/?#]|$)/i);
  return m ? m[1].toUpperCase() : "";
}

// The cards christmas-films keeps: films_NN holds two cards, [link, giver, receiver, savedAt?].
export function readCards(meta: Record<string, string>, total: number): (Card | null)[] {
  const out: (Card | null)[] = [];
  for (let n = 1; n <= total; n++) {
    let pair: unknown = null;
    try { pair = JSON.parse(meta?.["films_" + String(Math.ceil(n / 2)).padStart(2, "0")] || "null"); } catch { pair = null; }
    const row = Array.isArray(pair) ? pair[(n - 1) % 2] : null;
    if (Array.isArray(row) && row[0]) {
      const at = Number(row[3]);
      out.push({ link: String(row[0]), asin: asinOf(String(row[0])), giver: String(row[1] || ""), receiver: String(row[2] || ""), savedAt: at > 1e9 ? at : null });
    } else out.push(null);
  }
  return out;
}

const idOf = (v: Any): string => (typeof v === "string" ? v : (v?.id || ""));

export type Order = {
  id: string; kind: "film" | "skill"; created: number; paid: boolean; paidAt: number;
  email: string; name: string; films: number; skills: number;
  usd: number | null;              // cents, what the buyer paid in US dollars
  refunded: number;                // cents refunded, in US dollars
  fullyRefunded: boolean;
  bonus: "yes" | "no" | "unknown"; // unknown: paid in the bonus window, not decided yet
  vaultCoupon: boolean;
  vaultSkill: boolean;             // a Vault member's free Skill: listed with the Vault claims, never a sale
  vaultShared: boolean;            // the ONE shared $0 kit session for the whole Vault (metadata.vault_shared "1")
  test: string[];                  // why this is one of Jay's own tests (empty: a real order)
  status: string;                  // Stripe: open, complete, expired
  failed: string;                  // a declined payment attempt, if any
  paymentIntent: string;
  partner: string;                 // metadata.partner from a partner's own Stripe link, "" for Jay's links
  meta: Record<string, string>;
};

export function classify(s: Any, promos: Record<string, Promo>): Order | null {
  let films = 0, skills = 0;
  for (const it of (s?.line_items?.data || [])) {
    const p = idOf(it?.price?.product), q = Number(it?.quantity ?? 1);
    if (p === VIDEO_PRODUCT) films += q;
    if (p === SKILL_PRODUCT) skills += q;
  }
  if (s?.metadata?.project !== PROJECT && !films && !skills) return null;
  if (!films && !skills) return null; // a Christmas session we cannot read the items of
  const email = String(s?.customer_details?.email || s?.customer_email || "").toLowerCase();
  const codes: string[] = [], coupons: string[] = [];
  for (const d of (s?.discounts || [])) {
    const pid = idOf(d?.promotion_code);
    if (pid && promos[pid]) { codes.push(promos[pid].code); coupons.push(promos[pid].coupon); }
    const c = idOf(d?.coupon);
    if (c) coupons.push(c);
  }
  const test: string[] = [];
  if (s?.metadata?.test === "true") test.push("marked test");
  for (const c of codes) if (/test/i.test(c)) test.push("code " + c);
  if (email.endsWith("@jaygptpro.com")) test.push("Jay's own email");
  const pi = typeof s?.payment_intent === "object" ? s.payment_intent : null;
  const charge = pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const paid = s?.payment_status === "paid" || (s?.status === "complete" && s?.payment_status === "no_payment_required");
  const conv = s?.currency_conversion;
  const usd = conv && String(conv.source_currency || "").toLowerCase() === "usd" ? Number(conv.amount_total)
    : String(s?.currency || "").toLowerCase() === "usd" ? Number(s?.amount_total ?? 0) : null;
  const refunded = !charge || usd == null ? 0 : charge.refunded ? usd
    : charge.amount > 0 ? Math.round(usd * Number(charge.amount_refunded || 0) / Number(charge.amount)) : 0;
  const meta = (s?.metadata || {}) as Record<string, string>;
  const paidAt = paid ? Number(charge?.created || s?.created || 0) : 0;
  let bonus: Order["bonus"] = meta.bonus === "1" ? "yes" : "no";
  if (!meta.bonus && paid && films > 0 && paidAt >= BONUS_START && paidAt < BONUS_END) bonus = "unknown";
  return {
    id: String(s?.id || ""), kind: films > 0 ? "film" : "skill", created: Number(s?.created || 0), paid, paidAt,
    email, name: String(s?.customer_details?.name || ""), films, skills, usd, refunded,
    fullyRefunded: !!charge?.refunded, bonus, vaultCoupon: coupons.includes(VAULT_COUPON),
    vaultSkill: meta.offer === "vault_skill" || coupons.includes(VAULT_SKILL_COUPON), vaultShared: meta.vault_shared === "1", test,
    status: String(s?.status || ""), failed: !paid && pi?.last_payment_error ? String(pi.last_payment_error.message || pi.last_payment_error.code || "declined") : "",
    paymentIntent: idOf(s?.payment_intent), partner: String(meta.partner || ""), meta,
  };
}

const net = (o: Order) => (o.usd ?? 0) - o.refunded;

export function build(input: Input) {
  const { now } = input;
  const all = input.sessions.map((s) => classify(s, input.promos)).filter((o): o is Order => !!o);
  // Sales, checkouts and conversion count real buyers only: not Jay's tests, not Vault Skill claims.
  const real = all.filter((o) => !o.test.length && !o.vaultSkill);
  const sold = real.filter((o) => o.paid && !o.fullyRefunded);

  // Sales and checkouts per Israel day, from launch day to today.
  type Day = { day: string; filmOrders: number; filmsPaid: number; bonusFilms: number; filmUsd: number;
    skillOrders: number; skillUsd: number; opened: number; openedFilm: number; openedSkill: number; paidOfOpened: number };
  const days: Day[] = [];
  const blank = (day: string): Day => ({ day, filmOrders: 0, filmsPaid: 0, bonusFilms: 0, filmUsd: 0, skillOrders: 0, skillUsd: 0, opened: 0, openedFilm: 0, openedSkill: 0, paidOfOpened: 0 });
  for (let t = LAUNCH; ilDay(t) <= ilDay(now); t += 24 * H) days.push(blank(ilDay(t)));
  const at = (t: number): Day => {
    if (t < LAUNCH) {
      let b = days.find((d) => d.day === "before");
      if (!b) { b = blank("before"); days.unshift(b); }
      return b;
    }
    const k = ilDay(t);
    let d = days.find((x) => x.day === k);
    if (!d) { d = blank(k); days.push(d); }
    return d;
  };
  for (const o of sold) {
    const d = at(o.paidAt);
    if (o.kind === "film") {
      d.filmOrders++; d.filmsPaid += o.films; d.filmUsd += net(o);
      if (o.bonus === "yes") d.bonusFilms++;
    } else { d.skillOrders++; d.skillUsd += net(o); }
  }
  for (const o of real) {
    if (o.created < LAUNCH) continue;
    const d = at(o.created);
    d.opened++;
    if (o.kind === "film") d.openedFilm++; else d.openedSkill++;
    if (o.paid) d.paidOfOpened++;
  }
  const sum = (k: keyof Day) => days.reduce((a, d) => a + (d[k] as number), 0);
  const totals = {
    filmOrders: sum("filmOrders"), filmsPaid: sum("filmsPaid"), bonusFilms: sum("bonusFilms"), filmUsd: sum("filmUsd"),
    skillOrders: sum("skillOrders"), skillUsd: sum("skillUsd"), opened: sum("opened"), openedFilm: sum("openedFilm"),
    openedSkill: sum("openedSkill"), paidOfOpened: sum("paidOfOpened"),
  };

  // Every film to make: paid films + the bonus film, one row per film, with its card. Jay's own
  // test orders are in here too, marked: he runs them through production like a customer (20.11).
  // They stay out of the sales and checkout numbers above.
  const films = [];
  for (const o of all.filter((x) => x.paid && !x.fullyRefunded && x.kind === "film")) {
    const total = o.films + (o.bonus === "yes" ? 1 : 0);
    const cards = readCards(o.meta, total);
    for (let n = 1; n <= total; n++) {
      const card = cards[n - 1];
      const start = card ? (card.savedAt ?? o.paidAt) : null;
      films.push({
        order: o.id, n, total, bonus: o.bonus === "yes" && n === total, bonusUnknown: o.bonus === "unknown",
        vaultCoupon: o.vaultCoupon, email: o.email, name: o.name, paidAt: o.paidAt, card,
        clock: card ? (card.savedAt ? "card" : "payment") : null,
        start, deadline: start ? addBusinessHours(start, FILM_HOURS) : null,
        test: o.test, partner: o.partner,
        cardsUrl: `https://jaygptpro.com/christmas-video/thanks/?p=${total > 1 ? "pack" : "video"}&s=${o.id}`,
        stripeUrl: o.paymentIntent ? `https://dashboard.stripe.com/payments/${o.paymentIntent}` : "",
      });
    }
  }
  films.sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || a.paidAt - b.paidAt || a.n - b.n);

  // Vault free-film claims, recorded on the Stripe customer by christmas-films.
  const vault = (input.vault || []).map((c: Any) => {
    const m = c?.metadata || {};
    const [giver = "", receiver = ""] = String(m.xmas_vault_roles || "").split(" to ");
    const email = String(c?.email || "").toLowerCase();
    return {
      email, name: String(c?.name || ""), claimedAt: Math.floor(Date.parse(m.xmas_vault_at || "") / 1000) || Number(c?.created || 0),
      link: String(m.xmas_vault_link || ""), asin: asinOf(String(m.xmas_vault_link || "")), giver, receiver,
      test: email.endsWith("@jaygptpro.com") ? ["Jay's own email"] : [],
    };
  }).sort((a, b) => a.claimedAt - b.claimedAt);

  // The Skill: who paid before the kit opens on Sunday 22.11 (they get the "kit is open" mail).
  // Jay's own tests are listed too, marked, so he sees them go through like a customer (20.11).
  const skill = all.filter((o) => o.paid && !o.fullyRefunded && o.kind === "skill" && !o.vaultSkill).map((o) => ({
    email: o.email, name: o.name, paidAt: o.paidAt, usd: net(o), beforeOpen: o.paidAt < KIT_OPEN_AT, order: o.id, test: o.test, partner: o.partner,
  })).sort((a, b) => a.paidAt - b.paidAt);

  // Vault free Skill: since 22.11 ONE shared $0 kit session for the whole Vault (open link, no email check),
  // so members cannot be counted one by one; any per-member claim still lists as its own row.
  const vaultSkill = all.filter((o) => o.vaultSkill && o.paid).map((o) => ({
    email: o.email, name: o.name, claimedAt: o.paidAt, order: o.id, shared: o.vaultShared,
    test: o.vaultShared ? [] : o.test,   // the shared link is made with Jay's own email on purpose: not a test
    kitUrl: `https://jaygptpro.com/christmas-video/kit/?s=${o.id}`,
  })).sort((a, b) => a.claimedAt - b.claimedAt);

  // Checkouts opened since launch and not paid.
  const unpaid = real.filter((o) => !o.paid && o.created >= LAUNCH).map((o) => ({
    created: o.created, kind: o.kind, qty: o.kind === "film" ? o.films : o.skills, usd: o.usd, status: o.status,
    email: o.email, failed: o.failed, partner: o.partner,
  })).sort((a, b) => b.created - a.created);

  const refunds = real.filter((o) => o.paid && o.refunded > 0).map((o) => ({
    paidAt: o.paidAt, kind: o.kind, email: o.email, usd: o.usd, refunded: o.refunded, full: o.fullyRefunded,
  }));

  const tests = all.filter((o) => o.test.length && o.paid && !o.vaultSkill).map((o) => ({
    paidAt: o.paidAt, kind: o.kind, qty: o.kind === "film" ? o.films : o.skills, usd: o.usd, email: o.email,
    why: o.test, bonus: o.bonus, refunded: o.refunded, fullyRefunded: o.fullyRefunded,
  })).sort((a, b) => b.paidAt - a.paidAt);
  const testOpens = all.filter((o) => o.test.length && !o.vaultSkill && !o.paid && o.created >= LAUNCH).length;

  // Each partner's own sales (orders from their Stripe links). These orders are ALSO inside the
  // day table and totals above; this only splits them out, by the same rules (real orders, USD,
  // net of refunds, fully refunded orders drop out).
  const partners = [...new Set([...PARTNERS, ...real.map((o) => o.partner).filter(Boolean)])].map((name) => {
    const mine = real.filter((o) => o.partner === name);
    const paid = mine.filter((o) => o.paid);
    const kept = paid.filter((o) => !o.fullyRefunded);
    const film = kept.filter((o) => o.kind === "film"), sk = kept.filter((o) => o.kind === "skill");
    return {
      name,
      filmOrders: film.length, filmsPaid: film.reduce((a, o) => a + o.films, 0), filmUsd: film.reduce((a, o) => a + net(o), 0),
      skillOrders: sk.length, skillUsd: sk.reduce((a, o) => a + net(o), 0),
      refundedUsd: paid.reduce((a, o) => a + o.refunded, 0),
      opened: mine.filter((o) => o.created >= LAUNCH).length,
      orders: paid.map((o) => ({
        paidAt: o.paidAt, kind: o.kind, qty: o.kind === "film" ? o.films : o.skills, usd: o.usd,
        refunded: o.refunded, full: o.fullyRefunded, email: o.email, name: o.name,
      })).sort((a, b) => b.paidAt - a.paidAt),
    };
  });

  return {
    generatedAt: now, launch: LAUNCH, kitOpenAt: KIT_OPEN_AT, bonusEnd: BONUS_END, filmHours: FILM_HOURS,
    days, totals, films, vault, vaultError: input.vaultError || "", vaultSkill, skill, unpaid, refunds, tests, testOpens, partners,
  };
}

// ---------------------------------------------------------------- the request

export type Deps = {
  sessions: () => Promise<Any[]>;
  promos: () => Promise<Record<string, Promo>>;
  vault: () => Promise<Any[]>;
  now: () => number;
  keyHash?: string; // tests only; the deployed function always uses KEY_SHA256
};

const ALLOWED = /^(https:\/\/(www\.)?jaygptpro\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.test(o) ? o : "https://jaygptpro.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store, private, max-age=0" },
  });
}

export async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method not allowed" }, 405);
  const key = (await req.text()).trim().slice(0, 200);
  if (!key || (await sha256hex(key)) !== (deps.keyHash || KEY_SHA256)) return json(req, { error: "Unauthorized" }, 401);
  const [sessions, promos] = await Promise.all([deps.sessions(), deps.promos()]);
  let vault: Any[] | null = null, vaultError = "";
  try { vault = await deps.vault(); } catch (e) { vaultError = String((e as Error)?.message || e); }
  return json(req, build({ sessions, promos, vault, vaultError, now: deps.now() }));
}
