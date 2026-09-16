import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY')!;
// Reads EDGE_SHARED_SECRET (16.9.2026). FORM_SYNC_SECRET's value was hardcoded in the
// public admin.html page, so it opens nothing any more.
const sharedSecret = Deno.env.get('EDGE_SHARED_SECRET') || '';

const FROM_EMAIL = 'Jay Margaliot <info@jaygptpro.com>';
const REPLY_TO = 'info@jaygptpro.com';
const VAULT_OFFER_URL = 'https://jaygptpro.com/vault-challenge-offer/';
const VAULT_COUPON = 'Q8812X';

// Trigger window: NY hour 17 on day 4 of an English round (1-indexed, where day 1 = start_date).
const TRIGGER_HOUR_NY = 17;
const TRIGGER_DAY_OF_ROUND = 4;

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

function renderVaultEmail(): { subject: string; html: string } {
  const subject = 'You built Donna. Here’s the next move (your coupon is inside)';
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>AI Vault offer</title></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="background:#0f1424;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
<tr><td style="background:radial-gradient(circle at 30% 0%,rgba(212,164,68,0.18),transparent 50%),linear-gradient(180deg,#0c1126,#0f1424);padding:56px 48px 40px;text-align:center;border-bottom:1px solid rgba(212,164,68,0.18)">
  <p style="margin:0 0 18px;font-size:11px;color:#d4a444;font-weight:800;letter-spacing:4px;text-transform:uppercase">✨ The AI Vault</p>
  <h1 style="margin:0;font-size:34px;font-weight:900;color:#fff;line-height:1.15;letter-spacing:-0.5px">You built Donna in 5 days.</h1>
  <h1 style="margin:6px 0 0;font-size:34px;font-weight:900;color:#d4a444;line-height:1.15;letter-spacing:-0.5px">Here’s the next move.</h1>
  <p style="margin:22px 0 0;font-size:14px;color:#9aa1bd;line-height:1.6">What’s inside the Vault, and the coupon I’m holding open for you.</p>
</td></tr>
<tr><td style="padding:40px 48px 8px">
  <p style="margin:0;font-size:16px;color:#d6dbed;line-height:1.8">Real talk for a minute.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#d6dbed;line-height:1.8">You just turned Claude Code into your <strong style="color:#fff">first AI employee</strong>. Most people who said they’d do this are still &ldquo;planning&rdquo; to.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#d6dbed;line-height:1.8">The question I always get on Day 5: <em style="color:#fff">&ldquo;OK Jay, how do I keep going from here?&rdquo;</em></p>
  <p style="margin:14px 0 0;font-size:16px;color:#d6dbed;line-height:1.8">Same answer every time: <strong style="color:#d4a444">the Vault</strong>.</p>
</td></tr>
<tr><td style="padding:32px 48px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#16203e,#0f1424);border:1px solid rgba(212,164,68,0.3);border-radius:16px">
    <tr><td style="padding:28px 28px 22px">
      <p style="margin:0;font-size:10px;color:#d4a444;font-weight:800;letter-spacing:3px;text-transform:uppercase">This month inside the Vault</p>
      <p style="margin:10px 0 0;font-size:22px;color:#fff;font-weight:800;line-height:1.3">Claude Code for Amazon Sellers</p>
      <p style="margin:14px 0 0;font-size:15px;color:#b6bcd5;line-height:1.7">The most direct continuation of what you just built. Donna handles your inbox and calendar. This month’s module turns Claude into your listings, reviews, supplier emails, and weekly VA reports operator. If you sell on Amazon (or know someone who does), this alone is worth more than the membership.</p>
      <p style="margin:14px 0 0;font-size:13px;color:#9aa1bd;line-height:1.7"><strong style="color:#d4a444">Join now and it lands in your account the day it drops.</strong></p>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:40px 48px 0">
  <p style="margin:0;font-size:11px;color:#9aa1bd;font-weight:800;letter-spacing:3px;text-transform:uppercase">What’s inside the Vault</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px">
    <tr><td style="padding:14px 0;border-top:1px solid rgba(255,255,255,0.08)"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="34" valign="top" style="padding-right:14px"><span style="display:inline-block;width:28px;height:28px;background:#d4a444;color:#0f1424;border-radius:50%;text-align:center;line-height:28px;font-size:14px;font-weight:900">•</span></td><td valign="top" style="font-size:15px;color:#d6dbed;line-height:1.7"><strong style="color:#fff">A new module every month.</strong> Deep, real builds. Last month: scheduled tasks at scale. This month: Claude Code for Amazon Sellers. Next month: TBA but already in the lab.</td></tr></table></td></tr>
    <tr><td style="padding:14px 0;border-top:1px solid rgba(255,255,255,0.08)"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="34" valign="top" style="padding-right:14px"><span style="display:inline-block;width:28px;height:28px;background:#d4a444;color:#0f1424;border-radius:50%;text-align:center;line-height:28px;font-size:14px;font-weight:900">•</span></td><td valign="top" style="font-size:15px;color:#d6dbed;line-height:1.7"><strong style="color:#fff">A 1-on-1 with me, every quarter.</strong> 45 minutes, just you and me, on what to build next in your business. Members get one a quarter, no extra cost.</td></tr></table></td></tr>
    <tr><td style="padding:14px 0;border-top:1px solid rgba(255,255,255,0.08)"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="34" valign="top" style="padding-right:14px"><span style="display:inline-block;width:28px;height:28px;background:#d4a444;color:#0f1424;border-radius:50%;text-align:center;line-height:28px;font-size:14px;font-weight:900">•</span></td><td valign="top" style="font-size:15px;color:#d6dbed;line-height:1.7"><strong style="color:#fff">Every skill and automation I build for myself.</strong> Custom MCP servers, prompts, agents. The stuff I run my own business on, you get the same files.</td></tr></table></td></tr>
    <tr><td style="padding:14px 0;border-top:1px solid rgba(255,255,255,0.08);border-bottom:1px solid rgba(255,255,255,0.08)"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="34" valign="top" style="padding-right:14px"><span style="display:inline-block;width:28px;height:28px;background:#d4a444;color:#0f1424;border-radius:50%;text-align:center;line-height:28px;font-size:14px;font-weight:900">•</span></td><td valign="top" style="font-size:15px;color:#d6dbed;line-height:1.7"><strong style="color:#fff">A private community.</strong> People shipping with AI, workshopping each other’s setups. Quiet, high-signal, no spam.</td></tr></table></td></tr>
  </table>
</td></tr>
<tr><td style="padding:36px 48px 0">
  <p style="margin:0;font-size:11px;color:#9aa1bd;font-weight:800;letter-spacing:3px;text-transform:uppercase">And the part that’s just for you</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border-radius:14px;margin-top:14px"><tr><td style="padding:24px 28px;text-align:center"><p style="margin:0;font-size:12px;color:#92400e;font-weight:800;letter-spacing:2px;text-transform:uppercase">Your challenge coupon</p><p style="margin:12px 0 0;font-size:36px;color:#0f1424;font-weight:900;letter-spacing:3px;font-family:'SF Mono',Monaco,'Courier New',monospace">${VAULT_COUPON}</p><p style="margin:10px 0 0;font-size:13px;color:#92400e;line-height:1.6">For challenge graduates only. It works on the offer page below.</p></td></tr></table>
</td></tr>
<tr><td align="center" style="padding:28px 48px 8px">
  <a href="${VAULT_OFFER_URL}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#d4a444,#e8b853);color:#0f1424;text-decoration:none;font-size:16px;font-weight:900;padding:18px 44px;border-radius:50px;letter-spacing:0.3px;box-shadow:0 8px 24px rgba(212,164,68,0.3)">Open the offer →</a>
</td></tr>
<tr><td style="padding:24px 48px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(220,38,38,0.12);border:1px solid rgba(220,38,38,0.3);border-radius:12px"><tr><td style="padding:16px 22px;text-align:center"><p style="margin:0;font-size:14px;color:#fca5a5;font-weight:700">⏰ This coupon won’t stay open long.</p><p style="margin:4px 0 0;font-size:13px;color:#9aa1bd">Once it’s gone, it’s gone.</p></td></tr></table>
</td></tr>
<tr><td style="padding:40px 48px 0">
  <p style="margin:0;font-size:15px;color:#d6dbed;line-height:1.8">On the fence? Hit reply. I’d rather talk you out of it than have you regret it later.</p>
  <p style="margin:18px 0 0;font-size:15px;color:#d6dbed;line-height:1.8">Day 5 is tomorrow. Either way, see you there.</p>
  <p style="margin:18px 0 0;font-size:15px;color:#fff;font-weight:700">Jay</p>
</td></tr>
<tr><td style="padding:32px 48px 36px"><div style="height:1px;background:rgba(212,164,68,0.2);margin-bottom:18px"></div><p style="margin:0;font-size:12px;color:#6b7290;line-height:1.7">Jay Margaliot &middot; AI Vault</p><p style="margin:4px 0 0;font-size:12px;color:#6b7290"><a href="mailto:info@jaygptpro.com" style="color:#d4a444;text-decoration:none">info@jaygptpro.com</a></p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html };
}

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}

