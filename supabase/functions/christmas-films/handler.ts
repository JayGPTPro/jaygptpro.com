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
export const GIVERS = ["mom", "dad"] as const;
export const RECEIVERS = ["son", "daughter", "partner"] as const;
const LINK_MAX = 190; // two cards must fit one 500-character metadata value

export type Film = { n: number; link: string; giver: string; receiver: string };
export type Order = {
  paid: boolean;
  qty: number;                       // videos bought, 0 when the session is not a video order
  email: string;
  name: string;
  paymentIntent: string;
  metadata: Record<string, string>;
};
export type Deps = {
  order: (sessionId: string) => Promise<Order | null>;                       // null: no such session
  saveMeta: (sessionId: string, patch: Record<string, string>) => Promise<void>;
  mail: (subject: string, html: string, replyTo: string) => Promise<boolean>;
};

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
export function cleanLink(raw: unknown): string {
  let s = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u: URL;
  try { u = new URL(s); } catch { return ""; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return "";
  const asin = (u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i) || [])[1];
  if (asin && /(^|\.)amazon\./i.test(u.hostname)) return `https://${u.hostname}/dp/${asin.toUpperCase()}`;
  const plain = u.origin + u.pathname;
  const full = plain + u.search;
  return (full.length <= LINK_MAX ? full : plain).slice(0, LINK_MAX);
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

const WHO: Record<string, string> = { mom: "Mom", dad: "Dad", son: "Son", daughter: "Daughter" };
export function receiverLabel(giver: string, receiver: string): string {
  if (receiver === "partner") return giver === "mom" ? "Husband (Dad)" : "Wife (Mom)";
  return WHO[receiver] || receiver;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const s = url.searchParams.get("s");
    if (!validSession(s)) return json({ error: "bad session" }, 400);
    const o = await deps.order(s);
    if (!o || !o.paid || o.qty < 1) return json({ error: "order not found" }, 404);
    return json({ qty: o.qty, email: maskEmail(o.email), films: readFilms(o.metadata, o.qty) });
  }

  if (req.method === "POST") {
    let b: Record<string, unknown>;
    try { b = JSON.parse(await req.text()); } catch { return json({ error: "bad json" }, 400); }
    const s = b?.s;
    if (!validSession(s)) return json({ error: "bad session" }, 400);
    const n = Number(b?.n);
    const giver = String(b?.giver || ""), receiver = String(b?.receiver || "");
    const link = cleanLink(b?.link);
    if (!Number.isInteger(n) || n < 1) return json({ error: "bad film number" }, 400);
    if (!link) return json({ error: "link", message: "Please paste the link to your product." }, 400);
    if (!(GIVERS as readonly string[]).includes(giver)) return json({ error: "giver", message: "Pick who gives the gift." }, 400);
    if (!(RECEIVERS as readonly string[]).includes(receiver)) return json({ error: "receiver", message: "Pick who receives it." }, 400);

    const o = await deps.order(s);
    if (!o || !o.paid || o.qty < 1) return json({ error: "order not found" }, 404);
    if (n > o.qty) return json({ error: "bad film number" }, 400);

    // Rewrite the pair this card shares its key with, keeping the other card as it was.
    const key = keyFor(n);
    let pair: unknown[] = [null, null];
    try { const p = JSON.parse(o.metadata[key] || "null"); if (Array.isArray(p)) pair = [p[0] ?? null, p[1] ?? null]; } catch { /* start clean */ }
    const before = Array.isArray(pair[(n - 1) % 2]) ? pair[(n - 1) % 2] as unknown[] : null;
    pair[(n - 1) % 2] = [link, giver, receiver];
    const value = JSON.stringify(pair);
    if (value.length > 500) return json({ error: "link", message: "That link is too long. Paste the plain product page link." }, 400);
    await deps.saveMeta(s, { [key]: value });

    const done = readFilms({ ...o.metadata, [key]: value }, o.qty).length;
    const changed = !before || before[0] !== link || before[1] !== giver || before[2] !== receiver;
    if (changed) {
      const rows: [string, string][] = [
        ["Video", `${n} of ${o.qty}`],
        ["Product link", link],
        ["Who gives", WHO[giver]],
        ["Who receives", receiverLabel(giver, receiver)],
        ["Buyer", `${o.name} <${o.email}>`],
        ["Cards filled", `${done} of ${o.qty}`],
        ["Due", "Within 48 hours (business days) of this card."],
        ["Stripe", o.paymentIntent ? `https://dashboard.stripe.com/payments/${o.paymentIntent}` : s],
      ];
      if (before) rows.splice(1, 0, ["Note", "The buyer CHANGED this card. This replaces what they sent before."]);
      const html = `<h2>Christmas video ${n} of ${o.qty}: ready to make</h2><table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:15px">`
        + rows.map(([k, v]) => `<tr><td style="color:#666;vertical-align:top"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("") + "</table>";
      const sent = await deps.mail(`Christmas video ${n} of ${o.qty} ready to make: ${WHO[giver]} to ${receiverLabel(giver, receiver)}${before ? " (changed)" : ""}`, html, o.email);
      // The card is saved either way. A card Jay never heard about is a film nobody makes,
      // so the buyer is told to write to us instead of being told all is well.
      if (!sent) return json({ ok: true, done, qty: o.qty, link, notified: false }, 200);
    }
    return json({ ok: true, done, qty: o.qty, link, notified: true });
  }
  return json({ error: "method not allowed" }, 405);
}
