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
const SEND_DONNA_ADDON_URL = `${supabaseUrl}/functions/v1/send-welcome-donna-addon`;

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
  'plink_1U1vCERqcDuiISNTjqJvj1P5', // Golden Ticket, $697 less WONKA200
  'plink_1TxmiPRqcDuiISNTKsKrn7Lz', // The Private Tour
  // Golden Ticket at $497 flat, no coupon. WONKA200 is a fixed $200 USD discount and
  // Stripe cannot express that in a buyer's local currency, so under Adaptive Pricing
  // it silently fails to apply and they are left looking at $697. This link carries
  // the discount in the price instead. Same product, so it resolves either way; it is
  // listed here because the product route goes blind when the Stripe line-items call
  // fails, and that is exactly when a Wonka buyer gets filed into a Donna cohort.
  'plink_1U8laoRqcDuiISNT1xwjgIAy',
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

// ===========================================================================
// THE INVARIANT, and why every access bug so far has been the same bug.
//
// There are two disagreeing models of "who is this customer":
//   WRITE side (this webhook, service key): the customer is the address that paid,
//     and it can read and write any row in the table.
//   READ side (both portals, the user's own JWT): RLS policy is
//     "Users can check their own email" -> auth.jwt() ->> 'email' = email.
//     The customer can ONLY ever read the single row matching the Google address
//     they signed in with. It cannot read a second row. Ever.
//
// So the invariant is: EVERY ADDRESS A CUSTOMER MIGHT SIGN IN WITH MUST HAVE A ROW
// THAT IS INDEPENDENTLY VALID. Any design that needs a second row at gate time is
// already broken, it just fails silently, and it fails as "no ticket found", which
// is the worst sentence this system can show a person who just paid.
//
// `primary_email` links rows into one human. Granting access to only the paying row
// leaves the other addresses of that same human on their old product. That is what
// locked Steve Chu and Kim out on launch night with correct-looking data everywhere.
// So a purchase upgrades the WHOLE cluster, not just the row that paid.
// ===========================================================================
async function identityCluster(supabase: SupabaseClient, email: string): Promise<string[]> {
  const lower = email.toLowerCase();
  const set = new Set<string>([lower]);
  try {
    // the row this address points at, if it is an alias
    const { data: mine } = await supabase
      .from('allowed_emails').select('primary_email').eq('email', lower).maybeSingle();
    if (mine?.primary_email) set.add(String(mine.primary_email).toLowerCase());
    // every row pointing at anything already in the set. The table is small and this
    // runs once per purchase, so a scan of the alias rows is the cheap, exact option:
    // an .in() filter would miss a primary_email stored with different casing.
    const { data: pointers } = await supabase
      .from('allowed_emails').select('email, primary_email').not('primary_email', 'is', null);
    for (const r of pointers || []) {
      const target = String(r.primary_email || '').toLowerCase();
      if (set.has(target)) set.add(String(r.email).toLowerCase());
    }
  } catch (e) { console.error('identityCluster exception, falling back to the paying row alone:', e); }
  return [...set];
}

// Move one row of the cluster onto the Wonka round without taking away what it
// already had. Never touches welcome_email_sent_at: that column is the atomic
// welcome claim and belongs to the paying row alone.
async function claimRowForRound(
  supabase: SupabaseClient, email: string, round: string, alsoGrantDonna: boolean,
): Promise<{ ok: boolean; before?: string }> {
  const lower = email.toLowerCase();
  const { data: existing, error: readErr } = await supabase
    .from('allowed_emails').select('round, addon_donna').eq('email', lower).maybeSingle();
  if (readErr) { console.error('cluster read failed:', lower, readErr); return { ok: false }; }
  if (!existing) return { ok: true };            // nothing to repair
  if (existing.round === round && (!alsoGrantDonna || existing.addon_donna)) return { ok: true, before: existing.round };
  const prior = String(existing.round || '');
  const hadDonna = !!prior && !isWonkaRound(prior) && prior !== 'unknown';
  const patch: Record<string, unknown> = { round };
  if (hadDonna || alsoGrantDonna || existing.addon_donna) patch.addon_donna = true;
  const { error } = await supabase.from('allowed_emails').update(patch).eq('email', lower);
  if (error) { console.error('cluster write failed:', lower, error); return { ok: false }; }
  return { ok: true, before: prior };
}

