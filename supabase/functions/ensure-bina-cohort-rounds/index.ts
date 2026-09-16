import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Hebrew (Bina) evergreen cohort generator. Mirror of ensure-cohort-rounds but:
//  . Israel timezone (Asia/Jerusalem)
//  . cohorts start SUNDAY 11:00 Israel time, run Sunday..Thursday (5 days)
//  . id scheme bina_wk_YYYY_MM_DD, language 'he', NO WhatsApp, Bina portal
//  . payment is Cardcom (no Stripe product)

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Reads EDGE_SHARED_SECRET (16.9.2026). FORM_SYNC_SECRET's value was hardcoded in the
// public admin.html page, so it opens nothing any more.
const sharedSecret = Deno.env.get('EDGE_SHARED_SECRET') || '';

const PORTAL = 'https://jaygptpro.com/donna-challenge-bina/';
const COHORTS_AHEAD = 2;
const HE_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

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
// Hebrew display: Sunday..Thursday. e.g. "8-12 ביוני 2026" or cross-month "29 ביוני - 3 ביולי 2026".
function datesDisplayHe(sun: Date, thu: Date): string {
  const mSun = HE_MONTHS[sun.getUTCMonth()];
  const mThu = HE_MONTHS[thu.getUTCMonth()];
  const year = thu.getUTCFullYear();
  if (sun.getUTCMonth() === thu.getUTCMonth()) {
    return `${sun.getUTCDate()}-${thu.getUTCDate()} ב${mSun} ${year}`;
  }
  return `${sun.getUTCDate()} ב${mSun} - ${thu.getUTCDate()} ב${mThu} ${year}`;
}
function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
  const provided = req.headers.get('x-form-secret') || '';
  if (!sharedSecret || provided !== sharedSecret) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });

  const supabase = createClient(supabaseUrl, supabaseKey);
  const todayIL = ilDateStr();
  const created: string[] = [];
  const ensured: string[] = [];

  const firstSunday = upcomingSunday(todayIL);
  for (let i = 0; i < COHORTS_AHEAD; i++) {
    const sun = new Date(firstSunday.getTime() + i * 7 * 86400000);
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
      notes: 'Auto-created evergreen weekly Bina cohort (Sunday IL)',
    };
    const { data, error } = await supabase.from('rounds').upsert(row, { onConflict: 'id', ignoreDuplicates: true }).select('id');
    if (error) { console.error('upsert bina round error:', id, error); continue; }
    ensured.push(id);
    if (Array.isArray(data) && data.length > 0) created.push(id);
  }

  const { data: bRounds } = await supabase.from('rounds').select('id, start_date, end_date, status').like('id', 'bina_wk_%');
  const statusUpdates: any[] = [];
  for (const r of (bRounds || [])) {
    let desired = 'upcoming';
    if (r.start_date && r.end_date) {
      if (todayIL < r.start_date) desired = 'upcoming';
      else if (todayIL >= r.start_date && todayIL <= r.end_date) desired = 'active';
      else desired = 'completed';
    }
    if (desired !== r.status) {
      await supabase.from('rounds').update({ status: desired }).eq('id', r.id);
      statusUpdates.push({ id: r.id, from: r.status, to: desired });
    }
  }

  return new Response(JSON.stringify({ ok: true, todayIL, ensured, created, statusUpdates }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
});
