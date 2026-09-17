import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// cardcom-webhook . phase 2 (LIVE onboarding)
// Cardcom \"דיווח עסקה נוסף\" POSTs transaction details here on every sale
// (application/x-www-form-urlencoded). We:
//   1. validate the shared ?key=
//   2. ALWAYS capture the raw payload to cardcom_webhook_log (audit / safety net)
//   3. if the deal succeeded (responsecode=0) AND a real amount was charged
//      (suminfull>0) AND we have an email, onboard the buyer into the upcoming
//      Sunday evergreen cohort (bina_wk_YYYY_MM_DD): allowed_emails +
//      bina_registrations, then send the evergreen welcome email.
// Dedup is race-safe via the UNIQUE(email) index on allowed_emails.
//
// Cardcom field names (captured from a real test transaction 2026-06-07):
//   UserEmail, CardOwnerName, intTo, InvMobile, CardOwnerPhone,
//   responsecode (0=OK), responsdescription, suminfull (charged sum),
//   ProdPrice, cointype (1=ILS), internaldealnumber, CouponNumber, invoicenumber
// ============================================================

// The secret was written in this file until 17.9.2026. A secret in source cannot be
// rotated without a deploy, rides along into every copy and log of the code, and this
// one guarded a function that sends real mail to customers. It is a project secret now.
// The VALUE is unchanged: Cardcom is configured with it at their end, so rotating it
// means changing it there too. This only takes it out of the source.
const WEBHOOK_KEY = Deno.env.get('CARDCOM_WEBHOOK_KEY') || '';
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Reads EDGE_SHARED_SECRET (16.9.2026). FORM_SYNC_SECRET's value was hardcoded in the
// public admin.html page, so it opens nothing any more.
const sharedSecret = Deno.env.get('EDGE_SHARED_SECRET') || '';

