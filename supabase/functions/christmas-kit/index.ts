import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { BF_SKILL_PRODUCT, handle, SKILL_PRODUCT, type Manifest, type Order } from "./handler.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
const sbUrl = Deno.env.get("SUPABASE_URL") || "";
const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BUCKET = "christmas-kit";

async function storage(path: string, init?: RequestInit): Promise<Response> {
  return await fetch(`${sbUrl}/storage/v1/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${sbKey}`, apikey: sbKey, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

Deno.serve((req) =>
  handle(req, {
    order: async (id): Promise<Order | null> => {
      const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}?expand[]=line_items&expand[]=payment_intent.latest_charge`, {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`stripe session ${res.status}`);
      const s = await res.json();
      const skill = (s?.line_items?.data || []).some((it: any) => it?.price?.product === SKILL_PRODUCT || it?.price?.product === BF_SKILL_PRODUCT);
      const charge = s?.payment_intent?.latest_charge;
      return {
        paid: s?.payment_status === "paid",
        skill,
        refunded: Boolean(charge?.refunded),
        email: s?.customer_details?.email || s?.customer_email || "",
        name: s?.customer_details?.name || "",
        vault: s?.metadata?.offer === "vault_skill",
      };
    },
    manifest: async (): Promise<Manifest> => {
      const res = await storage(`object/authenticated/${BUCKET}/latest.json`, { method: "GET" });
      if (!res.ok) throw new Error(`latest.json ${res.status}`);
      return await res.json();
    },
    sign: async (paths, seconds) => {
      const out: Record<string, string> = {};
      for (let i = 0; i < paths.length; i += 200) {
        const res = await storage(`object/sign/${BUCKET}`, { method: "POST", body: JSON.stringify({ expiresIn: seconds, paths: paths.slice(i, i + 200) }) });
        if (!res.ok) throw new Error(`sign ${res.status}: ${await res.text()}`);
        for (const r of await res.json()) if (r?.signedURL && !r?.error) out[r.path] = `${sbUrl}/storage/v1${r.signedURL}`;
      }
      return out;
    },
  }).catch((e) => {
    console.error("christmas-kit error:", e);
    return new Response(JSON.stringify({ error: "server", message: "Something went wrong on our side. Write to info@jaygptpro.com." }), {
      status: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  })
);