// Does this HUMAN have Donna, anywhere in their cluster?
//
// The entitlement belongs to the person, not to one row. claimRowForRound can only
// see the row in front of it, and a row parked on 'unknown' looks identical to a row
// that never bought anything, so it dropped Donna from the very address the customer
// signs in with. Izzy Benoliel hit this on 24.8.2026: he bought Donna in April on an
// Outlook address, had his Gmail linked so he could sign in at all, and the Gmail row
// sat on 'unknown'. Buying Wonka moved that row to wonka_r1 and took his Donna away.
//
// This still never invents access. It needs a real Donna round or an addon_donna
// already set somewhere in the cluster; a cluster that is all 'unknown' answers no.
//
// Reads one row at a time rather than an .in() filter, reusing the exact query shape
// claimRowForRound already runs in production. Clusters hold one to three addresses
// and this runs once per purchase.
async function clusterHasDonna(supabase: SupabaseClient, cluster: string[]): Promise<boolean> {
  for (const addr of cluster) {
    const { data, error } = await supabase
      .from('allowed_emails').select('round, addon_donna').eq('email', addr.toLowerCase()).maybeSingle();
    if (error) { console.error('cluster donna read failed:', addr, error); continue; }
    if (!data) continue;
    if (data.addon_donna) return true;
    const round = String(data.round || '');
    if (round && !isWonkaRound(round) && round !== 'unknown') return true;
  }
  return false;
}

// Refunds decide access PER PRODUCT, not per person.
//
// This used to ask "does this human have any non-refunded payment at all", which is
// the wrong question when one address buys two products. A Donna alum who bought the
// $697 Golden Ticket and refunded it inside the 48 hour window still had their old
// $97 Donna payment on file, so the "restore" branch ran and they kept their Wonka
// row: fully refunded, walks into the bootcamp on 1 September for free. The reverse
// held too, so a Wonka refund could revoke somebody's Donna access.
//
// `roundHint` is the round of the payment that just changed. When it is known, only
// payments for that same product are counted. Without it the old whole-person
// behaviour stands, which is right for a plain single-product customer.
function sameProduct(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = String(a || ''), y = String(b || '');
  if (!x || !y) return false;
  if (isWonkaRound(x) && isWonkaRound(y)) return true;
  if (isWonkaRound(x) !== isWonkaRound(y)) return false;
  return true;   // both Donna: any Donna payment keeps Donna access alive
}

async function reconcileAccessFor(supabase: SupabaseClient, email: string, roundHint?: string | null) {
  if (!email) return;
  const lower = email.toLowerCase();
  const { data: allPayments } = await supabase
    .from('stripe_customers')
    .select('id, amount_paid, refunded, coupon_used, round')
    .eq('email', lower);
  const payments = (allPayments || []);
  const scoped = roundHint ? payments.filter(p => sameProduct(p.round, roundHint)) : payments;
  // A refunded Wonka ticket with no other Wonka payment revokes; a still-live Donna
  // payment must not rescue it. If the hint matched nothing, fall back to the whole
  // person rather than revoking on an empty set.
  const pool = scoped.length ? scoped : payments;
  // 'TEST' is an amount label, not a statement about the customer, so it cannot on its
  // own prove somebody has not paid. It stays excluded, but see the note at
  // couponFromAmount: a genuine near-free comp is no longer auto-revoked.
  const hasActive = pool.some(p => !p.refunded && (p.coupon_used || '').toUpperCase() !== 'TEST');
  if (hasActive) {
    // Only ever clears an AUTOMATIC revocation. A revocation written by hand carries a
    // human reason, and a later webhook must not quietly undo it.
    await supabase.from('allowed_emails')
      .update({ access_revoked_at: null, access_revoked_reason: null })
      .eq('email', lower).not('access_revoked_at', 'is', null)
      .eq('access_revoked_reason', 'Stripe refund (auto)');
  } else if (pool.length) {
    await supabase.from('allowed_emails').update({ access_revoked_at: new Date().toISOString(), access_revoked_reason: 'Stripe refund (auto)' }).eq('email', lower).is('access_revoked_at', null);
  }
}

