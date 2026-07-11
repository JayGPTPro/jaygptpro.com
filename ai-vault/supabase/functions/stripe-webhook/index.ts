// AI Vault. Stripe webhook: THE fulfillment brain.
// SIGNATURE-VERIFIED (fixes the Donna forgery hole). Idempotent via stripe_events claim.
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY_VAULT, SITE_URL
// Deploy with: supabase functions deploy stripe-webhook --no-verify-jwt
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2026-03-25.dahlia" as never,
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/* ---------- helpers ---------- */

async function setAccessFlag(userId: string, hasAccess: boolean) {
  // Mirror into JWT app_metadata so future tokens carry it; RLS stays the real floor.
  await admin.auth.admin.updateUserById(userId, { app_metadata: { vault_access: hasAccess } });
  if (!hasAccess) await admin.auth.admin.signOut(userId, "global").catch(() => {});
}

async function upsertSubscription(sub: Stripe.Subscription, eventCreated: number) {
  const userId = (sub.metadata?.supabase_user_id) ||
    (await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", String(sub.customer)).maybeSingle()).data?.user_id;
  if (!userId) { console.error("subscription without user link", sub.id); return null; }

  // ordering guard: never let an older event overwrite a newer state
  const { data: cur } = await admin.from("subscriptions").select("last_event_created").eq("id", sub.id).maybeSingle();
  if (cur?.last_event_created && cur.last_event_created > eventCreated) return userId;

  const item = sub.items?.data?.[0];
  await admin.from("subscriptions").upsert({
    id: sub.id,
    user_id: userId,
    status: sub.status,
    price_lookup_key: item?.price?.lookup_key ?? item?.price?.id ?? null,
    current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    dunning_since: sub.status === "past_due" ? new Date().toISOString() : null,
    last_event_created: eventCreated,
    updated_at: new Date().toISOString(),
  });
  const hasAccess = ["active", "trialing", "past_due"].includes(sub.status);
  await setAccessFlag(userId, hasAccess);
  return userId;
}

async function claimEmail(key: string, userId: string | null, kind: string): Promise<boolean> {
  const { error } = await admin.from("emails_log").insert({ key, user_id: userId, kind, sent_at: new Date().toISOString() });
  return !error; // unique key: second caller loses the claim, email sends exactly once
}

async function sendWelcome(userId: string, email: string, name: string) {
  if (!(await claimEmail(`welcome:${userId}`, userId, "welcome"))) return;
  const site = Deno.env.get("SITE_URL") ?? "https://jaygptpro.com/ai-vault";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY_VAULT")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Jay at AI Vault <jay@jaygptpro.com>",
      to: [email],
      subject: "Your key works. Welcome to the Vault",
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <p>Hey ${name || "there"},</p>
        <p>Your membership is live. Here is everything you need:</p>
        <p><strong>1. Enter the Vault:</strong> <a href="${site}/index.html">${site.replace("https://", "")}</a><br>
        Sign in with the SAME Google account you used at checkout.</p>
        <p><strong>2. Start Here:</strong> your first 10 minutes are mapped out inside. One quick win, today.</p>
        <p><strong>3. The WhatsApp group:</strong> reply to this email and I will add you personally.</p>
        <p>See you inside the Vault 🔑<br>Jay</p>
        <p style="color:#888;font-size:12px">JAY GPT PRO LLC · You are receiving this because you joined the AI Vault.
        Manage billing anytime from your account page.</p></div>`,
    }),
  }).catch((e) => console.error("welcome email failed", e));
}

/* ---------- the webhook ---------- */

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig!, Deno.env.get("STRIPE_WEBHOOK_SECRET")!, undefined, cryptoProvider);
  } catch (e) {
    console.error("BAD SIGNATURE", e);
    return new Response("bad signature", { status: 400 });
  }

  // idempotency: claim the event id, delete the claim on failure so Stripe retries reprocess
  const { error: claimErr } = await admin.from("stripe_events").insert({ id: event.id, type: event.type, created: event.created });
  if (claimErr) return new Response("already processed", { status: 200 });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.client_reference_id || s.metadata?.supabase_user_id;
        if (userId && s.customer) {
          await admin.from("billing_customers").upsert({ user_id: userId, stripe_customer_id: String(s.customer) });
          // store the paid email as alias if it differs from the Google email
          const { data: p } = await admin.from("profiles").select("google_email,display_name").eq("id", userId).single();
          const paidEmail = s.customer_details?.email;
          if (paidEmail && p && paidEmail.toLowerCase() !== p.google_email.toLowerCase()) {
            await admin.from("profiles").update({ primary_email: paidEmail }).eq("id", userId);
          }
          if (s.subscription) {
            const sub = await stripe.subscriptions.retrieve(String(s.subscription));
            await upsertSubscription(sub, event.created);
          }
          await sendWelcome(userId, s.customer_details?.email || p?.google_email || "", (p?.display_name || "").split(" ")[0]);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        await upsertSubscription(event.data.object as Stripe.Subscription, event.created);
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = (inv as unknown as { subscription?: string }).subscription ??
          inv.parent?.subscription_details?.subscription;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(String(subId));
          await upsertSubscription(sub, event.created);
        }
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const { data: bc } = await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", String(inv.customer)).maybeSingle();
        if (bc) await admin.from("subscriptions").update({ dunning_since: new Date().toISOString() }).eq("user_id", bc.user_id).in("status", ["active", "past_due"]);
        // Stripe Smart Retries + Stripe's own dunning emails handle recovery. past_due keeps access.
        break;
      }
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        const { data: bc } = await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", String(ch.customer)).maybeSingle();
        if (bc) await admin.from("refunds_log").upsert({ user_id: bc.user_id, refund_id: ch.id, reason: "refund" }, { onConflict: "user_id", ignoreDuplicates: true });
        break; // access revocation flows from the subscription.deleted event when Jay cancels
      }
      case "charge.dispute.created": {
        const ch = event.data.object as Stripe.Dispute;
        const { data: bc } = await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", String(ch.charge && (await stripe.charges.retrieve(String(ch.charge))).customer)).maybeSingle();
        if (bc) {
          await admin.from("billing_customers").update({ blocked: true }).eq("user_id", bc.user_id);
          await admin.from("subscriptions").update({ access_blocked: true }).eq("user_id", bc.user_id);
          await setAccessFlag(bc.user_id, false);
        }
        break;
      }
      default:
        break; // event logged in stripe_events either way
    }
    await admin.from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("handler failed", event.type, e);
    await admin.from("stripe_events").delete().eq("id", event.id); // release the claim so Stripe's retry reprocesses
    return new Response("handler error", { status: 500 });
  }
});
