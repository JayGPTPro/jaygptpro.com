import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Wonka Creative Bootcamp . purchase confirmation email.
//
// Modelled on send-welcome-english, and deliberately NOT a variant of it: the
// Donna welcome is Donna copy (Suits, Chief of Staff, 5 days) and would be the
// wrong email for a Wonka buyer. Same env vars, same Resend call, same
// recordResult contract.
//
// Every link comes from the round row so nothing has to be redeployed when Jay
// fills one in. A block whose link is still missing is OMITTED rather than
// printed as a placeholder: a paying customer must never receive "[GROUP LINK]".
// ============================================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY')!;
const sharedSecret = Deno.env.get('FORM_SYNC_SECRET') || '';

const FROM_EMAIL = 'Jay Margaliot <info@jaygptpro.com>';
const REPLY_TO = 'info@jaygptpro.com';
const DEFAULT_PORTAL = 'https://jaygptpro.com/wonka-bootcamp/';
// NO kit link in this email (Jay, 10.8): the starter kit is handed out inside
// the portal on Day 1, and it is still being built until then. NO refund or
// guarantee talk either; EMAIL-SEQUENCE.md line 10 is the rule, and a purchase
// confirmation is not the place to reopen the money conversation.

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

type Meta = { wa: string; dates: string; portal: string };

async function loadRoundMeta(supabase: any, round: string): Promise<Meta> {
  const fallback: Meta = { wa: '', dates: 'August 10 to 21, 2026', portal: DEFAULT_PORTAL };
  try {
    const { data, error } = await supabase
      .from('rounds')
      .select('whatsapp_link, welcome_dates_display, portal_url')
      .eq('id', round || 'wonka_r1')
      .maybeSingle();
    if (!error && data) {
      return {
        wa: data.whatsapp_link || '',
        dates: data.welcome_dates_display || fallback.dates,
        portal: data.portal_url || DEFAULT_PORTAL,
      };
    }
  } catch (e) { console.error('loadRoundMeta exception, falling back:', e); }
  return fallback;
}

const S = {
  wrap: "margin:0;padding:0;background:#160A1C;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  card: "background:#241033;border-radius:20px;overflow:hidden;box-shadow:0 4px 28px rgba(0,0,0,.45)",
  h1: "margin:0;font-size:26px;line-height:1.25;color:#F3E9D2;font-weight:800;letter-spacing:-.4px",
  p: "margin:0 0 16px;font-size:15px;line-height:1.75;color:#D9CDBA",
  strong: "color:#F3E9D2",
  gold: "color:#E4B46C",
  btn: "display:inline-block;background:#E4B46C;color:#2A1409;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:50px;letter-spacing:.3px",
  btnWa: "display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:50px;letter-spacing:.3px",
  note: "background:#31163F;border-left:4px solid #E4B46C;border-radius:10px;padding:18px 22px",
  warn: "background:#3A1520;border-left:4px solid #E0356B;border-radius:10px;padding:18px 22px",
  li: "margin:0 0 9px;font-size:15px;line-height:1.7;color:#D9CDBA",
};

