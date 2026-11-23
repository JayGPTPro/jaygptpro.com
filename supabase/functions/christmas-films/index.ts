import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handle, makeAskLimiter, VIDEO_PRODUCT, VAULT_COUPON, BONUS_START, BONUS_END, SKILL_PRICE_BF, type Order } from "./handler.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
const resendKey = Deno.env.get("RESEND_API_KEY") || "";
const NOTIFY_TO = "info@jaygptpro.com";

async function sha256hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}
const askAllowed = makeAskLimiter();

async function resend(to: string, subject: string, html: string, replyTo?: string): Promise<boolean> {
  if (!resendKey) { console.error("christmas-films: RESEND_API_KEY is not set"); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Jay Margaliot <info@jaygptpro.com>", to: [to], reply_to: replyTo || undefined, subject, html }),
    });
    if (!res.ok) { console.error("christmas-films mail failed:", res.status, await res.text()); return false; }
    return true;
  } catch (e) { console.error("christmas-films mail error:", e); return false; }
}

async function stripe(path: string, body?: URLSearchParams): Promise<Response> {
  return await fetch("https://api.stripe.com/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${stripeKey}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body,
  });
}

// deno-lint-ignore no-explicit-any
function usedVault(s: any): boolean {
  // A promotion code shows its coupon only in the expanded breakdown.
  for (const d of (s?.total_details?.breakdown?.discounts || [])) {
    if (d?.discount?.coupon?.id === VAULT_COUPON) return true;
  }
  for (const d of (s?.discounts || [])) {
    const c = typeof d?.coupon === "string" ? d.coupon : d?.coupon?.id;
    if (c === VAULT_COUPON) return true;
  }
  return false;
}

