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
const INSTALL_URL = 'https://jaygptpro.com/claude-code-install-en.html';
const CHALLENGE_URL = 'https://jaygptpro.com/claude-code-challenge-launch/';
// What this email deliberately does NOT contain (Jay, 10.8, on his own read):
//   * a kit link. The starter kit is handed out inside the portal on Day 1, and
//     it is still being built until then.
//   * refund or guarantee talk. A purchase confirmation is not the place to
//     reopen the money conversation.
//   * a "what is in your ticket" recap. They just read it on the sales page and
//     paid; selling it back to them after the sale is noise.
//   * the Claude Code Challenge add-on P.S.
// Keep it to: what they bought in one line, the dates, the portal, WhatsApp,
// the Google login warning, and the one thing worth starting early.

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

type Meta = { wa: string; dates: string; portal: string };

// The Private Tour ($2,999) and the Golden Ticket ($497/$697) share round wonka_r1,
// so the round alone cannot tell them apart and a buyer paying six times as much was
// getting a mail that never mentioned the personal guidance he paid for (Jay, 11.8).
// The signal is the amount: the widest gap available, since the dearest Golden Ticket
// route is $697 plus the $250 add-on, well under $2,000.
const PRIVATE_TOUR_MIN_CENTS = 200000;

async function boughtPrivateTour(supabase: any, email: string): Promise<boolean> {
  if (!email) return false;
  try {
    // Scoped to Wonka payments made in the last day. It used to scan EVERY payment
    // ever made by this address, so an unrelated $3,267 invoice from June would have
    // promised a Golden Ticket buyer a $2,999 private tour and a personal call.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('stripe_customers')
      .select('amount_paid, currency, refunded, round, payment_date')
      .eq('email', email.toLowerCase())
      .eq('round', 'wonka_r1')
      .gte('payment_date', since);
    if (error) { console.error('boughtPrivateTour lookup error:', error); return false; }
    // Refunded payments do not count, and USD only: the Bina side prices in ILS,
    // where 200000 agorot is an ordinary Donna purchase, not a Private Tour.
    return (data || []).some((p: any) =>
      !p.refunded &&
      String(p.currency || 'usd').toLowerCase() === 'usd' &&
      Number(p.amount_paid || 0) >= PRIVATE_TOUR_MIN_CENTS);
  } catch (e) { console.error('boughtPrivateTour exception:', e); return false; }
}

