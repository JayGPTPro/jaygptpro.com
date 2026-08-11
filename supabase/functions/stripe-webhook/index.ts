import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const formSecret = Deno.env.get('FORM_SYNC_SECRET') || '';

// Signature verification. This endpoint is public and unauthenticated, so without it
// anyone who knows the URL can POST a forged checkout.session.completed and grant
// themselves a paid row. Enforced only when STRIPE_WEBHOOK_SECRET is set, so that a
// missing secret degrades to today's behaviour (loudly) instead of rejecting every
// real purchase across all three products. SET THE SECRET.
const stripeForSig = stripeKey
  ? new Stripe(stripeKey, { apiVersion: '2025-12-15.clover', httpClient: Stripe.createFetchHttpClient() })
  : null;
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const SEND_WELCOME_URL = `${supabaseUrl}/functions/v1/send-welcome-email`;
const SEND_WELCOME_BINA_URL = `${supabaseUrl}/functions/v1/send-welcome-bina`;
const SEND_WELCOME_ENGLISH_URL = `${supabaseUrl}/functions/v1/send-welcome-english`;

// Evergreen: one product, always-open, weekly Monday cohorts. Buyers are assigned to the upcoming Monday's wk_ round.
const EVERGREEN_PRODUCT = 'prod_UdyoNBZgnpQwan';
const EVERGREEN_WA = 'https://chat.whatsapp.com/Kw459iL73jV4zSTSxd18tS';
const EVERGREEN_PORTAL = 'https://jaygptpro.com/donna-challenge/';
// Active USD evergreen payment links. Mapping these directly to the evergreen flow means a buyer
// resolves to the upcoming wk_ cohort WITHOUT needing STRIPE_SECRET_KEY / a session product lookup.
const EVERGREEN_PLINKS = new Set([
  'plink_1TevFWRqcDuiISNTHnwIfuLq', // landing-page buy button (full price)
  'plink_1TegrRRqcDuiISNTTajV9LLO', // discounted link
]);
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Cross-sell products. These ride along inside somebody else's checkout, so they must
// never be treated as the thing that was bought: not for round resolution, and not as
// a purchase on their own.
const DONNA_ADDON_PRODUCT = 'prod_UxhPy8Tfpeiwv6'; // "Donna Challenge. Full Access", $250
const ADDON_PRODUCTS = new Set([DONNA_ADDON_PRODUCT]);

// Fallback for when STRIPE_SECRET_KEY is absent and line items cannot be read.
// Every USD total that can only be reached by adding the $250 Donna cross-sell:
//   Golden 697 + 250, Golden 497 (WONKA200) + 250, Private Tour 2999 + 250.
// The 94900/74900 pair is kept from when the price read 699/499, harmless if
// unreachable. Amount matching is brittle by nature, so it is used ONLY as a
// fallback and it announces itself in the logs. Set the key and this stops
// being consulted.
const DONNA_ADDON_TOTALS_USD = new Set([94700, 74700, 94900, 74900, 324900]);

const FALLBACK_PLINK_TO_ROUND: Record<string, string> = {
  'plink_1TRshDRqcDuiISNTcGBCP4yl': 'bina_r1',
  'plink_1TRshHRqcDuiISNT5UgwSDd0': 'bina_r2',
  'plink_1TSgHARqcDuiISNTK0yKXFNQ': 'round4',
  'plink_1TSg6TRqcDuiISNTcj9XcIrf': 'round4',
  'plink_1TSgHFRqcDuiISNT5N0yhhSQ': 'round5',
  'plink_1TSg6YRqcDuiISNTL8bvltkL': 'round5',
};
const FALLBACK_PRODUCT_TO_ROUND: Record<string, string> = {
  'prod_UCzffM0SU6fWW5': 'round2',
  'prod_URZEzjLnIA9yPX': 'round4',
  'prod_URZEKiFdSoJTO6': 'round5',
  'prod_UQk3t4u4M4ktwO': 'bina_r1',
  'prod_UQk4gu2czKqQ6y': 'bina_r2',
  // Wonka. The Golden Ticket also resolves via the plink on the wonka_r1 row, but the
  // Private Tour had NO second route: its plink is parked in stripe_plink_discounted,
  // and issuing a real discount link would overwrite it and drop those buyers.
  'prod_UxhJATVn8CEfCT': 'wonka_r1', // Golden Ticket, $697 / $497 with WONKA200
  'prod_UxhOUOpgTAGC7q': 'wonka_r1', // The Private Tour, $2,999
};

