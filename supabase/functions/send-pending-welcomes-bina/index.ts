import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Reads EDGE_SHARED_SECRET (16.9.2026). FORM_SYNC_SECRET's value was hardcoded in the
// public admin.html page, so it opens nothing any more.
const sharedSecret = Deno.env.get('EDGE_SHARED_SECRET') || '';
const SEND_WELCOME_BINA_URL = `${supabaseUrl}/functions/v1/send-welcome-bina`;

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders() });

  const provided = req.headers.get('x-form-secret') || '';
  if (!sharedSecret || provided !== sharedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const url = new URL(req.url);
  // Default: only bina_r2 customers (R1 is closed). Override via ?rounds=r1,r2 if needed.
  const roundsParam = url.searchParams.get('rounds') || 'r2';
  const targetRounds = roundsParam.split(',').map(s => s.trim()).filter(Boolean);
  const dryRun = url.searchParams.get('dry_run') === '1';

  // Pull bina_registrations WHERE welcome not yet sent AND round in targetRounds.
  const { data: pending, error } = await supabase
    .from('bina_registrations')
    .select('email, round')
    .in('round', targetRounds)
    .is('welcome_email_sent_at', null);

  if (error) return new Response(JSON.stringify({ error: 'pending lookup failed', detail: error }), { status: 500 });
  if (!pending || pending.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, action: 'nothing_pending' }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  if (dryRun) {
    return new Response(JSON.stringify({ ok: true, dry_run: true, pending_count: pending.length, breakdown: pending.reduce((acc: any, p: any) => { acc[p.round] = (acc[p.round] || 0) + 1; return acc; }, {}) }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const results: any[] = [];
  for (const p of pending) {
    // Atomic claim: mark welcome_email_sent_at on bina_registrations BEFORE sending. If already claimed, skip.
    const claimTime = new Date().toISOString();
    const { data: claimed } = await supabase
      .from('bina_registrations')
      .update({ welcome_email_sent_at: claimTime })
      .ilike('email', p.email)
      .is('welcome_email_sent_at', null)
      .select('email');
    if (!claimed || claimed.length === 0) {
      results.push({ email: p.email, round: p.round, ok: false, skipped: 'already_sent_by_another_caller' });
      continue;
    }

    // Call send-welcome-bina edge fn. It uses RESEND_API_KEY_BINA and reads round metadata from DB.
    try {
      const res = await fetch(SEND_WELCOME_BINA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-form-secret': sharedSecret },
        body: JSON.stringify({ email: p.email, round: p.round }),
      });
      const data = await res.json();
      if (res.ok) {
        results.push({ email: p.email, round: p.round, ok: true, id: data?.resendId });
      } else {
        // ROLLBACK claim so it can retry.
        await supabase.from('bina_registrations').update({ welcome_email_sent_at: null }).ilike('email', p.email).eq('welcome_email_sent_at', claimTime);
        results.push({ email: p.email, round: p.round, ok: false, error: data });
      }
    } catch (e) {
      await supabase.from('bina_registrations').update({ welcome_email_sent_at: null }).ilike('email', p.email).eq('welcome_email_sent_at', claimTime);
      results.push({ email: p.email, round: p.round, ok: false, error: String(e) });
    }
    await new Promise(r => setTimeout(r, 700));
  }
  const okCount = results.filter(r => r.ok).length;
  const skipped = results.filter(r => r.skipped).length;
  const errors = results.filter(r => !r.ok && !r.skipped).length;
  return new Response(JSON.stringify({ ok: true, attempted: results.length, sent: okCount, skipped, errors, results }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
});
