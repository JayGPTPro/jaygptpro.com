import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handle } from "./handler.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";

Deno.serve((req) =>
  handle(req, {
    now: () => Date.now(),
    createSession: async (form) => {
      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const s = await res.json();
      if (!res.ok || !s?.url) throw new Error(`stripe ${res.status}: ${JSON.stringify(s?.error || s).slice(0, 300)}`);
      return { url: s.url };
    },
  }).catch((e) => {
    console.error("bf11-checkout error:", e);
    return new Response(JSON.stringify({ error: "server", message: "Checkout did not open. Try again, or write to info@jaygptpro.com." }), {
      status: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  })
);
