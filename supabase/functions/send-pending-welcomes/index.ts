import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY')!;
// Reads EDGE_SHARED_SECRET (16.9.2026). FORM_SYNC_SECRET's value was hardcoded in the
// public admin.html page, so it opens nothing any more.
const sharedSecret = Deno.env.get('EDGE_SHARED_SECRET') || '';

const FROM = 'Jay Margaliot <info@jaygptpro.com>';
const REPLY_TO = 'info@jaygptpro.com';
const PORTAL = 'https://jaygptpro.com/donna-challenge/';

const FALLBACK_WA: Record<string, string> = {
  round4: 'https://chat.whatsapp.com/GmlS7mkK0zfGHEI3W9FaTp?mode=gi_t',
  round5: 'https://chat.whatsapp.com/DfLQHp00JQf5IRWfjNTMtE?mode=gi_t',
};
const FALLBACK_DATES: Record<string, string> = {
  round4: 'May 18-22, 2026',
  round5: 'June 1-5, 2026',
};

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}

function welcomeBody(dates: string, waLink: string, roundNum: string): string {
  return `
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Your spot for Round ${roundNum} (<strong>${dates}</strong>) is locked. Here’s everything you need before Day 1.</p>
  <p style="margin:24px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">1. Join the WhatsApp group, this is where the action happens</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Every daily check-in, recording link, and live answer happens in the group. Don’t skip it.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0"><a href="${waLink}" target="_blank" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:50px;letter-spacing:0.3px">\u{1F4AC} Join Round ${roundNum} WhatsApp</a></td></tr></table>
  <p style="margin:24px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">2. Your portal is live, Day 0 is open right now</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Day 0 is setup day. Get Claude Code Desktop, Claude Pro ($20/mo), and Obsidian installed. The full guide is waiting for you.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0"><a href="${PORTAL}" target="_blank" style="display:inline-block;background:#e87040;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:50px;letter-spacing:0.3px">Open the portal →</a></td></tr></table>
  <p style="margin:24px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">3. Spend 15 minutes playing with Claude Code today</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Once Day 0 is done, try the examples I walk through in the Day 0 video. Once those click, go off-script and ask Claude to help with something small and real from your week.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f8f6f2;border-radius:14px;padding:20px 24px"><p style="margin:0;font-size:14px;color:#555;line-height:1.7"><strong>Why this matters:</strong> Everyone who shows up cold on Day 1 spends the first 2 hours just getting comfortable with Claude Code. Spend 15 minutes today and you’ll show up on Day 1 ready to actually build.</p></td></tr></table>
  <p style="margin:24px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">What happens next</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">On Day 1 at 2pm New York time, the first lesson opens. You’ll get an email and a WhatsApp ping.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Questions? Reply to this email. I read everything.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">See you soon \u{1F680}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr><td style="background:#fff7ed;border-radius:14px;padding:20px 24px"><p style="margin:0;font-size:14px;color:#555;line-height:1.7"><strong>P.S.</strong> If you’ve never seen <em>Suits</em>, the whole challenge is built around <strong>Donna Paulsen</strong>, the most legendary Chief of Staff on TV. Throw on Season 1 Episode 1 on Netflix sometime this weekend. You’ll get a lot more out of every reference once you’ve met her.</p></td></tr></table>`;
}

