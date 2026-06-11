import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY')!;
const sharedSecret = Deno.env.get('FORM_SYNC_SECRET') || '';

const FROM_EMAIL = 'Jay Margaliot <info@jaygptpro.com>';
const REPLY_TO = 'info@jaygptpro.com';
const VAULT_OFFER_URL = 'https://jaygptpro.com/vault-challenge-offer/';
const GRADUATES_WA = 'https://chat.whatsapp.com/Kw459iL73jV4zSTSxd18tS';

// Trigger: NY hour 14 on day 6 of an English round (day 1 = start_date, so day 6 = end_date + 1).
const TRIGGER_HOUR_NY = 14;
const TRIGGER_DAY_OF_ROUND = 6;

function nyHourAndDate(): { hour: number; dateStr: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(now);
  let y = '', m = '', d = '', h = '';
  parts.forEach(p => { if (p.type === 'year') y = p.value; if (p.type === 'month') m = p.value; if (p.type === 'day') d = p.value; if (p.type === 'hour') h = p.value; });
  return { hour: parseInt(h, 10), dateStr: `${y}-${m}-${d}` };
}
function daysBetween(startIsoDate: string, endIsoDate: string): number {
  const s = new Date(startIsoDate + 'T00:00:00Z').getTime();
  const e = new Date(endIsoDate + 'T00:00:00Z').getTime();
  return Math.round((e - s) / (1000 * 60 * 60 * 24));
}

// Evergreen (wk_) cohorts get a trimmed email: no Graduates WhatsApp section, no video-feedback ask.
// Legacy rounds (round4, round5, etc.) keep the original full version.
function renderSummaryEmail(isEvergreen: boolean): { subject: string; html: string } {
  const subject = 'You did it. A few things from me.';
  const gradAndFeedback = isEvergreen ? '' : `
  <p style="margin:24px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">2. Join the Graduates WhatsApp group</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">This round’s group closes at the end of the week. But the conversation doesn’t have to. The Graduates group is where everyone who’s been through this lives. You’ll meet people from earlier rounds, talk about Donna, share what you’re building, get unstuck.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0"><a href="${GRADUATES_WA}" target="_blank" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:50px;letter-spacing:0.3px">🏆 Join the Graduates group</a></td></tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f8f6f2;border-radius:14px;padding:20px 24px"><p style="margin:0;font-size:14px;color:#555;line-height:1.7"><strong>Quick heads up so we’re aligned:</strong> this group is your space, not my support inbox. I’m not active there day-to-day. Drop your question in the group, someone has probably solved it already. If you really need me, info@jaygptpro.com still works.</p></td></tr></table>
  <p style="margin:24px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">3. One small favor I want to ask, this is the personal one</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Stay with me for a second. If anything this week shifted for you, in how you work, how you think about AI, even just how you talk to your computer, I want to ask you for 3 minutes of your time. The 3 minutes that mean the most to me from this whole journey.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Pull out your phone. Hit record. Talk to me for 30 seconds, selfie style, no script, no edits. Tell me what you think about the challenge, what Donna ended up doing for you, what the experience was like, or just one moment that stuck.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Send it back to me right here, or drop it in WhatsApp. That’s it.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px"><tr><td style="background:#fff7ed;border-radius:14px;padding:20px 24px"><p style="margin:0;font-size:14px;color:#555;line-height:1.7"><strong>Why I’m asking like this:</strong> one 30-second video from someone who actually did the challenge is worth more than 1,000 marketing words from me. I want to bring more people into the next rounds, and the only honest way is for them to hear it from you, not me. If I made any kind of difference this week, that’s the way to tell me, and the way to help me reach the next batch.</p></td></tr></table>`;
  const vaultNum = isEvergreen ? '2' : '4';
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
<tr><td style="padding:44px 48px 8px">
  <p style="margin:0;font-size:11px;color:#e87040;font-weight:700;letter-spacing:2px;text-transform:uppercase">A NOTE FROM JAY</p>
  <h1 style="margin:14px 0 0;font-size:28px;font-weight:800;color:#1a1a2e;line-height:1.3;letter-spacing:-0.4px">You did it.</h1>
</td></tr>
<tr><td style="padding:20px 48px 4px">
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">5 days ago you committed to this. Today you have a real, working Donna. I’ve been doing this a while and watching what people ship by Day 5 still gets me every single round.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">So before anything else, <strong>thank you</strong>. For the trust, the hours, the willingness to try something new with me. That’s the part nobody talks about, and it’s the part that means the most.</p>
  <p style="margin:24px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">1. Use Donna for real, every day</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">The skills you trained Day 4 only get sharp from use. Run the morning briefing tomorrow. Use draft-reply on a real email today. The muscle memory builds fast once you actually keep using her.</p>${gradAndFeedback}
  <p style="margin:24px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">${vaultNum}. The Vault, this is genuinely your last call</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Your graduate window closes tonight. After that, the price goes back to <strong>$100/month</strong>, full stop. If you were waiting to decide, this is the decision moment.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0"><a href="${VAULT_OFFER_URL}" target="_blank" style="display:inline-block;background:#e87040;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:50px;letter-spacing:0.3px">Jump into the Vault →</a></td></tr></table>
  <p style="margin:18px 0 0;font-size:16px;color:#333;line-height:1.75">Thank you again. For the trust, for the week, for going on this with me.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">See you in the Vault ❤️</p>
</td></tr>
<tr><td style="padding:36px 48px 36px">
  <div style="height:2px;background:linear-gradient(90deg,transparent,#e87040,transparent);margin-bottom:20px"></div>
  <p style="margin:0;font-size:14px;color:#999;font-weight:600">Jay Margaliot</p>
  <p style="margin:2px 0 0;font-size:13px;color:#bbb">Claude Code Challenge</p>
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html };
}

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}

