// Black Friday 1+1 (jaygptpro.com/black-friday/, 24.11.2026): the cart's Check out button posts the ids it holds,
// this works out the pairs again from its own price list, and answers the url of a Stripe Checkout made for
// exactly that cart. The browser sends ids only. Every price comes from CATALOG below.
//
// POST { items: ["donna","wonka"] } -> { url, pay, items: [{ id, price, free }] }
//
// The rule (Jay, 24.11): sort the cart from the priciest down, pair neighbours, the second of every pair is
// free. One payment for the whole cart, every item its own line, free items at $0. Each item once.
//
// Delivery: Jay delivers every Black Friday product by hand (25.11.2026). stripe-webhook reads the session
// metadata this writes (project=bf11, items, free, courses), grants nothing, and mails Jay the order with his
// to-dos and the buyer a confirmation (an email from Jay within 24 hours). The Skill and the film still ride
// on their own products, so the kit page and the film card Jay sends open for this order's session id.

export const BF_PROJECT = "bf11";
// The offer runs as Black Friday, then as Cyber Monday, until Tue 1.12.2026 00:00 New York (EST, UTC-5).
export const OFFER_END = Date.UTC(2026, 11, 1, 5, 0, 0);
export const SITE = "https://jaygptpro.com";

export const DONNA_SOLO_PRODUCT = "prod_UdyoNBZgnpQwan";   // Claude Code Challenge: Your First AI Hire (evergreen)
export const DONNA_ADDON_PRODUCT = "prod_UxhPy8Tfpeiwv6";  // Donna Challenge. Full Access, the Wonka cross-sell
// Wonka has a product of its own here: the Golden Ticket product carries a Stripe cross-sell that offers
// Donna for $250, also to a buyer who already has Donna in the cart. The webhook grants Wonka from the metadata.
export const WONKA_PRODUCT = "prod_Vgptu7pxmb7d1I";        // Black Friday 1+1: Wonka Bootcamp
export const SKILL_PRODUCT = "prod_VdK0WmRf7Cgnvy";        // Christmas Film Skill + Training
export const FILM_PRODUCT = "prod_VdK0ykqQR23ctI";         // Christmas Film: The Perfect Gift
export const CALL_PRODUCT = "prod_UrMUodTe2zrXPy";         // 1-on-1 Strategy Call with Jay

export type Item = { id: string; name: string; price: number; ord: number; product: string };

// Same order and the same prices (after the usual discount) as P in black-friday/index.html.
// handler_test.ts reads that page and fails when the two drift apart.
export const CATALOG: Item[] = [
  { id: "gift",   name: "The Perfect Gift Skill",           price: 19900,  ord: 0, product: SKILL_PRODUCT },
  { id: "donna",  name: "Donna Challenge",                  price: 29700,  ord: 1, product: DONNA_SOLO_PRODUCT },
  { id: "wonka",  name: "Wonka Bootcamp",                   price: 49700,  ord: 2, product: WONKA_PRODUCT },
  { id: "vault",  name: "The AI Vault, 1 year",             price: 100000, ord: 3, product: "prod_Vgpcvepgv2F85M" },
  { id: "call",   name: "1:1 AI call",                      price: 40000,  ord: 4, product: CALL_PRODUCT },
  { id: "calls4", name: "4 AI calls",                       price: 120000, ord: 5, product: "prod_VgpcLA85A5BRml" },
  { id: "xmas",   name: "Christmas film for your product",  price: 9900,   ord: 6, product: FILM_PRODUCT },
  { id: "build",  name: "Custom AI workflow",               price: 300000, ord: 7, product: "prod_VgpcLGbzZDNUDx" },
  { id: "images", name: "Product image system",             price: 300000, ord: 8, product: "prod_VgpcewV9zkiUyz" },
  { id: "video",  name: "Product video & ads system",       price: 300000, ord: 9, product: "prod_VgpcH455WsSht8" },
];
const BY_ID: Record<string, Item> = Object.fromEntries(CATALOG.map((p) => [p.id, p]));

