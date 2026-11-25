// "Your films" cards for the Christmas video (jaygptpro.com/christmas-video/thanks/).
// The checkout takes the payment only. After it, the buyer fills one card per video bought:
// the product link, who gives, who receives. Five videos = five cards, each its own product
// and family.
//
// GET  ?s=cs_...                              -> { qty, email, films: [{ n, link, giver, receiver }] }
// POST { s, n, link, giver, receiver }        -> saves card n, mails it to Jay
//
// Where the cards live: on the Checkout Session's own metadata in Stripe, so there is no
// new table and the order and its cards sit in one place. Two cards per key, because Stripe
// allows 50 keys of 500 characters and an order can be 50 videos.
// Who may read or write: whoever holds the session id. Stripe puts it in the redirect and
// we put it in the buyer's mail; it is long and unguessable, and it only opens that order.

export const VIDEO_PRODUCT = "prod_VdK0ykqQR23ctI";
// The film as sold in the Black Friday 1+1 store (bf11-checkout, 25.11.2026). Jay sends those buyers the film card by hand.
export const BF_VIDEO_PRODUCT = "prod_Vh04NOe5P8I3nA";

// Free bonus film (Jay's launch plan, revised 19.11.2026): every customer who PAYS for at
// least one film between launch and Monday 23 November 11:59 PM Pacific time gets exactly ONE
// extra film free, however many films and orders. Judged by the moment the payment went
// through (the charge), not by when the cards are filled: the bonus is written to the order
// at payment and stays with it. One per customer, by the email they paid with: only their
// FIRST paid film order in the window. Never for a customer who took the Vault free film.
// The window opens on Thursday 19.11 00:00 PST because the page promised a bonus that day
// before the plan moved; those buyers keep it.
export const BONUS_START = Date.UTC(2026, 10, 19, 8, 0, 0) / 1000; // Thu 19.11 00:00 PST
export const BONUS_END = Date.UTC(2026, 10, 24, 8, 0, 0) / 1000;   // Tue 24.11 00:00 PST, exclusive
// Black Friday Skill price: $199 until Monday 30.11 11:59 PM PST, $299 from 1.12. The price is
// picked HERE, by the server's clock, when the checkout is made: no step to remember on 1.12.
export const BF_END = Date.UTC(2026, 11, 1, 8, 0, 0) / 1000;       // Tue 1.12 00:00 PST
export const SKILL_PRICE_BF = "price_1UdWhjRqcDuiISNTODc4cSas";    // $199
export const SKILL_PRICE_FULL = "price_1Uc3M6RqcDuiISNTdJqMRrRa";  // $299
// The Vault "first film free" coupon. An order that used it is the member's free film.
export const VAULT_COUPON = "VAULT_FIRST_FILM";
// The Vault gifts switch. OPEN since November's Vault episode (Jay, 24.11.2026: "מאשר לפתוח").
// Set it to false to close them again: every Vault film request is then refused here, on the
// server, and only Jay's own addresses (@jaygptpro.com) pass, for tests. The public orders, the
// cards and the bonus never pass through this switch.
export const VAULT_OPEN = true;
export const VAULT_CLOSED_MESSAGE = "The AI Vault gifts are not open right now. Questions? Write to info@jaygptpro.com.";
export const GIVERS = ["mom", "dad"] as const;
export const RECEIVERS = ["son", "daughter", "toddler", "partner"] as const;   // toddler: Jay, 19.11.2026 (a child of about 3)
const LINK_MAX = 190; // two cards must fit one 500-character metadata value

