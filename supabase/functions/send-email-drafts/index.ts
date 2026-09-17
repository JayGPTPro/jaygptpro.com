import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const sharedSecret = Deno.env.get('EDGE_SHARED_SECRET') || '';
const KEY_EN = Deno.env.get('RESEND_API_KEY') || '';
const KEY_BINA = Deno.env.get('RESEND_API_KEY_BINA') || '';
const FROM = 'Jay Margaliot <info@jaygptpro.com>';
const REPLY_TO = 'info@jaygptpro.com';
const DEFAULT_TO = 'info@jaygptpro.com';

const R4_DATES = 'May 18-22, 2026';
const R5_DATES = 'June 1-5, 2026';
const WA_R4 = 'https://chat.whatsapp.com/GmlS7mkK0zfGHEI3W9FaTp?mode=gi_t';
const WA_R5 = 'https://chat.whatsapp.com/DfLQHp00JQf5IRWfjNTMtE?mode=gi_t';
const PORTAL = 'https://jaygptpro.com/donna-challenge/';
const VAULT_OFFER_URL = 'https://jaygptpro.com/vault-challenge-offer/';
const VAULT_COUPON = 'Q8812X';
const GRADUATES_WA = 'https://chat.whatsapp.com/Kw459iL73jV4zSTSxd18tS';

function shell(badge: string, title: string, sub: string, body: string, showDraftBanner = true): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
${showDraftBanner ? '<tr><td style="background:linear-gradient(90deg,#fef3c7,#fde68a);padding:10px 20px;text-align:center;font-size:12px;font-weight:700;color:#92400e;letter-spacing:1px">DRAFT FOR REVIEW. NOT SENT TO CUSTOMERS YET</td></tr>' : ''}
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
function btn(href: string, label: string, color = '#e87040'): string { return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0"><a href="${href}" target="_blank" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:50px;letter-spacing:0.3px">${label}</a></td></tr></table>`; }
function card(content: string, bg = '#f8f6f2'): string { return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${bg};border-radius:14px;padding:20px 24px;margin:16px 0">${content}</td></tr></table>`; }
function p(text: string): string { return `<p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">${text}</p>`; }
function h3(text: string): string { return `<p style="margin:24px 0 0;font-size:18px;color:#1a1a2e;font-weight:700;line-height:1.4">${text}</p>`; }

function welcomeBody(dates: string, waLink: string, roundNum: string): string {
  return `
  ${p("Your spot for Round " + roundNum + " (<strong>" + dates + "</strong>) is locked. Here's everything you need before Day 1.")}
  ${h3('1. Join the WhatsApp group, this is where the action happens')}
  ${p("Every daily check-in, recording link, and live answer happens in the group. Don't skip it.")}
  ${btn(waLink, '💬 Join Round ' + roundNum + ' WhatsApp', '#25D366')}
  ${h3('2. Your portal is live, Day 0 is open right now')}
  ${p("Day 0 is setup day. Get Claude Code Desktop, Claude Pro ($20/mo), and Obsidian installed. The full guide is waiting for you.")}
  ${btn(PORTAL, 'Open the portal →')}
  ${h3('3. Spend 15 minutes playing with Claude Code today')}
  ${p("Once Day 0 is done, try the examples I walk through in the Day 0 video. Once those click, go off-script and ask Claude to help with something small and real from your week.")}
  ${card('<p style="margin:0;font-size:14px;color:#555;line-height:1.7"><strong>Why this matters:</strong> Everyone who shows up cold on Day 1 spends the first 2 hours just getting comfortable with Claude Code. Spend 15 minutes today and you\'ll show up on Day 1 ready to actually build.</p>')}
  ${h3('What happens next')}
  ${p("On Day 1 at 2pm New York time, the first lesson opens. You'll get an email and a WhatsApp ping.")}
  ${p("Questions? Reply to this email. I read everything.")}
  ${p("See you soon 🚀")}
  ${card('<p style="margin:0;font-size:14px;color:#555;line-height:1.7"><strong>P.S.</strong> If you’ve never seen <em>Suits</em>, the whole challenge is built around <strong>Donna Paulsen</strong>, the most legendary Chief of Staff on TV. Throw on Season 1 Episode 1 on Netflix sometime this weekend. You’ll get a lot more out of every reference once you’ve met her.</p>', '#fff7ed')}
  `;
}

