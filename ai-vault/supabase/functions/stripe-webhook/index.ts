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

// supabase-js NEVER throws on query errors, it returns { error }. Every
// state-mutating write (and every read a decision depends on) must go through
// this, or a transient DB error silently settles the event as 200 and the
// retry machinery never engages.
function must<T extends { error: { message: string } | null }>(res: T, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res;
}

async function setAccessFlag(userId: string, hasAccess: boolean) {
  // A comped member keeps access regardless of subscription state (matches has_vault_access)
  if (!hasAccess) {
    const { data: prof } = must(await admin.from("profiles").select("access_type").eq("id", userId).maybeSingle(), "comped lookup");
    if (prof?.access_type === "comped") hasAccess = true;
  }
  // Mirror into JWT app_metadata so future tokens carry it; RLS stays the real floor.
  must(await admin.auth.admin.updateUserById(userId, { app_metadata: { vault_access: hasAccess } }), "app_metadata update");
  if (!hasAccess) {
    // supabase-js admin.signOut expects a session JWT, not a user id: hit the
    // GoTrue admin logout endpoint directly to revoke all of the user's sessions
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users/${userId}/logout`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }).then((r) => { if (!r.ok) console.error("forced signout failed", userId, r.status); })
      .catch((e) => console.error("forced signout failed", userId, e));
  }
}

async function upsertSubscription(sub: Stripe.Subscription, eventCreated: number) {
  let userId = sub.metadata?.supabase_user_id as string | undefined;
  if (!userId) {
    // a FAILED lookup must throw (retry); only a genuinely missing link is skippable
    const { data: link } = must(await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", String(sub.customer)).maybeSingle(), "billing link lookup");
    userId = link?.user_id;
  }
  if (!userId) { console.error("subscription without user link", sub.id); return null; }

  // orphan guard: subscriptions.user_id carries a NOT NULL FK to profiles. If the
  // account was deleted between checkout and webhook delivery, skip-and-log
  // instead of crash-looping on 23503 for Stripe's whole retry window
  const { data: prof } = must(await admin.from("profiles").select("id").eq("id", userId).maybeSingle(), "profile existence check");
  if (!prof) { console.error("ORPHANED SUBSCRIPTION: user has no profile row, manual reconciliation needed", userId, sub.id); return null; }

  // ordering guard: never let an older event overwrite a newer state. A failed
  // read must THROW: silently skipping the guard would let a delayed older event
  // (e.g. updated:active after deleted) overwrite newer state and settle as 200
  const { data: cur } = must(await admin.from("subscriptions").select("last_event_created").eq("id", sub.id).maybeSingle(), "ordering guard read");
  if (cur?.last_event_created && cur.last_event_created > eventCreated) return userId;

  const item = sub.items?.data?.[0];
  must(await admin.from("subscriptions").upsert({
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
  }), "subscriptions upsert");
  const hasAccess = ["active", "trialing", "past_due"].includes(sub.status);
  await setAccessFlag(userId, hasAccess);
  return userId;
}

async function claimEmail(key: string, userId: string | null, kind: string): Promise<boolean> {
  // sent_at stays NULL until the provider confirms delivery (set by the caller)
  const { error } = await admin.from("emails_log").insert({ key, user_id: userId, kind });
  if (!error) return true;
  // any non-duplicate error must throw so the handler 500s and Stripe redelivers
  if (error.code !== "23505") throw new Error(`emails_log claim failed: ${error.message}`);
  // duplicate: take over ONLY a stale unsent claim (a delivery killed mid-send).
  // sent_at set means delivered, never resend.
  const { data: takeover, error: toErr } = await admin.from("emails_log")
    .update({ claimed_at: new Date().toISOString() })
    .eq("key", key).is("sent_at", null)
    .lt("claimed_at", new Date(Date.now() - 120000).toISOString())
    .select("key");
  if (toErr) throw new Error(`emails_log takeover failed: ${toErr.message}`);
  if (takeover && takeover.length) return true;
  // takeover missed: either the email was delivered (skip quietly), or the claim
  // is fresh-and-unsent. A fresh unsent claim may be orphaned (its holder failed
  // and could not release), so NEVER settle the event on it: throw, let Stripe
  // retry, and once the claim ages past 120s the takeover above wins.
  const { data: row, error: rowErr } = await admin.from("emails_log").select("sent_at").eq("key", key).maybeSingle();
  if (rowErr) throw new Error(`emails_log state check failed: ${rowErr.message}`);
  if (row && row.sent_at) return false;
  throw new Error("email claim fresh and unsent, retry later");
}

async function sendWelcome(userId: string, email: string, name: string, hasProfile = true) {
  // emails_log.user_id carries an FK to profiles: for an orphaned checkout
  // (no profile row) the claim is keyed by userId but linked to null
  if (!(await claimEmail(`welcome:${userId}`, hasProfile ? userId : null, "welcome"))) return;
  // if the send fails: release the claim AND throw, so the handler 500s, the
  // stripe_events claim gets deleted, and Stripe's redelivery retries the send
  // (everything else in the handler is idempotent upserts)
  const releaseClaim = async () => {
    // only ever release an UNSENT claim; a sent_at row is a delivered email
    const { error } = await admin.from("emails_log").delete().eq("key", `welcome:${userId}`).is("sent_at", null);
    if (error) console.error("welcome claim release failed", userId, error);
  };
  const site = Deno.env.get("SITE_URL") ?? "https://jaygptpro.com/ai-vault";
  // hard timeout: a hung Resend connection must fail in-process so the
  // release-and-500 path always runs before Stripe gives up on the delivery
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15000);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: abort.signal,
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY_VAULT")}`,
      "Content-Type": "application/json",
      // provider-side dedup: an aborted-but-actually-delivered send must not
      // double-deliver when the retry resends with the same key
      "Idempotency-Key": `welcome:${userId}`,
    },
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
  }).then(async (res) => {
    clearTimeout(timer);
    if (!res.ok) {
      console.error("welcome email failed", res.status, await res.text().catch(() => ""));
      await releaseClaim();
      throw new Error("welcome email send failed");
    }
    // delivery confirmed: stamp sent_at so no future takeover can ever resend.
    // A failed stamp must 500 the event: the retry re-sends (deduped by the
    // provider Idempotency-Key, minutes vs its 24h window) and re-stamps.
    must(await admin.from("emails_log").update({ sent_at: new Date().toISOString() }).eq("key", `welcome:${userId}`), "sent_at stamp");
  }, async (e) => {
    clearTimeout(timer);
    console.error("welcome email failed", e);
    await releaseClaim();
    throw new Error("welcome email send failed");
  });
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

  // idempotency: claim the event id, delete the claim on failure so Stripe retries reprocess.
  // Only a unique violation means "already claimed"; any other insert error must 500 so Stripe retries.
  const { error: claimErr } = await admin.from("stripe_events").insert({ id: event.id, type: event.type, created: event.created });
  if (claimErr) {
    if (claimErr.code === "23505") {
      // claimed is not processed: if the delivery holding the claim died mid-flight
      // (isolate killed, hung fetch) the row exists with processed_at null. After a
      // 2-minute grace measured from claimed_at (the CURRENT claim's age, so
      // re-claims get a fresh window) release the stuck claim so this retry 500s
      // and the NEXT redelivery reprocesses. All handler work is idempotent upserts.
      const { data: stale } = await admin.from("stripe_events")
        .delete().eq("id", event.id).is("processed_at", null)
        .lt("claimed_at", new Date(Date.now() - 120000).toISOString()).select("id");
      if (stale && stale.length) {
        console.error("released stuck event claim", event.id);
        return new Response("stuck claim released, retry again", { status: 500 });
      }
      // 200 ONLY when a row exists with processed_at set. A missing row means the
      // claim was just released (retry must reprocess), and an unreadable state
      // must keep Stripe retrying rather than end deliveries on a guess.
      const { data: prev, error: prevErr } = await admin.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
      if (prevErr) return new Response("state unknown, retry", { status: 500 });
      if (!prev || !prev.processed_at) return new Response("claim released or in flight", { status: 500 });
      return new Response("already processed", { status: 200 });
    }
    console.error("event claim failed", event.id, claimErr);
    return new Response("claim error", { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.client_reference_id || s.metadata?.supabase_user_id;
        if (userId && s.customer) {
          // profile FIRST: billing_customers and subscriptions carry an FK to
          // profiles, so a missing profile (account deleted between checkout and
          // webhook) must skip those writes instead of crash-looping on 23503
          const { data: p } = must(await admin.from("profiles").select("google_email,display_name").eq("id", userId).maybeSingle(), "profile lookup");
          if (p) {
            must(await admin.from("billing_customers").upsert({ user_id: userId, stripe_customer_id: String(s.customer) }), "billing_customers upsert");
            // store the paid email as alias if it differs from the Google email
            const paidEmail = s.customer_details?.email;
            if (paidEmail && paidEmail.toLowerCase() !== p.google_email.toLowerCase()) {
              must(await admin.from("profiles").update({ primary_email: paidEmail }).eq("id", userId), "primary_email update");
            }
            if (s.subscription) {
              const sub = await stripe.subscriptions.retrieve(String(s.subscription));
              await upsertSubscription(sub, event.created);
            }
          } else {
            console.error("ORPHANED CHECKOUT: paid user has no profile row, manual reconciliation needed", userId, s.id);
          }
          await sendWelcome(userId, s.customer_details?.email || p?.google_email || "", (p?.display_name || "").split(" ")[0], !!p);
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
        const { data: bc } = must(await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", String(inv.customer)).maybeSingle(), "billing lookup");
        if (bc) must(await admin.from("subscriptions").update({ dunning_since: new Date().toISOString() }).eq("user_id", bc.user_id).in("status", ["active", "past_due"]), "dunning update");
        // Stripe Smart Retries + Stripe's own dunning emails handle recovery. past_due keeps access.
        break;
      }
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        const { data: bc } = must(await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", String(ch.customer)).maybeSingle(), "billing lookup");
        if (bc) must(await admin.from("refunds_log").upsert({ user_id: bc.user_id, refund_id: ch.id, reason: "refund" }, { onConflict: "user_id", ignoreDuplicates: true }), "refunds_log upsert");
        break; // access revocation flows from the subscription.deleted event when Jay cancels
      }
      case "charge.dispute.created": {
        const ch = event.data.object as Stripe.Dispute;
        const { data: bc } = must(await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", String(ch.charge && (await stripe.charges.retrieve(String(ch.charge))).customer)).maybeSingle(), "billing lookup");
        if (bc) {
          must(await admin.from("billing_customers").update({ blocked: true }).eq("user_id", bc.user_id), "billing block");
          must(await admin.from("subscriptions").update({ access_blocked: true }).eq("user_id", bc.user_id), "access block");
          await setAccessFlag(bc.user_id, false);
        }
        break;
      }
      default:
        break; // event logged in stripe_events either way
    }
    // a failed stamp must also retry: 200 here would leave the row claimed-but-
    // unstamped forever (Stripe stops redelivering once it sees 200)
    must(await admin.from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id), "processed_at stamp");
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("handler failed", event.type, e);
    // release the claim so Stripe's retry reprocesses; a failed release means the
    // event is stuck as claimed-but-unprocessed, so log it loudly
    const { error: relErr } = await admin.from("stripe_events").delete().eq("id", event.id);
    if (relErr) console.error("EVENT CLAIM STUCK, manual replay needed", event.id, relErr);
    return new Response("handler error", { status: 500 });
  }
});
