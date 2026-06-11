import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
const formSecret = Deno.env.get('FORM_SYNC_SECRET') || '';
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
};

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

async function fetchSessionProductId(sessionId: string): Promise<string | null> {
  if (!sessionId || !stripeKey) return null;
  try {
    const url = `https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items?limit=10&expand[]=data.price.product`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${stripeKey}` } });
    if (!res.ok) { console.error('fetchSessionProductId failed:', res.status, await res.text()); return null; }
    const json = await res.json();
    const items = json?.data || [];
    for (const item of items) {
      const product = item?.price?.product;
      if (typeof product === 'string') return product;
      if (product && typeof product === 'object' && product.id) return product.id;
    }
    return null;
  } catch (e) { console.error('fetchSessionProductId error:', e); return null; }
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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const body = await req.json();
    const event = body;
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

    let canonicalRound: string | null = null;
    if (paymentLinkId) canonicalRound = await roundFromPlink(supabase, paymentLinkId);
    // Known evergreen plinks resolve directly, no STRIPE_SECRET_KEY needed.
    if (!canonicalRound && paymentLinkId && EVERGREEN_PLINKS.has(paymentLinkId)) {
      canonicalRound = await ensureEvergreenRound(supabase);
    }
    if (!canonicalRound && sessionId) {
      const productId = await fetchSessionProductId(sessionId);
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
          const englishRound = canonicalRound || 'unknown';
          const allowedEmailsRound = canonicalToAllowedEmailsRound(englishRound);
          const { error: insertEmailErr } = await supabase.from('allowed_emails').insert({ email: customerEmail.toLowerCase(), name: customerName, round: allowedEmailsRound, phone: customerPhone || null, stripe_payment_id: paymentId, notes: `Auto-added by Stripe webhook (payment_link: ${paymentLinkId || 'none'}, resolved: ${englishRound})` });
          if (insertEmailErr && !String(insertEmailErr.message).includes('duplicate')) console.error('allowed_emails insert error:', insertEmailErr);
          if (canonicalRound) await upgradeAllowedEmailRound(supabase, customerEmail, allowedEmailsRound);
          await reconcileAccessFor(supabase, customerEmail);

          if (couponUsed !== 'TEST') {
            const isEvergreen = englishRound.startsWith('wk_');
            const shortRound = canonicalToShort(englishRound);
            // Atomic claim before sending. Prevents duplicates if event is replayed.
            const may = await claimWelcome(supabase, customerEmail);
            if (may) {
              if (isEvergreen) {
                // Evergreen weekly cohort: send-welcome-english resolves dates/WhatsApp from the wk_ round row.
                await sendWelcomeEnglishAsync(customerEmail, englishRound);
              } else if (shortRound === 'r4' || shortRound === 'r5') {
                await sendWelcomeEnglishAsync(customerEmail, shortRound);
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
