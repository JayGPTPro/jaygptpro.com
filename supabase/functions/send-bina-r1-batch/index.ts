import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY_BINA') || Deno.env.get('RESEND_API_KEY')!;

// The secret was written in this file until 17.9.2026. A secret in source cannot be
// rotated without a deploy, rides along into every copy and log of the code, and this
// one guarded a function that sends real mail to customers. It is a project secret now.
// Empty means every request is refused, never that every request passes.
const SHARED = Deno.env.get('EDGE_SHARED_SECRET') || '';
const FROM_EMAIL = 'Jay Margaliot <info@jaygptpro.com>';
const REPLY_TO = 'info@jaygptpro.com';
const PORTAL_URL = 'https://jaygptpro.com/donna-challenge-bina/';
const WA_LINK = 'https://chat.whatsapp.com/EitaKhbxnMRGOM2G3dq3Ji';

const DAY_DATES: Record<number, string> = {
  1: '2026-05-10', 2: '2026-05-11', 3: '2026-05-12', 4: '2026-05-13', 5: '2026-05-14',
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function buildDay(opts: { num: number; title: string; intro: string; lessonsHeader: string; lessons: string[]; tip: string; homework: string; signoff: string; ctaLabel: string }) {
  const subject = `יום ${opts.num}: ${opts.title}`;
  const lessonsHtml = opts.lessons.map((l, i) => {
    const isLast = i === opts.lessons.length - 1;
    const border = isLast ? '' : 'border-bottom:1px solid #e2e8f0;';
    return `<tr><td style="padding:14px 0;${border}"><span style="display:inline-block;width:24px;color:#f97316;font-weight:700;font-size:14px;">${i + 1}.</span><span style="color:#0f172a;font-size:15px;">${l}</span></td></tr>`;
  }).join('');

  const homeworkBlock = opts.homework
    ? `<tr><td style="padding:0 0 26px;"><p style="margin:0 0 6px;font-size:13px;color:#94a3b8;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">שיעורי בית</p><p style="margin:0;font-size:15px;color:#334155;line-height:1.7;">${opts.homework}</p></td></tr>`
    : '';

  const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title><style>body{margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#0f172a;}.btn{display:inline-block;background:#f97316;color:#fff !important;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:8px;}.btn-wa{display:inline-block;background:#25D366;color:#fff !important;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;}@media (max-width:525px){.wrap{padding:24px 18px !important;}}</style></head><body dir="rtl"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:40px 16px;background:#ffffff;"><table class="wrap" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#fff;"><tr><td style="border-top:3px solid #f97316;padding-top:28px;"><p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#f97316;letter-spacing:1.5px;text-transform:uppercase;">יום ${opts.num} · DAY ${opts.num}</p><h1 style="margin:0 0 22px;font-size:28px;font-weight:700;color:#0f172a;line-height:1.3;">${opts.title}</h1><p style="margin:0 0 18px;font-size:16px;color:#334155;line-height:1.7;">${opts.intro}</p><p style="margin:0 0 8px;font-size:14px;color:#64748b;line-height:1.7;">${opts.lessonsHeader}</p></td></tr><tr><td style="padding:14px 0 28px;"><table width="100%" cellpadding="0" cellspacing="0" border="0">${lessonsHtml}</table></td></tr><tr><td align="center" style="padding:8px 0 30px;text-align:center;"><a href="${PORTAL_URL}#day${opts.num}" class="btn">${opts.ctaLabel}</a></td></tr><tr><td style="padding:0 0 26px;"><p style="margin:0 0 6px;font-size:13px;color:#94a3b8;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">הטיפ של היום</p><p style="margin:0;font-size:15px;color:#334155;line-height:1.7;">${opts.tip}</p></td></tr>${homeworkBlock}<tr><td align="center" style="padding:0 0 30px;border-top:1px solid #e2e8f0;padding-top:24px;text-align:center;"><a href="${WA_LINK}" class="btn-wa">💬 קבוצת הוואטסאפ</a></td></tr><tr><td style="padding:0 0 8px;"><p style="margin:0;font-size:15px;color:#0f172a;line-height:1.7;">${opts.signoff}</p><p style="margin:4px 0 0;font-size:15px;color:#0f172a;font-weight:600;">מנדי וג'יי</p></td></tr><tr><td style="padding:30px 0 0;border-top:1px solid #f1f5f9;"><p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">Jay Margaliot · אתגר קלוד קוד עם בינה<br><a href="mailto:info@jaygptpro.com" style="color:#94a3b8;text-decoration:underline;">info@jaygptpro.com</a></p></td></tr></table></td></tr></table></body></html>`;
  return { subject, html };
}

function buildEmailForDay(day: number) {
  if (day === 1) return buildDay({
    num: 1, title: 'מכירים את דונה',
    intro: 'היום אתם פוגשים את עובד ה-AI הראשון שלכם. דונה לא עוד מכירה אתכם, אבל אתם תתחילו היום ללמד אותה לעבוד איתכם.',
    lessonsHeader: '4 שיעורים מחכים לכם היום:',
    lessons: ['התקנה והכרת המערכת','השיטה (8 המרכיבים שמאחורי דונה)','סיור בערכה (דונה תעבור איתכם)','מדברים עם דונה (השיחה הראשונה)'],
    tip: 'אחרי שתסיימו את 4 השיעורים, הקדישו עוד 5-10 דקות לדבר עם דונה חופשי. שאלו אותה שאלה אישית, תספרו לה משהו על העסק. זה יראה לכם מהר מאוד למה דונה שונה מ-ChatGPT.',
    homework: 'בסוף יום 1 יש משימה קצרה (20-30 דקות) שמכינה את דונה ללמוד עליכם מחר. אל תדלגו. זה מה שיהפוך את דונה לשלכם.',
    signoff: 'נתראה בקבוצה. בהצלחה!', ctaLabel: 'קדימה, מתחילים ←',
  });
  if (day === 2) return buildDay({
    num: 2, title: 'דונה לומדת אתכם',
    intro: 'אתמול הכרתם את דונה. היום היא הופכת לדונה שלכם. לא של מישהו אחר, לא גנרית, שלכם.',
    lessonsHeader: '2 שיעורים מחכים לכם היום:',
    lessons: ['דונה לומדת אתכם (העסק, האנשים, הקול שלכם)','רגע הוואו · The Wow Moment'],
    tip: 'אחרי ששיעור 1 רץ, שאלו את דונה: “מה את מבינה על העסק שלי?”. אם היא עונה כמו שותף שלכם ולא כמו ChatGPT גנרי, הצלחתם. זה רגע הוואו.',
    homework: '',
    signoff: 'יום שני מעולה!', ctaLabel: 'ממשיכים ליום 2 ←',
  });
  if (day === 3) return buildDay({
    num: 3, title: 'דונה נכנסת לחיים שלכם',
    intro: 'עד עכשיו דונה ידעה מה שסיפרתם לה. היום היא מקבלת תג כניסה. ג׳ימייל, יומן, דרייב.',
    lessonsHeader: '2 שיעורים מחכים לכם היום:',
    lessons: ['אמון וחיבור הכלים (Gmail, Calendar, Drive)','חוקרים את העסק עם דונה (Power Workflow)'],
    tip: 'אחרי שחיברתם את הכלים, תבקשו מדונה: “תכיני לי תדריך לפגישה הקרובה ביומן.” היא תמשוך מהמייל, מהיומן ומהמסמכים. זה הרגע שדונה הופכת ממדברת לעובדת.',
    homework: 'תחשבו על תהליך עבודה אחד שאתם עושים שוב ושוב (תחקיר לקוח, סגירת פגישה, סיכום מייל). מחר אנחנו הופכים אותו לסקיל, קיצור דרך שדונה תריץ בפקודה אחת.',
    signoff: 'יום שלישי, כבר חצי דרך!', ctaLabel: 'יום 3 מחכה ←',
  });
  if (day === 4) return buildDay({
    num: 4, title: 'יום הסקילים',
    intro: 'סקיל = מתכון שדונה לומדת פעם אחת ומריצה לנצח בפקודה אחת. זה היום שדונה הופכת מעוזרת לצוות.',
    lessonsHeader: '3 שיעורים מחכים לכם היום:',
    lessons: ['סקילים · יום האימון (12 הסקילים של דונה)','התור שלכם · Your Turn (מריצים סקילים אמיתיים)','תהפכו את זה לשלכם · Make It Yours'],
    tip: 'זוכרים את ה-Power Workflow מיום 3? זה הרגע להפוך אותו לסקיל. תגידו לדונה: “תהפכי את התהליך של אתמול לסקיל בשם /schedule-meeting.” היא תטפל בזה. בפעם הבאה זה פקודה אחת.',
    homework: 'בחרו 1-2 סקילים שלדעתכם הכי שווים להריץ אוטומטית כל יום (תדריך בוקר? סיכום ערב?). מחר אנחנו מתזמנים אותם דרך Routines, דונה תתחיל לעבוד בלי שתבקשו.',
    signoff: 'יום רביעי, יום הסקילים!', ctaLabel: 'מתחילים יום 4 ←',
  });
  if (day === 5) return buildDay({
    num: 5, title: 'דונה עובדת גם כשישנים',
    intro: 'היום האחרון. דונה הופכת מעוזרת שאתם מפעילים, לעובדת שעובדת לבד ולומדת מעצמה.',
    lessonsHeader: '3 שיעורים מחכים לכם היום:',
    lessons: ['Routines · אוטומציה (דונה מתעוררת לפניכם)','Learning Loop (דונה משתפרת מעצמה)','Graduation · הצעדים הבאים'],
    tip: 'אחרי שתגדירו את ה-Routines, פתחו את Obsidian וצלמו מסך של ה-Graph View. עוד 30 יום צלמו עוד אחד. ההבדל יהיה דרמטי.',
    homework: '', signoff: 'תודה שעשיתם איתנו את האתגר.', ctaLabel: 'סוגרים את האתגר ←',
  });
  return null;
}

async function sendOne(email: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [email], reply_to: REPLY_TO, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data?.message || `HTTP ${res.status}` };
  return { ok: true, id: data.id };
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders() });

    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    if (!SHARED || (body.secret || '') !== SHARED) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    const day = body.day;
    const dryRun = body.dry_run === true;
    const skipDateCheck = body.skip_date_check === true;

    if (!day || ![1,2,3,4,5].includes(day)) {
      return new Response(JSON.stringify({ error: 'Invalid day. Must be 1-5.' }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    const expectedDate = DAY_DATES[day];
    const israelDate = new Date(Date.now() + 3*60*60*1000).toISOString().slice(0, 10);
    if (!skipDateCheck && israelDate !== expectedDate) {
      return new Response(JSON.stringify({ error: `Date guard: today is ${israelDate} IL, but day ${day} is expected on ${expectedDate}. Pass skip_date_check=true to override.` }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const campaign = `bina_r1_day${day}`;

    const { data: allRows, error: allError } = await supabase
      .from('allowed_emails')
      .select('email, round, notes')
      .in('round', ['round1', 'both']);
    if (allError) return new Response(JSON.stringify({ error: 'allowed_emails error: ' + allError.message }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });

    const { data: binaRows, error: binaError } = await supabase.from('bina_registrations').select('email');
    if (binaError) return new Response(JSON.stringify({ error: 'bina_registrations error: ' + binaError.message }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    const binaEmails = new Set((binaRows || []).map((r: any) => (r.email || '').toLowerCase()));

    const audience = (allRows || []).filter((row: any) => {
      const email = (row.email || '').toLowerCase();
      const notes = (row.notes || '').toLowerCase();
      if (email === 'info@jaygptpro.com') return false;
      return binaEmails.has(email)
        || notes.includes('bina')
        || notes.includes('cardcom')
        || notes.includes('mendi')
        || notes.includes('מנדי')
        || notes.includes('family/team')
        || notes.includes('family member (jay added)')
        || email === 'mendikoritz@gmail.com';
    }).map((r: any) => ({ email: r.email }));

    const { data: alreadySent } = await supabase
      .from('email_sends')
      .select('email')
      .eq('campaign', campaign);
    const sentSet = new Set((alreadySent || []).map((r: any) => (r.email || '').toLowerCase()));

    const toSend = audience.filter(r => !sentSet.has(r.email.toLowerCase()));
    const skipped = audience.length - toSend.length;

    const built = buildEmailForDay(day);
    if (!built) return new Response(JSON.stringify({ error: 'Email content for day not found' }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });

    if (dryRun) {
      return new Response(JSON.stringify({
        dry_run: true, day, campaign,
        audience_size: audience.length,
        already_sent: skipped,
        will_send_to: toSend.length,
        recipients_preview: toSend.map(r => r.email),
      }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    const results: any[] = [];
    for (const r of toSend) {
      const sendRes = await sendOne(r.email, built.subject, built.html);
      if (sendRes.ok) {
        await supabase.from('email_sends').insert({ email: r.email, campaign, resend_id: sendRes.id });
      }
      results.push({ email: r.email, ok: sendRes.ok, id: sendRes.id, error: sendRes.error });
    }

    return new Response(JSON.stringify({
      ok: true, day, campaign,
      audience_size: audience.length,
      already_sent_skipped: skipped,
      sent_now: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Exception: ' + (e?.message || String(e)), stack: e?.stack }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }
});
