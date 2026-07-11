// AI Vault. Creates a Stripe Checkout Session bound to the logged-in Supabase user.
// Secrets (set with `supabase secrets set`): STRIPE_SECRET_KEY, SITE_URL
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
    // 1. Who is asking? (JWT from the browser)
    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: "Sign in first" }, 401);

    const { plan } = await req.json(); // "vault_monthly" | "vault_annual"
    if (!["vault_monthly", "vault_annual"].includes(plan)) return json({ error: "Unknown plan" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 2. Already an active member? Do not double-subscribe.
    const { data: existing } = await admin.from("subscriptions").select("id,status")
      .eq("user_id", user.id).in("status", ["active", "trialing", "past_due"]).limit(1);
    if (existing && existing.length) return json({ error: "already subscribed" }, 409);

    const { data: blocked } = await admin.from("billing_customers").select("blocked").eq("user_id", user.id).maybeSingle();
    if (blocked?.blocked) return json({ error: "Account blocked. Contact support." }, 403);

    // 3. Reuse the Stripe customer if we have one.
    const { data: bc } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();

    // 4. Resolve the price by lookup_key (prices are managed in the Stripe dashboard).
    const prices = await stripe.prices.list({ lookup_keys: [plan], active: true, limit: 1 });
    if (!prices.data.length) return json({ error: "Price not configured in Stripe" }, 500);

    const site = Deno.env.get("SITE_URL") ?? "https://jaygptpro.com/ai-vault";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: bc?.stripe_customer_id || undefined,
      customer_email: bc?.stripe_customer_id ? undefined : user.email,
      line_items: [{ price: prices.data[0].id, quantity: 1 }],
      allow_promotion_codes: true,                      // the whole coupon strategy hangs here
      client_reference_id: user.id,                     // join key #1
      subscription_data: { metadata: { supabase_user_id: user.id } }, // join key #2
      metadata: { supabase_user_id: user.id },          // join key #3
      consent_collection: { terms_of_service: "required" },
      success_url: `${site}/welcome.html`,
      cancel_url: `${site}/join.html`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("create-checkout error", e);
    return json({ error: "Checkout failed" }, 500);
  }
});
