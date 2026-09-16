import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY')!;
// Two callers, two secrets (16.9.2026): stripe-webhook and the other functions send
// EDGE_SHARED_SECRET; the public admin.html page sends ADMIN_PAGE_SECRET, which opens
// only this welcome function and its sibling. FORM_SYNC_SECRET opens nothing any more.
const sharedSecret = Deno.env.get('EDGE_SHARED_SECRET') || '';
const adminPageSecret = Deno.env.get('ADMIN_PAGE_SECRET') || '';

const FROM_EMAIL = 'Jay Margaliot <info@jaygptpro.com>';
const REPLY_TO = 'info@jaygptpro.com';
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf3cpKBxC_Bkd_-zfsfb7dgN756QGOvlqEKK3ilY-75uePpvg/viewform';
const WA_R1 = 'https://chat.whatsapp.com/Kw459iL73jV4zSTSxd18tS';
const WA_R2 = 'https://chat.whatsapp.com/GZLCWjQAKmILir6X40caUB';

function styleHead(): string {
  return `<style>
@media (prefers-color-scheme: dark) {
  .email-body { background-color: #1a1a1a !important; }
  .main-container { background-color: #2a2a2e !important; }
  .text-primary { color: #e8e8ed !important; }
  .text-secondary { color: #aaa !important; }
  .text-dim { color: #888 !important; }
  .card-light { background-color: #333338 !important; }
  .card-light p, .card-light strong, .card-light a { color: #e8e8ed !important; }
  .wa-card { background-color: #1a3a2e !important; border-color: rgba(37,211,102,0.4) !important; }
  .divider-line { background: linear-gradient(90deg,transparent,#e87040,transparent) !important; }
  .section-title { color: #fff !important; }
  .top-tag { color: #f0935e !important; }
}
</style>`;
}

function openerBlock(): string {
  return `<tr><td style="padding:44px 48px 8px;">
  <p style="margin:0;font-size:11px;color:#e87040;font-weight:700;letter-spacing:2px;text-transform:uppercase;" class="top-tag">You're officially in</p>
  <h1 style="margin:14px 0 0;font-size:26px;font-weight:800;color:#1a1a2e;line-height:1.3;letter-spacing:-0.4px;" class="section-title">Welcome to the Claude Code Challenge</h1>
</td></tr>`;
}

function introBlock(extraLine: string): string {
  return `<tr><td style="padding:20px 48px 4px;">
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">Hi,</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">Just got your payment, your spot is locked in. Welcome aboard!</p>
  <p style="margin:10px 0 0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">${extraLine}</p>
</td></tr>`;
}

function bothRoundsSteps(r1Dates: string, r2Dates: string): string {
  return `<tr><td style="padding:36px 48px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td style="width:40px;vertical-align:top;">
      <div style="background:linear-gradient(135deg,#e87040,#f0935e);width:40px;height:40px;border-radius:50%;text-align:center;line-height:40px;"><span style="color:#fff;font-size:16px;font-weight:800;">01</span></div>
      <div style="width:2px;height:60px;background:linear-gradient(to bottom,#e87040,#f0ede8);margin:8px auto 0;"></div>
    </td>
    <td style="padding-left:18px;vertical-align:top;">
      <p style="margin:6px 0 4px;font-size:11px;color:#e87040;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Step 1</p>
      <h2 style="margin:0;font-size:22px;color:#1a1a2e;font-weight:800;letter-spacing:-0.3px;line-height:1.3;" class="section-title">Pick your round</h2>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:14px 48px 0;">
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">The challenge runs in 5-day rounds, same content in both. Pick whichever fits your schedule:</p>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px;">
    <tr><td class="card-light" style="background:#f8f6f2;border-radius:14px;padding:18px 24px;">
      <p style="margin:0;font-size:15px;color:#333;line-height:1.8;" class="text-primary">
        <strong style="color:#1a1a2e;" class="section-title">\u{1F7E6} Round 1</strong>&nbsp;&nbsp;${r1Dates}<br>
        <strong style="color:#1a1a2e;" class="section-title">\u{1F7E7} Round 2</strong>&nbsp;&nbsp;${r2Dates}
      </p>
    </td></tr>
  </table>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px;">
    <tr><td align="center">
      <a href="${FORM_URL}" target="_blank" style="display:inline-block;background:#e87040;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:50px;letter-spacing:0.3px;">Pick your round (30 sec) \u2192</a>
    </td></tr>
  </table>
</td></tr>`;
}