const PORTAL = 'https://jaygptpro.com/donna-challenge-bina/';
const HE_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function ok(body: unknown, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function ilDateStr(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
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
// Upcoming Sunday. If today is Sunday, roll to next week (today's cohort already started 11:00 IL).
function upcomingSunday(fromDateStr: string): Date {
  const d = new Date(fromDateStr + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0 = Sunday
  let add = (0 - dow + 7) % 7;
  if (add === 0) add = 7;
  return new Date(d.getTime() + add * 86400000);
}
function datesDisplayHe(sun: Date, thu: Date): string {
  const mSun = HE_MONTHS[sun.getUTCMonth()];
  const mThu = HE_MONTHS[thu.getUTCMonth()];
  const year = thu.getUTCFullYear();
  if (sun.getUTCMonth() === thu.getUTCMonth()) return `${sun.getUTCDate()}-${thu.getUTCDate()} ב${mSun} ${year}`;
  return `${sun.getUTCDate()} ב${mSun} - ${thu.getUTCDate()} ב${mThu} ${year}`;
}

// Resolve (and create on demand) the upcoming Sunday cohort row. Returns its id.
async function ensureUpcomingCohort(supabase: any): Promise<string> {
  const todayIL = ilDateStr();
  const sun = upcomingSunday(todayIL);
  const thu = new Date(sun.getTime() + 4 * 86400000);
  const startStr = ymd(sun);
  const id = `bina_wk_${startStr.replace(/-/g, '_')}`;
  const row = {
    id,
    name: `אתגר קלוד קוד עם בינה (שבוע ${sun.getUTCDate()} ב${HE_MONTHS[sun.getUTCMonth()]})`,
    start_date: startStr,
    end_date: ymd(thu),
    language: 'he',
    status: 'upcoming',
    whatsapp_link: '',
    welcome_dates_display: datesDisplayHe(sun, thu),
    portal_url: PORTAL,
    notes: 'Auto-created evergreen weekly Bina cohort (Cardcom on-demand)',
  };
  await supabase.from('rounds').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
  return id;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') || '';

  if (req.method === 'GET' && !key) {
    return ok({ ok: true, service: 'cardcom-webhook', mode: 'live', hint: 'POST transaction reports here with ?key=' });
  }
  // Fail CLOSED. Without the guard on WEBHOOK_KEY, an unset secret makes '' === '' true
  // and a keyless POST would be accepted as a real payment notification.
  if (!WEBHOOK_KEY || key !== WEBHOOK_KEY) {
    console.warn('cardcom-webhook: rejected, bad/missing key. method=', req.method);
    return ok({ error: 'unauthorized' }, 401);
  }

  const rawText = await req.text().catch(() => '');
  const contentType = req.headers.get('content-type') || '';
  let parsed: Record<string, string> = {};
  try {
    if (rawText) {
      if (contentType.includes('application/json') || rawText.trim().startsWith('{')) {
        const j = JSON.parse(rawText);
        if (j && typeof j === 'object') parsed = j as Record<string, string>;
      } else {
        const sp = new URLSearchParams(rawText);
        sp.forEach((v, k) => { parsed[k] = v; });
      }
    }
  } catch (e) {
    console.error('cardcom-webhook: parse error', String(e));
  }

  const queryParams: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { if (k !== 'key') queryParams[k] = v; });

  console.log('=== CARDCOM ===', JSON.stringify({ method: req.method, contentType, queryParams, parsed: Object.keys(parsed) }));

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1) Always capture (audit / safety net) BEFORE any onboarding logic.
  try {
    await supabase.from('cardcom_webhook_log').insert({
      method: req.method,
      content_type: contentType,
      query_params: queryParams,
      parsed,
      raw_text: rawText.slice(0, 8000),
    });
  } catch (e) {
    console.error('cardcom-webhook: log insert failed', String(e));
  }

  // 2) Decide whether this is a real successful paid deal.
  const responseCode = String(parsed.responsecode ?? '').trim();
  const email = String(parsed.UserEmail ?? '').trim().toLowerCase();
  const sum = parseFloat(String(parsed.suminfull ?? '0').replace(/[^0-9.\-]/g, '')) || 0;
  const success = responseCode === '0';

  if (!success || sum <= 0 || !email) {
    const reason = !success ? `responsecode=${responseCode}` : (sum <= 0 ? 'suminfull<=0 (likely a 0₪ test)' : 'missing UserEmail');
    console.log('cardcom-webhook: not onboarding.', reason, 'email=', email);
    return ok({ ok: true, received: true, onboarded: false, reason });
  }

  // 3) Onboard. Never throw out of here . always 200 so Cardcom doesn't retry-storm;
  //    the raw payload is already captured above for manual remediation if needed.
  try {
    const round = await ensureUpcomingCohort(supabase);
    const name = String(parsed.CardOwnerName || parsed.intTo || '').trim();
    const phone = String(parsed.InvMobile || parsed.CardOwnerPhone || '').trim();
    const dealId = String(parsed.internaldealnumber || '').trim();
    const coupon = String(parsed.CouponNumber || '').trim();
    const notes = `Cardcom evergreen | deal ${dealId || 'n/a'} | coupon ${coupon || 'none'} | sum ${sum} | ${name}`;

    // Race-safe insert: UNIQUE(email). ignoreDuplicates => returns the row only if NEWLY inserted.
    const { data: inserted, error: insErr } = await supabase
      .from('allowed_emails')
      .upsert({ email, name: name || null, phone: phone || null, round, customer_type: 'paid', notes }, { onConflict: 'email', ignoreDuplicates: true })
      .select('email');
    if (insErr) {
      console.error('cardcom-webhook: allowed_emails insert error', insErr);
      return ok({ ok: true, received: true, onboarded: false, reason: 'db_error', detail: String(insErr.message || insErr) });
    }

    const isNew = Array.isArray(inserted) && inserted.length > 0;
    if (!isNew) {
      console.log('cardcom-webhook: email already onboarded, skipping welcome.', email);
      return ok({ ok: true, received: true, onboarded: false, reason: 'already_exists', email, round });
    }

    // bina_registrations: store name/phone/deal context in notes (no name/phone columns there).
    await supabase.from('bina_registrations').upsert({ email, round, notes }, { onConflict: 'email' });

    // Send evergreen welcome (email-only, no WhatsApp). Records welcome_email_sent_at.
    let welcomeOk = false; let welcomeDetail: unknown = null;
    try {
      const wRes = await fetch(`${supabaseUrl}/functions/v1/send-welcome-bina`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-form-secret': sharedSecret },
        body: JSON.stringify({ email, round }),
      });
      welcomeDetail = await wRes.json().catch(() => null);
      welcomeOk = wRes.ok;
      if (!wRes.ok) console.error('cardcom-webhook: welcome send failed', welcomeDetail);
    } catch (e) {
      console.error('cardcom-webhook: welcome fetch error', String(e));
    }

    return ok({ ok: true, received: true, onboarded: true, email, round, welcomeSent: welcomeOk });
  } catch (e) {
    console.error('cardcom-webhook: onboarding exception', String(e));
    return ok({ ok: true, received: true, onboarded: false, reason: 'exception', detail: String(e) });
  }
});
