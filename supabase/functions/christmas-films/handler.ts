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
// The Vault gifts are CLOSED until November's Vault episode goes up (Jay, 20.11.2026): every
// Vault request is refused here, on the server, so a direct POST stops too. While closed, only
// Jay's own addresses (@jaygptpro.com) pass, so the whole path can be tested live before it opens.
// The public orders, the cards and the bonus do not pass through this switch.
export const VAULT_OPEN = false;
export const VAULT_CLOSED_MESSAGE = "The AI Vault gifts open next week with November's Vault episode. Watch the Vault for the date.";
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
export type VaultCard = { name: string; link: string; giver: string; receiver: string };
export type Deps = {
  order: (sessionId: string) => Promise<Order | null>;                       // null: no such session
  saveMeta: (sessionId: string, patch: Record<string, string>) => Promise<void>;
  mail: (subject: string, html: string, replyTo: string) => Promise<boolean>;
  // Did this email pay for another film order in the bonus window, opened before this one?
  earlierFilmOrder: (email: string, created: number, sessionId: string) => Promise<boolean>;
  vaultClaimed: (email: string) => Promise<boolean>;           // has this email taken the Vault free film?
  // Records the member's one free film, atomically: true for exactly one request per email, even
  // when several arrive at the same moment; false when this email already has it. Throws on failure.
  vaultClaimOnce: (email: string, card: VaultCard) => Promise<boolean>;
  bonusOrder: (email: string) => Promise<boolean>;             // does this email already have a bonus film?
  skillCheckout: (price: string, ref: string) => Promise<string>; // a Stripe Checkout URL
  resolveShort?: (url: string) => Promise<string>;             // where an amzn.to / a.co link leads
  now: () => number;                                           // unix seconds
  vaultOpen?: boolean;                                         // tests only; the deployed function uses VAULT_OPEN
  // The AI Vault gifts (see "AI Vault gifts" below)
  linkSecret: string;                                          // HMAC key of the personal links ("" = links off)
  vaultMember: (email: string) => Promise<boolean | null>;     // on the member list? null: no list loaded
  vaultFilm: (email: string) => Promise<VaultCard | null>;     // the free film this email claimed, if any
  vaultSkillSession: (email: string) => Promise<string>;       // its completed free-Skill checkout, "" if none
  vaultSkillCheckout: (price: string, email: string, success: string, cancel: string) => Promise<string>; // a $0 Checkout URL
  mailTo: (to: string, subject: string, html: string) => Promise<boolean>; // a mail to a member
  askAllowed: (email: string, now: number) => boolean;         // the ask limiter (makeAskLimiter)
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

// AI Vault gifts (Jay, 20.11.2026): every active Vault member gets the Christmas Film Skill with
// its training AND one Done For You film for one product, free, from November's Vault episode.
//
// Membership is proven by the member's own inbox. The page only ever ASKS for a link; the personal
// link goes to the email, never to the screen, so knowing a member's address is not enough.
//   - On the member list (a hashed Top Dog export in private Storage): the link is mailed at once.
//   - Not on the list, or no list loaded: Jay gets a mail with an Approve button, and the member
//     gets the link only after he presses it. Both answers look the same to whoever asked, so the
//     page never tells a stranger whether an address is a member.
// The personal link carries a signed token (email, name, expiry). With it the member takes the Skill
// (a $0 Stripe Checkout with coupon VAULT_FREE_SKILL, email locked, so christmas-kit, the buyer mail
// and the Sunday opening all work as for a paid order) and/or one film (one per email, recorded on
// the Stripe customer as before). The film never stacks with the public bonus film, either way.
export const VAULT_SKILL_COUPON = "VAULT_FREE_SKILL";
export const VAULT_PAGE = "https://jaygptpro.com/christmas-video/vault/";
export const KIT_PAGE = "https://jaygptpro.com/christmas-video/kit/?s=";
export const MEMBER_LINK_DAYS = 21;
export const APPROVE_LINK_DAYS = 14;
const TEST_EMAIL = /@jaygptpro\.com$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const VAULT_ACTIONS = ["ask", "approve", "me", "skill", "film"];

export type VaultToken = { e: string; n: string; p: "member" | "approve"; x: number };
const enc = new TextEncoder();
function b64u(bytes: Uint8Array): string {
  let bin = "";
  for (const c of bytes) bin += String.fromCharCode(c);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function hmac(secret: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data))));
}
export async function makeToken(secret: string, t: VaultToken): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify(t)));
  return body + "." + await hmac(secret, body);
}
export async function readToken(secret: string, raw: unknown, purpose: VaultToken["p"], now: number): Promise<VaultToken | null> {
  if (!secret || typeof raw !== "string" || raw.length > 800) return null;
  const [body, sig, extra] = raw.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const want = await hmac(secret, body);
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return null;
  let t: Record<string, unknown>;
  try { t = JSON.parse(new TextDecoder().decode(unb64u(body))); } catch { return null; }
  if (t?.p !== purpose || typeof t?.e !== "string" || !EMAIL.test(t.e) || !(Number(t?.x) > now)) return null;
  return { e: t.e, n: String(t.n || ""), p: purpose, x: Number(t.x) };
}