async function loadRoundMeta(supabase: any, round: string): Promise<Meta> {
  // If the rounds read fails, this is what a paying customer is told. It said
  // "August 10 to 21, 2026", a dead date from an earlier schedule, which would have
  // told a buyer the bootcamp already happened. Keep it in step with
  // rounds.wonka_r1.welcome_dates_display.
  const fallback: Meta = { wa: '', dates: 'September 1 to 4, 8 to 10, and 15 to 17, 2026', portal: DEFAULT_PORTAL };
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


// ---------------------------------------------------------------------------
// The comped-seat email. Deliberately NOT the branded card above (Jay, 12.8):
// "too designed, too marketing HTML, I want each of them to think I wrote to them
// personally". So this is what a person actually sends: default font, black text
// on white, no cards, no buttons, links as plain links. It is HTML only because
// the links have to be clickable.
// ---------------------------------------------------------------------------
function buildGiftEmail(meta: Meta, firstName: string): { subject: string; html: string } {
  const subject = `A free ticket to the Wonka bootcamp`;
  const hi = firstName ? `Hi ${firstName},` : 'Hi,';
  const a = (href: string, text: string) =>
    `<a href="${href}" style="color:#1155cc">${text}</a>`;
  const wa = meta.wa
    ? `<p>2. The WhatsApp group, already open: ${a(meta.wa, 'join here')}</p>`
    : `<p>2. The WhatsApp group invite goes out a few days before Day 1.</p>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="max-width:600px;margin:0;padding:16px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#202124">
<p>${hi}</p>
<p>I decided to give you a free ticket to the Wonka Creative Bootcamp. It is yours, nothing to pay.</p>
<p>Ten days. You build an AI creative director called Wonka inside Claude Code, and he runs your Amazon listing images end to end: research, brief, a new main image, a full secondary set, A+ content and variations. The Grand Opening runs ${meta.dates}.</p>
<p>Two things when you have a minute:</p>
<p>1. The portal: ${a(meta.portal, meta.portal)}</p>
${wa}
<p>One heads-up: the portal signs in with Google. If this address is not a Google account it will not recognise you. Reply to me with a Google address and I will connect it to your ticket.</p>
<p>Worth doing before Day 1: install Claude Code and play with it for an hour, so Day 1 feels easy instead of new. ${a(INSTALL_URL, 'Install guide')}.</p>
<p>See you inside the factory on 1 September.</p>
<p>Jay</p>
</div>
</body></html>`;
  return { subject, html };
}

// `gift` is a comped seat: somebody Jay hands a ticket to rather than sells one.
// Everything practical is identical (same portal, same WhatsApp group, same Google
// warning, same pre-work) so there is one place to keep those correct. Only the
// opening changes, because "here is what you just bought" is nonsense to a guest.
function buildEmail(meta: Meta, privateTour = false, gift = false): { subject: string; html: string } {
  const subject = gift
    ? `I set a golden ticket aside for you.`
    : `You're in. Here are your factory keys.`;

  // Deliberately vague about the scheduling itself: there is no booking link yet, and a
  // promise this email cannot keep is worse than none. Jay writes the personal mail.
  const tourBlock = privateTour
    ? `<tr><td style="padding:22px 40px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${S.note}">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#E4B46C">You booked the Private Tour</p>
      <p style="margin:0;font-size:14px;color:#D9CDBA;line-height:1.7">Everything below is yours, and so is the part that is not written down: personal guidance through the bootcamp, and onboarding for your team. <span style="${S.strong}">I will email you personally within 24 hours</span> to set that up around your catalog and your calendar. Nothing for you to do until then.</p>
    </td></tr></table>
  </td></tr>`
    : '';

  // Only rendered when the link actually exists.
  const waBlock = meta.wa
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:6px 0 18px"><a href="${meta.wa}" target="_blank" style="${S.btnWa}">Join the WhatsApp group</a></td></tr></table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${S.note}"><p style="margin:0;font-size:14px;color:#D9CDBA;line-height:1.7">The WhatsApp group invite goes out in a separate email a few days before Day 1. Nothing for you to do.</p></td></tr></table><div style="height:18px"></div>`;

  // Without a viewport meta, iOS Mail and mobile Gmail render this fixed 620px table
  // at desktop width and the reader has to pinch-zoom. Every other email in the repo
  // has the head block; this one, the only mail a $697 or $2,999 buyer receives, did not.
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="${S.wrap}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#160A1C"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="${S.card}">

  <tr><td style="padding:36px 40px 8px">
    <p style="margin:0 0 14px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#B87333">The Wonka Creative Bootcamp</p>
    <h1 style="${S.h1}">${gift ? 'A golden ticket, on me.' : "You're in."}</h1>
  </td></tr>

  <tr><td style="padding:22px 40px 0">
    ${gift
      ? `<p style="${S.p}">I want you inside this one, so I put a seat aside for you. Nothing to pay and nothing to do.</p>
    <p style="${S.p}">Here is what it is, in one sentence: complete the 10 days and your product has a full creative package. A new main image, a full secondary set, A+ content, and variation images. Quality checked, tested in the Tasting Room, and ready to upload to Amazon or start an A/B test.</p>`
      : `<p style="${S.p}">Here is what you just bought, in one sentence: complete the 10 days and your product has a full creative package. A new main image, a full secondary set, A+ content, and variation images. Quality checked, tested in the Tasting Room, and ready to upload to Amazon or start an A/B test.</p>`}
    <p style="${S.p}">Built by an AI employee named <span style="${S.gold}">Wonka</span> that you hire on Day 1.</p>
    <p style="${S.p}"><span style="${S.strong}">The Grand Opening runs ${meta.dates}.</span></p>
  </td></tr>
${tourBlock}

  <tr><td style="padding:12px 40px 0">
    <p style="margin:0 0 12px;font-size:15px;color:#F3E9D2;font-weight:700">${gift ? 'Two things now, two minutes' : 'One thing now, one minute'}</p>
    <p style="${S.li}">${gift ? '1. ' : ''}Bookmark the portal: <a href="${meta.portal}" style="${S.gold}">${meta.portal}</a>. That is where everything happens, starting Day 1. Your starter kit is waiting for you there on Day 1 too.</p>
    ${gift ? `<p style="${S.li}">2. Join the WhatsApp group below. That is the factory floor, and it is already open.</p>` : ''}
  </td></tr>

  <tr><td style="padding:22px 40px 0">${waBlock}</td></tr>

  <tr><td style="padding:0 40px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${S.warn}">
      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#E0356B">Heads-up about portal login</p>
      <p style="margin:0;font-size:14px;color:#D9CDBA;line-height:1.65">The portal uses Google Sign-In. <strong style="${S.strong}">If ${gift ? 'the address this reached you at' : 'the email you paid with'} is not a Google account</strong> (work email, Yahoo, Hotmail), the portal will not recognise it. Reply to this email with a Google address and I will link it to your account.</p>
    </td></tr></table>
  </td></tr>

  <tr><td style="padding:26px 40px 0">
    <p style="margin:0 0 12px;font-size:15px;color:#F3E9D2;font-weight:700">Worth doing before Day 1</p>
    <p style="${S.p}">Install <span style="${S.strong}">Claude Code</span> and play with it for an hour. Ask it questions, let it read a folder on your computer, get used to talking to it in plain English. Nothing to prepare, nothing to build. Walking in with that hour behind you makes Day 1 feel easy instead of new. Here is the install guide: <a href="${INSTALL_URL}" style="${S.gold}">how to install Claude Code</a>.</p>
    <p style="${S.p}">Never used Claude Code at all? Start with my <a href="${CHALLENGE_URL}" style="${S.gold}">Claude Code Challenge</a>. It is where you build your first AI employee, and it is the shortest path from zero to comfortable. Wonka is your second hire.</p>
  </td></tr>

  <tr><td align="center" style="padding:28px 40px 8px">
    <a href="${meta.portal}" target="_blank" style="${S.btn}">Open the portal</a>
  </td></tr>

  <tr><td style="padding:22px 40px 36px">
    <div style="height:2px;background:linear-gradient(90deg,transparent,#B87333,transparent);margin-bottom:20px"></div>
    <p style="${S.p}">Questions? Reply to this email. I read everything.</p>
    <p style="margin:0;font-size:15px;color:#F3E9D2">Jay</p>
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
    // stripe_customers is written by the webhook BEFORE it calls this function, so the
    // payment is already on record by the time we look. ?tier=private forces the block
    // for previews; it cannot be reached without the shared secret.
    const forceTour = url.searchParams.get('tier') === 'private';
    const privateTour = forceTour || await boughtPrivateTour(supabase, email);
    const gift = url.searchParams.get('variant') === 'gift';
    let firstName = '';
    if (gift) {
      const { data: who } = await supabase.from('allowed_emails').select('name').eq('email', email.toLowerCase()).maybeSingle();
      firstName = String(who?.name || '').trim().split(/\s+/)[0] || '';
      // A stored name like "Jay (Test)" or an address fragment would read worse than none.
      if (!/^[A-Za-z][A-Za-z'.-]{1,20}$/.test(firstName)) firstName = '';
    }
    const { subject, html } = gift
      ? buildGiftEmail(meta, firstName)
      : buildEmail(meta, privateTour, false);

    const to = isPreview && previewTo ? previewTo : email;
    const resendRes = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM_EMAIL, to: [to], reply_to: REPLY_TO, subject, html }) });
    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      if (!isPreview) await recordResult(supabase, email, false);
      console.error('Resend error:', resendData);
      return new Response(JSON.stringify({ error: 'Resend send failed', detail: resendData }), { status: 502, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }
    if (!isPreview) await recordResult(supabase, email, true);
    return new Response(JSON.stringify({ ok: true, preview: isPreview, email: to, round, resendId: resendData.id, dates: meta.dates, waIncluded: !!meta.wa, privateTour, gift }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('send-welcome-wonka error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }
});
