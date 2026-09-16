import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Reads EDGE_SHARED_SECRET (16.9.2026). FORM_SYNC_SECRET's value was hardcoded in the
// public admin.html page, so it opens nothing any more.
const sharedSecret = Deno.env.get('EDGE_SHARED_SECRET') || '';

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}

interface Alert { severity: 'info'|'warning'|'critical'; category: string; message: string; context: any; }

async function runChecks(supabase: any): Promise<Alert[]> {
  const alerts: Alert[] = [];

  // 1. Stripe customers with NULL round (paid but not assigned)
  const { data: nullRound } = await supabase
    .from('stripe_customers')
    .select('id, email, currency, payment_date, amount_paid')
    .is('round', null).eq('refunded', false);
  if (nullRound && nullRound.length > 0) {
    alerts.push({
      severity: 'critical',
      category: 'null_round_payment',
      message: `${nullRound.length} paid customers without round assignment`,
      context: { count: nullRound.length, emails: nullRound.map((r:any)=>r.email).slice(0,10), runbook: 'reconcile-stripe-nulls' },
    });
  }

  // 2. Upcoming rounds with missing operational fields
  const { data: rounds } = await supabase.from('rounds').select('*').in('status', ['upcoming','active']);
  for (const r of rounds || []) {
    const missing: string[] = [];
    if (!r.whatsapp_link) missing.push('whatsapp_link');
    if (!r.welcome_dates_display) missing.push('welcome_dates_display');
    if (!r.stripe_product_id) missing.push('stripe_product_id');
    if (!r.start_date) missing.push('start_date');
    if (missing.length > 0) {
      alerts.push({
        severity: 'critical',
        category: 'round_missing_fields',
        message: `Round ${r.id} missing ${missing.join(', ')}`,
        context: { round_id: r.id, missing_fields: missing },
      });
    }
  }

  // 3. Round start in <48h, customers without welcome
  const now = new Date();
  const in48h = new Date(now.getTime() + 48*60*60*1000);
  for (const r of rounds || []) {
    if (!r.start_date) continue;
    const start = new Date(r.start_date + 'T00:00:00Z');
    if (start > in48h || start < now) continue;
    const { data: notWelcomed } = await supabase
      .from('allowed_emails')
      .select('email')
      .eq('round', r.id)
      .is('welcome_email_sent_at', null)
      .eq('customer_type', 'paid')
      .is('access_revoked_at', null);
    if (notWelcomed && notWelcomed.length > 0) {
      alerts.push({
        severity: 'critical',
        category: 'imminent_round_missing_welcomes',
        message: `${notWelcomed.length} customers in ${r.id} haven\'t got welcome (starts ${r.start_date})`,
        context: { round_id: r.id, start_date: r.start_date, count: notWelcomed.length, runbook: 'send-welcome-batch' },
      });
    }
  }

  // 4. allowed_emails with round_confirmed=false older than 24h
  const dayAgo = new Date(now.getTime() - 24*60*60*1000).toISOString();
  const { data: unconfirmed } = await supabase
    .from('allowed_emails')
    .select('email, round, created_at')
    .eq('round_confirmed', false)
    .lt('created_at', dayAgo);
  if (unconfirmed && unconfirmed.length > 0) {
    alerts.push({
      severity: 'warning',
      category: 'stale_unconfirmed_assignments',
      message: `${unconfirmed.length} auto-assigned customers awaiting manual confirmation >24h`,
      context: { count: unconfirmed.length, sample: unconfirmed.slice(0,5) },
    });
  }

  // 5. Recent daily email send failures (last 7 days)
  const weekAgo = new Date(now.getTime() - 7*24*60*60*1000).toISOString();
  const { data: failedDays } = await supabase
    .from('challenge_daily_emails')
    .select('round, day_num, error_count, recipient_count, sent_at')
    .gt('error_count', 0)
    .gt('sent_at', weekAgo);
  if (failedDays && failedDays.length > 0) {
    alerts.push({
      severity: 'warning',
      category: 'recent_daily_email_errors',
      message: `${failedDays.length} daily-email send batches had errors in the last 7 days`,
      context: { runs: failedDays },
    });
  }

  // 6. Bina R2 specific: customers without welcome and round starts in <14 days
  const { data: binaR2 } = await supabase.from('rounds').select('start_date').eq('id','bina_r2').maybeSingle();
  if (binaR2?.start_date) {
    const start = new Date(binaR2.start_date + 'T00:00:00Z');
    const in14d = new Date(now.getTime() + 14*24*60*60*1000);
    if (start > now && start < in14d) {
      const { data: bnotwel } = await supabase.from('bina_registrations').select('email').eq('round','r2').is('welcome_email_sent_at', null);
      if (bnotwel && bnotwel.length > 0) {
        alerts.push({
          severity: 'warning',
          category: 'bina_r2_missing_welcomes',
          message: `${bnotwel.length} Bina R2 customers haven\'t got welcome (round starts ${binaR2.start_date})`,
          context: { count: bnotwel.length, runbook: 'bina-pending-fixes' },
        });
      }
    }
  }

  return alerts;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST' && req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: corsHeaders() });

  // Allow public read access for the dashboard via GET (returns current alerts, doesn\'t insert).
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (req.method === 'GET') {
    const alerts = await runChecks(supabase);
    return new Response(JSON.stringify({ ok: true, alerts, count: alerts.length, ts: new Date().toISOString() }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  // POST = run checks and persist to alerts table (for the cron job).
  const provided = req.headers.get('x-form-secret') || '';
  if (!sharedSecret || provided !== sharedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const alerts = await runChecks(supabase);

  // Clear previous unresolved alerts (snapshot pattern, dashboard sees current state).
  await supabase.from('alerts').update({ resolved_at: new Date().toISOString() }).is('resolved_at', null);

  if (alerts.length > 0) {
    const rows = alerts.map(a => ({ severity: a.severity, category: a.category, message: a.message, context: a.context }));
    const { error } = await supabase.from('alerts').insert(rows);
    if (error) return new Response(JSON.stringify({ error: 'insert failed', detail: error }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, alerts_inserted: alerts.length, ts: new Date().toISOString() }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
});