export type Line = Item & { free: boolean };
export type Cart = { lines: Line[]; pay: number; full: number };

// The page's calc(), on the server. Throws a message the page can show.
export function priceCart(ids: unknown): Cart {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("Pick at least one product.");
  if (ids.length > CATALOG.length) throw new Error("Too many products.");
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || !BY_ID[id]) throw new Error("Unknown product.");
    if (seen.has(id)) throw new Error("Each product can be in the cart once.");
    seen.add(id);
  }
  const items = (ids as string[]).map((id) => BY_ID[id]).sort((a, b) => b.price - a.price || a.ord - b.ord);
  const lines: Line[] = items.map((p, i) => ({ ...p, free: i % 2 === 1 }));
  const full = lines.reduce((t, l) => t + l.price, 0);
  const pay = lines.reduce((t, l) => t + (l.free ? 0 : l.price), 0);
  // With Wonka in the cart Donna is the Wonka cross-sell, which is how the webhook grants both.
  if (seen.has("wonka")) for (const l of lines) if (l.id === "donna") l.product = DONNA_ADDON_PRODUCT;
  return { lines, pay, full };
}

export function courses(lines: Line[]): string {
  const c = lines.map((l) => l.id).filter((id) => id === "donna" || id === "wonka").sort();
  return c.length ? c.join(",") : "none";
}

// The form body for POST /v1/checkout/sessions.
export function sessionParams(cart: Cart, now: number): URLSearchParams {
  const f = new URLSearchParams();
  const ids = cart.lines.map((l) => l.id).join(",");
  const free = cart.lines.filter((l) => l.free).map((l) => l.id).join(",");
  f.set("mode", "payment");
  cart.lines.forEach((l, i) => {
    f.set(`line_items[${i}][quantity]`, "1");
    f.set(`line_items[${i}][price_data][currency]`, "usd");
    f.set(`line_items[${i}][price_data][product]`, l.product);
    f.set(`line_items[${i}][price_data][unit_amount]`, String(l.free ? 0 : l.price));
  });
  const meta: Record<string, string> = { project: BF_PROJECT, items: ids, free: free || "none", courses: courses(cart.lines) };
  for (const [k, v] of Object.entries(meta)) {
    f.set(`metadata[${k}]`, v);
    f.set(`payment_intent_data[metadata][${k}]`, v);   // the charge carries it too, for refunds
  }
  const freeNames = cart.lines.filter((l) => l.free).map((l) => l.name);
  if (freeNames.length) {
    f.set("custom_text[submit][message]", `Black Friday 1+1: ${freeNames.join(", ")} ${freeNames.length > 1 ? "are" : "is"} free.`);
  }
  f.set("customer_creation", "always");
  f.set("success_url", `${SITE}/black-friday/thanks/?s={CHECKOUT_SESSION_ID}&items=${ids}`);
  f.set("cancel_url", `${SITE}/black-friday/?canceled=1`);
  // Stripe wants 30 minutes to 24 hours. Close at the end of the offer when that comes sooner.
  const at = Math.max(now + 31 * 60 * 1000, Math.min(now + 23 * 3600 * 1000, OFFER_END));
  f.set("expires_at", String(Math.floor(at / 1000)));
  return f;
}

export type Deps = { now: () => number; createSession: (form: URLSearchParams) => Promise<{ url: string }> };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad", message: "Pick at least one product." }, 400); }
  let cart: Cart;
  try { cart = priceCart(body?.items); } catch (e) { return json({ error: "bad", message: String((e as Error).message) }, 400); }
  // After the cart check, so the deploy workflow's empty probe still gets 400 once the offer is over.
  if (deps.now() >= OFFER_END) return json({ error: "ended", message: "The Black Friday 1+1 has ended." }, 410);
  const s = await deps.createSession(sessionParams(cart, deps.now()));
  return json({ url: s.url, pay: cart.pay, items: cart.lines.map((l) => ({ id: l.id, price: l.price, free: l.free })) });
}