export type Film = { n: number; link: string; giver: string; receiver: string };
export type Order = {
  paid: boolean;
  qty: number;                       // videos bought, 0 when the session is not a video order
  email: string;
  name: string;
  paymentIntent: string;
  metadata: Record<string, string>;
  created: number;                   // unix seconds, when the checkout was opened
  paidAt: number;                    // unix seconds, when the payment went through (0: unknown)
  vault: boolean;                    // paid (or not) with the Vault first-film coupon
};
export type VaultCard = { name: string; link: string; giver: string; receiver: string; product?: string };
export type Deps = {
  order: (sessionId: string) => Promise<Order | null>;                       // null: no such session
  saveMeta: (sessionId: string, patch: Record<string, string>) => Promise<void>;
  mail: (subject: string, html: string, replyTo: string) => Promise<boolean>;
  // Did this email pay for another film order in the bonus window, opened before this one?
  earlierFilmOrder: (email: string, created: number, sessionId: string) => Promise<boolean>;
  vaultClaimed: (email: string) => Promise<boolean>;           // has this email taken the Vault free film?
  vaultProductClaimed: (product: string) => Promise<boolean>;  // has this product (vaultProductKey) had a Vault free film?
  // Records the member's one free film, atomically: true for exactly one request per email, even
  // when several arrive at the same moment; false when this email already has it. Throws on failure.
  vaultClaimOnce: (email: string, card: VaultCard) => Promise<boolean>;
  bonusOrder: (email: string) => Promise<boolean>;             // does this email already have a bonus film?
  skillCheckout: (price: string, ref: string) => Promise<string>; // a Stripe Checkout URL
  resolveShort?: (url: string) => Promise<string>;             // where an amzn.to / a.co link leads
  now: () => number;                                           // unix seconds
  vaultOpen?: boolean;                                         // tests only; the deployed function uses VAULT_OPEN
  askAllowed: (email: string, now: number) => boolean;         // the Vault film limiter (makeAskLimiter)
};

// 1 when this order carries the launch-day bonus film, else 0. Decided once and written to
// the session metadata ("bonus"), so the answer never changes after the buyer has seen it.
export async function bonusFor(o: Order, sessionId: string, deps: Deps): Promise<number> {
  if (o.metadata.bonus === "1") return 1;
  if (o.metadata.bonus === "0") return 0;
  if (!o.paid || o.qty < 1) return 0;
  const t = o.paidAt || o.created;
  let b = 1;
  if (t < BONUS_START || t >= BONUS_END) b = 0;
  else if (o.vault) b = 0;
  else if (!o.email) b = 0;
  else if (await deps.vaultClaimed(o.email.toLowerCase())) b = 0;
  else if (await deps.earlierFilmOrder(o.email.toLowerCase(), o.created, sessionId)) b = 0;
  if (t >= BONUS_START) {
    try { await deps.saveMeta(sessionId, { bonus: String(b) }); o.metadata.bonus = String(b); } catch { /* decided again next time */ }
  }
  return b;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store, private, max-age=0" },
  });
}
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);

export function validSession(s: unknown): s is string {
  return typeof s === "string" && /^cs_(live|test)_[A-Za-z0-9]{20,200}$/.test(s);
}

