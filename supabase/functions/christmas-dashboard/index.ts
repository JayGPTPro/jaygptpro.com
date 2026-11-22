import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handle, FETCH_FROM, type Promo } from "./handler.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";

// Reads: GET only.
// deno-lint-ignore no-explicit-any
async function get(path: string, params: URLSearchParams): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}?${params}`, { headers: { Authorization: `Bearer ${stripeKey}` } });
  if (!res.ok) throw new Error(`stripe ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

// The ONLY write: metadata keys of the sent mark, on one Checkout Session or one customer.
// Any other key, path or id shape is refused here, whatever the code above asks for.
const SENT_KEY = /^(sent\d*|xmas_vault_sent)$/;
async function setMeta(path: string, patch: Record<string, string>): Promise<void> {
  if (!/^(checkout\/sessions\/cs_(live|test)_[A-Za-z0-9]{20,200}|customers\/cus_[A-Za-z0-9]{6,60})$/.test(path)) throw new Error("refused path");
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(patch)) {
    if (!SENT_KEY.test(k)) throw new Error("refused key " + k);
    body.set(`metadata[${k}]`, String(v).slice(0, 500));
  }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  if (!res.ok) throw new Error(`stripe write ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
// deno-lint-ignore no-explicit-any
async function getOrNull(path: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${stripeKey}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`stripe ${path} ${res.status}`);
  return await res.json();
}

Deno.serve((req) =>
  handle(req, {
    // Every Checkout Session since the first Christmas link, with its items and its charge.
    sessions: async () => {
      // deno-lint-ignore no-explicit-any
      const out: any[] = [];
      let after = "";
      for (let page = 0; page < 40; page++) {
        const q = new URLSearchParams({ limit: "100", "created[gte]": String(FETCH_FROM) });
        q.append("expand[]", "data.line_items");
        q.append("expand[]", "data.payment_intent.latest_charge");
        if (after) q.set("starting_after", after);
        const r = await get("checkout/sessions", q);
        out.push(...(r?.data || []));
        if (!r?.has_more || !r.data?.length) break;
        after = r.data[r.data.length - 1].id;
      }
      return out;
    },
    // Promotion code id -> its code and coupon, to tell XMASTEST / KITTEST orders and the Vault coupon.
    promos: async () => {
      const map: Record<string, Promo> = {};
      let after = "";
      for (let page = 0; page < 10; page++) {
        const q = new URLSearchParams({ limit: "100" });
        if (after) q.set("starting_after", after);
        const r = await get("promotion_codes", q);
        for (const p of (r?.data || [])) {
          const c = p?.promotion?.coupon ?? p?.coupon;
          map[p.id] = { code: String(p.code || ""), coupon: typeof c === "string" ? c : String(c?.id || "") };
        }
        if (!r?.has_more || !r.data?.length) break;
        after = r.data[r.data.length - 1].id;
      }
      return map;
    },
    // Vault free-film claims: christmas-films marks the customer with metadata xmas_vault = 1.
    vault: async () => {
      // deno-lint-ignore no-explicit-any
      const out: any[] = [];
      let next = "";
      for (let page = 0; page < 10; page++) {
        const q = new URLSearchParams({ query: "metadata['xmas_vault']:'1'", limit: "100" });
        if (next) q.set("page", next);
        const r = await get("customers/search", q);
        out.push(...(r?.data || []));
        if (!r?.has_more || !r?.next_page) break;
        next = r.next_page;
      }
      return out;
    },
    now: () => Math.floor(Date.now() / 1000),
    sessionMeta: async (id) => (await getOrNull(`checkout/sessions/${id}`))?.metadata ?? null,
    setSessionMeta: (id, patch) => setMeta(`checkout/sessions/${id}`, patch),
    customerMeta: async (id) => { const c = await getOrNull(`customers/${id}`); return c && !c.deleted ? (c.metadata || {}) : null; },
    setCustomerMeta: (id, patch) => setMeta(`customers/${id}`, patch),
  }).catch((e) => {
    console.error("christmas-dashboard error:", e);
    return new Response(JSON.stringify({ error: "server", message: String(e?.message || e).slice(0, 300) }), {
      status: 502, headers: { "Access-Control-Allow-Origin": "https://jaygptpro.com", "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  })
);