function buildEmail(meta: Meta): { subject: string; html: string } {
  const subject = `You're in. Here are your factory keys.`;

  // Only rendered when the link actually exists.
  const waBlock = meta.wa
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:6px 0 18px"><a href="${meta.wa}" target="_blank" style="${S.btnWa}">Join the WhatsApp group</a></td></tr></table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${S.note}"><p style="margin:0;font-size:14px;color:#D9CDBA;line-height:1.7">The WhatsApp group invite goes out in a separate email a few days before Day 1. Nothing for you to do.</p></td></tr></table><div style="height:18px"></div>`;

  const html = `<!DOCTYPE html><html><body style="${S.wrap}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#160A1C"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="${S.card}">

  <tr><td style="padding:36px 40px 8px">
    <p style="margin:0 0 14px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#B87333">The Wonka Creative Bootcamp</p>
    <h1 style="${S.h1}">You're in.</h1>
  </td></tr>

  <tr><td style="padding:22px 40px 0">
    <p style="${S.p}">Here is what you just bought, in one sentence: complete the 10 days and your product has a full creative package. A new main image, a full secondary set, A+ content, and variation images. Quality checked, tested in the Tasting Room, and ready to upload to Amazon or start an A/B test.</p>
    <p style="${S.p}">Built by an AI employee named <span style="${S.gold}">Wonka</span> that you hire on Day 1.</p>
    <p style="${S.p}"><span style="${S.strong}">Your round runs ${meta.dates}.</span></p>
  </td></tr>

  <tr><td style="padding:12px 40px 0">
    <p style="margin:0 0 12px;font-size:15px;color:#F3E9D2;font-weight:700">One thing now, one minute</p>
    <p style="${S.li}">Bookmark the portal: <a href="${meta.portal}" style="${S.gold}">${meta.portal}</a>. That is where everything happens, starting Day 1. Your starter kit is waiting for you there on Day 1 too.</p>
  </td></tr>

  <tr><td style="padding:22px 40px 0">${waBlock}</td></tr>

  <tr><td style="padding:0 40px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${S.warn}">
      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#E0356B">Heads-up about portal login</p>
      <p style="margin:0;font-size:14px;color:#D9CDBA;line-height:1.65">The portal uses Google Sign-In. <strong style="${S.strong}">If the email you paid with is not a Google account</strong> (work email, Yahoo, Hotmail), the portal will not recognise it. Reply to this email with a Google address and I will link it to your account.</p>
    </td></tr></table>
  </td></tr>

  <tr><td style="padding:26px 40px 0">
    <p style="margin:0 0 12px;font-size:15px;color:#F3E9D2;font-weight:700">Worth starting today</p>
    <p style="${S.p}">Your <span style="${S.strong}">OpenAI organization verification</span>. It is a one time check, it can take a while to clear, and until it clears your key can talk but it cannot draw. Day 1 shows you exactly where the button lives. Starting early costs you nothing and saves the one delay that actually stings.</p>
  </td></tr>

  <tr><td style="padding:12px 40px 0">
    <p style="margin:0 0 12px;font-size:15px;color:#F3E9D2;font-weight:700">What is in your ticket</p>
    <p style="${S.li}">All 10 days, plus the kit and its 15 skills, yours forever</p>
    <p style="${S.li}">Your full package built and tested: main, secondaries, A+, variations</p>
    <p style="${S.li}">The Tasting Room, about 100 tasters per race</p>
    <p style="${S.li}">A full month of Genrupt, 1,800 credits, about $100 of value</p>
    <p style="${S.li}">The WhatsApp group and a live Q&amp;A</p>
  </td></tr>

  <tr><td align="center" style="padding:28px 40px 8px">
    <a href="${meta.portal}" target="_blank" style="${S.btn}">Open the portal</a>
  </td></tr>

  <tr><td style="padding:22px 40px 36px">
    <div style="height:2px;background:linear-gradient(90deg,transparent,#B87333,transparent);margin-bottom:20px"></div>
    <p style="${S.p}">Questions? Reply to this email. I read everything.</p>
    <p style="margin:0;font-size:15px;color:#F3E9D2">Jay</p>
    <p style="margin:18px 0 0;font-size:13px;color:#9C8E9E;line-height:1.7"><strong style="color:#D9CDBA">P.S.</strong> Added the foundations at checkout? Your Claude Code Challenge access arrives in a separate email with every day already unlocked, so you can finish it before this bootcamp opens.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

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
    round = String(body.round || 'wonka_r1').trim().toLowerCase();
    if (!email) return new Response(JSON.stringify({ error: 'Missing email' }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });

    const url = new URL(req.url);
    const previewTo = url.searchParams.get('to') || '';
    const isPreview = url.searchParams.get('preview') === '1';

    const supabase = createClient(supabaseUrl, supabaseKey);
    const meta = await loadRoundMeta(supabase, round);
    const { subject, html } = buildEmail(meta);

    const to = isPreview && previewTo ? previewTo : email;
    const resendRes = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM_EMAIL, to: [to], reply_to: REPLY_TO, subject, html }) });
    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      if (!isPreview) await recordResult(supabase, email, false);
      console.error('Resend error:', resendData);
      return new Response(JSON.stringify({ error: 'Resend send failed', detail: resendData }), { status: 502, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }
    if (!isPreview) await recordResult(supabase, email, true);
    return new Response(JSON.stringify({ ok: true, preview: isPreview, email: to, round, resendId: resendData.id, dates: meta.dates, waIncluded: !!meta.wa }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('send-welcome-wonka error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }
});
