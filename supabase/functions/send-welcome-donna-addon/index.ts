import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// The $250 Claude Code Challenge add-on, bought inside a Wonka checkout.
//
// Why this is its OWN email and not a block inside the Wonka welcome (Jay, 12.8):
// two products, two portals, two Google sign-ins, two WhatsApp groups, and two
// schedules. One of them is open right now and the other opens on 1 September.
// Merged into one mail, every sentence needs a "for Wonka / for the Challenge"
// qualifier. A separate subject line is also findable three weeks later, which a
// P.S. never is.
//
// These buyers are invisible to every other Donna send: `send-daily-emails`
// selects on `round IN (roundId, 'both')` and their round is wonka_r1, so they
// receive NOTHING automatically. Chris Haupt paid $250 on 11.8 and heard nothing
// until he asked. This mail is the whole communication for that product.
//
// Their access comes from `allowed_emails.addon_donna`, which the Donna portal
// reads as `effectiveRound = addon_donna ? 'both'`, and round 'both' unlocks
// every day at once. So the copy must say all days are open. It is also what
// the sales page promises: "every day unlocked immediately".
//
// It deliberately does NOT write welcome_email_sent_at. That column is the Wonka
// welcome's atomic claim (claimWelcome in stripe-webhook); touching it here would
// let a Stripe retry send a second Wonka welcome.
// ============================================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY')!;
const sharedSecret = Deno.env.get('FORM_SYNC_SECRET') || '';

const FROM_EMAIL = 'Jay Margaliot <info@jaygptpro.com>';
const REPLY_TO = 'info@jaygptpro.com';
const PORTAL = 'https://jaygptpro.com/donna-challenge/';
const WA = 'https://chat.whatsapp.com/Kw459iL73jV4zSTSxd18tS';
const WONKA_OPENS = '1 September';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Donna's own visual language, not Wonka's factory palette: the reader is about
// to land in the Donna portal, and the two mails arriving minutes apart should
// not look like the same product.
const S = {
  bg: "margin:0;padding:0;background:#f0ede8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  card: "background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)",
  eyebrow: "margin:0 0 10px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8B7BA8;font-weight:700",
  h1: "margin:0;font-size:27px;line-height:1.25;color:#1a1a1a;font-weight:800;letter-spacing:-.5px",
  p: "margin:0 0 16px;font-size:15.5px;line-height:1.75;color:#3d3d3d",
  strong: "color:#1a1a1a;font-weight:700",
  num: "margin:0 0 8px;font-size:16px;color:#1a1a1a;font-weight:700",
  sub: "margin:0 0 14px;font-size:14.5px;line-height:1.7;color:#5a5a5a",
  btn: "display:inline-block;background:#6B3FA0;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 34px;border-radius:50px",
  btnWa: "display:inline-block;background:#25D366;color:#07240f;text-decoration:none;font-size:15px;font-weight:700;padding:15px 34px;border-radius:50px",
  warn: "background:#FFF6E5;border-left:4px solid #E8A33D;border-radius:0 10px 10px 0;padding:16px 20px",
  note: "background:#F4F0FA;border-radius:12px;padding:20px 24px",
  rule: "height:1px;background:#e8e2da;margin:0",
  foot: "margin:16px 0 0;font-size:13px;color:#8a8a8a;line-height:1.7",
};

