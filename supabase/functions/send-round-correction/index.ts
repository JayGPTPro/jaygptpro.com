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

function renderEmail(): { subject: string; html: string } {
  const subject = 'Quick correction . you\'re in Round 1';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<style>@media (prefers-color-scheme: dark) { .email-body{background:#1a1a1a!important} .main-container{background:#2a2a2e!important} .text-primary{color:#e8e8ed!important} .text-dim{color:#aaa!important} .card-light{background:#333338!important} .section-title{color:#fff!important} }</style></head>
<body class="email-body" style="margin:0;padding:0;background:#f0ede8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8" class="email-body"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" class="main-container" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">

<tr><td style="padding:44px 48px 8px">
  <p style="margin:0;font-size:11px;color:#e87040;font-weight:700;letter-spacing:2px;text-transform:uppercase">Quick correction</p>
  <h1 style="margin:14px 0 0;font-size:26px;font-weight:800;color:#1a1a2e;line-height:1.3;letter-spacing:-0.4px" class="section-title">You\'re in Round 1, not Round 2</h1>
</td></tr>

<tr><td style="padding:20px 48px 4px">
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75" class="text-primary">Hi,</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75" class="text-primary">Quick correction on the email I sent yesterday. I had you down with no round preference and put you in Round 2 by default, but I see now you\'re actually confirmed for <strong style="color:#1a1a2e" class="section-title">Round 1 (April 20 to April 24)</strong>. Sorry for the mixup.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75" class="text-primary">Your Round 1 spot is locked in. Nothing else to do, you\'re already in the right WhatsApp group.</p>
</td></tr>

<tr><td style="padding:24px 48px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="card-light" style="background:linear-gradient(135deg,#fff4e6 0%,#ffece0 100%);border:1px solid rgba(232,112,64,0.2);border-radius:14px;padding:22px 28px">
    <p style="margin:0;font-size:11px;color:#e87040;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">You\'re in</p>
    <p style="margin:8px 0 0;font-size:20px;color:#1a1a2e;font-weight:800;letter-spacing:-0.3px" class="section-title">\u{1F7E6} Round 1: April 20 to April 24</p>
    <p style="margin:8px 0 0;font-size:14px;color:#666;line-height:1.6" class="text-dim">Daily content drops at 2pm New York time. About 30 min video plus 30 min hands-on per day.</p>
  </td></tr></table>
</td></tr>

<tr><td style="padding:32px 48px 0">
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75" class="text-primary">Talk Monday,</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75" class="text-primary">Jay</p>
</td></tr>

<tr><td style="padding:36px 48px 36px">
  <div style="height:2px;background:linear-gradient(90deg,transparent,#e87040,transparent);margin-bottom:20px"></div>
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
  try {
    const body = await req.json();
    email = String(body.email || '').trim();
    if (!email) {
      return new Response(JSON.stringify({ error: 'Missing email' }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    const { subject, html } = renderEmail();
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [email], reply_to: REPLY_TO, subject, html }),
    });
    const data = await resendRes.json();
    if (!resendRes.ok) {
      return new Response(JSON.stringify({ error: 'Resend send failed', detail: data }), { status: 502, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('user_events').insert({
        user_email: email.toLowerCase(),
        event_type: 'round_correction_email_sent',
        event_data: { resend_id: data.id, corrected_to: 'round1' },
      });
    } catch (_) {}

    return new Response(JSON.stringify({ ok: true, email, resendId: data.id }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }
});
