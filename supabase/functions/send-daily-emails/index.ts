import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY')!;
const sharedSecret = Deno.env.get('FORM_SYNC_SECRET') || '';

const FROM_EMAIL = 'Jay Margaliot <info@jaygptpro.com>';
const REPLY_TO = 'info@jaygptpro.com';
const PORTAL = 'https://jaygptpro.com/donna-challenge/';

// Fallback WhatsApp links if rounds lookup fails. SoT = public.rounds.
const FALLBACK_WA: Record<string, string> = {
  round1: 'https://chat.whatsapp.com/Kw459iL73jV4zSTSxd18tS',
  round2: 'https://chat.whatsapp.com/GZLCWjQAKmILir6X40caUB',
  round4: 'https://chat.whatsapp.com/GmlS7mkK0zfGHEI3W9FaTp?mode=gi_t',
  round5: 'https://chat.whatsapp.com/DfLQHp00JQf5IRWfjNTMtE?mode=gi_t',
};

function nyHourAndDate(): { hour: number; dateStr: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(now);
  let y = '', m = '', d = '', h = '';
  parts.forEach(p => {
    if(p.type === 'year') y = p.value;
    if(p.type === 'month') m = p.value;
    if(p.type === 'day') d = p.value;
    if(p.type === 'hour') h = p.value;
  });
  return { hour: parseInt(h, 10), dateStr: `${y}-${m}-${d}` };
}

function daysBetween(startIsoDate: string, endIsoDate: string): number {
  const s = new Date(startIsoDate + 'T00:00:00Z').getTime();
  const e = new Date(endIsoDate + 'T00:00:00Z').getTime();
  return Math.round((e - s) / (1000 * 60 * 60 * 24));
}

// Per-day content. Approved by Jay 2026-05-16.
function dayContent(dayNum: number): { title: string; openingHook: string; bodyHook: string; strategy: string; closer: string } {
  switch (dayNum) {
    case 1: return {
      title: 'Meet Donna',
      openingHook: 'Day 1 is open. <strong>Meet Donna.</strong>',
      bodyHook: 'Today we cover three things: who Donna is, her role as your Chief of Staff, and the map of the 5 days ahead. You\'ll see my Donna live, walk through the brain/ folder in Obsidian, and get the lay of the land.',
      strategy: '<strong>Time commitment today:</strong> ~60 minutes. Watch the video, follow along, ask in WhatsApp.',
      closer: 'You got this.',
    };
    case 2: return {
      title: 'Donna, Meet My Business',
      openingHook: 'Day 2 is open. <strong>Donna, Meet My Business.</strong>',
      bodyHook: 'Today Donna learns about <em>you</em>. You\'ll fill out about-me.md (it\'s a questionnaire, not a form). Then she\'ll process it through 4 onboarding prompts and build her own map of your business.',
      strategy: '<strong>The trick:</strong> Spend real time on about-me.md. Whatever you put in is what she works with. Garbage in, garbage out, both ways.',
      closer: "This is the day most people say 'oh, I get it now.' Lean in.",
    };
    case 3: return {
      title: 'Badge & Access',
      openingHook: 'Day 3 is open. <strong>Badge & Access.</strong>',
      bodyHook: 'Today we plug Donna into your real Gmail, Calendar, Drive, and tasks. By the end of this session, she\'s reading your inbox and drafting in your voice.',
      strategy: '<strong>Heads up:</strong> Connectors take a few minutes the first time (OAuth flow). Don\'t rush them. Once connected, they stay connected.',
      closer: '',
    };
    case 4: return {
      title: 'Training Day',
      openingHook: 'Day 4 is open. <strong>Training Day.</strong>',
      bodyHook: "Today is the onboarding session. Like with a real new hire, you walk Donna through her 10 skills once: morning briefing, evening summary, draft-reply, prep-meeting, accountability, weekly-report, and more. After today, she runs them on her own. You don't have to explain again.",
      strategy: '<strong>Strategy:</strong> Watch the full video first, then go back and run the 2-3 skills that matter most to you. You don\'t have to master all 10 today.',
      closer: 'After today, Donna is operational. She can do real work.',
    };
    case 5: return {
      title: 'She Works While You Sleep',
      openingHook: 'Day 5 is open. <strong>She Works While You Sleep.</strong>',
      bodyHook: "Final day. Today we set up Scheduled Tasks (morning briefing at 7am, evening summary at 9pm, weekly report Sundays). After today, Donna is running on her own. You'll wake up tomorrow morning with her first briefing waiting.",
      strategy: '<strong>Today is also graduation.</strong> The Graph View moment in Obsidian. The full picture of what you built this week.',
      closer: "Proud of you for sticking with it. Tomorrow you’ll get one more email from me. A short wrap-up of the journey with a couple of things I want you to do next. Look out for it.",
    };
    default: return { title: 'Day ' + dayNum, openingHook: '', bodyHook: '', strategy: '', closer: '' };
  }
}