function shell(badge: string, title: string, sub: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
<tr><td style="padding:44px 48px 8px">
  <p style="margin:0;font-size:11px;color:#e87040;font-weight:700;letter-spacing:2px;text-transform:uppercase">${badge}</p>
  <h1 style="margin:14px 0 0;font-size:28px;font-weight:800;color:#1a1a2e;line-height:1.3;letter-spacing:-0.4px">${title}</h1>
  ${sub ? `<p style="margin:10px 0 0;font-size:15px;color:#666">${sub}</p>` : ''}
</td></tr>
<tr><td style="padding:20px 48px 4px">${body}</td></tr>
<tr><td style="padding:36px 48px 36px">
  <div style="height:2px;background:linear-gradient(90deg,transparent,#e87040,transparent);margin-bottom:20px"></div>
  <p style="margin:0;font-size:14px;color:#999;font-weight:600">Jay Margaliot</p>
  <p style="margin:2px 0 0;font-size:13px;color:#bbb">Claude Code Challenge</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function r4Welcome(waLink: string, dates: string) {
  return { subject: 'You’re in! Welcome to the Claude Code Challenge, Round 4', html: shell('WELCOME', 'You’re officially in', dates, welcomeBody(dates, waLink, '4')) };
}

function r5SpecialWelcome(waLink: string, dates: string) {
  const banner = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:2px solid #f59e0b;border-radius:14px;margin-bottom:20px"><tr><td style="padding:24px 28px">
    <p style="margin:0;font-size:11px;color:#92400e;font-weight:800;letter-spacing:2px;text-transform:uppercase">⚠️ Important update first</p>
    <p style="margin:12px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">We moved Round 5 forward by one week</p>
    <p style="margin:12px 0 0;font-size:15px;color:#333;line-height:1.75">Since many people couldn’t fully participate due to the Memorial Day weekend, I shifted Round 5 by one week so everyone can get the most out of the challenge.</p>
    <p style="margin:12px 0 0;font-size:15px;color:#333;line-height:1.75"><strong>New start date: Monday, June 1st.</strong> You’re automatically enrolled for the new dates, no action needed.</p>
    <p style="margin:16px 0 6px;font-size:13px;color:#92400e;font-weight:700;letter-spacing:1px;text-transform:uppercase">If June 1 doesn’t work for you</p>
    <p style="margin:8px 0 0;font-size:15px;color:#333;line-height:1.75"><strong>Option 1:</strong> Switch to Round 4, which starts this coming Monday, May 18th. If you want to do that, just reply to this email.</p>
    <p style="margin:8px 0 0;font-size:15px;color:#333;line-height:1.75"><strong>Option 2:</strong> If neither date works, reply privately and I’ll personally take care of you.</p>
    <p style="margin:14px 0 0;font-size:15px;color:#333;line-height:1.75">Otherwise, see you on June 1st 🚀</p>
  </td></tr></table>`;
  return { subject: 'Round 5 update inside (new start date) + your welcome kit', html: shell('UPDATE + WELCOME', 'Quick update for Round 5', dates, banner + welcomeBody(dates, waLink, '5')) };
}

async function loadRoundMeta(supabase: any, roundId: string): Promise<{ wa: string; dates: string }> {
  try {
    const { data } = await supabase.from('rounds').select('whatsapp_link, welcome_dates_display').eq('id', roundId).maybeSingle();
    if (data?.whatsapp_link && data?.welcome_dates_display) return { wa: data.whatsapp_link, dates: data.welcome_dates_display };
  } catch (e) {
    console.error('loadRoundMeta err:', e);
  }
  return { wa: FALLBACK_WA[roundId] || '#', dates: FALLBACK_DATES[roundId] || 'TBD' };
}

async function sendOne(email: string, subject: string, html: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [email], reply_to: REPLY_TO, subject, html }),
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

  const supabase = createClient(supabaseUrl, supabaseKey);
  const url = new URL(req.url);
  const roundsParam = url.searchParams.get('rounds') || 'round4,round5';
  const targetRounds = roundsParam.split(',').map(s => s.trim()).filter(Boolean);
  const dryRun = url.searchParams.get('dry_run') === '1';

  const { data: pending, error } = await supabase
    .from('allowed_emails')
    .select('email, name, round')
    .in('round', targetRounds)
    .is('welcome_email_sent_at', null)
    .eq('customer_type', 'paid')
    .is('access_revoked_at', null)
    .is('primary_email', null);

  if (error) return new Response(JSON.stringify({ error: 'pending lookup failed', detail: error }), { status: 500 });
  if (!pending || pending.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, action: 'nothing_pending' }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  if (dryRun) {
    return new Response(JSON.stringify({ ok: true, dry_run: true, pending_count: pending.length, breakdown: pending.reduce((acc: any, p: any) => { acc[p.round] = (acc[p.round] || 0) + 1; return acc; }, {}) }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  // Pre-load round metadata
  const metaCache: Record<string, { wa: string; dates: string }> = {};
  for (const r of targetRounds) metaCache[r] = await loadRoundMeta(supabase, r);

  const results: any[] = [];
  for (const p of pending) {
    // ATOMIC CLAIM: try to mark welcome_email_sent_at IF still NULL.
    // If 0 rows returned, another caller (cron or another curl) got it first; skip.
    const claimTime = new Date().toISOString();
    const { data: claimed } = await supabase
      .from('allowed_emails')
      .update({ welcome_email_sent_at: claimTime })
      .ilike('email', p.email)
      .is('welcome_email_sent_at', null)
      .select('email');
    if (!claimed || claimed.length === 0) {
      results.push({ email: p.email, round: p.round, ok: false, skipped: 'already_sent_by_another_caller' });
      continue;
    }

    // We hold the claim. Render and send.
    const meta = metaCache[p.round];
    const tpl = p.round === 'round5' ? r5SpecialWelcome(meta.wa, meta.dates) : r4Welcome(meta.wa, meta.dates);
    const send = await sendOne(p.email, tpl.subject, tpl.html);

    if (send.ok) {
      await supabase.from('email_sends').insert({ email: p.email, campaign: `welcome-${p.round}`, resend_id: send.id || null });
      results.push({ email: p.email, round: p.round, ok: true, id: send.id });
    } else {
      // ROLLBACK the claim so it can be retried later.
      await supabase.from('allowed_emails').update({ welcome_email_sent_at: null }).ilike('email', p.email).eq('welcome_email_sent_at', claimTime);
      results.push({ email: p.email, round: p.round, ok: false, error: send.error });
    }
    await new Promise(r => setTimeout(r, 600));
  }
  const okCount = results.filter(r => r.ok).length;
  const skippedCount = results.filter(r => r.skipped).length;
  const errCount = results.filter(r => !r.ok && !r.skipped).length;
  return new Response(JSON.stringify({ ok: true, attempted: results.length, sent: okCount, skipped: skippedCount, errors: errCount, results }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
});