// The subject and the headline are about DONNA, not about scheduling (Jay, 12.8).
// The first cut led with "It is open. All five days, right now.", which made the
// unlock schedule the entire subject of a mail announcing a course about hiring an
// AI Chief of Staff. All-days-open is a logistical detail, so it sits in a note near
// the bottom where a logistical detail belongs.
function buildEmail(): { subject: string; html: string } {
  const subject = `You're in. Now go hire Donna.`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="${S.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="${S.card}">

  <tr><td style="padding:44px 48px 6px">
    <p style="${S.eyebrow}">The Claude Code Challenge</p>
    <h1 style="${S.h1}">You're in. Now go hire Donna.</h1>
  </td></tr>

  <tr><td style="padding:22px 48px 0">
    <p style="${S.p}">Over five days you build an <span style="${S.strong}">AI Chief of Staff</span>. She reads your inbox so you do not have to, drafts the replies in your voice, pulls up what you promised a supplier before the call, and briefs you every morning before the coffee lands.</p>
    <p style="${S.p}">Not a chatbot you go and visit. An employee who works inside your business while you sleep.</p>
    <p style="${S.p}">Day 0 is setup. Day 1 you meet her. By Day 5 she is running on her own.</p>
  </td></tr>

  <tr><td style="padding:14px 48px 0">
    <p style="${S.num}">Start with Day 0</p>
    <p style="${S.sub}">Install Claude Code, take the tour, get comfortable. No terminal, no code. It is the shortest day of the five.</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td>
      <a href="${PORTAL}" target="_blank" style="${S.btn}">Open the portal</a>
    </td></tr></table>
    <p style="margin:12px 0 0;font-size:14px;color:#5a5a5a">Sign in with the email you paid with.</p>
  </td></tr>

  <tr><td style="padding:28px 48px 0">
    <p style="${S.num}">Join the WhatsApp group</p>
    <p style="${S.sub}">Questions get answered there faster than anywhere else, and you will see what everyone else is building.</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td>
      <a href="${WA}" target="_blank" style="${S.btnWa}">Join the group</a>
    </td></tr></table>
  </td></tr>

  <tr><td style="padding:28px 48px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${S.warn}">
      <p style="margin:0 0 6px;font-size:14.5px;font-weight:700;color:#8a5a10">Heads-up about portal login</p>
      <p style="margin:0;font-size:14px;line-height:1.65;color:#5a4520">The portal uses Google Sign-In. If the email you paid with is not a Google account (work email, Yahoo, Hotmail), the portal will not recognise it. Reply to this email with a Google address and I will link it to your ticket.</p>
    </td></tr></table>
  </td></tr>

  <tr><td style="padding:28px 48px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${S.note}">
      <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#4a2d75">One note on timing</p>
      <p style="margin:0;font-size:14.5px;line-height:1.7;color:#3d3d3d">Because you bought this alongside your Wonka ticket, all five days are unlocked from the start. Nothing is on a timer. Try to finish before <span style="${S.strong}">${WONKA_OPENS}</span>, when the factory opens, so you walk into Wonka with Donna already running.</p>
    </td></tr></table>
  </td></tr>

  <tr><td style="padding:30px 48px 0"><div style="${S.rule}"></div></td></tr>

  <tr><td style="padding:22px 48px 40px">
    <p style="${S.p}">Questions? Reply to this email. I read everything.</p>
    <p style="margin:0;font-size:15.5px;color:#1a1a1a;font-weight:600">Jay</p>
    <p style="${S.foot}"><strong style="color:#5a5a5a">P.S.</strong> Never seen Suits? Donna Paulsen is the Chief of Staff this whole thing is named after, the one who knows what you need before you ask. One episode and every reference lands.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  return { subject, html };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders() });

  const provided = req.headers.get('x-form-secret') || '';
  if (!sharedSecret || provided !== sharedSecret) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  if (!resendKey) return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });

  let email = '';
  try {
    const body = await req.json();
    email = String(body.email || '').trim();
    if (!email) return new Response(JSON.stringify({ error: 'Missing email' }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });

    const url = new URL(req.url);
    const isPreview = url.searchParams.get('preview') === '1';
    const previewTo = url.searchParams.get('to') || '';
    const to = isPreview && previewTo ? previewTo : email;

    // Refuse to tell somebody their Challenge is open when it is not. The whole
    // mail is a lie without this flag, because addon_donna IS the access.
    if (!isPreview) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from('allowed_emails')
        .select('addon_donna, access_revoked_at')
        .ilike('email', email.toLowerCase())
        .maybeSingle();
      if (error) {
        console.error('addon lookup failed:', error);
        return new Response(JSON.stringify({ error: 'addon lookup failed' }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
      }
      if (!data?.addon_donna || data.access_revoked_at) {
        console.warn('refusing to send: no Donna add-on on this row', { email, row: data });
        return new Response(JSON.stringify({ error: 'no donna addon for this email', sent: false }), { status: 409, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
      }
    }

    const { subject, html } = buildEmail();
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], reply_to: REPLY_TO, subject, html }),
    });
    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      console.error('Resend error:', resendData);
      return new Response(JSON.stringify({ error: 'Resend send failed', detail: resendData }), { status: 502, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, preview: isPreview, email: to, resendId: resendData.id }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('send-welcome-donna-addon error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }
});