function renderDayEmail(dayNum: number, waLink: string): { subject: string; html: string } {
  if (dayNum < 1 || dayNum > 5) return { subject: '', html: '' };
  const c = dayContent(dayNum);
  const portalDeep = `${PORTAL}?day=${dayNum}`;
  const subject = `Day ${dayNum} is open: ${c.title}`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
<tr><td style="padding:44px 48px 8px">
  <p style="margin:0;font-size:11px;color:#e87040;font-weight:700;letter-spacing:2px;text-transform:uppercase">DAY ${dayNum} OF 5</p>
  <h1 style="margin:14px 0 0;font-size:28px;font-weight:800;color:#1a1a2e;line-height:1.3;letter-spacing:-0.4px">${c.title}</h1>
</td></tr>
<tr><td style="padding:20px 48px 4px">
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">${c.openingHook}</p>
  <p style="margin:14px 0 0;font-size:16px;color:#333;line-height:1.75">${c.bodyHook}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0"><a href="${portalDeep}" target="_blank" style="display:inline-block;background:#e87040;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:50px;letter-spacing:0.3px">Open Day ${dayNum} →</a></td></tr></table>
  ${c.strategy ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f8f6f2;border-radius:14px;padding:20px 24px"><p style="margin:0;font-size:14px;color:#555;line-height:1.7">${c.strategy}</p></td></tr></table>` : ''}
  ${c.closer ? `<p style="margin:18px 0 0;font-size:16px;color:#333;line-height:1.75">${c.closer}</p>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0"><a href="${waLink}" target="_blank" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:50px;letter-spacing:0.3px">\u{1F4AC} Join the WhatsApp group</a></td></tr></table>
</td></tr>
<tr><td style="padding:36px 48px 36px">
  <div style="height:2px;background:linear-gradient(90deg,transparent,#e87040,transparent);margin-bottom:20px"></div>
  <p style="margin:0;font-size:14px;color:#999;font-weight:600">Jay Margaliot</p>
  <p style="margin:2px 0 0;font-size:13px;color:#bbb">Claude Code Challenge</p>
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

async function loadWaLink(supabase: any, roundId: string): Promise<string> {
  try {
    const { data } = await supabase.from('rounds').select('whatsapp_link').eq('id', roundId).maybeSingle();
    if (data?.whatsapp_link) return data.whatsapp_link;
  } catch (e) {
    console.error('loadWaLink err:', e);
  }
  return FALLBACK_WA[roundId] || '#';
}

async function sendOne(email: string, dayNum: number, waLink: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const { subject, html } = renderDayEmail(dayNum, waLink);
    if (!subject) return { ok: false, error: 'day out of range' };
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [email], reply_to: REPLY_TO, subject, html }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.message || `HTTP ${res.status}` };
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
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

  const url = new URL(req.url);
  const previewMode = url.searchParams.get('preview') === '1';
  const previewDay = parseInt(url.searchParams.get('day') || '-99', 10);
  const previewRound = url.searchParams.get('round') || 'round4';
  const previewTo = url.searchParams.get('to') || '';

  const supabase = createClient(supabaseUrl, supabaseKey);

  if (previewMode) {
    if (previewDay < 1 || previewDay > 5 || !previewTo) {
      return new Response(JSON.stringify({ error: 'Preview requires day (1-5), round, to' }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }
    const wa = await loadWaLink(supabase, previewRound);
    const res = await sendOne(previewTo, previewDay, wa);
    return new Response(JSON.stringify({ preview: true, ...res }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const { hour, dateStr: todayNY } = nyHourAndDate();
  if (hour !== 14) {
    return new Response(JSON.stringify({ ok: true, action: 'skipped_off_hour', ny_hour: hour, ny_date: todayNY }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const { data: settingsRow } = await supabase.from('settings').select('value').eq('key', 'daily_emails_armed').maybeSingle();
  const armed = settingsRow && settingsRow.value && settingsRow.value.armed === true;

  // Only English rounds. Bina has its own send-bina-daily.
  const { data: rounds } = await supabase.from('rounds').select('id, start_date, status, language, whatsapp_link').in('status', ['upcoming', 'active', 'full']).eq('language', 'en');
  if (!rounds || rounds.length === 0) {
    return new Response(JSON.stringify({ ok: true, action: 'no_open_rounds', ny_date: todayNY }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const results: any[] = [];

  for (const r of rounds) {
    const roundId = r.id;
    const startDate = r.start_date;
    if (!startDate) continue;
    const dayNum = daysBetween(startDate, todayNY) + 1;
    if (dayNum < 1 || dayNum > 5) continue;

    const { data: existing } = await supabase.from('challenge_daily_emails').select('sent_at').eq('round', roundId).eq('day_num', dayNum).maybeSingle();
    if (existing && existing.sent_at) {
      results.push({ round: roundId, day: dayNum, action: 'already_sent_today', sent_at: existing.sent_at });
      continue;
    }

    const { data: participants } = await supabase
      .from('allowed_emails')
      .select('email, customer_type, round, primary_email')
      .in('round', [roundId, 'both'])
      .is('access_revoked_at', null);
    const list = (participants || []).filter(p =>
      !p.primary_email &&
      (p.customer_type === 'paid' || p.customer_type === 'family' || p.customer_type === 'admin' || !p.customer_type)
    );

    if (!armed) {
      results.push({ round: roundId, day: dayNum, action: 'dry_run_not_armed', would_send_to: list.length });
      continue;
    }

    const waLink = r.whatsapp_link || FALLBACK_WA[roundId] || '#';
    await supabase.from('challenge_daily_emails').upsert({ round: roundId, day_num: dayNum, sent_at: new Date().toISOString(), recipient_count: 0, error_count: 0 });

    let ok = 0; let errors = 0; let lastErr: string | null = null;
    for (const p of list) {
      const send = await sendOne(p.email, dayNum, waLink);
      if (send.ok) {
        ok++;
        await supabase.from('daily_email_recipients').upsert({ round: roundId, day_num: dayNum, recipient_email: p.email, sent_at: new Date().toISOString(), resend_id: send.id || null, error: null }, { onConflict: 'round,day_num,recipient_email' });
      } else {
        errors++;
        lastErr = send.error || 'unknown';
        await supabase.from('daily_email_recipients').upsert({ round: roundId, day_num: dayNum, recipient_email: p.email, sent_at: new Date().toISOString(), error: lastErr }, { onConflict: 'round,day_num,recipient_email' });
      }
    }
    await supabase.from('challenge_daily_emails').update({ recipient_count: ok, error_count: errors, last_error: lastErr }).eq('round', roundId).eq('day_num', dayNum);
    results.push({ round: roundId, day: dayNum, sent: ok, errors });
  }

  return new Response(JSON.stringify({ ok: true, ny_date: todayNY, ny_hour: hour, armed, results }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
});