async function sendOne(email: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { subject, html } = renderVaultEmail();
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
    const r = await sendOne(previewTo);
    return new Response(JSON.stringify({ preview: true, ...r }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { hour, dateStr: todayNY } = nyHourAndDate();
  if (hour !== TRIGGER_HOUR_NY) {
    return new Response(JSON.stringify({ ok: true, action: 'skipped_off_hour', ny_hour: hour, ny_date: todayNY }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const { data: settingsRow } = await supabase.from('settings').select('value').eq('key', 'daily_emails_armed').maybeSingle();
  const armed = settingsRow && settingsRow.value && settingsRow.value.armed === true;

  const { data: rounds } = await supabase.from('rounds').select('id, start_date, status, language').in('status', ['upcoming', 'active', 'full']).eq('language', 'en');
  if (!rounds || rounds.length === 0) {
    return new Response(JSON.stringify({ ok: true, action: 'no_open_rounds', ny_date: todayNY }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const results: any[] = [];
  for (const r of rounds) {
    if (!r.start_date) continue;
    const dayNum = daysBetween(r.start_date, todayNY) + 1;
    if (dayNum !== TRIGGER_DAY_OF_ROUND) {
      results.push({ round: r.id, day: dayNum, action: 'not_day_4' });
      continue;
    }
    // Dedup. Have we already sent vault for this round?
    const { data: existing } = await supabase.from('email_sends').select('id').eq('campaign', `vault-${r.id}`).limit(1);
    if (existing && existing.length > 0) {
      results.push({ round: r.id, action: 'already_sent_for_round' });
      continue;
    }
    const { data: participants } = await supabase
      .from('allowed_emails')
      .select('email, customer_type, primary_email, notes')
      .in('round', [r.id, 'both'])
      .is('access_revoked_at', null);
    const list = (participants || []).filter(p => !p.primary_email && (p.customer_type === 'paid' || p.customer_type === 'family' || p.customer_type === 'admin' || !p.customer_type) && !((p.notes || '').toLowerCase().includes('[no-vault]')));

    if (!armed) {
      results.push({ round: r.id, day: dayNum, action: 'dry_run_not_armed', would_send_to: list.length });
      continue;
    }
    let ok = 0, errors = 0, lastErr: string | null = null;
    for (const p of list) {
      const send = await sendOne(p.email);
      if (send.ok) {
        ok++;
        await supabase.from('email_sends').insert({ email: p.email, campaign: `vault-${r.id}`, resend_id: send.id || null });
      } else {
        errors++; lastErr = send.error || 'unknown';
      }
    }
    results.push({ round: r.id, day: dayNum, sent: ok, errors, lastErr });
  }
  return new Response(JSON.stringify({ ok: true, ny_date: todayNY, ny_hour: hour, armed, results }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
});