async function sendOne(email: string, isEvergreen: boolean): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { subject, html } = renderSummaryEmail(isEvergreen);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [email], reply_to: REPLY_TO, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data?.message || `HTTP ${res.status}` };
  return { ok: true, id: data.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
  const provided = req.headers.get('x-form-secret') || '';
  if (!sharedSecret || provided !== sharedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }
  if (!resendKey) return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500 });

  const url = new URL(req.url);
  const previewTo = url.searchParams.get('to') || '';
  if (url.searchParams.get('preview') === '1') {
    if (!previewTo) return new Response(JSON.stringify({ error: 'preview requires ?to=email' }), { status: 400 });
    // ?variant=evergreen renders the trimmed version; anything else renders the full legacy version.
    const isEvergreen = url.searchParams.get('variant') === 'evergreen';
    const r = await sendOne(previewTo, isEvergreen);
    return new Response(JSON.stringify({ preview: true, variant: isEvergreen ? 'evergreen' : 'legacy', ...r }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { hour, dateStr: todayNY } = nyHourAndDate();
  if (hour !== TRIGGER_HOUR_NY) {
    return new Response(JSON.stringify({ ok: true, action: 'skipped_off_hour', ny_hour: hour, ny_date: todayNY }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const { data: settingsRow } = await supabase.from('settings').select('value').eq('key', 'daily_emails_armed').maybeSingle();
  const armed = settingsRow && settingsRow.value && settingsRow.value.armed === true;

  // Match the daily-emails filter: include 'upcoming' so legacy rounds that were never advanced
  // past 'upcoming' (e.g. round5) still get their day-6 summary, same as their daily emails.
  const { data: rounds } = await supabase.from('rounds').select('id, start_date, status, language').in('status', ['upcoming', 'active', 'completed', 'full']).eq('language', 'en');
  if (!rounds || rounds.length === 0) {
    return new Response(JSON.stringify({ ok: true, action: 'no_open_rounds', ny_date: todayNY }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const results: any[] = [];
  for (const r of rounds) {
    if (!r.start_date) continue;
    const dayNum = daysBetween(r.start_date, todayNY) + 1;
    if (dayNum !== TRIGGER_DAY_OF_ROUND) {
      results.push({ round: r.id, day: dayNum, action: 'not_day_6' });
      continue;
    }
    const { data: existing } = await supabase.from('email_sends').select('id').eq('campaign', `summary-${r.id}`).limit(1);
    if (existing && existing.length > 0) {
      results.push({ round: r.id, action: 'already_sent_for_round' });
      continue;
    }
    const isEvergreen = r.id.startsWith('wk_');
    const { data: participants } = await supabase
      .from('allowed_emails')
      .select('email, customer_type, primary_email')
      .in('round', [r.id, 'both'])
      .is('access_revoked_at', null);
    const list = (participants || []).filter(p => !p.primary_email && (p.customer_type === 'paid' || p.customer_type === 'family' || p.customer_type === 'admin' || !p.customer_type));

    if (!armed) {
      results.push({ round: r.id, day: dayNum, action: 'dry_run_not_armed', would_send_to: list.length, variant: isEvergreen ? 'evergreen' : 'legacy' });
      continue;
    }
    let ok = 0, errors = 0, lastErr: string | null = null;
    for (const p of list) {
      const send = await sendOne(p.email, isEvergreen);
      if (send.ok) {
        ok++;
        await supabase.from('email_sends').insert({ email: p.email, campaign: `summary-${r.id}`, resend_id: send.id || null });
      } else {
        errors++; lastErr = send.error || 'unknown';
      }
    }
    results.push({ round: r.id, day: dayNum, sent: ok, errors, lastErr, variant: isEvergreen ? 'evergreen' : 'legacy' });
  }
  return new Response(JSON.stringify({ ok: true, ny_date: todayNY, ny_hour: hour, armed, results }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
});