Deno.serve((req) =>
  handle(req, {
    order: async (id): Promise<Order | null> => {
      const res = await stripe(`checkout/sessions/${id}?expand[]=line_items&expand[]=total_details.breakdown&expand[]=payment_intent.latest_charge`);
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
        paymentIntent: typeof s?.payment_intent === "string" ? s.payment_intent : (s?.payment_intent?.id || ""),
        metadata: s?.metadata || {},
        created: Number(s?.created || 0),
        // when the money actually moved; a $0 order has no charge and falls back to "created"
        paidAt: Number(s?.payment_intent?.latest_charge?.created || 0),
        vault: usedVault(s),
      };
    },
    // Paid film orders by the same email, opened in the bonus window before this one.
    // Ties on the same second go to the lower session id, so exactly one order wins.
    earlierFilmOrder: async (email, created, sessionId) => {
      const q = new URLSearchParams({
        limit: "100", status: "complete",
        "customer_details[email]": email,
        "created[gte]": String(BONUS_START - 86400), "created[lt]": String(BONUS_END),
      });
      const res = await stripe(`checkout/sessions?${q}`);
      if (!res.ok) throw new Error(`stripe list ${res.status}`);
      const list = (await res.json())?.data || [];
      for (const x of list) {
        if (x.id === sessionId || x.payment_status !== "paid") continue;
        if (x?.metadata?.project !== "christmas_video") continue;
        const before = x.created < created || (x.created === created && x.id < sessionId);
        if (!before) continue;
        const li = await stripe(`checkout/sessions/${x.id}/line_items?limit=10`);
        if (!li.ok) throw new Error(`stripe line items ${li.status}`);
        const films = ((await li.json())?.data || []).some((it: any) => it?.price?.product === VIDEO_PRODUCT);
        if (films) return true;
      }
      return false;
    },
    // The Vault free film is recorded on the Stripe customer with that email (made if none).
    vaultClaimed: async (email) => {
      const res = await stripe(`customers?${new URLSearchParams({ email, limit: "100" })}`);
      if (!res.ok) throw new Error(`stripe customers ${res.status}`);
      return ((await res.json())?.data || []).some((c: any) => c?.metadata?.xmas_vault === "1");
    },
    // One free film per email, recorded atomically: Stripe runs one request per Idempotency-Key, and
    // any other request with the same key (in flight, replayed, or with other details) is not fresh.
    // The key lives 24 hours; after that, vaultClaimed (checked first) refuses a second claim.
    // The product key is letters, digits and ":" only (vaultProductKey), so it is safe in the query.
    vaultProductClaimed: async (product) => {
      if (!/^[a-z]+:[A-Za-z0-9]+$/.test(product)) throw new Error("bad product key");
      const q = new URLSearchParams({ query: `metadata['xmas_vault_product']:'${product}'`, limit: "1" });
      const res = await stripe(`customers/search?${q}`);
      if (!res.ok) throw new Error(`stripe customer search ${res.status}`);
      return ((await res.json())?.data || []).length > 0;
    },
    vaultClaimOnce: async (email, card) => {
      const body = new URLSearchParams({
        email, name: card.name,
        "metadata[xmas_vault]": "1",
        "metadata[xmas_vault_at]": new Date().toISOString(),
        "metadata[xmas_vault_link]": card.link,
        "metadata[xmas_vault_roles]": `${card.giver} to ${card.receiver}`,
        "metadata[xmas_vault_product]": card.product || "",
      });
      const res = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST", body,
        headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": "xmas-vault-film-" + await sha256hex(email) },
      });
      const text = await res.text();
      if (res.ok) return res.headers.get("idempotent-replayed") !== "true";
      if (res.status === 409 || /idempoten/i.test(text)) return false;
      throw new Error(`stripe vault claim ${res.status}: ${text}`);
    },
    bonusOrder: async (email) => {
      const q = new URLSearchParams({ limit: "100", status: "complete", "customer_details[email]": email, "created[gte]": String(BONUS_START - 86400) });
      const res = await stripe(`checkout/sessions?${q}`);
      if (!res.ok) throw new Error(`stripe list ${res.status}`);
      return ((await res.json())?.data || []).some((x: any) => x?.metadata?.project === "christmas_video" && x?.metadata?.bonus === "1");
    },
    skillCheckout: async (price, ref) => {
      const body = new URLSearchParams({
        mode: "payment",
        "line_items[0][price]": price, "line_items[0][quantity]": "1",
        success_url: "https://jaygptpro.com/christmas-video/thanks/?p=skill&session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://jaygptpro.com/christmas-video/#order",
        "metadata[project]": "christmas_video",
        "metadata[offer]": price === SKILL_PRICE_BF ? "bf_skill_199" : "skill_299",
        "custom_text[submit][message]": "Your kit opens right after you pay, and the link is in your email too.",
        customer_creation: "if_required",
      });
      if (ref) body.set("client_reference_id", ref);
      const res = await stripe("checkout/sessions", body);
      if (!res.ok) throw new Error(`stripe checkout ${res.status}: ${await res.text()}`);
      return String((await res.json())?.url || "");
    },
    // Follow an amzn.to / a.co link's redirects (never the Amazon page itself), at most 4 hops, 4 s.
    resolveShort: async (start) => {
      let url = start;
      for (let hop = 0; hop < 4; hop++) {
        const res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(4000) });
        await res.body?.cancel();
        const next = res.headers.get("location");
        if (!next) return url;
        url = new URL(next, url).toString();
        if (/(^|\.)amazon\./i.test(new URL(url).hostname)) return url;
      }
      return url;
    },
    now: () => Math.floor(Date.now() / 1000),
    saveMeta: async (id, patch) => {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(patch)) body.set(`metadata[${k}]`, v);
      const res = await stripe(`checkout/sessions/${id}`, body);
      if (!res.ok) throw new Error(`stripe save ${res.status}: ${await res.text()}`);
    },
    mail: (subject, html, replyTo) => resend(NOTIFY_TO, subject, html, replyTo),
    askAllowed,
  }).catch((e) => {
    console.error("christmas-films error:", e);
    return new Response(JSON.stringify({ error: "server" }), { status: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
  })
);