// A Wonka purchase must never be silently reassigned to a Donna cohort. Used to
// suppress the evergreen fallthrough below.
// Both a product AND a plink route, deliberately: product ids come from the Stripe
// line-items call, which needs STRIPE_SECRET_KEY and returns [] on any non-2xx. If the
// guard leaned on that alone it would go blind in exactly the failure it exists to catch
// (proven in the harness: with no Stripe key the buyer still landed in a wk_ cohort).
// The plink arrives on the webhook payload itself and needs no API call.
const WONKA_PRODUCTS = new Set(['prod_UxhJATVn8CEfCT', 'prod_UxhOUOpgTAGC7q']);
const WONKA_PLINKS = new Set([
  'plink_1U1vCERqcDuiISNTjqJvj1P5', // Golden Ticket
  'plink_1TxmiPRqcDuiISNTKsKrn7Lz', // The Private Tour
]);
function isWonkaRound(round: string): boolean {
  return !!round && round.startsWith('wonka');
}

function isBinaRound(canonical: string): boolean {
  return canonical.startsWith('bina_');
}
function canonicalToShort(canonical: string): string {
  if (canonical === 'round4') return 'r4';
  if (canonical === 'round5') return 'r5';
  if (canonical === 'bina_r1') return 'r1';
  if (canonical === 'bina_r2') return 'r2';
  return '';
}
function canonicalToAllowedEmailsRound(canonical: string): string {
  if (canonical === 'bina_r1') return 'round1';
  if (canonical === 'bina_r2') return 'round2';
  return canonical;
}
function couponFromAmount(amountPaid: number): string {
  if (amountPaid === 19700) return 'EARLYBIRD200';
  if (amountPaid === 24700) return 'LAUNCH';
  if (amountPaid <= 200) return 'TEST';
  return 'FULL_PRICE';
}

// ---- Evergreen date helpers (mirror ensure-cohort-rounds) ----
function nyDateStr(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  let y = '', m = '', d = '';
  parts.forEach(p => { if (p.type === 'year') y = p.value; if (p.type === 'month') m = p.value; if (p.type === 'day') d = p.value; });
  return `${y}-${m}-${d}`;
}
function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// Upcoming Monday. If today is Monday, roll to next week (today's cohort already started at 2pm NY).
function upcomingMonday(fromDateStr: string): Date {
  const d = new Date(fromDateStr + 'T00:00:00Z');
  const dow = d.getUTCDay();
  let add = (1 - dow + 7) % 7;
  if (add === 0) add = 7;
  return new Date(d.getTime() + add * 86400000);
}
function datesDisplay(monday: Date, friday: Date): string {
  const mMon = MONTHS[monday.getUTCMonth()];
  const mFri = MONTHS[friday.getUTCMonth()];
  const year = friday.getUTCFullYear();
  if (monday.getUTCMonth() === friday.getUTCMonth()) {
    return `${mMon} ${monday.getUTCDate()}-${friday.getUTCDate()}, ${year}`;
  }
  return `${mMon} ${monday.getUTCDate()} - ${mFri} ${friday.getUTCDate()}, ${year}`;
}
// Resolve (and defensively create) the wk_ round for the buyer: the upcoming Monday cohort.
async function ensureEvergreenRound(supabase: SupabaseClient): Promise<string> {
  const today = nyDateStr();
  const monday = upcomingMonday(today);
  const friday = new Date(monday.getTime() + 4 * 86400000);
  const startStr = ymd(monday);
  const id = `wk_${startStr.replace(/-/g, '_')}`;
  const row = {
    id,
    name: `Claude Code Challenge (week of ${MONTHS[monday.getUTCMonth()]} ${monday.getUTCDate()})`,
    start_date: startStr,
    end_date: ymd(friday),
    language: 'en',
    status: 'upcoming',
    whatsapp_link: EVERGREEN_WA,
    welcome_dates_display: datesDisplay(monday, friday),
    stripe_product_id: EVERGREEN_PRODUCT,
    portal_url: EVERGREEN_PORTAL,
    notes: 'Auto-created evergreen weekly cohort (webhook)',
  };
  const { error } = await supabase.from('rounds').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.error('ensureEvergreenRound upsert error:', error);
  return id;
}

