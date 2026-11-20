import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handle, FETCH_FROM, type Promo } from "./handler.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";

// The ONLY way this function reaches Stripe: a GET. There is no POST, so it cannot change
// an order, a card, a customer or a payment, whatever the code above it does.
// deno-lint-ignore no-explicit-any
async function get(path: string, params: URLSearchParams): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}?${params}`, { headers: { Authorization: `Bearer ${stripeKey}` } });
  if (!res.ok) throw new Error(`stripe ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
  }).catch((e) => {
    console.error("christmas-dashboard error:", e);
    return new Response(JSON.stringify({ error: "server", message: String(e?.message || e).slice(0, 300) }), {
      status: 502, headers: { "Access-Control-Allow-Origin": "https://jaygptpro.com", "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  })
);
