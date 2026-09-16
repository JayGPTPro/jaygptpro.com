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
const PORTAL_URL = 'https://jaygptpro.com/donna-challenge/';
const WA_LINKS: Record<string, string> = {
  round1: 'https://chat.whatsapp.com/Kw459iL73jV4zSTSxd18tS',
  round2: 'https://chat.whatsapp.com/GZLCWjQAKmILir6X40caUB',
};
const ROUND_DATES: Record<string, string> = {
  round1: 'April 20 to April 24',
  round2: 'April 27 to May 1',
};
const ROUND_LABEL: Record<string, string> = {
  round1: 'Round 1',
  round2: 'Round 2',
};
const ROUND_EMOJI: Record<string, string> = {
  round1: '\u{1F7E6}',
  round2: '\u{1F7E7}',
};

function renderEmail(round: string): { subject: string; html: string } {
  const dates = ROUND_DATES[round] || '';
  const label = ROUND_LABEL[round] || round;
  const emoji = ROUND_EMOJI[round] || '';
  const wa = WA_LINKS[round] || '#';
  const subject = `Your ${label} spot is confirmed`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<style>@media (prefers-color-scheme: dark) { .email-body{background:#1a1a1a!important} .main-container{background:#2a2a2e!important} .text-primary{color:#e8e8ed!important} .text-secondary{color:#aaa!important} .text-dim{color:#888!important} .card-light{background:#333338!important} .wa-card{background:#1a3a2e!important;border-color:rgba(37,211,102,0.4)!important} .divider-line{background:linear-gradient(90deg,transparent,#e87040,transparent)!important} .section-title{color:#fff!important} .top-tag{color:#f0935e!important} }</style></head>
<body class="email-body" style="margin:0;padding:0;background-color:#f0ede8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8" class="email-body"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" class="main-container" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">

<tr><td style="padding:44px 48px 8px">
  <p style="margin:0;font-size:11px;color:#e87040;font-weight:700;letter-spacing:2px;text-transform:uppercase" class="top-tag">Quick housekeeping</p>
  <h1 style="margin:14px 0 0;font-size:26px;font-weight:800;color:#1a1a2e;line-height:1.3;letter-spacing:-0.4px" class="section-title">Your ${label} spot is confirmed</h1>
</td></tr>

<tr><td style="padding:20px 48px 4px">
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75" class="text-primary">Hi,</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75" class="text-primary">Following up on your Claude Code Challenge signup. I never got a round preference back from you, so here is what I did:</p>
</td></tr>

<tr><td style="padding:24px 48px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="card-light" style="background:linear-gradient(135deg,#fff4e6 0%,#ffece0 100%);border:1px solid rgba(232,112,64,0.2);border-radius:14px;padding:22px 28px">
    <p style="margin:0;font-size:11px;color:#e87040;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">You're in</p>
    <p style="margin:8px 0 0;font-size:20px;color:#1a1a2e;font-weight:800;letter-spacing:-0.3px" class="section-title">${emoji} ${label}: ${dates}</p>
    <p style="margin:8px 0 0;font-size:14px;color:#666;line-height:1.6" class="text-secondary">Round 1 filled up, so I locked you into Round 2. Same content, same structure, one week later. If Round 2 does not work for you, just hit reply and we will figure it out.</p>
  </td></tr></table>
</td></tr>

<tr><td style="padding:36px 48px 0">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td style="width:40px;vertical-align:top"><div style="background:linear-gradient(135deg,#e87040,#f0935e);width:40px;height:40px;border-radius:50%;text-align:center;line-height:40px"><span style="color:#fff;font-size:16px;font-weight:800">\u2192</span></div></td>
    <td style="padding-left:18px;vertical-align:top">
      <p style="margin:6px 0 4px;font-size:11px;color:#25D366;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">One step . required</p>
      <h2 style="margin:0;font-size:22px;color:#1a1a2e;font-weight:800;letter-spacing:-0.3px;line-height:1.3" class="section-title">Join the WhatsApp group</h2>
    </td>
  </tr></table>
</td></tr>

<tr><td style="padding:14px 48px 0">
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75" class="text-primary">This is where everything happens during the challenge: daily access links, live Q&A, real-time updates, and direct support.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px">
    <tr><td class="wa-card" style="background:#f0fdf5;border:1px solid #c8efd4;border-radius:14px;padding:24px 28px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="width:36px;vertical-align:middle"><div style="width:32px;height:32px;background:#25D366;border-radius:50%;text-align:center;line-height:32px;font-size:18px">\u{1F4AC}</div></td>
        <td style="vertical-align:middle;padding-left:10px"><p style="margin:0;font-size:14px;font-weight:700;color:#128C7E" class="section-title">Tap to join the ${label} group</p></td>
      </tr></table>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px"><tr>
        <td align="center"><a href="${wa}" target="_blank" style="display:block;background:#25D366;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 8px;border-radius:50px;letter-spacing:0.3px">${emoji} Join ${label} WhatsApp group</a></td>
      </tr></table>
    </td></tr>
  </table>
  <p style="margin:14px 0 0;font-size:14px;color:#666;line-height:1.7;font-style:italic" class="text-secondary">Don't use WhatsApp? Just reply to this email and we'll figure out the best way to keep you in the loop.</p>
</td></tr>

<tr><td style="padding:36px 48px 0">
  <div class="divider-line" style="height:2px;background:linear-gradient(90deg,transparent,#e87040,transparent)"></div>
</td></tr>

<tr><td style="padding:28px 48px 0">
  <p style="margin:0 0 8px;font-size:11px;color:#e87040;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">How it works</p>
  <h2 style="margin:0 0 14px;font-size:20px;color:#1a1a2e;font-weight:800;letter-spacing:-0.3px;line-height:1.35" class="section-title">When the challenge starts</h2>
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75" class="text-primary">Daily content opens at <strong style="color:#1a1a2e" class="section-title">2pm New York time</strong>. About 30 minutes of video plus 30 minutes hands-on per day, flexible whenever works for you.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75" class="text-primary">On Sunday April 26, I'll open the WhatsApp group and send the Day 0 setup link. Day 1 officially kicks off Monday April 27.</p>
</td></tr>

<tr><td style="padding:28px 48px 0">
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75" class="text-primary">If you want a head start before then, you can already log into the portal and explore Day 0 (the prep day):</p>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:14px"><tr><td align="center"><a href="${PORTAL_URL}" target="_blank" style="display:inline-block;background:#e87040;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:50px;letter-spacing:0.3px">Open the portal \u2192</a></td></tr></table>
</td></tr>

<tr><td style="padding:32px 48px 0">
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75" class="text-primary">Any questions, just reply to this email. I read everything personally.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75" class="text-primary">Talk soon,</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75" class="text-primary">Jay</p>
</td></tr>

<tr><td style="padding:36px 48px 36px">
  <div class="divider-line" style="height:2px;background:linear-gradient(90deg,transparent,#e87040,transparent);margin-bottom:20px"></div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td style="width:56px;vertical-align:middle"><img src="https://jaygptpro.com/daily-claude-hacks/media/jay-avatar.jpg" alt="Jay" width="44" height="44" style="border-radius:50%;display:block"></td>
    <td style="vertical-align:middle;padding-left:6px"><p style="margin:0;font-size:14px;color:#999;font-weight:600">Jay Margaliot</p><p style="margin:2px 0 0;font-size:13px;color:#bbb">Claude Code Challenge</p></td>
  </tr></table>
</td></tr>

</table></td></tr></table></body></html>`;
  return { subject, html };
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

  if (!resendKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  let email = '';
  let round = '';
  try {
    const body = await req.json();
    email = String(body.email || '').trim();
    round = String(body.round || '').trim();
    if (!email || !round) {
      return new Response(JSON.stringify({ error: 'Missing email or round' }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }
    if (!ROUND_LABEL[round]) {
      return new Response(JSON.stringify({ error: 'Invalid round (use round1 or round2)' }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    const { subject, html } = renderEmail(round);
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [email], reply_to: REPLY_TO, subject, html }),
    });
    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      return new Response(JSON.stringify({ error: 'Resend send failed', detail: resendData }), { status: 502, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    // Log to user_events so it shows up in admin
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('user_events').insert({
        user_email: email.toLowerCase(),
        event_type: 'round_assignment_email_sent',
        event_data: { round, resend_id: resendData.id },
      });
    } catch (_) { /* swallow */ }

    return new Response(JSON.stringify({ ok: true, email, round, resendId: resendData.id }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }
});