function lockedRoundBanner(roundLabel: string, roundDates: string, otherFullText: string): string {
  return `<tr><td style="padding:32px 48px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="card-light" style="background:linear-gradient(135deg,#fff4e6 0%,#ffece0 100%);border:1px solid rgba(232,112,64,0.2);border-radius:14px;padding:22px 28px;">
    <p style="margin:0;font-size:11px;color:#e87040;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">You're in</p>
    <p style="margin:8px 0 0;font-size:20px;color:#1a1a2e;font-weight:800;letter-spacing:-0.3px;" class="section-title">${roundLabel}: ${roundDates}</p>
    <p style="margin:8px 0 0;font-size:14px;color:#666;line-height:1.6;" class="text-secondary">${otherFullText}</p>
  </td></tr>
  </table>
</td></tr>`;
}

function waBlockBoth(): string {
  return `<tr><td style="padding:36px 48px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td style="width:40px;vertical-align:top;">
      <div style="background:linear-gradient(135deg,#e87040,#f0935e);width:40px;height:40px;border-radius:50%;text-align:center;line-height:40px;"><span style="color:#fff;font-size:16px;font-weight:800;">02</span></div>
    </td>
    <td style="padding-left:18px;vertical-align:top;">
      <p style="margin:6px 0 4px;font-size:11px;color:#25D366;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Step 2 . required</p>
      <h2 style="margin:0;font-size:22px;color:#1a1a2e;font-weight:800;letter-spacing:-0.3px;line-height:1.3;" class="section-title">Join the official WhatsApp group</h2>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:14px 48px 0;">
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">The WhatsApp group is where everything happens during the challenge: daily access links, live Q&A, real-time updates, and direct support. Make sure you're in the right group for your round.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px;">
    <tr><td class="wa-card" style="background:#f0fdf5;border:1px solid #c8efd4;border-radius:14px;padding:24px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="width:36px;vertical-align:middle;"><div style="width:32px;height:32px;background:#25D366;border-radius:50%;text-align:center;line-height:32px;font-size:18px;">\u{1F4AC}</div></td>
        <td style="vertical-align:middle;padding-left:10px;"><p style="margin:0;font-size:14px;font-weight:700;color:#128C7E;" class="section-title">Tap to join your group</p></td>
      </tr></table>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px;"><tr>
        <td align="center" style="padding-right:6px;"><a href="${WA_R1}" target="_blank" style="display:block;background:#25D366;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 8px;border-radius:50px;letter-spacing:0.3px;">\u{1F7E6} Round 1 group</a></td>
        <td align="center" style="padding-left:6px;"><a href="${WA_R2}" target="_blank" style="display:block;background:#25D366;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 8px;border-radius:50px;letter-spacing:0.3px;">\u{1F7E7} Round 2 group</a></td>
      </tr></table>
    </td></tr>
  </table>
  <p style="margin:14px 0 0;font-size:14px;color:#666;line-height:1.7;font-style:italic;" class="text-secondary">Don't use WhatsApp? Just reply to this email and we'll figure out the best way to keep you in the loop.</p>
</td></tr>`;
}

