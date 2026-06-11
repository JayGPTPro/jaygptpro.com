import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY') || Deno.env.get('RESEND_API_KEY_BINA')!;
const sharedSecret = Deno.env.get('FORM_SYNC_SECRET') || '';

const FROM_EMAIL = 'Jay Margaliot <info@jaygptpro.com>';
const REPLY_TO = 'info@jaygptpro.com';
const PORTAL = 'https://jaygptpro.com/donna-challenge/';

// Evergreen default WhatsApp group, used only if a round row has no whatsapp_link.
const EVERGREEN_WA = 'https://chat.whatsapp.com/Kw459iL73jV4zSTSxd18tS';

// Legacy fallbacks for the two pre-evergreen rounds, in case their round row is missing fields.
const FALLBACK: Record<string, { wa: string; dates: string }> = {
  round4: { wa: 'https://chat.whatsapp.com/GmlS7mkK0zfGHEI3W9FaTp?mode=gi_t', dates: 'May 18-22, 2026' },
  round5: { wa: 'https://chat.whatsapp.com/DfLQHp00JQf5IRWfjNTMtE?mode=gi_t', dates: 'June 1-5, 2026' },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Accept any round id. Normalize the legacy short forms (r4/r5) to canonical; pass everything else through.
function toCanonical(round: string): string {
  if (round === 'r4') return 'round4';
  if (round === 'r5') return 'round5';
  return round;
}

async function loadRoundMeta(supabase: any, round: string): Promise<{ wa: string; dates: string }> {
  const canonical = toCanonical(round);
  try {
    const { data, error } = await supabase
      .from('rounds')
      .select('whatsapp_link, welcome_dates_display')
      .eq('id', canonical)
      .maybeSingle();
    if (!error && data && data.whatsapp_link && data.welcome_dates_display) {
      return { wa: data.whatsapp_link, dates: data.welcome_dates_display };
    }
  } catch (e) { console.error('loadRoundMeta exception, falling back:', e); }
  if (FALLBACK[canonical]) return FALLBACK[canonical];
  // Evergreen fallback when the round row is incomplete.
  return { wa: EVERGREEN_WA, dates: 'this coming Monday to Friday' };
}

function buildEmail(waLink: string, dates: string): { subject: string; html: string } {
  const subject = `You’re in! Welcome to the Claude Code Challenge`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
<tr><td style="padding:44px 48px 8px">
  <p style="margin:0;font-size:11px;color:#e87040;font-weight:700;letter-spacing:2px;text-transform:uppercase">WELCOME</p>
  <h1 style="margin:14px 0 0;font-size:28px;font-weight:800;color:#1a1a2e;line-height:1.3;letter-spacing:-0.4px">You’re officially in</h1>
  <p style="margin:10px 0 0;font-size:15px;color:#666">${dates}</p>
</td></tr>
<tr><td style="padding:20px 48px 4px">
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Your spot is locked in for <strong>${dates}</strong>. Here’s everything you need before Day 1.</p>
  <p style="margin:24px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">1. Join the WhatsApp group, this is where the action happens</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Every daily check-in, recording link, and live answer happens in the group. Don’t skip it.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0"><a href="${waLink}" target="_blank" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:50px;letter-spacing:0.3px">\u{1F4AC} Join the WhatsApp group</a></td></tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px"><tr><td style="background:#fff7ed;border-left:4px solid #e87040;border-radius:10px;padding:18px 22px"><p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#c2410c">⚠️ Heads-up about portal login</p><p style="margin:0;font-size:14px;color:#555;line-height:1.65">The portal uses Google Sign-In. <strong>If the email you used to pay isn’t a Gmail address</strong> (work email, Yahoo, Hotmail, etc.), the portal won’t recognize it. <strong>Just reply to this email with your Gmail address</strong> and I’ll link it to your account in under an hour. 30-second fix.</p></td></tr></table>
  <p style="margin:24px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">2. Your portal is live, Day 0 is open right now</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Day 0 is setup day. Get Claude Code Desktop and Claude Pro ($20/mo) installed. The full guide is waiting for you.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0"><a href="${PORTAL}" target="_blank" style="display:inline-block;background:#e87040;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:50px;letter-spacing:0.3px">Open the portal →</a></td></tr></table>
  <p style="margin:24px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">3. Spend 15 minutes playing with Claude Code today</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Once Day 0 is done, try the examples I walk through in the Day 0 video. Once those click, go off-script and ask Claude to help with something small and real from your week.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f8f6f2;border-radius:14px;padding:20px 24px"><p style="margin:0;font-size:14px;color:#555;line-height:1.7"><strong>Why this matters:</strong> Everyone who shows up cold on Day 1 spends the first 2 hours just getting comfortable with Claude Code. Spend 15 minutes today and you’ll show up on Day 1 ready to actually build.</p></td></tr></table>
  <p style="margin:24px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">What happens next</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">On Day 1 at 2pm New York time, the first lesson opens. You’ll get an email and a WhatsApp ping.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">Questions? Reply to this email. I read everything.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">See you soon \u{1F680}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr><td style="background:#fff7ed;border-radius:14px;padding:20px 24px"><p style="margin:0;font-size:14px;color:#555;line-height:1.7"><strong>P.S.</strong> If you’ve never seen <em>Suits</em>, the whole challenge is built around <strong>Donna Paulsen</strong>, the most legendary Chief of Staff on TV. Throw on Season 1 Episode 1 on Netflix sometime this weekend. You’ll get a lot more out of every reference once you’ve met her.</p></td></tr></table>
</td></tr>
<tr><td style="padding:36px 48px 36px">
  <div style="height:2px;background:linear-gradient(90deg,transparent,#e87040,transparent);margin-bottom:20px"></div>
  <p style="margin:0;font-size:14px;color:#999;font-weight:600">Jay Margaliot</p>
  <p style="margin:2px 0 0;font-size:13px;color:#bbb">Claude Code Challenge</p>
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html };
}

async function recordResult(supabase: any, email: string, ok: boolean) {
  if (!email) return;
  const lower = email.toLowerCase();
  await supabase.from('allowed_emails').update({ welcome_email_sent_at: ok ? new Date().toISOString() : null }).ilike('email', lower);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders() });

  const provided = req.headers.get('x-form-secret') || '';
  if (!sharedSecret || provided !== sharedSecret) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  if (!resendKey) return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });

  let email = ''; let round = '';
  try {
    const body = await req.json();
    email = String(body.email || '').trim();
    round = String(body.round || '').trim().toLowerCase();
    if (!email) return new Response(JSON.stringify({ error: 'Missing email' }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });

    const url = new URL(req.url);
    const previewTo = url.searchParams.get('to') || '';
    const isPreview = url.searchParams.get('preview') === '1';

    const supabase = createClient(supabaseUrl, supabaseKey);
    const meta = await loadRoundMeta(supabase, round);
    const { subject, html } = buildEmail(meta.wa, meta.dates);

    const to = isPreview && previewTo ? previewTo : email;
    const resendRes = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM_EMAIL, to: [to], reply_to: REPLY_TO, subject, html }) });
    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      if (!isPreview) await recordResult(supabase, email, false);
      console.error('Resend error:', resendData);
      return new Response(JSON.stringify({ error: 'Resend send failed', detail: resendData }), { status: 502, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }
    if (!isPreview) await recordResult(supabase, email, true);
    return new Response(JSON.stringify({ ok: true, preview: isPreview, email: to, round, resendId: resendData.id, dates: meta.dates }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('send-welcome-english error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }
});
