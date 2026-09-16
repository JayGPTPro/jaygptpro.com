import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY_BINA') || Deno.env.get('RESEND_API_KEY')!;
// Reads EDGE_SHARED_SECRET (16.9.2026). FORM_SYNC_SECRET's value was hardcoded in the
// public admin.html page, so it opens nothing any more.
const sharedSecret = Deno.env.get('EDGE_SHARED_SECRET') || '';

const FROM_EMAIL = 'Jay Margaliot <info@jaygptpro.com>';
const REPLY_TO = 'info@jaygptpro.com';
const PORTAL_URL = 'https://jaygptpro.com/donna-challenge-bina/';

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}

function ilHourAndDate(): { hour: number; dateStr: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(now);
  let y = '', m = '', d = '', h = '';
  parts.forEach(p => { if (p.type === 'year') y = p.value; if (p.type === 'month') m = p.value; if (p.type === 'day') d = p.value; if (p.type === 'hour') h = p.value; });
  return { hour: parseInt(h, 10), dateStr: `${y}-${m}-${d}` };
}
function daysBetween(startIsoDate: string, endIsoDate: string): number {
  const s = new Date(startIsoDate + 'T00:00:00Z').getTime();
  const e = new Date(endIsoDate + 'T00:00:00Z').getTime();
  return Math.round((e - s) / (1000 * 60 * 60 * 24));
}

const LEFT_ARROW = '←';

function buildDay(opts: { num: number; title: string; intro: string; lessonsHeader: string; lessons: string[]; tip: string; homework: string; signoff: string; ctaLabel: string; }) {
  const subject = `יום ${opts.num}: ${opts.title}`;
  const lessonsHtml = opts.lessons.map((l, i) => {
    const isLast = i === opts.lessons.length - 1;
    const border = isLast ? '' : 'border-bottom:1px solid #e2e8f0;';
    return `<tr><td style=\"padding:14px 0;${border}\"><span style=\"display:inline-block;width:24px;color:#f97316;font-weight:700;font-size:14px;\">${i + 1}.</span><span style=\"color:#0f172a;font-size:15px;\">${l}</span></td></tr>`;
  }).join('\n      ');
  const homeworkBlock = opts.homework ? `<tr><td style=\"padding:0 0 26px;\"><p style=\"margin:0 0 6px;font-size:13px;color:#94a3b8;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;\">שיעורי בית</p><p style=\"margin:0;font-size:15px;color:#334155;line-height:1.7;\">${opts.homework}</p></td></tr>` : '';
  const html = `<!DOCTYPE html>
<html lang=\"he\" dir=\"rtl\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><title>${subject}</title>
<style>body{margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#0f172a;}
.btn{display:inline-block;background:#f97316;color:#fff !important;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:8px;}
@media (max-width:525px){.wrap{padding:24px 18px !important;}}
</style></head>
<body dir=\"rtl\">
<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td align=\"center\" style=\"padding:40px 16px;background:#fff;\">
<table class=\"wrap\" width=\"560\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#fff;\">
  <tr><td style=\"border-top:3px solid #f97316;padding-top:28px;\">
    <p style=\"margin:0 0 6px;font-size:11px;font-weight:700;color:#f97316;letter-spacing:1.5px;text-transform:uppercase;\">יום ${opts.num} · DAY ${opts.num}</p>
    <h1 style=\"margin:0 0 22px;font-size:28px;font-weight:700;color:#0f172a;line-height:1.3;\">${opts.title}</h1>
    <p style=\"margin:0 0 18px;font-size:16px;color:#334155;line-height:1.7;\">${opts.intro}</p>
    <p style=\"margin:0 0 8px;font-size:14px;color:#64748b;line-height:1.7;\">${opts.lessonsHeader}</p>
  </td></tr>
  <tr><td style=\"padding:14px 0 28px;\"><table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\">${lessonsHtml}</table></td></tr>
  <tr><td align=\"center\" style=\"padding:8px 0 30px;text-align:center;\"><a href=\"${PORTAL_URL}#day${opts.num}\" class=\"btn\">${opts.ctaLabel}</a></td></tr>
  <tr><td style=\"padding:0 0 26px;\"><p style=\"margin:0 0 6px;font-size:13px;color:#94a3b8;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;\">הטיפ של היום</p><p style=\"margin:0;font-size:15px;color:#334155;line-height:1.7;\">${opts.tip}</p></td></tr>
  ${homeworkBlock}
  <tr><td style=\"padding:24px 0 8px;border-top:1px solid #e2e8f0;\"><p style=\"margin:0;font-size:15px;color:#0f172a;line-height:1.7;\">${opts.signoff}</p><p style=\"margin:4px 0 0;font-size:15px;color:#0f172a;font-weight:600;\">מנדי וג׳יי</p></td></tr>
  <tr><td style=\"padding:30px 0 0;border-top:1px solid #f1f5f9;\"><p style=\"margin:0;font-size:12px;color:#94a3b8;line-height:1.6;\">Jay Margaliot · אתגר קלוד קוד עם בינה<br><a href=\"mailto:info@jaygptpro.com\" style=\"color:#94a3b8;text-decoration:underline;\">info@jaygptpro.com</a></p></td></tr>
</table>
</td></tr></table></body></html>`;
  return { subject, html };
}