function waBlockSingle(roundEmoji: string, roundNum: string, waLink: string): string {
  return `<tr><td style="padding:36px 48px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td style="width:40px;vertical-align:top;">
      <div style="background:linear-gradient(135deg,#e87040,#f0935e);width:40px;height:40px;border-radius:50%;text-align:center;line-height:40px;"><span style="color:#fff;font-size:16px;font-weight:800;">\u2192</span></div>
    </td>
    <td style="padding-left:18px;vertical-align:top;">
      <p style="margin:6px 0 4px;font-size:11px;color:#25D366;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">One step . required</p>
      <h2 style="margin:0;font-size:22px;color:#1a1a2e;font-weight:800;letter-spacing:-0.3px;line-height:1.3;" class="section-title">Join the official WhatsApp group</h2>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:14px 48px 0;">
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">The WhatsApp group is where everything happens during the challenge: daily access links, live Q&A, real-time updates, and direct support.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px;">
    <tr><td class="wa-card" style="background:#f0fdf5;border:1px solid #c8efd4;border-radius:14px;padding:24px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="width:36px;vertical-align:middle;"><div style="width:32px;height:32px;background:#25D366;border-radius:50%;text-align:center;line-height:32px;font-size:18px;">\u{1F4AC}</div></td>
        <td style="vertical-align:middle;padding-left:10px;"><p style="margin:0;font-size:14px;font-weight:700;color:#128C7E;" class="section-title">Tap to join the Round ${roundNum} group</p></td>
      </tr></table>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px;"><tr>
        <td align="center"><a href="${waLink}" target="_blank" style="display:block;background:#25D366;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 8px;border-radius:50px;letter-spacing:0.3px;">${roundEmoji} Join Round ${roundNum} WhatsApp group</a></td>
      </tr></table>
    </td></tr>
  </table>
  <p style="margin:14px 0 0;font-size:14px;color:#666;line-height:1.7;font-style:italic;" class="text-secondary">Don't use WhatsApp? Just reply to this email and we'll figure out the best way to keep you in the loop.</p>
</td></tr>`;
}

function howItWorksBlock(sundayBefore: string, mondayStart: string): string {
  return `<tr><td style="padding:36px 48px 0;">
  <div class="divider-line" style="height:2px;background:linear-gradient(90deg,transparent,#e87040,transparent);"></div>
</td></tr>
<tr><td style="padding:28px 48px 0;">
  <p style="margin:0 0 8px;font-size:11px;color:#e87040;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">How it works</p>
  <h2 style="margin:0 0 14px;font-size:20px;color:#1a1a2e;font-weight:800;letter-spacing:-0.3px;line-height:1.35;" class="section-title">When the challenge starts</h2>
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">Daily content opens at <strong style="color:#1a1a2e;" class="section-title">2pm New York time (EST)</strong>. About 30 minutes of video plus 30 minutes hands-on per day, flexible whenever works for you.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">${sundayBefore} ${mondayStart}</p>
</td></tr>`;
}

function whatYoullBuildBlock(): string {
  return `<tr><td style="padding:28px 48px 0;">
  <p style="margin:0 0 8px;font-size:11px;color:#e87040;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">What you'll build</p>
  <h2 style="margin:0 0 14px;font-size:20px;color:#1a1a2e;font-weight:800;letter-spacing:-0.3px;line-height:1.35;" class="section-title">A working AI employee, by the end of week one</h2>
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">Built with Claude Code. Connected to your email, calendar, tasks, and more. Runs on its own. Briefs you in the morning. Wraps up your day in the evening. Works while you sleep.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">If you want a head start, just open the <strong style="color:#1a1a2e;" class="section-title">Claude Code Desktop App</strong> and play around. Get a feel for the tool. That's it.</p>
</td></tr>`;
}

