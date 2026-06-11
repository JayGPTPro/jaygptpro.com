import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sharedSecret = Deno.env.get('FORM_SYNC_SECRET') || '';

// Evergreen cohort config. One product, one always-open WhatsApp group, weekly Monday starts.
const EVERGREEN_PRODUCT = 'prod_UdyoNBZgnpQwan';
const EVERGREEN_WA = 'https://chat.whatsapp.com/Kw459iL73jV4zSTSxd18tS';
const PORTAL = 'https://jaygptpro.com/donna-challenge/';
const COHORTS_AHEAD = 2; // ensure the upcoming Monday + the one after it always exist

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function nyDateStr(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  let y = '', m = '', d = '';
  parts.forEach(p => { if (p.type === 'year') y = p.value; if (p.type === 'month') m = p.value; if (p.type === 'day') d = p.value; });
  return `${y}-${m}-${d}`;
}

function addDays(dateStr: string, days: number): Date {
  return new Date(new Date(dateStr + 'T00:00:00Z').getTime() + days * 86400000);
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Upcoming Monday. If today is Monday, roll to next week (today's cohort has already started at 2pm NY).
function upcomingMonday(fromDateStr: string): Date {
  const d = new Date(fromDateStr + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders() });

  const provided = req.headers.get('x-form-secret') || '';
  if (!sharedSecret || provided !== sharedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const todayNY = nyDateStr();
  const created: string[] = [];
  const ensured: string[] = [];

  // 1. Ensure the next COHORTS_AHEAD Monday cohorts exist (insert only; never overwrite a manual edit).
  const firstMonday = upcomingMonday(todayNY);
  for (let i = 0; i < COHORTS_AHEAD; i++) {
    const monday = new Date(firstMonday.getTime() + i * 7 * 86400000);
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
      portal_url: PORTAL,
      notes: 'Auto-created evergreen weekly cohort',
    };
    const { data, error } = await supabase.from('rounds').upsert(row, { onConflict: 'id', ignoreDuplicates: true }).select('id');
    if (error) { console.error('upsert round error:', id, error); continue; }
    ensured.push(id);
    if (Array.isArray(data) && data.length > 0) created.push(id);
  }

  // 2. Advance status for evergreen (wk_) rounds based on today. Never touch legacy/Bina rounds.
  const { data: wkRounds } = await supabase.from('rounds').select('id, start_date, end_date, status').like('id', 'wk_%');
  const statusUpdates: any[] = [];
  for (const r of (wkRounds || [])) {
    let desired = 'upcoming';
    if (r.start_date && r.end_date) {
      if (todayNY < r.start_date) desired = 'upcoming';
      else if (todayNY >= r.start_date && todayNY <= r.end_date) desired = 'active';
      else desired = 'completed';
    }
    if (desired !== r.status) {
      await supabase.from('rounds').update({ status: desired }).eq('id', r.id);
      statusUpdates.push({ id: r.id, from: r.status, to: desired });
    }
  }

  return new Response(JSON.stringify({ ok: true, todayNY, ensured, created, statusUpdates }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
});