function dayContent(day: number) {
  switch (day) {
    case 1: return { title: 'מכירים את דונה', intro: 'היום אתם פוגשים את עובד ה-AI הראשון שלכם. דונה לא עוד מכירה אתכם, אבל אתם תתחילו היום ללמד אותה לעבוד איתכם.', lessonsHeader: '4 שיעורים מחכים לכם היום:', lessons: ['התקנה והכרת המערכת','השיטה (8 המרכיבים שמאחורי דונה)','סיור בערכה (דונה תעבור איתכם)','מדברים עם דונה (השיחה הראשונה)'], tip: 'אחרי שתסיימו את 4 השיעורים, הקדישו עוד 5-10 דקות לדבר עם דונה חופשי. שאלו אותה שאלה אישית, תספרו לה משהו על העסק. זה יראה לכם מהר מאוד למה דונה שונה מ-ChatGPT.', homework: 'בסוף יום 1 יש משימה קצרה (20-30 דקות) שמכינה את דונה ללמוד עליכם מחר. אל תדלגו. זה מה שיהפוך את דונה לשלכם.', signoff: 'נתראה בקבוצה. בהצלחה!', ctaLabel: 'קדימה, מתחילים ' + LEFT_ARROW };
    case 2: return { title: 'דונה לומדת אתכם', intro: 'אתמול הכרתם את דונה. היום היא הופכת לדונה שלכם. לא של מישהו אחר, לא גנרית, שלכם.', lessonsHeader: '2 שיעורים מחכים לכם היום:', lessons: ['דונה לומדת אתכם (העסק, האנשים, הקול שלכם)','רגע הואו · The Wow Moment'], tip: 'אחרי ששיעור 1 רץ, שאלו את דונה: “מה את מבינה על העסק שלי?”. אם היא עונה כמו שותף שלכם ולא כמו ChatGPT גנרי, הצלחתם. זה רגע הואו.', homework: 'בדקו שהחשבון ה-Google שלכם מחובר. מחר דונה מתחברת ל-Gmail, Calendar ו-Drive שלכם. ודאו שאתם מחוברים לחשבון הנכון.', signoff: 'יום שני מעולה!', ctaLabel: 'ממשיכים ליום 2 ' + LEFT_ARROW };
    case 3: return { title: 'דונה נכנסת לחיים שלכם', intro: 'עד עכשיו דונה ידעה מה שסיפרתם לה. היום היא מקבלת תג כניסה. ג׳ימייל, יומן, דרייב.', lessonsHeader: '2 שיעורים מחכים לכם היום:', lessons: ['אמון וחיבור הכלים (Gmail, Calendar, Drive)','חוקרים את העסק עם דונה (Power Workflow)'], tip: 'אחרי שחיברתם את הכלים, תבקשו מדונה: “תכיני לי תדריך לפגישה הקרובה ביומן.” היא תמשוך מהמייל, מהיומן ומהמסמכים. זה הרגע שדונה הופכת ממדברת לעובדת.', homework: 'תחשבו על תהליך עבודה אחד שאתם עושים שוב ושוב (תחקיר לקוח, סגירת פגישה, סיכום מייל). מחר אנחנו הופכים אותו לסקיל, קיצור דרך שדונה תריץ בפקודה אחת.', signoff: 'יום שלישי, כבר חצי דרך!', ctaLabel: 'יום 3 מחכה ' + LEFT_ARROW };
    case 4: return { title: 'יום הסקילים', intro: 'סקיל = מתכון שדונה לומדת פעם אחת ומריצה לנצח בפקודה אחת. זה היום שדונה הופכת מעוזרת לצוות.', lessonsHeader: '3 שיעורים מחכים לכם היום:', lessons: ['סקילים · יום האימון (12 הסקילים של דונה)','התור שלכם · Your Turn (מריצים סקילים אמיתיים)','תהפכו את זה לשלכם · Make It Yours'], tip: 'זוכרים את ה-Power Workflow מיום 3? זה הרגע להפוך אותו לסקיל. תגיםו לדונה: “תהפכי את התהליך של אתמול לסקיל בשם /schedule-meeting.” היא תטפל בזה. בפעם הבאה זה פקודה אחת.', homework: 'בחרו 1-2 סקילים שלדעתכם הכי שווים להריץ אוטומטית כל יום (תדריך בוקר? סיכום ערב?). מחר אנחנו מתזמנים אותם דרך Routines, דונה תתחיל לעבוד בלי שתבקשו.', signoff: 'יום רביעי, יום הסקילים!', ctaLabel: 'מתחילים יום 4 ' + LEFT_ARROW };
    case 5: return { title: 'דונה עובדת גם כשישנים', intro: 'היום האחרון. דונה הופכת מעוזרת שאתם מפעילים, לעובדת שעובדת לבד ולומדת מעצמה.', lessonsHeader: '3 שיעורים מחכים לכם היום:', lessons: ['Routines · אוטומציה (דונה מתעוררת לפניכם)','Learning Loop (דונה משתפרת מעצמה)','Graduation · הצעדים הבאים'], tip: 'אחרי שתגדירו את ה-Routines, פתחו את Obsidian וצלמו מסך של ה-Graph View. עוד 30 יום צלמו עוד אחד. ההבדל יהיה דרמטי.', homework: '', signoff: 'תודה שעשיתם איתנו את האתגר.', ctaLabel: 'סוגרים את האתגר ' + LEFT_ARROW };
  }
  return null;
}