// An Amazon link is long and mostly tracking. Keep the product page, drop the rest.
// A bare ASIN: B0 and eight more, or the ten-digit ISBN form books use (last may be X).
const BARE_ASIN = /^(B0[A-Z0-9]{8}|\d{9}[\dX])$/i;
// Every way Amazon puts the ASIN in a product page path.
const ASIN_PATH = /\/(?:dp|gp\/product|gp\/aw\/d|gp\/offer-listing|o\/ASIN|exec\/obidos\/ASIN|exec\/obidos\/tg\/detail\/-)\/([A-Z0-9]{10})(?:[/?#]|$)/i;
// Amazon's short links: they only say the ASIN after a redirect.
export const SHORT_HOST = /^(?:www\.)?(?:amzn\.to|a\.co|amzn\.eu|amzn\.asia|amzn\.com)$/i;

// The product as the buyer typed it: an ASIN, any Amazon product link, or another shop's link.
// Amazon comes back as https://<host>/dp/<ASIN> (a bare ASIN as amazon.com); other links as typed.
export function cleanLink(raw: unknown): string {
  let s = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!s) return "";
  if (BARE_ASIN.test(s)) return `https://www.amazon.com/dp/${s.toUpperCase()}`;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u: URL;
  try { u = new URL(s); } catch { return ""; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return "";
  if (/(^|\.)amazon\./i.test(u.hostname)) {
    const asin = (u.pathname.match(ASIN_PATH) || [])[1] || u.searchParams.get("asin") || u.searchParams.get("ASIN") || "";
    if (/^[A-Z0-9]{10}$/i.test(asin)) return `https://${u.hostname.toLowerCase()}/dp/${asin.toUpperCase()}`;
  }
  const plain = u.origin + u.pathname;
  const full = plain + u.search;
  return (full.length <= LINK_MAX ? full : plain).slice(0, LINK_MAX);
}

// cleanLink, and an amzn.to / a.co short link is followed to the product page when it can be.
// If the short link cannot be followed, it is kept as typed, as before.
export async function cleanProduct(raw: unknown, deps: Deps): Promise<string> {
  const link = cleanLink(raw);
  if (!link || !deps.resolveShort) return link;
  let host = "";
  try { host = new URL(link).hostname; } catch { return link; }
  if (!SHORT_HOST.test(host)) return link;
  try {
    const long = cleanLink(await deps.resolveShort(link));
    if (long && /\/dp\/[A-Z0-9]{10}$/.test(long)) return long;
  } catch { /* keep the short link */ }
  return link;
}

const keyFor = (n: number) => "films_" + String(Math.ceil(n / 2)).padStart(2, "0");

export function readFilms(meta: Record<string, string>, qty: number): Film[] {
  const out: Film[] = [];
  for (let n = 1; n <= qty; n++) {
    let pair: unknown = null;
    try { pair = JSON.parse(meta[keyFor(n)] || "null"); } catch { pair = null; }
    const row = Array.isArray(pair) ? pair[(n - 1) % 2] : null;
    if (Array.isArray(row) && row[0]) out.push({ n, link: String(row[0]), giver: String(row[1] || ""), receiver: String(row[2] || "") });
  }
  return out;
}

function maskEmail(e: string): string {
  const [a, b] = e.split("@");
  if (!a || !b) return "";
  return a.slice(0, 2) + "***@" + b;
}

const WHO: Record<string, string> = { mom: "Mom", dad: "Dad", son: "Son", daughter: "Daughter", toddler: "Toddler" };
export function receiverLabel(giver: string, receiver: string): string {
  if (receiver === "partner") return giver === "mom" ? "Husband (Dad)" : "Wife (Mom)";
  return WHO[receiver] || receiver;
}

// AI Vault gifts (Jay, 20-22.11.2026): from November's Vault episode, every Vault member gets the
// Christmas Film Skill with its training and one Done For You film for one product, free.
// OPEN by Jay's choice (22.11): no email check, so members who joined with another address are
// never turned away. The Vault has ONE kit link of its own (a $0 Checkout with coupon
// VAULT_FREE_SKILL and metadata.offer "vault_skill"), posted only inside the Vault on Circle; it
// opens the kit page in its Vault mode, which holds the free-film form. A film request must carry
// that kit code, so reading this public code alone opens nothing. One film per email, recorded
// first and atomically, and never together with the public bonus film (in either order).
export const VAULT_SKILL_COUPON = "VAULT_FREE_SKILL";
export const VAULT_OFFER = "vault_skill";
const TEST_EMAIL = /@jaygptpro\.com$/i;   // Jay's own addresses pass while VAULT_OPEN is false, for live tests
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

// Each film request mails Jay, and anyone can call this function. One request per email per
// 5 minutes and at most 1000 an hour per server instance, so a script cannot flood his inbox.
export function makeAskLimiter(perEmailSec = 300, perHour = 1000) {
  const last = new Map<string, number>();
  let hourStart = -Infinity, count = 0;
  return (email: string, now: number): boolean => {
    if (now - hourStart >= 3600) { hourStart = now; count = 0; }
    if (count >= perHour) return false;
    const t = last.get(email);
    if (t !== undefined && now - t < perEmailSec) return false;
    if (last.size > 5000) last.clear();
    last.set(email, now);
    count++;
    return true;
  };
}

// One free Vault film per PRODUCT too (Fred's review, 23.11; Jay: "fix what you can"), so one product
// cannot collect films through several emails. The product is the ASIN for any Amazon link (any
// marketplace, any link form), else the cleaned link. Only letters, digits and ":" so it is safe
// inside a Stripe search query. Not atomic across two emails in the same minute (Stripe search
// lags), which is fine: Jay reviews every free film before it is made.
export async function vaultProductKey(link: string): Promise<string> {
  const asin = (link.match(/\/dp\/([A-Z0-9]{10})$/) || [])[1];
  if (asin) return "asin:" + asin;
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(link.toLowerCase())));
  return "url:" + Array.from(d.slice(0, 12), (x) => x.toString(16).padStart(2, "0")).join("");
}