// Every product in the checkout session, in order. A cross-sell means a session can
// carry more than one, so the single-product helper below picks the first that is NOT
// an add-on: an add-on must never decide which round the buyer belongs to.
async function fetchSessionProductIds(sessionId: string): Promise<string[]> {
  if (!sessionId || !stripeKey) return [];
  try {
    const url = `https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items?limit=10&expand[]=data.price.product`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${stripeKey}` } });
    if (!res.ok) { console.error('fetchSessionProductIds failed:', res.status, await res.text()); return []; }
    const json = await res.json();
    const out: string[] = [];
    for (const item of (json?.data || [])) {
      const product = item?.price?.product;
      if (typeof product === 'string') out.push(product);
      else if (product && typeof product === 'object' && product.id) out.push(product.id);
    }
    return out;
  } catch (e) { console.error('fetchSessionProductIds error:', e); return []; }
}

async function fetchSessionProductId(sessionId: string): Promise<string | null> {
  const ids = await fetchSessionProductIds(sessionId);
  return ids.find(id => !ADDON_PRODUCTS.has(id)) || ids[0] || null;
}

async function roundFromPlink(supabase: SupabaseClient, plinkId: string): Promise<string | null> {
  if (!plinkId) return null;
  try {
    const { data, error } = await supabase
      .from('rounds')
      .select('id')
      .or(`stripe_plink_full_price.eq.${plinkId},stripe_plink_discounted.eq.${plinkId}`)
      .limit(1)
      .maybeSingle();
    if (!error && data?.id) return data.id;
  } catch (e) { console.error('roundFromPlink exception:', e); }
  return FALLBACK_PLINK_TO_ROUND[plinkId] || null;
}

async function roundFromProduct(supabase: SupabaseClient, productId: string): Promise<string | null> {
  if (!productId) return null;
  try {
    const { data, error } = await supabase
      .from('rounds')
      .select('id')
      .eq('stripe_product_id', productId)
      .limit(1)
      .maybeSingle();
    if (!error && data?.id) return data.id;
  } catch (e) { console.error('roundFromProduct exception:', e); }
  return FALLBACK_PRODUCT_TO_ROUND[productId] || null;
}

async function reconcileAccessFor(supabase: SupabaseClient, email: string) {
  if (!email) return;
  const lower = email.toLowerCase();
  const { data: payments } = await supabase
    .from('stripe_customers')
    .select('id, amount_paid, refunded, coupon_used')
    .ilike('email', lower);
  const hasActive = (payments || []).some(p => !p.refunded && (p.coupon_used || '').toUpperCase() !== 'TEST');
  if (hasActive) {
    await supabase.from('allowed_emails').update({ access_revoked_at: null, access_revoked_reason: null }).ilike('email', lower).not('access_revoked_at', 'is', null);
  } else {
    await supabase.from('allowed_emails').update({ access_revoked_at: new Date().toISOString(), access_revoked_reason: 'Stripe refund (auto)' }).ilike('email', lower).is('access_revoked_at', null);
  }
}

async function upgradeAllowedEmailRound(supabase: SupabaseClient, email: string, round: string) {
  if (!email || !round || round === 'unknown') return;
  const lower = email.toLowerCase();
  await supabase.from('allowed_emails').update({ round }).ilike('email', lower).or('round.is.null,round.eq.unknown');
}

// CRITICAL DEDUP: claim the welcome by atomically setting welcome_email_sent_at IF still NULL.
// Returns true if THIS caller may proceed to send. Returns false if another caller already claimed.
// Used to prevent duplicate welcome emails when both payment_intent.succeeded AND
// checkout.session.completed events fire for the same payment.
async function claimWelcome(supabase: SupabaseClient, email: string): Promise<boolean> {
  if (!email) return false;
  const lower = email.toLowerCase();
  const { data } = await supabase
    .from('allowed_emails')
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .ilike('email', lower)
    .is('welcome_email_sent_at', null)
    .select('email');
  return Array.isArray(data) && data.length > 0;
}

async function sendWelcomeEmailAsync(email: string) {
  if (!email || !formSecret) return;
  try {
    const res = await fetch(SEND_WELCOME_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-form-secret': formSecret }, body: JSON.stringify({ email }) });
    const detail = await res.json().catch(() => ({}));
    console.log('send-welcome-email status:', res.status, JSON.stringify(detail));
  } catch (e) { console.error('send-welcome-email call failed:', e); }
}
async function sendWelcomeBinaAsync(email: string, round: string) {
  if (!email || !formSecret) return;
  try {
    const res = await fetch(SEND_WELCOME_BINA_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-form-secret': formSecret }, body: JSON.stringify({ email, round }) });
    const detail = await res.json().catch(() => ({}));
    console.log('send-welcome-bina status:', res.status, JSON.stringify(detail));
  } catch (e) { console.error('send-welcome-bina call failed:', e); }
}
async function sendWelcomeEnglishAsync(email: string, round: string) {
  if (!email || !formSecret) return;
  try {
    const res = await fetch(SEND_WELCOME_ENGLISH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-form-secret': formSecret }, body: JSON.stringify({ email, round }) });
    const detail = await res.json().catch(() => ({}));
    console.log('send-welcome-english status:', res.status, JSON.stringify(detail));
  } catch (e) { console.error('send-welcome-english call failed:', e); }
}

// A round row may name its own welcome function in `welcome_email_fn_slug`.
// This is how a NON-Donna product (Wonka, and whatever comes after it) gets the
// right welcome without another hardcoded branch in here. Returns '' when the
// round has no slug, which keeps every existing round on its current path.
async function welcomeFnSlugFor(supabase: SupabaseClient, canonical: string): Promise<string> {
  if (!canonical || canonical === 'unknown') return '';
  try {
    const { data, error } = await supabase
      .from('rounds')
      .select('welcome_email_fn_slug')
      .eq('id', canonical)
      .maybeSingle();
    if (!error && data?.welcome_email_fn_slug) return String(data.welcome_email_fn_slug);
  } catch (e) { console.error('welcomeFnSlugFor exception:', e); }
  return '';
}

// Returns true only when the welcome actually went out. The caller uses this to decide
// whether to release the welcome claim and fail the webhook so Stripe retries. Every
// early return here is a path where the buyer gets NO email, so each must report false.
async function sendWelcomeBySlugAsync(slug: string, email: string, round: string): Promise<boolean> {
  if (!email || !slug) return false;
  if (!formSecret) { console.error('FORM_SYNC_SECRET is not set: cannot call the welcome function.'); return false; }
  // Guard the slug: it becomes a URL path segment.
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) { console.error('Refusing suspicious welcome slug:', slug); return false; }
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-form-secret': formSecret }, body: JSON.stringify({ email, round }) });
    const detail = await res.json().catch(() => ({}));
    console.log(`${slug} status:`, res.status, JSON.stringify(detail));
    return res.ok;
  } catch (e) { console.error(`${slug} call failed:`, e); return false; }
}

// Undo a welcome claim so a retry can send it. Used when the send did not happen.
async function releaseWelcomeClaim(supabase: SupabaseClient, email: string) {
  if (!email) return;
  await supabase.from('allowed_emails').update({ welcome_email_sent_at: null }).ilike('email', email.toLowerCase());
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    // Read the body as TEXT: the signature is computed over the raw bytes, so parsing first
    // would make verification impossible.
    const raw = await req.text();
    let event: any;
    if (webhookSecret && stripeForSig) {
      const sig = req.headers.get('stripe-signature');
      if (!sig) return new Response(JSON.stringify({ error: 'missing stripe-signature' }), { status: 400 });
      try {
        event = await stripeForSig.webhooks.constructEventAsync(raw, sig, webhookSecret, undefined, cryptoProvider);
      } catch (e) {
        console.error('Stripe signature verification FAILED:', String(e));
        return new Response(JSON.stringify({ error: 'bad signature' }), { status: 400 });
      }
    } else {
      console.warn('STRIPE_WEBHOOK_SECRET is not set: accepting this webhook UNVERIFIED. Anyone who knows this URL can forge a purchase. Set the secret.');
      event = JSON.parse(raw);
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const paymentId = charge.payment_intent || charge.id;
      const refundedAmount = charge.amount_refunded || 0;
      const fullyRefunded = charge.refunded === true;
      const reason = charge.refunds?.data?.[0]?.reason || null;
      const refundedAt = charge.refunds?.data?.[0]?.created ? new Date(charge.refunds.data[0].created * 1000).toISOString() : new Date().toISOString();
      const email = (charge.billing_details?.email || charge.receipt_email || '').toLowerCase();
      const currency = (charge.currency || '').toLowerCase();
      const { data: existing } = await supabase.from('stripe_customers').select('id, amount_paid, email').or(`id.eq.${paymentId},stripe_customer_id.eq.${charge.customer || 'NONE'}`).limit(1);
      if (existing && existing.length > 0) {
        const row = existing[0];
        await supabase.from('stripe_customers').update({ refunded: fullyRefunded, refund_amount: refundedAmount, refunded_at: refundedAt, refund_reason: reason }).eq('id', row.id);
        await reconcileAccessFor(supabase, row.email || email);
      } else {
        await supabase.from('stripe_customers').upsert({ id: paymentId, email, name: charge.billing_details?.name || '', country: charge.billing_details?.address?.country || '', phone: charge.billing_details?.phone || null, amount_paid: charge.amount || 0, currency: charge.currency || 'usd', coupon_used: couponFromAmount(charge.amount || 0), payment_date: new Date(charge.created * 1000).toISOString(), stripe_customer_id: charge.customer || '', refunded: fullyRefunded, refund_amount: refundedAmount, refunded_at: refundedAt, refund_reason: reason }, { onConflict: 'id' });
        await reconcileAccessFor(supabase, email);
      }
      return new Response(JSON.stringify({ received: true, type: 'refund' }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (event.type === 'charge.refund.updated' || event.type === 'refund.created' || event.type === 'refund.updated') {
      const refund = event.data.object;
      const paymentId = refund.payment_intent || refund.charge;
      const status = refund.status;
      if (status === 'succeeded' && paymentId) {
        const { data: existing } = await supabase.from('stripe_customers').select('amount_paid, email, refund_amount, currency').eq('id', paymentId).maybeSingle();
        const totalRefunded = (existing?.refund_amount || 0) + (refund.amount || 0);
        const isFullyRefunded = existing && existing.amount_paid > 0 && totalRefunded >= existing.amount_paid;
        const { data: row } = await supabase.from('stripe_customers').update({ refunded: isFullyRefunded, refund_amount: refund.amount, refunded_at: refund.created ? new Date(refund.created * 1000).toISOString() : new Date().toISOString(), refund_reason: refund.reason || null }).eq('id', paymentId).select('email, currency').maybeSingle();
        if (row?.email) await reconcileAccessFor(supabase, row.email);
      }
      return new Response(JSON.stringify({ received: true, type: 'refund_event' }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (event.type !== 'payment_intent.succeeded' && event.type !== 'checkout.session.completed') {
      return new Response(JSON.stringify({ received: true, skipped: event.type }), { headers: { 'Content-Type': 'application/json' } });
    }

    let customerEmail = '', customerName = '', customerPhone = '', country = '', paymentId = '', customerId = '', paymentLinkId = '', sessionId = '';
    let amountPaid = 0, currency = 'usd';

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      paymentId = pi.id;
      amountPaid = pi.amount;
      currency = pi.currency;
      customerId = pi.customer || '';
      if (pi.charges?.data?.[0]) {
        const charge = pi.charges.data[0];
        customerEmail = charge.billing_details?.email || '';
        customerName = charge.billing_details?.name || '';
        customerPhone = charge.billing_details?.phone || '';
        country = charge.billing_details?.address?.country || '';
      }
      if (!customerEmail) customerEmail = pi.receipt_email || pi.metadata?.email || '';
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      sessionId = session.id;
      paymentId = session.payment_intent || session.id;
      amountPaid = session.amount_total;
      currency = session.currency;
      customerEmail = session.customer_email || session.customer_details?.email || '';
      customerName = session.customer_details?.name || '';
      customerPhone = session.customer_details?.phone || '';
      country = session.customer_details?.address?.country || '';
      customerId = session.customer || '';
      paymentLinkId = session.payment_link || '';
    }

    if (!paymentId) return new Response(JSON.stringify({ error: 'No payment ID found' }), { status: 400 });

    const currencyLower = (currency || '').toLowerCase();
    const couponUsedFromAmount = couponFromAmount(amountPaid);

    // Read the line items ONCE. Needed for two independent things: resolving the round when
    // the payment link did not, and spotting a cross-sell. The add-on check must run even
    // when the round already resolved, which is the normal Wonka case.
    const sessionProductIds = sessionId ? await fetchSessionProductIds(sessionId) : [];
    let tookDonnaAddon = sessionProductIds.includes(DONNA_ADDON_PRODUCT);
    // No key means no line items, so fall back to the total. USD only: the Bina
    // side prices in ILS and has no cross-sell, and matching across currencies
    // would be a coincidence waiting to happen.
    if (!tookDonnaAddon && !stripeKey && currencyLower === 'usd' && DONNA_ADDON_TOTALS_USD.has(amountPaid)) {
      tookDonnaAddon = true;
      console.warn(`Donna add-on inferred from total ${amountPaid} because STRIPE_SECRET_KEY is not set. Set the key to read line items properly.`);
    }

    let canonicalRound: string | null = null;
    if (paymentLinkId) canonicalRound = await roundFromPlink(supabase, paymentLinkId);
    // Known evergreen plinks resolve directly, no STRIPE_SECRET_KEY needed.
    if (!canonicalRound && paymentLinkId && EVERGREEN_PLINKS.has(paymentLinkId)) {
      canonicalRound = await ensureEvergreenRound(supabase);
    }
    if (!canonicalRound && sessionProductIds.length) {
      const productId = sessionProductIds.find(id => !ADDON_PRODUCTS.has(id)) || null;
      if (productId === EVERGREEN_PRODUCT) {
        // Evergreen: assign to the upcoming Monday cohort (create the row if it doesn't exist yet).
        canonicalRound = await ensureEvergreenRound(supabase);
      } else if (productId) {
        canonicalRound = await roundFromProduct(supabase, productId);
      }
    }

    const isBina = canonicalRound ? isBinaRound(canonicalRound) : (currencyLower === 'ils');
    const couponUsed = isBina ? 'BINA300' : couponUsedFromAmount;

    const { error: insertError } = await supabase.from('stripe_customers').upsert({
      id: paymentId, name: customerName, email: customerEmail, phone: customerPhone || null, country: country, amount_paid: amountPaid, currency: currency, coupon_used: couponUsed, payment_date: new Date().toISOString(), stripe_customer_id: customerId, round: canonicalRound,
    }, { onConflict: 'id' });
    if (insertError) { console.error('Insert error:', insertError); return new Response(JSON.stringify({ error: insertError.message }), { status: 500 }); }

    // ============================================================
    // WELCOME EMAIL: only fire from checkout.session.completed.
    // payment_intent.succeeded fires WITHOUT payment_link info, which means we can't resolve
    // the round properly and would fall through to the LEGACY R1/R2 welcome.
    // checkout.session.completed fires ~5s later with the payment_link, so we send the correct welcome from there.
    // Defensive secondary dedup via claimWelcome (atomic UPDATE...WHERE welcome_email_sent_at IS NULL).
    // ============================================================
    if (event.type === 'checkout.session.completed') {
      if (isBina) {
        if (customerEmail && canonicalRound) {
          const shortRound = canonicalToShort(canonicalRound) || 'r1';
          const lowerEmail = customerEmail.toLowerCase();
          const allowedRound = canonicalToAllowedEmailsRound(canonicalRound);
          await supabase.from('bina_registrations').upsert({ email: lowerEmail, round: shortRound }, { onConflict: 'email' });
          const { error: insertEmailErr } = await supabase.from('allowed_emails').insert({ email: lowerEmail, name: customerName, round: allowedRound, phone: customerPhone || null, stripe_payment_id: paymentId, customer_type: 'paid', notes: `Auto-added by Stripe webhook (Bina ${shortRound})` });
          if (insertEmailErr && !String(insertEmailErr.message).includes('duplicate')) console.error('allowed_emails insert error (Bina):', insertEmailErr);
          await upgradeAllowedEmailRound(supabase, customerEmail, allowedRound);
          await reconcileAccessFor(supabase, customerEmail);
          if (couponUsed !== 'TEST') {
            // Atomic claim: only send if welcome_email_sent_at IS NULL.
            const may = await claimWelcome(supabase, customerEmail);
            if (may) await sendWelcomeBinaAsync(customerEmail, shortRound);
          }
        }
      } else {
        // English branch
        if (customerEmail) {
          // FIX (2026-06-13): never fall through to the legacy R1/R2 welcome (which shows stale
          // April dates when round2 is still 'upcoming'). If the link/product didn't resolve to a
          // round, default to the upcoming Monday evergreen cohort (always correct current dates),
          // so the buyer lands on a real round and gets the proper send-welcome-english.
          // ...but NEVER for a Wonka purchase. Dropping a $697 Wonka buyer into a Donna
          // weekly cohort gives them the Donna welcome, the Donna portal url, and a round
          // the Wonka gate rejects. If a Wonka product was bought and the round still did
          // not resolve, refuse loudly: 500 makes Stripe retry and shows red on the
          // dashboard, which is the alert that does not otherwise exist.
          const boughtWonka = sessionProductIds.some(id => WONKA_PRODUCTS.has(id))
            || (!!paymentLinkId && WONKA_PLINKS.has(paymentLinkId));
          if (!canonicalRound && boughtWonka) {
            console.error('Wonka purchase with unresolved round. Refusing to assign a Donna cohort.', { paymentLinkId, sessionProductIds, paymentId });
            return new Response(JSON.stringify({ error: 'wonka round unresolved' }), { status: 500 });
          }
          if (!canonicalRound) canonicalRound = await ensureEvergreenRound(supabase);
          const englishRound = canonicalRound || 'unknown';
          const allowedEmailsRound = canonicalToAllowedEmailsRound(englishRound);
          const lowerEmail = customerEmail.toLowerCase();
          const { error: insertEmailErr } = await supabase.from('allowed_emails').insert({ email: lowerEmail, name: customerName, round: allowedEmailsRound, phone: customerPhone || null, stripe_payment_id: paymentId, addon_donna: tookDonnaAddon, notes: `Auto-added by Stripe webhook (payment_link: ${paymentLinkId || 'none'}, resolved: ${englishRound}${tookDonnaAddon ? ', +donna addon' : ''})` });
          const wasDuplicate = !!insertEmailErr && String(insertEmailErr.message).includes('duplicate');
          if (insertEmailErr && !wasDuplicate) {
            // Do NOT swallow this. A 200 here means Stripe never retries and the buyer is
            // lost with no trace. 500 makes Stripe retry, and every write in this handler
            // is replay-safe (upsert on id, duplicate-tolerant insert, atomic welcome claim).
            console.error('allowed_emails insert error:', insertEmailErr);
            return new Response(JSON.stringify({ error: 'allowed_emails insert failed' }), { status: 500 });
          }

          // A returning customer already has a row, so the insert above did nothing: their
          // round stays on the Donna value, upgradeAllowedEmailRound only fills blanks, and
          // the Wonka gate then tells a paying buyer "this ticket opens a different factory".
          // Most of the launch list is in this table already, so this is the common case,
          // not the edge case. Claim the row for Wonka and keep their Donna access.
          if (wasDuplicate && isWonkaRound(allowedEmailsRound)) {
            const { data: existing } = await supabase
              .from('allowed_emails')
              .select('round, addon_donna, stripe_payment_id, welcome_email_sent_at')
              .ilike('email', lowerEmail)
              .maybeSingle();
            const priorRound = String(existing?.round || '');
            // Only a real Donna round needs preserving. 'unknown' grants nothing, so do not
            // hand out Donna access that was never bought.
            const hadDonna = !!priorRound && !isWonkaRound(priorRound) && priorRound !== 'unknown';
            // Same payment id means this is a Stripe retry of an event already handled, so
            // leave the welcome claim alone rather than sending a second welcome.
            const isRetry = !!existing?.stripe_payment_id && existing.stripe_payment_id === paymentId;
            const patch: Record<string, unknown> = { round: allowedEmailsRound, stripe_payment_id: paymentId };
            if (hadDonna || tookDonnaAddon) patch.addon_donna = true;
            if (!isRetry) patch.welcome_email_sent_at = null; // re-arm claimWelcome for this purchase
            const { error: repairErr } = await supabase.from('allowed_emails').update(patch).ilike('email', lowerEmail);
            if (repairErr) {
              console.error('returning-buyer repair failed:', repairErr);
              return new Response(JSON.stringify({ error: 'allowed_emails repair failed' }), { status: 500 });
            }
            console.log('Returning buyer moved to Wonka:', { email: lowerEmail, priorRound, hadDonna, isRetry });
          }
          // The insert above is a no-op for somebody already in the table (email is UNIQUE),
          // so the add-on has to be granted separately or a returning buyer never gets it.
          // Only ever turns the flag ON: a later purchase without the add-on must not revoke it.
          if (tookDonnaAddon) {
            const { error: addonErr } = await supabase.from('allowed_emails').update({ addon_donna: true }).ilike('email', customerEmail.toLowerCase()).eq('addon_donna', false);
            if (addonErr) console.error('addon_donna grant error:', addonErr);
          }
          if (canonicalRound) await upgradeAllowedEmailRound(supabase, customerEmail, allowedEmailsRound);
          await reconcileAccessFor(supabase, customerEmail);

          if (couponUsed !== 'TEST') {
            const isEvergreen = englishRound.startsWith('wk_');
            const shortRound = canonicalToShort(englishRound);
            // Looked up BEFORE claiming the welcome so a lookup failure cannot burn the claim.
            // Deliberately consulted LAST, below, so every path that already works keeps working
            // byte for byte. This only replaces the legacy generic fallback.
            const customSlug = await welcomeFnSlugFor(supabase, englishRound);
            // Atomic claim before sending. Prevents duplicates if event is replayed.
            const may = await claimWelcome(supabase, customerEmail);
            if (may) {
              if (isEvergreen) {
                // Evergreen weekly cohort: send-welcome-english resolves dates/WhatsApp from the wk_ round row.
                await sendWelcomeEnglishAsync(customerEmail, englishRound);
              } else if (shortRound === 'r4' || shortRound === 'r5') {
                await sendWelcomeEnglishAsync(customerEmail, shortRound);
              } else if (customSlug && customSlug !== 'send-welcome-email') {
                // A non-Donna product naming its own welcome function (Wonka, and whatever follows).
                // Excludes 'send-welcome-email' so round1/round2 keep the exact legacy call below
                // rather than gaining a round argument they have never been sent.
                const sent = await sendWelcomeBySlugAsync(customSlug, customerEmail, englishRound);
                if (!sent) {
                  // The claim was already taken, so leaving it set means nobody ever sends this
                  // welcome and nothing anywhere records that. Release it and fail the webhook:
                  // Stripe retries with backoff for three days and shows the failure in red.
                  await releaseWelcomeClaim(supabase, customerEmail);
                  console.error('Welcome send failed, claim released, asking Stripe to retry:', { slug: customSlug, email: customerEmail.toLowerCase(), round: englishRound });
                  return new Response(JSON.stringify({ error: 'welcome send failed' }), { status: 500 });
                }
              } else {
                // Round 1/2/unknown: legacy generic welcome (rare path, only if product/plink lookup failed)
                await sendWelcomeEmailAsync(customerEmail);
              }
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true, email: customerEmail, amount: amountPaid, isBina, round: canonicalRound, eventType: event.type }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