// Asking for a link mails someone (the member, or Jay), and anyone can call this function. So one
// mail per email per 5 minutes, and at most 1000 asks an hour per server instance; extra asks get
// the same answer and send nothing. In memory: enough to stop a script flooding one inbox.
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

const btn = (href: string, label: string) =>
  `<p><a href="${esc(href)}" style="display:inline-block;background:#d9ae63;color:#1a1206;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:999px">${esc(label)}</a></p>`;
async function mailMemberLink(email: string, name: string, deps: Deps): Promise<boolean> {
  const t = await makeToken(deps.linkSecret, { e: email, n: name, p: "member", x: deps.now() + MEMBER_LINK_DAYS * 86400 });
  // No name in the greeting: whoever asked typed it, and it may not be the member.
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#222;max-width:560px">`
    + `<p>Hi,</p>`
    + `<p>Here are your two Christmas gifts from the AI Vault: the Christmas Film Skill with its full training, and one Done For You Christmas film for one of your products.</p>`
    + btn(VAULT_PAGE + "#t=" + t, "Open my gifts")
    + `<p>This link is yours alone, so please keep it to yourself. It works for ${MEMBER_LINK_DAYS} days; after that, just ask for a new one on the same page.</p>`
    + `<p>Jay</p></div>`;
  return await deps.mailTo(email, "Your AI Vault Christmas gifts", html);
}
const sameAnswer = () => json({ ok: true, message: "Check your inbox. Your private link is on its way to the email you use in the Vault. If it is not there within a few minutes, we are checking your membership by hand, and it arrives within a day." });