async function vault(b: Record<string, unknown>, deps: Deps): Promise<Response> {
  const closed = () => json({ error: "closed", message: VAULT_CLOSED_MESSAGE }, 403);
  if (b?.vault !== "film") return closed();   // the older Vault forms are gone
  const email = String(b?.email || "").trim().toLowerCase();
  const name = String(b?.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const giver = String(b?.giver || ""), receiver = String(b?.receiver || "");
  if (!name) return json({ error: "name", message: "Please write your name." }, 400);
  if (!EMAIL.test(email)) return json({ error: "email", message: "Please write your email, so your film can reach you." }, 400);
  if (!(deps.vaultOpen ?? VAULT_OPEN) && !TEST_EMAIL.test(email)) return closed();
  const link = await cleanProduct(b?.link, deps);
  if (!link) return json({ error: "link", message: "Please paste your product's Amazon link or its ASIN." }, 400);
  if (!(GIVERS as readonly string[]).includes(giver)) return json({ error: "giver", message: "Pick who gives the gift." }, 400);
  if (!(RECEIVERS as readonly string[]).includes(receiver)) return json({ error: "receiver", message: "Pick who receives it." }, 400);
  const noKit = () => json({ error: "kit", message: "Open this form from the Vault's kit link." }, 403);
  if (!validSession(b?.s)) return noKit();
  if (!deps.askAllowed(email, deps.now())) return json({ error: "slow", message: "We got your request a moment ago. If you need to change it, write to info@jaygptpro.com." }, 429);
  const kit = await deps.order(b.s as string);
  if (!kit || !kit.paid || kit.metadata.offer !== VAULT_OFFER) return noKit();
  const taken = () => json({ error: "claimed", message: "This email already has its free Vault film on the way. More films are $99 each on the film page." }, 409);
  if (await deps.vaultClaimed(email)) return taken();
  const product = await vaultProductKey(link);
  if (await deps.vaultProductClaimed(product)) {
    return json({ error: "product", message: "This product already has its free Vault film on the way. Pick another product, or order more films for $99 each on the film page." }, 409);
  }
  if (await deps.bonusOrder(email)) {
    return json({ error: "bonus", message: "Your film order with this email already includes a free bonus film, so the Vault film does not add to it. More films are $99 each on the film page." }, 409);
  }
  // Recorded FIRST and atomically, so two requests at the same moment cannot both win a film.
  // A recorded claim is on Jay's board even if the mail below fails.
  if (!await deps.vaultClaimOnce(email, { name, link, giver, receiver, product })) return taken();
  const rows: [string, string][] = [
    ["Email", email],
    ["Name", name],
    ["Product link", link],
    ["Who gives", WHO[giver]],
    ["Who receives", receiverLabel(giver, receiver)],
    ["From", "The Vault kit page (the open link posted in the Vault). One free film per email; not checked against a member list."],
    ["Due", "Within 2 business days of this mail."],
  ];
  const html = `<h2>AI Vault free film: ready to make</h2><table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:15px">`
    + rows.map(([k, v]) => `<tr><td style="color:#666;vertical-align:top"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("") + "</table>";
  const sent = await deps.mail(`Vault free film ready to make: ${WHO[giver]} to ${receiverLabel(giver, receiver)} (${email})`, html, email);
  if (!sent) console.error("vault film mail failed (the claim is recorded and on the board):", email);
  return json({ ok: true, link, notified: sent });
}

// The Skill checkout: $199 until Black Friday ends, $299 after, by the server's clock.
async function skillCheckout(b: Record<string, unknown>, deps: Deps): Promise<Response> {
  const ref = String(b?.ref || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 190);
  const bf = deps.now() < BF_END;
  const url = await deps.skillCheckout(bf ? SKILL_PRICE_BF : SKILL_PRICE_FULL, ref);
  return json({ ok: true, url, price: bf ? 199 : 299 });
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const s = url.searchParams.get("s");
    if (!validSession(s)) return json({ error: "bad session" }, 400);
    const o = await deps.order(s);
    if (!o || !o.paid || o.qty < 1) return json({ error: "order not found" }, 404);
    const bonus = await bonusFor(o, s, deps);
    const total = o.qty + bonus;
    return json({ qty: total, paid: o.qty, bonus: bonus === 1, email: maskEmail(o.email), films: readFilms(o.metadata, total) });
  }

  if (req.method === "POST") {
    let b: Record<string, unknown>;
    try { b = JSON.parse(await req.text()); } catch { return json({ error: "bad json" }, 400); }
    if (b?.vault) return await vault(b, deps);
    if (b?.checkout === "skill") return await skillCheckout(b, deps);
    const s = b?.s;
    if (!validSession(s)) return json({ error: "bad session" }, 400);
    const n = Number(b?.n);
    const giver = String(b?.giver || ""), receiver = String(b?.receiver || "");
    const link = await cleanProduct(b?.link, deps);
    if (!Number.isInteger(n) || n < 1) return json({ error: "bad film number" }, 400);
    if (!link) return json({ error: "link", message: "Please paste your product's Amazon link or its ASIN." }, 400);
    if (!(GIVERS as readonly string[]).includes(giver)) return json({ error: "giver", message: "Pick who gives the gift." }, 400);
    if (!(RECEIVERS as readonly string[]).includes(receiver)) return json({ error: "receiver", message: "Pick who receives it." }, 400);

    const o = await deps.order(s);
    if (!o || !o.paid || o.qty < 1) return json({ error: "order not found" }, 404);
    const bonus = await bonusFor(o, s, deps);
    const total = o.qty + bonus;
    if (n > total) return json({ error: "bad film number" }, 400);

    // Rewrite the pair this card shares its key with, keeping the other card as it was.
    const key = keyFor(n);
    let pair: unknown[] = [null, null];
    try { const p = JSON.parse(o.metadata[key] || "null"); if (Array.isArray(p)) pair = [p[0] ?? null, p[1] ?? null]; } catch { /* start clean */ }
    const before = Array.isArray(pair[(n - 1) % 2]) ? pair[(n - 1) % 2] as unknown[] : null;
    pair[(n - 1) % 2] = [link, giver, receiver];
    const value = JSON.stringify(pair);
    if (value.length > 500) return json({ error: "link", message: "That link is too long. Paste the plain product page link." }, 400);
    await deps.saveMeta(s, { [key]: value });

    const done = readFilms({ ...o.metadata, [key]: value }, total).length;
    const isBonus = bonus === 1 && n === total;
    const changed = !before || before[0] !== link || before[1] !== giver || before[2] !== receiver;
    if (changed) {
      const rows: [string, string][] = [
        ["Video", `${n} of ${total}${isBonus ? " (FREE launch-day bonus film)" : ""}`],
        ["Product link", link],
        ["Who gives", WHO[giver]],
        ["Who receives", receiverLabel(giver, receiver)],
        ["Buyer", `${o.name} <${o.email}>`],
        ["Cards filled", `${done} of ${total}`],
        ["Paid for", `${o.qty} film${o.qty === 1 ? "" : "s"}${bonus ? " + 1 free launch-day bonus" : ""}${o.vault ? " (Vault first film free)" : ""}`],
        ["Due", "Within 2 business days of this card."],
        ["Stripe", o.paymentIntent ? `https://dashboard.stripe.com/payments/${o.paymentIntent}` : s],
      ];
      if (before) rows.splice(1, 0, ["Note", "The buyer CHANGED this card. This replaces what they sent before."]);
      const html = `<h2>Christmas video ${n} of ${total}${isBonus ? " (free bonus)" : ""}: ready to make</h2><table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:15px">`
        + rows.map(([k, v]) => `<tr><td style="color:#666;vertical-align:top"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("") + "</table>";
      const sent = await deps.mail(`Christmas video ${n} of ${total}${isBonus ? " (free bonus)" : ""} ready to make: ${WHO[giver]} to ${receiverLabel(giver, receiver)}${before ? " (changed)" : ""}`, html, o.email);
      // The card is saved either way. A card Jay never heard about is a film nobody makes,
      // so the buyer is told to write to us instead of being told all is well.
      if (!sent) return json({ ok: true, done, qty: total, link, notified: false }, 200);
    }
    return json({ ok: true, done, qty: total, link, notified: true });
  }
  return json({ error: "method not allowed" }, 405);
}