function closingBlock(): string {
  return `<tr><td style="padding:32px 48px 0;">
  <p style="margin:0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">Any questions, just reply to this email or message me on WhatsApp. I read everything personally.</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">Looking forward to building with you.</p>
  <p style="margin:18px 0 0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">Jay</p>
</td></tr>
<tr><td style="padding:28px 48px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="card-light" style="background:#f8f6f2;border-radius:14px;padding:22px 28px;">
    <p style="margin:0;font-size:14px;color:#555;line-height:1.7;" class="text-secondary"><strong style="color:#e87040;">PS</strong>&nbsp;&nbsp;If you need a show to binge before we start, you already know it has to be <strong style="color:#1a1a2e;" class="section-title">Suits</strong>. Go meet the real Donna. You'll know exactly who's about to work for you \u{1F609}</p>
  </td></tr>
  </table>
</td></tr>`;
}

function footerBlock(): string {
  return `<tr><td style="padding:36px 48px 36px;">
  <div class="divider-line" style="height:2px;background:linear-gradient(90deg,transparent,#e87040,transparent);margin-bottom:24px;"></div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td style="width:56px;vertical-align:middle;"><img src="https://jaygptpro.com/daily-claude-hacks/media/jay-avatar.jpg" alt="Jay" width="44" height="44" style="border-radius:50%;display:block;"></td>
    <td style="vertical-align:middle;padding-left:6px;"><p style="margin:0;font-size:14px;color:#999;font-weight:600;">Jay Margaliot</p><p style="margin:2px 0 0;font-size:13px;color:#bbb;">Claude Code Challenge</p></td>
  </tr></table>
</td></tr>`;
}

function wrapEmail(body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">${styleHead()}</head>
<body class="email-body" style="margin:0;padding:0;background-color:#f0ede8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0ede8;" class="email-body"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" class="main-container" style="background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
${body}
</table></td></tr></table></body></html>`;
}

function formatDateRange(startStr: string, endStr: string): string {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const s = new Date(startStr + 'T00:00:00Z');
  const e = new Date(endStr + 'T00:00:00Z');
  return `${months[s.getUTCMonth()]} ${s.getUTCDate()} to ${months[e.getUTCMonth()]} ${e.getUTCDate()}`;
}

function sundayBeforeText(startStr: string): string {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const s = new Date(startStr + 'T00:00:00Z');
  const sunday = new Date(s);
  sunday.setUTCDate(s.getUTCDate() - ((s.getUTCDay() + 6) % 7) - 1);
  return `On Sunday ${months[sunday.getUTCMonth()]} ${sunday.getUTCDate()}, I'll open the WhatsApp group for chat and send the Day 0 setup link.`;
}

