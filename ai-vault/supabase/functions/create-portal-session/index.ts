// AI Vault. Opens the Stripe Customer Portal for the logged-in member.
// Secrets: STRIPE_SECRET_KEY, SITE_URL
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2026-03-25.dahlia" as never,
  httpClient: Stripe.createFetchHttpClient(),
});
const CORS = {
  "Access-Control-Allow-Origin": "https://jaygptpro.com",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: "Sign in first" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: bc } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    if (!bc) return json({ error: "No billing account found. Comped members have no billing." }, 404);

    const site = Deno.env.get("SITE_URL") ?? "https://jaygptpro.com/ai-vault";
    const session = await stripe.billingPortal.sessions.create({
      customer: bc.stripe_customer_id,
      return_url: `${site}/account.html`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("portal error", e);
    return json({ error: "Could not open billing portal" }, 500);
  }
});