async function upgradeAllowedEmailRound(supabase: SupabaseClient, email: string, round: string) {
  if (!email || !round || round === 'unknown') return;
  const lower = email.toLowerCase();
  await supabase.from('allowed_emails').update({ round }).eq('email', lower).or('round.is.null,round.eq.unknown');
}

// Identity lookups in this file use .eq on a lowercased address, never .ilike. In
// PostgREST, ilike treats `_` and `%` in the VALUE as wildcards, so a customer whose
// address contains an underscore matches every address differing by one character at
// that spot. These are UPDATEs: a collision would move a stranger's row to another
// product, steal their welcome claim, or revoke their access. Six addresses in the
// table contain an underscore today. Every write path stores lowercase, so .eq is
// exact and strictly safer. The portal has escaped this since day one.
//
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
    .eq('email', lower)
    .is('welcome_email_sent_at', null)
    .select('email');
  return Array.isArray(data) && data.length > 0;
}

// These three used to return void and swallow everything, so a Resend 502 on a Donna
// purchase looked identical to a success: the claim stayed stamped, the handler
// returned 200, Stripe never retried, and the buyer simply never heard from us. Only
// the Wonka path checked its result. They now report, and every caller releases the
// claim and answers 500 so Stripe retries and the failure shows red on the dashboard.
async function postWelcome(url: string, label: string, body: Record<string, unknown>): Promise<boolean> {
  if (!formSecret) { console.error(`${label}: FORM_SYNC_SECRET missing, cannot send`); return false; }
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-form-secret': formSecret }, body: JSON.stringify(body) });
    const detail = await res.json().catch(() => ({}));
    console.log(`${label} status:`, res.status, JSON.stringify(detail));
    return res.ok;
  } catch (e) { console.error(`${label} call failed:`, e); return false; }
}
async function sendWelcomeEmailAsync(email: string): Promise<boolean> {
  if (!email) return false;
  return await postWelcome(SEND_WELCOME_URL, 'send-welcome-email', { email });
}
async function sendWelcomeBinaAsync(email: string, round: string): Promise<boolean> {
  if (!email) return false;
  return await postWelcome(SEND_WELCOME_BINA_URL, 'send-welcome-bina', { email, round });
}
async function sendWelcomeEnglishAsync(email: string, round: string): Promise<boolean> {
  if (!email) return false;
  return await postWelcome(SEND_WELCOME_ENGLISH_URL, 'send-welcome-english', { email, round });
}
// The $250 cross-sell. The session id is passed so the callee can prove the purchase
// against Stripe's own line items rather than trusting a flag or trusting us.
async function sendDonnaAddonAsync(email: string, sessionId: string): Promise<boolean> {
  if (!email || !sessionId) return false;
  return await postWelcome(SEND_DONNA_ADDON_URL, 'send-welcome-donna-addon', { email, sessionId });
}

