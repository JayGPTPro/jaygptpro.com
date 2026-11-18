import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handle, VIDEO_PRODUCT, type Order } from "./handler.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
const resendKey = Deno.env.get("RESEND_API_KEY") || "";
const NOTIFY_TO = "info@jaygptpro.com";

async function stripe(path: string, body?: URLSearchParams): Promise<Response> {
  return await fetch("https://api.stripe.com/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${stripeKey}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body,
  });
}

Deno.serve((req) =>
  handle(req, {
    order: async (id): Promise<Order | null> => {
      const res = await stripe(`checkout/sessions/${id}?expand[]=line_items`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`stripe session ${res.status}`);
      const s = await res.json();
      let qty = 0;
      for (const it of (s?.line_items?.data || [])) {
        if (it?.price?.product === VIDEO_PRODUCT) qty += Number(it?.quantity ?? 1);
      }
      return {
        paid: s?.payment_status === "paid",
        qty,
        email: s?.customer_details?.email || s?.customer_email || "",
        name: s?.customer_details?.name || "",
        paymentIntent: typeof s?.payment_intent === "string" ? s.payment_intent : "",
        metadata: s?.metadata || {},
      };
    },
    saveMeta: async (id, patch) => {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(patch)) body.set(`metadata[${k}]`, v);
      const res = await stripe(`checkout/sessions/${id}`, body);
      if (!res.ok) throw new Error(`stripe save ${res.status}: ${await res.text()}`);
    },
    mail: async (subject, html, replyTo) => {
      if (!resendKey) { console.error("christmas-films: RESEND_API_KEY is not set"); return false; }
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "Jay Margaliot <info@jaygptpro.com>", to: [NOTIFY_TO], reply_to: replyTo || undefined, subject, html }),
        });
        if (!res.ok) { console.error("christmas-films mail failed:", res.status, await res.text()); return false; }
        return true;
      } catch (e) { console.error("christmas-films mail error:", e); return false; }
    },
  }).catch((e) => {
    console.error("christmas-films error:", e);
    return new Response(JSON.stringify({ error: "server" }), { status: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
  })
);