async function sendOne(email: string, subject: string, html: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [email], reply_to: REPLY_TO, subject, html }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.message || `HTTP ${res.status}` };
    return { ok: true, id: data.id };
  } catch (e) { return { ok: false, error: String(e) }; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
  const provided = req.headers.get('x-form-secret') || '';
  if (!sharedSecret || provided !== sharedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }
  if (!resendKey) return new Response(JSON.stringify({ error: 'RESEND key not configured' }), { status: 500 });

  const url = new URL(req.url);
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (url.searchParams.get('preview') === '1') {
    const previewDay = parseInt(url.searchParams.get('day') || '0', 10);
    const previewTo = url.searchParams.get('to') || '';
    if (previewDay < 1 || previewDay > 5 || !previewTo) return new Response(JSON.stringify({ error: 'Preview requires day 1-5, to' }), { status: 400 });
    const c = dayContent(previewDay);
    if (!c) return new Response(JSON.stringify({ error: 'Bad day' }), { status: 400 });
    const built = buildDay({ num: previewDay, ...c });
    const r = await sendOne(previewTo, built.subject, built.html);
    return new Response(JSON.stringify({ preview: true, ...r }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  let body: any = {};
  try { body = await req.json(); } catch (_) {}

  // Manual batch (legacy)
  if (Array.isArray(body.emails) && body.emails.length > 0 && typeof body.day === 'number') {
    const day = body.day;
    const c = dayContent(day);
    if (!c) return new Response(JSON.stringify({ error: 'Bad day' }), { status: 400 });
    const built = buildDay({ num: day, ...c });
    const results: any[] = [];
    for (const email of body.emails) {
      const r = await sendOne(String(email).trim().toLowerCase(), built.subject, built.html);
      results.push({ email, ok: r.ok, id: r.id, error: r.error });
      await new Promise(res => setTimeout(res, 600));
    }
    return new Response(JSON.stringify({ ok: true, mode: 'manual_batch', day, sent: results.filter(r => r.ok).length, results }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  // Scheduled mode
  const { hour, dateStr: todayIL } = ilHourAndDate();
  if (hour !== 11) return new Response(JSON.stringify({ ok: true, action: 'skipped_off_hour', il_hour: hour, il_date: todayIL }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });

  const { data: settingsRow } = await supabase.from('settings').select('value').eq('key', 'daily_emails_armed_bina').maybeSingle();
  const armed = settingsRow && settingsRow.value && settingsRow.value.armed === true;

  const { data: rounds } = await supabase.from('rounds').select('id, start_date, status').in('status', ['upcoming','active','full']).eq('language','he');
  if (!rounds || rounds.length === 0) return new Response(JSON.stringify({ ok: true, action: 'no_open_bina_rounds', il_date: todayIL }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });

  const results: any[] = [];
  for (const r of rounds) {
    if (!r.start_date) continue;
    const dayNum = daysBetween(r.start_date, todayIL) + 1;
    if (dayNum < 1 || dayNum > 5) continue;

    const { data: existing } = await supabase.from('challenge_daily_emails').select('sent_at').eq('round', r.id).eq('day_num', dayNum).maybeSingle();
    if (existing && existing.sent_at) { results.push({ round: r.id, day: dayNum, action: 'already_sent_today' }); continue; }

    // Recipients for this round: bina_registrations.round matches the round id.
    // Legacy fixed rounds store short codes (r1/r2); evergreen stores the full id (bina_wk_*).
    const roundShort = r.id === 'bina_r1' ? 'r1' : (r.id === 'bina_r2' ? 'r2' : r.id);
    const { data: bineRegs } = await supabase.from('bina_registrations').select('email').eq('round', roundShort);
    const binaEmails = (bineRegs || []).map((x: any) => x.email.toLowerCase());
    if (binaEmails.length === 0) { results.push({ round: r.id, day: dayNum, action: 'no_recipients' }); continue; }

    const { data: allowed } = await supabase.from('allowed_emails').select('email, access_revoked_at, primary_email').is('access_revoked_at', null).is('primary_email', null);
    const allowedSet = new Set((allowed || []).map((a: any) => a.email.toLowerCase()));
    const list = binaEmails.filter(e => allowedSet.has(e));

    if (!armed) { results.push({ round: r.id, day: dayNum, action: 'dry_run_not_armed', would_send_to: list.length }); continue; }

    const c = dayContent(dayNum);
    if (!c) continue;
    const built = buildDay({ num: dayNum, ...c });

    await supabase.from('challenge_daily_emails').upsert({ round: r.id, day_num: dayNum, sent_at: new Date().toISOString(), recipient_count: 0, error_count: 0 });

    let ok = 0, errors = 0, lastErr: string | null = null;
    for (const e of list) {
      const send = await sendOne(e, built.subject, built.html);
      if (send.ok) {
        ok++;
        await supabase.from('daily_email_recipients').upsert({ round: r.id, day_num: dayNum, recipient_email: e, sent_at: new Date().toISOString(), resend_id: send.id || null, error: null }, { onConflict: 'round,day_num,recipient_email' });
      } else {
        errors++; lastErr = send.error || 'unknown';
        await supabase.from('daily_email_recipients').upsert({ round: r.id, day_num: dayNum, recipient_email: e, sent_at: new Date().toISOString(), error: lastErr }, { onConflict: 'round,day_num,recipient_email' });
      }
      await new Promise(res => setTimeout(res, 600));
    }
    await supabase.from('challenge_daily_emails').update({ recipient_count: ok, error_count: errors, last_error: lastErr }).eq('round', r.id).eq('day_num', dayNum);
    results.push({ round: r.id, day: dayNum, sent: ok, errors });
  }

  return new Response(JSON.stringify({ ok: true, il_date: todayIL, il_hour: hour, armed, results }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
});