// A round row may name its own welcome function in `welcome_email_fn_slug`.
// This is how a NON-Donna product (Wonka, and whatever comes after it) gets the
// right welcome without another hardcoded branch in here. Returns '' when the
// round has no slug, which keeps every existing round on its current path.
const UNKNOWN_SLUG = '__lookup_failed__';
async function welcomeFnSlugFor(supabase: SupabaseClient, canonical: string): Promise<string> {
  if (!canonical || canonical === 'unknown') return '';
  try {
    const { data, error } = await supabase
      .from('rounds')
      .select('welcome_email_fn_slug')
      .eq('id', canonical)
      .maybeSingle();
    if (!error && data?.welcome_email_fn_slug) return String(data.welcome_email_fn_slug);
    if (error) {
      // A transient read failure used to return '' here, and '' routes to the legacy
      // Donna welcome. That would send Donna copy, Donna dates and the Donna WhatsApp
      // group to a $697 or $2,999 Wonka buyer, with the claim already stamped so the
      // correct mail could never follow. Say "unknown" instead, and let the caller
      // refuse rather than guess.
      console.error('welcomeFnSlugFor read failed for round', canonical, error);
      return UNKNOWN_SLUG;
    }
  } catch (e) {
    console.error('welcomeFnSlugFor exception:', e);
    return UNKNOWN_SLUG;
  }
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
  await supabase.from('allowed_emails').update({ welcome_email_sent_at: null }).eq('email', email.toLowerCase());
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
      // Match on the PAYMENT, never on the customer. The old query also accepted
      // `stripe_customer_id.eq.<cus_...>` with limit(1) and no ordering, so a repeat
      // buyer's refund could be stamped onto whichever of their payments PostgREST
      // happened to return: the refunded purchase kept reading refunded:false, access
      // was never revoked, and the revenue numbers were wrong in both directions.
      const { data: existing } = await supabase.from('stripe_customers')
        .select('id, amount_paid, email, round').eq('id', paymentId).limit(1);
      if (existing && existing.length > 0) {
        const row = existing[0];
        await supabase.from('stripe_customers').update({ refunded: fullyRefunded, refund_amount: refundedAmount, refunded_at: refundedAt, refund_reason: reason }).eq('id', row.id);
        await reconcileAccessFor(supabase, row.email || email, row.round);
      } else {
        await supabase.from('stripe_customers').upsert({ id: paymentId, email, name: charge.billing_details?.name || '', country: charge.billing_details?.address?.country || '', phone: charge.billing_details?.phone || null, amount_paid: charge.amount || 0, currency: charge.currency || 'usd', coupon_used: couponFromAmount(charge.amount || 0), payment_date: new Date(charge.created * 1000).toISOString(), stripe_customer_id: charge.customer || '', refunded: fullyRefunded, refund_amount: refundedAmount, refunded_at: refundedAt, refund_reason: reason }, { onConflict: 'id' });
        await reconcileAccessFor(supabase, email);
      }
      return new Response(JSON.stringify({ received: true, type: 'refund' }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Chargebacks. These used to fall through to {received:true, skipped}, so a
    // customer who disputed a charge kept full access for ever and a dispute Jay won
    // restored nothing. Access is pulled when the money actually leaves the account,
    // not when the dispute opens: an open dispute is an accusation, and plenty are
    // withdrawn or won.
    if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed' || event.type === 'charge.dispute.funds_withdrawn' || event.type === 'charge.dispute.funds_reinstated') {
      const dispute = event.data.object;
      const paymentId = dispute.payment_intent || dispute.charge;
      const status = String(dispute.status || '');
      const lost = event.type === 'charge.dispute.funds_withdrawn' || status === 'lost';
      const won = event.type === 'charge.dispute.funds_reinstated' || status === 'won' || status === 'warning_closed';
      if (paymentId) {
        const { data: row } = await supabase.from('stripe_customers')
          .select('email, round, amount_paid').eq('id', paymentId).maybeSingle();
        if (lost) {
          await supabase.from('stripe_customers').update({ refunded: true, refund_amount: row?.amount_paid ?? (dispute.amount || 0), refunded_at: new Date().toISOString(), refund_reason: `chargeback (${status || event.type})` }).eq('id', paymentId);
        } else if (won) {
          await supabase.from('stripe_customers').update({ refunded: false, refund_amount: 0, refunded_at: null, refund_reason: `chargeback won (${status})` }).eq('id', paymentId);
        }
        if ((lost || won) && row?.email) await reconcileAccessFor(supabase, row.email, row.round);
      }
      console.log('dispute event:', { type: event.type, status, paymentId, lost, won });
      return new Response(JSON.stringify({ received: true, type: 'dispute', lost, won }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (event.type === 'charge.refund.updated' || event.type === 'refund.created' || event.type === 'refund.updated') {
      const refund = event.data.object;
      const paymentId = refund.payment_intent || refund.charge;
      const status = refund.status;
      if (status === 'succeeded' && paymentId) {
        const { data: existing } = await supabase.from('stripe_customers').select('amount_paid, email, refund_amount, currency, round').eq('id', paymentId).maybeSingle();
        // `refund.amount` is THIS refund; the column holds the running total. Writing
        // the single amount into it broke both directions: charge.refunded and
        // refund.created both fire for one refund, so a 50% goodwill refund added
        // itself twice and revoked everything; and three genuine partials never
        // accumulated, so a fully refunded customer kept access forever.
        const totalRefunded = Math.max(Number(existing?.refund_amount || 0), 0) + Number(refund.amount || 0);
        const capped = existing?.amount_paid ? Math.min(totalRefunded, existing.amount_paid) : totalRefunded;
        const isFullyRefunded = !!existing && existing.amount_paid > 0 && capped >= existing.amount_paid;
        const { data: row } = await supabase.from('stripe_customers').update({ refunded: isFullyRefunded, refund_amount: capped, refunded_at: refund.created ? new Date(refund.created * 1000).toISOString() : new Date().toISOString(), refund_reason: refund.reason || null }).eq('id', paymentId).select('email, currency, round').maybeSingle();
        if (row?.email) await reconcileAccessFor(supabase, row.email, row.round);
      }
      return new Response(JSON.stringify({ received: true, type: 'refund_event' }), { headers: { 'Content-Type': 'application/json' } });
    }

    // checkout.session.async_payment_succeeded is the same session, arriving when a
    // delayed method (bank transfer, Klarna) finally clears. It has to walk the exact
    // same path, or refusing the 'unpaid' session earlier would strand those buyers.
    const isSessionEvent = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';
    if (event.type === 'checkout.session.async_payment_failed') {
      console.warn('Delayed payment failed, nothing was ever granted:', { session: event.data?.object?.id });
      return new Response(JSON.stringify({ received: true, type: 'async_payment_failed' }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (event.type !== 'payment_intent.succeeded' && !isSessionEvent) {
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
    } else if (isSessionEvent) {
      const session = event.data.object;
      // Delayed methods (bank transfer, Klarna, Cash App) complete the session while
      // the money is still in flight, with payment_status 'unpaid'. Granting there
      // hands out a $697 ticket on a promise, and there is no handler to take it back
      // when checkout.session.async_payment_failed arrives.
      const payStatus = String(session.payment_status || 'paid');
      if (payStatus !== 'paid' && payStatus !== 'no_payment_required') {
        console.warn('checkout.session.completed with payment_status', payStatus, '. Not granting access yet.', { session: session.id });
        return new Response(JSON.stringify({ received: true, skipped: `payment_status=${payStatus}` }), { headers: { 'Content-Type': 'application/json' } });
      }
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

    // `payment_intent.succeeded` carries no payment_link and, on current Stripe API
    // versions, no `charges` array either (it is `latest_charge`), and a Checkout PI
    // has receipt_email null. So that event resolves an EMPTY email and a null round.
    // Stripe does not guarantee it arrives before checkout.session.completed, and any
    // retry lands after it, so the upsert used to blank out the good row. A refund
    // then found `email: ''` and skipped reconcileAccessFor entirely: fully refunded,
    // access never revoked, and nothing anywhere showing it.
    // Never overwrite a populated field with an empty one.
    const record: Record<string, unknown> = {
      id: paymentId, amount_paid: amountPaid, currency: currency, coupon_used: couponUsed,
      payment_date: new Date().toISOString(),
    };
    if (customerEmail) record.email = customerEmail;
    if (customerName) record.name = customerName;
    if (customerPhone) record.phone = customerPhone;
    if (country) record.country = country;
    if (customerId) record.stripe_customer_id = customerId;
    if (canonicalRound) record.round = canonicalRound;
    if (!customerEmail || !canonicalRound) {
      const { data: prior } = await supabase.from('stripe_customers').select('email, round').eq('id', paymentId).maybeSingle();
      if (prior) console.log('Thin event over an existing payment row, keeping what is already there:', { paymentId, eventType: event.type, keptEmail: !customerEmail && !!prior.email, keptRound: !canonicalRound && !!prior.round });
    }
    const { error: insertError } = await supabase.from('stripe_customers').upsert(record, { onConflict: 'id' });
    if (insertError) { console.error('Insert error:', insertError); return new Response(JSON.stringify({ error: insertError.message }), { status: 500 }); }

    // ============================================================
    // WELCOME EMAIL: only fire from checkout.session.completed.
    // payment_intent.succeeded fires WITHOUT payment_link info, which means we can't resolve
    // the round properly and would fall through to the LEGACY R1/R2 welcome.
    // checkout.session.completed fires ~5s later with the payment_link, so we send the correct welcome from there.
    // Defensive secondary dedup via claimWelcome (atomic UPDATE...WHERE welcome_email_sent_at IS NULL).
    // ============================================================
    if (isSessionEvent) {
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
            if (may) {
              const sentOk = await sendWelcomeBinaAsync(customerEmail, shortRound);
              if (!sentOk) {
                await releaseWelcomeClaim(supabase, customerEmail);
                console.error('Bina welcome send failed, claim released, asking Stripe to retry:', { email: customerEmail.toLowerCase(), round: shortRound });
                return new Response(JSON.stringify({ error: 'welcome send failed' }), { status: 500 });
              }
            }
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
          // Was gated on Wonka only, so a repeat customer buying anything else fell
          // through every repair: the insert no-opped, upgradeAllowedEmailRound only
          // fills blanks, claimWelcome had already been used years ago, and the handler
          // returned 200. They paid, got no welcome, stayed parked on a finished round,
          // and were therefore excluded from the new cohort's daily emails too. 261 of
          // 503 rows already carry a welcome timestamp, so this is the common case, and
          // the Wonka welcome itself points buyers at the Challenge.
          if (wasDuplicate && !isWonkaRound(allowedEmailsRound)) {
            const { data: prior } = await supabase
              .from('allowed_emails')
              .select('round, addon_donna, stripe_payment_id, welcome_email_sent_at')
              .eq('email', lowerEmail)
              .maybeSingle();
            const priorRound = String(prior?.round || '');
            const isRetry = !!prior?.stripe_payment_id && prior.stripe_payment_id === paymentId;
            const patch: Record<string, unknown> = { stripe_payment_id: paymentId };
            // Move them onto the cohort they just bought, unless they hold a Wonka
            // ticket: that would take the bootcamp away to give them a Donna round.
            // addon_donna is exactly the flag that grants Donna beside Wonka.
            if (isWonkaRound(priorRound)) patch.addon_donna = true;
            else patch.round = allowedEmailsRound;
            if (!isRetry) patch.welcome_email_sent_at = null;   // re-arm the claim for THIS purchase
            const { error: repErr } = await supabase.from('allowed_emails').update(patch).eq('email', lowerEmail);
            if (repErr) {
              console.error('returning Donna buyer repair failed:', repErr);
              return new Response(JSON.stringify({ error: 'allowed_emails repair failed' }), { status: 500 });
            }
            console.log('Returning buyer bought a Donna product:', { email: lowerEmail, priorRound, movedTo: patch.round ?? '(kept Wonka, granted addon_donna)', isRetry });
          }

          if (wasDuplicate && isWonkaRound(allowedEmailsRound)) {
            const { data: existing } = await supabase
              .from('allowed_emails')
              .select('round, addon_donna, stripe_payment_id, welcome_email_sent_at, primary_email')
              .eq('email', lowerEmail)
              .maybeSingle();
            // An ALIAS row: both portals follow primary_email and read the target row instead,
            // so upgrading this one grants nothing. Two buyers paid $497 on launch day and were
            // refused at the gate for exactly this (11.8): the money landed on the alias while
            // the gate kept reading a Donna round on the target. Repair the row the gate will
            // actually read. The alias keeps pointing at it, so both addresses work.
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
            const { error: repairErr } = await supabase.from('allowed_emails').update(patch).eq('email', lowerEmail);
            if (repairErr) {
              console.error('returning-buyer repair failed:', repairErr);
              return new Response(JSON.stringify({ error: 'allowed_emails repair failed' }), { status: 500 });
            }
            console.log('Returning buyer moved to Wonka:', { email: lowerEmail, priorRound, hadDonna, isRetry });
          }

          // THE INVARIANT (see identityCluster above): every address this human can
          // sign in with needs a row that stands on its own, because RLS lets the
          // portal read exactly one row and never a second. Runs for a brand new
          // buyer too: they may already appear as somebody's alias.
          if (isWonkaRound(allowedEmailsRound)) {
            const cluster = await identityCluster(supabase, lowerEmail);
            // Ask the whole cluster about Donna, not each row on its own. See
            // clusterHasDonna: the paying row has already been repaired by here, so
            // a returning Donna member's entitlement is visible to every alias.
            const donnaForCluster = tookDonnaAddon || await clusterHasDonna(supabase, cluster);
            const others = cluster.filter(e => e !== lowerEmail);
            for (const other of others) {
              const res = await claimRowForRound(supabase, other, allowedEmailsRound, donnaForCluster);
              if (!res.ok) {
                // 500 so Stripe retries. Every write here is idempotent, and a half
                // repaired cluster is exactly the silent lockout this block exists to stop.
                console.error('cluster repair failed, asking Stripe to retry:', { paid: lowerEmail, other });
                return new Response(JSON.stringify({ error: 'cluster repair failed' }), { status: 500 });
              }
              if (res.before && res.before !== allowedEmailsRound) {
                console.log('Cluster row moved to Wonka:', { paid: lowerEmail, linked: other, before: res.before });
              }
            }
          }
          // The insert above is a no-op for somebody already in the table (email is UNIQUE),
          // so the add-on has to be granted separately or a returning buyer never gets it.
          // Only ever turns the flag ON: a later purchase without the add-on must not revoke it.
          if (tookDonnaAddon) {
            const { error: addonErr } = await supabase.from('allowed_emails').update({ addon_donna: true }).eq('email', customerEmail.toLowerCase()).eq('addon_donna', false);
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
            if (customSlug === UNKNOWN_SLUG) {
              // Do not guess which product's welcome to send. Stripe retries.
              console.error('Cannot resolve the welcome function, refusing to send the wrong one:', { round: englishRound, email: customerEmail.toLowerCase() });
              return new Response(JSON.stringify({ error: 'welcome slug lookup failed' }), { status: 500 });
            }
            // Atomic claim before sending. Prevents duplicates if event is replayed.
            const may = await claimWelcome(supabase, customerEmail);
            if (may) {
              let sentOk = true;
              if (isEvergreen) {
                // Evergreen weekly cohort: send-welcome-english resolves dates/WhatsApp from the wk_ round row.
                sentOk = await sendWelcomeEnglishAsync(customerEmail, englishRound);
              } else if (shortRound === 'r4' || shortRound === 'r5') {
                sentOk = await sendWelcomeEnglishAsync(customerEmail, shortRound);
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
                sentOk = await sendWelcomeEmailAsync(customerEmail);
              }
              // Same contract as the Wonka path above, now for every Donna path too. A
              // swallowed failure here meant a paying customer heard nothing, with the
              // claim stamped so no replay could ever fix it, and a green 200 on the
              // dashboard hiding it.
              if (!sentOk) {
                await releaseWelcomeClaim(supabase, customerEmail);
                console.error('Welcome send failed, claim released, asking Stripe to retry:', { email: customerEmail.toLowerCase(), round: englishRound });
                return new Response(JSON.stringify({ error: 'welcome send failed' }), { status: 500 });
              }
            }
          }
        }
      }
    }

    // The $250 Claude Code Challenge add-on gets its own email, and deliberately its
    // own claim (email_sends, campaign 'donna-addon') rather than riding on the Wonka
    // welcome's claim. If it rode along, a Stripe retry would skip it for ever the
    // moment the Wonka welcome had already been sent, and the buyer would pay $250 and
    // hear nothing. Which is exactly what happened to Chris Haupt on 11.8.
    if (isSessionEvent && tookDonnaAddon && customerEmail && couponUsed !== 'TEST') {
      const addonOk = await sendDonnaAddonAsync(customerEmail, sessionId);
      if (!addonOk) {
        console.error('Donna add-on welcome failed, asking Stripe to retry:', { email: customerEmail.toLowerCase(), sessionId });
        return new Response(JSON.stringify({ error: 'donna addon welcome failed' }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({ received: true, email: customerEmail, amount: amountPaid, isBina, round: canonicalRound, eventType: event.type }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