async function vault(b: Record<string, unknown>, deps: Deps): Promise<Response> {
  const action = String(b?.vault);
  if (!VAULT_ACTIONS.includes(action)) {
    // the old one-card form (vault: true) had no membership proof; it is gone
    return json({ error: "closed", message: VAULT_CLOSED_MESSAGE }, 403);
  }
  if (!deps.linkSecret) throw new Error("vault: no link secret");
  const open = deps.vaultOpen ?? VAULT_OPEN;
  const closedFor = (email: string) => !open && !TEST_EMAIL.test(email);
  const closed = () => json({ error: "closed", message: VAULT_CLOSED_MESSAGE }, 403);
  const now = deps.now();

  if (action === "ask") {
    const email = String(b?.email || "").trim().toLowerCase();
    const name = String(b?.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) return json({ error: "name", message: "Please write your name." }, 400);
    if (!EMAIL.test(email)) return json({ error: "email", message: "Please write the email you use in the Vault." }, 400);
    if (closedFor(email)) return closed();
    if (!deps.askAllowed(email, now)) return sameAnswer();
    const listed = await deps.vaultMember(email);
    if (listed === true) {
      if (!await mailMemberLink(email, name, deps)) return json({ error: "mail", message: "That did not go through. Please write to info@jaygptpro.com." }, 502);
      return sameAnswer();
    }
    const t = await makeToken(deps.linkSecret, { e: email, n: name, p: "approve", x: now + APPROVE_LINK_DAYS * 86400 });
    const rows: [string, string][] = [
      ["Email", email],
      ["Name", name],
      ["Member list", listed === null ? "No member list is loaded, so every request comes to you." : "NOT on the member list. Maybe they joined with another email."],
      ["If this is an active Vault member", "Press Approve. Their private link goes to this email, and only to it."],
      ["If not", "Ignore this mail. Nothing is sent."],
    ];
    const html = `<h2>AI Vault gifts: approve ${esc(email)}?</h2><table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:15px">`
      + rows.map(([k, v]) => `<tr><td style="color:#666;vertical-align:top"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("") + "</table>"
      + btn(VAULT_PAGE + "#approve=" + t, "Approve and send their link");
    // No reply-to here: a reply quotes the Approve button, and the asker must never hold it.
    if (!await deps.mail(`Vault check: ${email} asks for the Christmas gifts`, html, "")) {
      return json({ error: "mail", message: "That did not go through. Please write to info@jaygptpro.com." }, 502);
    }
    return sameAnswer();
  }

  if (action === "approve") {
    const t = await readToken(deps.linkSecret, b?.t, "approve", now);
    if (!t) return json({ error: "link", message: "This approve link is not valid or has expired." }, 400);
    if (closedFor(t.e)) return closed();
    if (!await mailMemberLink(t.e, t.n, deps)) return json({ error: "mail", message: "The mail to the member did not go out. Try again in a minute." }, 502);
    return json({ ok: true, email: t.e, name: t.n });
  }

  // Everything below is the member, holding the personal link from their inbox.
  const t = await readToken(deps.linkSecret, b?.t, "member", now);
  if (!t) return json({ error: "link", message: "This private link is not valid or has expired. Ask for a new one below." }, 401);
  if (closedFor(t.e)) return closed();
  const email = t.e;

  if (action === "me") {
    const [kitSession, film, bonus] = await Promise.all([deps.vaultSkillSession(email), deps.vaultFilm(email), deps.bonusOrder(email)]);
    return json({
      ok: true, email, name: t.n,
      skill: kitSession ? { claimed: true, kit: KIT_PAGE + kitSession } : { claimed: false },
      film: film ? { claimed: true, link: film.link, giver: film.giver, receiver: film.receiver } : { claimed: false, bonus },
    });
  }

  if (action === "skill") {
    const had = await deps.vaultSkillSession(email);
    if (had) return json({ error: "claimed", message: "Your free Skill is already yours.", kit: KIT_PAGE + had }, 409);
    const url = await deps.vaultSkillCheckout(now < BF_END ? SKILL_PRICE_BF : SKILL_PRICE_FULL, email,
      VAULT_PAGE + "?k={CHECKOUT_SESSION_ID}", VAULT_PAGE + "#t=" + String(b.t));
    return json({ ok: true, url });
  }

  // action === "film": one free film for one product, never with the public bonus film
  const giver = String(b?.giver || ""), receiver = String(b?.receiver || "");
  const link = await cleanProduct(b?.link, deps);
  if (!link) return json({ error: "link", message: "Please paste your product's Amazon link or its ASIN." }, 400);
  if (!(GIVERS as readonly string[]).includes(giver)) return json({ error: "giver", message: "Pick who gives the gift." }, 400);
  if (!(RECEIVERS as readonly string[]).includes(receiver)) return json({ error: "receiver", message: "Pick who receives it." }, 400);
  const taken = () => json({ error: "claimed", message: "Your free Vault film is already on its way. More films are $99 each on the film page." }, 409);
  if (await deps.vaultClaimed(email)) return taken();
  if (await deps.bonusOrder(email)) {
    return json({ error: "bonus", message: "Your order with this email already includes a free bonus film, so the Vault film does not apply. More films are $99 each on the film page." }, 409);
  }
  const name = t.n || email;
  // Recorded FIRST and atomically, so two requests at the same moment cannot both win a film.
  // A recorded claim is on Jay's board even if the mail below fails.
  if (!await deps.vaultClaimOnce(email, { name, link, giver, receiver })) return taken();
  const rows: [string, string][] = [
    ["Vault email", email],
    ["Name", name],
    ["Product link", link],
    ["Who gives", WHO[giver]],
    ["Who receives", receiverLabel(giver, receiver)],
    ["Membership", "Checked: they used the private link that was mailed to this address."],
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