function welcomeEmail() {
  return { subject: 'You’re in! Welcome to the Claude Code Challenge, Round 4', html: shell('WELCOME', 'You’re officially in', R4_DATES, welcomeBody(R4_DATES, WA_R4, '4')) };
}
function welcomeR5Email() {
  return { subject: 'You’re in! Welcome to the Claude Code Challenge, Round 5', html: shell('WELCOME', 'You’re officially in', R5_DATES, welcomeBody(R5_DATES, WA_R5, '5')) };
}

// Special R5 welcome with date-change banner. One-time send to the 3 R5 customers who were
// enrolled BEFORE the dates moved from May 25 to June 1.
function welcomeR5DateChangeEmail() {
  const dateChangeBanner = `
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
  const body = `${dateChangeBanner}${welcomeBody(R5_DATES, WA_R5, '5')}`;
  return { subject: 'Round 5 update inside (new start date) + your welcome kit', html: shell('UPDATE + WELCOME', 'Quick update for Round 5', R5_DATES, body) };
}

function day1Email() {
  const body = `
  ${p('Day 1 is open. <strong>Meet Donna.</strong>')}
  ${p("Today we cover three things: who Donna is, her role as your Chief of Staff, and the map of the 5 days ahead. You'll see my Donna live, walk through the brain/ folder in Obsidian, and get the lay of the land.")}
  ${btn(PORTAL + '?day=1', 'Open Day 1 →')}
  ${card('<p style="margin:0;font-size:14px;color:#555"><strong>Time commitment today:</strong> ~60 minutes. Watch the video, follow along, ask in WhatsApp.</p>')}
  ${p("Stuck? The WhatsApp group is where I answer live throughout the day.")}
  ${btn(WA_R4, '💬 Round 4 WhatsApp', '#25D366')}
  ${p('You got this.')}
  `;
  return { subject: 'Day 1 is open: Meet Donna', html: shell('DAY 1 OF 5', 'Meet Donna', '', body) };
}
function day2Email() { return { subject: 'Day 2 is open: Donna, Meet My Business', html: shell('DAY 2 OF 5', 'Donna, Meet My Business', '', `${p('Day 2 is open. <strong>Donna, Meet My Business.</strong>')}${p("Today Donna learns about <em>you</em>. You'll fill out about-me.md (it's a questionnaire, not a form). Then she'll process it through 4 onboarding prompts and build her own map of your business.")}${btn(PORTAL + '?day=2', 'Open Day 2 →')}${card('<p style="margin:0;font-size:14px;color:#555"><strong>The trick:</strong> Spend real time on about-me.md. Whatever you put in is what she works with. Garbage in, garbage out, both ways.</p>')}${p("This is the day most people say 'oh, I get it now.' Lean in.")}${btn(WA_R4, '💬 Round 4 WhatsApp', '#25D366')}`) }; }
function day3Email() { return { subject: 'Day 3 is open: Badge & Access', html: shell('DAY 3 OF 5', 'Badge & Access', '', `${p('Day 3 is open. <strong>Badge & Access.</strong>')}${p("Today we plug Donna into your real Gmail, Calendar, Drive, and tasks. By the end of this session, she's reading your inbox and drafting in your voice.")}${btn(PORTAL + '?day=3', 'Open Day 3 →')}${card('<p style="margin:0;font-size:14px;color:#555"><strong>Heads up:</strong> Connectors take a few minutes the first time (OAuth flow). Don\'t rush them. Once connected, they stay connected.</p>')}${btn(WA_R4, '💬 Round 4 WhatsApp', '#25D366')}`) }; }
function day4Email() { return { subject: 'Day 4 is open: Training Day', html: shell('DAY 4 OF 5', 'Training Day', '', `${p('Day 4 is open. <strong>Training Day.</strong>')}${p("Today is the onboarding session. Like with a real new hire, you walk Donna through her 10 skills once: morning briefing, evening summary, draft-reply, prep-meeting, accountability, weekly-report, and more. After today, she runs them on her own. You don't have to explain again.")}${btn(PORTAL + '?day=4', 'Open Day 4 →')}${card('<p style="margin:0;font-size:14px;color:#555"><strong>Strategy:</strong> Watch the full video first, then go back and run the 2-3 skills that matter most to you. You don\'t have to master all 10 today.</p>')}${p("After today, Donna is operational. She can do real work.")}${btn(WA_R4, '💬 Round 4 WhatsApp', '#25D366')}`) }; }
function vaultEmail() { /* unchanged - dark layout */ return { subject: 'You built Donna. Here\'s the next move (your coupon is inside)', html: '<p>Vault email (see send-vault-email production)</p>' }; }
function day5Email() { return { subject: 'Day 5 is open: She Works While You Sleep', html: shell('DAY 5 OF 5', 'She Works While You Sleep', '', `${p('Day 5 is open. <strong>She Works While You Sleep.</strong>')}${p("Final day. Today we set up Scheduled Tasks (morning briefing at 7am, evening summary at 9pm, weekly report Sundays). After today, Donna is running on her own. You'll wake up tomorrow morning with her first briefing waiting.")}${btn(PORTAL + '?day=5', 'Open Day 5 →')}${card('<p style="margin:0;font-size:14px;color:#555"><strong>Today is also graduation.</strong> The Graph View moment in Obsidian. The full picture of what you built this week.</p>')}${p("Proud of you for sticking with it. Tomorrow you’ll get one more email from me. A short wrap-up of the journey with a couple of things I want you to do next. Look out for it.")}${btn(WA_R4, '💬 Round 4 WhatsApp', '#25D366')}`) }; }
function summaryEmail() { return { subject: 'You did it. A few things from me.', html: '<p>Summary email (see send-summary-email production)</p>' }; }

const DRAFTS: Record<string, () => { subject: string; html: string }> = {
  welcome: welcomeEmail,
  welcomer5: welcomeR5Email,
  welcomer5datechange: welcomeR5DateChangeEmail,
  day1: day1Email,
  day2: day2Email,
  day3: day3Email,
  day4: day4Email,
  vault: vaultEmail,
  day5: day5Email,
  summary: summaryEmail,
};
const ORDER = ['welcome','day1','day2','day3','day4','vault','day5','summary'];

async function trySend(key: string, to: string, subject: string, html: string): Promise<any> {
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html }) });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

async function sendOne(name: string, idx: number, total: number, to: string, subj: string, html: string, draftMode: boolean) {
  const fullSubject = draftMode ? `📋 [DRAFT ${idx}/${total} for review] ${subj}` : subj;
  let result: any = null;
  if (KEY_EN) { result = await trySend(KEY_EN, to, fullSubject, html); if (result.ok) return { name, to, ok: true, via: 'KEY_EN', id: result.data?.id }; }
  if (KEY_BINA) { result = await trySend(KEY_BINA, to, fullSubject, html); if (result.ok) return { name, to, ok: true, via: 'KEY_BINA', id: result.data?.id }; }
  return { name, to, ok: false, error: result?.data || 'no resend keys' };
}

Deno.serve(async (req: Request) => {
  if (!KEY_EN && !KEY_BINA) return new Response(JSON.stringify({ error: 'No RESEND_API_KEY* configured' }), { status: 500 });
  const url = new URL(req.url);
// The secret was written in this file until 17.9.2026. A secret in source cannot be
// rotated without a deploy, rides along into every copy and log of the code, and this
// one guarded a function that sends real mail to customers. It is a project secret now.
  // It also moved OUT of the query string into a header: a URL is logged by every proxy
  // it passes, and ?to= on this function sends real mail to whoever is named.
  const provided = req.headers.get('x-form-secret') || '';
  if (!sharedSecret || provided !== sharedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const which = (url.searchParams.get('which') || 'all').toLowerCase();
  const toParam = url.searchParams.get('to') || '';
  const recipients = toParam ? toParam.split(',').map(s => s.trim()).filter(Boolean) : [DEFAULT_TO];
  // If a custom recipient list is passed, do NOT add the draft banner (this means real send to customers).
  const draftMode = recipients.length === 1 && recipients[0] === DEFAULT_TO;

  const toSend = which === 'all' ? ORDER : which.split(',').map(s => s.trim());

  const results: any[] = [];
  for (let i = 0; i < toSend.length; i++) {
    const name = toSend[i];
    const fn = DRAFTS[name];
    if (!fn) { results.push({ name, ok: false, error: 'unknown draft' }); continue; }
    const d = fn();
    const idx = ORDER.indexOf(name) + 1;
    for (const r of recipients) {
      const sent = await sendOne(name, idx, ORDER.length, r, d.subject, d.html, draftMode);
      results.push(sent);
      await new Promise(res => setTimeout(res, 600));
    }
  }
  return new Response(JSON.stringify({ ok: true, sent: results.length, draftMode, recipients, results }), { headers: { 'Content-Type': 'application/json' } });
});