function mondayStartText(startStr: string): string {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const s = new Date(startStr + 'T00:00:00Z');
  return `Day 1 officially kicks off ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][s.getUTCDay()]} ${months[s.getUTCMonth()]} ${s.getUTCDate()}.`;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

async function recordEmailResult(supabase: any, email: string, ok: boolean, errMsg: string | null) {
  if (!email) return;
  const lower = email.toLowerCase();
  // Build update object: increment attempts; on success set sent_at + clear error; on failure set error
  const { data: row } = await supabase
    .from('allowed_emails')
    .select('id, welcome_email_attempts')
    .ilike('email', lower)
    .maybeSingle();
  if (!row) return;
  const updates: Record<string, unknown> = {
    welcome_email_attempts: (row.welcome_email_attempts || 0) + 1,
  };
  if (ok) {
    updates.welcome_email_sent_at = new Date().toISOString();
    updates.welcome_email_error = null;
  } else {
    updates.welcome_email_error = (errMsg || 'unknown error').substring(0, 500);
  }
  await supabase.from('allowed_emails').update(updates).eq('id', row.id);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders() });

  const provided = req.headers.get('x-form-secret') || '';
  const okStrong = !!sharedSecret && provided === sharedSecret;
  const okAdmin = !!adminPageSecret && provided === adminPageSecret;
  if (!okStrong && !okAdmin) {
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

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: roundsData } = await supabase
      .from('rounds')
      .select('id, name, start_date, end_date, status, whatsapp_link')
      .in('id', ['round1', 'round2']);
    const rounds = roundsData || [];
    const r1 = rounds.find(r => r.id === 'round1');
    const r2 = rounds.find(r => r.id === 'round2');
    const r1Open = r1 && (r1.status === 'upcoming' || r1.status === 'active');
    const r2Open = r2 && (r2.status === 'upcoming' || r2.status === 'active');

    let html = '';
    const subject = 'Welcome to the Claude Code Challenge';

    if (r1Open && r2Open && r1 && r2) {
      const r1Dates = formatDateRange(r1.start_date, r1.end_date);
      const r2Dates = formatDateRange(r2.start_date, r2.end_date);
      html = wrapEmail(
        openerBlock() +
        introBlock("A couple of quick things to get you set up so you don't fall through the cracks.") +
        bothRoundsSteps(r1Dates, r2Dates) +
        waBlockBoth() +
        howItWorksBlock(
          "On the Sunday before your round, I'll open the WhatsApp group for chat and send the Day 0 setup link.",
          "Day 1 officially kicks off the Monday after."
        ) +
        whatYoullBuildBlock() +
        closingBlock() +
        footerBlock()
      );
    } else if (r2Open && r2 && !r1Open) {
      const r2Dates = formatDateRange(r2.start_date, r2.end_date);
      html = wrapEmail(
        openerBlock() +
        introBlock("Quick one-step setup so you don't fall through the cracks.") +
        lockedRoundBanner('\u{1F7E7} Round 2', r2Dates, 'Round 1 filled up, so you' + "'" + 're locked into Round 2. Same exact content, same structure, just one week later.') +
        waBlockSingle('\u{1F7E7}', '2', WA_R2) +
        howItWorksBlock(sundayBeforeText(r2.start_date), mondayStartText(r2.start_date)) +
        whatYoullBuildBlock() +
        closingBlock() +
        footerBlock()
      );
    } else if (r1Open && r1 && !r2Open) {
      const r1Dates = formatDateRange(r1.start_date, r1.end_date);
      html = wrapEmail(
        openerBlock() +
        introBlock("Quick one-step setup so you don't fall through the cracks.") +
        lockedRoundBanner('\u{1F7E6} Round 1', r1Dates, 'Round 2 is full, so you' + "'" + 're locked into Round 1. Same exact content.') +
        waBlockSingle('\u{1F7E6}', '1', WA_R1) +
        howItWorksBlock(sundayBeforeText(r1.start_date), mondayStartText(r1.start_date)) +
        whatYoullBuildBlock() +
        closingBlock() +
        footerBlock()
      );
    } else {
      html = wrapEmail(
        openerBlock() +
        `<tr><td style="padding:20px 48px 4px;">
          <p style="margin:0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">Hi,</p>
          <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">Just got your payment, your spot is locked in. Welcome aboard!</p>
          <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75;" class="text-primary">Both current rounds are full. I'll email you as soon as the next round opens with all the details.</p>
        </td></tr>` +
        whatYoullBuildBlock() +
        closingBlock() +
        footerBlock()
      );
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [email], reply_to: REPLY_TO, subject, html }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      const errMsg = resendData?.message || `Resend HTTP ${resendRes.status}`;
      await recordEmailResult(supabase, email, false, errMsg);
      console.error('Resend error:', resendData);
      return new Response(JSON.stringify({ error: 'Resend send failed', detail: resendData }), { status: 502, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    await recordEmailResult(supabase, email, true, null);
    return new Response(JSON.stringify({ ok: true, email, resendId: resendData.id, mode: r1Open && r2Open ? 'both' : (r2Open ? 'r2only' : (r1Open ? 'r1only' : 'closed')) }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('send-welcome-email error:', err);
    if (email) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        await recordEmailResult(supabase, email, false, String(err));
      } catch (_) { /* swallow */ }
    }
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }
});
