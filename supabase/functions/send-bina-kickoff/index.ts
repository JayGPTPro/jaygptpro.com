import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY_BINA') || Deno.env.get('RESEND_API_KEY')!;

// The secret was written in this file until 17.9.2026. A secret in source cannot be
// rotated without a deploy, rides along into every copy and log of the code, and this
// one guarded a function that sends real mail to customers. It is a project secret now.
// Empty means every request is refused, never that every request passes.
const SHARED = Deno.env.get('EDGE_SHARED_SECRET') || '';

const FROM_EMAIL = 'Jay Margaliot <info@jaygptpro.com>';
const REPLY_TO = 'info@jaygptpro.com';
const PORTAL_URL = 'https://jaygptpro.com/donna-challenge-bina/#day0';
const WA_LINK = 'https://chat.whatsapp.com/EitaKhbxnMRGOM2G3dq3Ji';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function buildEmail(): { subject: string; html: string } {
  const subject = 'אתם בפנים. הפורטל פתוח, יום 1 ביום ראשון 11:00';

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title>
<style type="text/css">
body { margin:0 !important; padding:0 !important; background-color:#f5f5f7; font-family:'Helvetica Neue',Arial,sans-serif; }
table { border-collapse:collapse !important; }
img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
.btn-portal { display:inline-block; background:#f97316; color:#ffffff !important; text-decoration:none; font-size:17px; font-weight:700; padding:16px 32px; border-radius:12px; }
.btn-wa { display:inline-block; background:#25D366; color:#ffffff !important; text-decoration:none; font-size:16px; font-weight:700; padding:14px 28px; border-radius:12px; }
@media screen and (max-width: 525px) {
  .wrapper { width:100% !important; max-width:100% !important; }
  .card-pad { padding:28px 22px !important; }
  .h1 { font-size:22px !important; }
}
</style>
</head>
<body dir="rtl" style="margin:0;padding:0;background-color:#f5f5f7;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f7;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table class="wrapper" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td align="center" style="background:linear-gradient(135deg,#1a1a2e 0%,#2d1b4e 100%);padding:40px 40px 36px;text-align:center;">
            <div style="font-size:44px;line-height:1;margin-bottom:14px;">🎉</div>
            <h1 class="h1" style="margin:0;font-size:26px;font-weight:800;color:#ffffff;line-height:1.3;text-align:center;">ברוכים הבאים לאתגר!</h1>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td class="card-pad" dir="rtl" style="padding:36px 44px;direction:rtl;text-align:right;">

            <p style="font-size:16px;color:#333;line-height:1.75;margin:0 0 18px;">אנחנו נרגשים להתחיל לבנות איתכם את עובדי ה-AI שלכם. המטרה: להפוך את Claude Code למכונה משומנת שחוסכת לכם שעות בכל יום.</p>

            <h2 style="font-size:18px;font-weight:700;color:#1a1a2e;margin:24px 0 10px;">🔖 הפורטל שלכם</h2>
            <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 16px;">בנינו פורטל ייעודי שבו מרוכזים כל התכנים, ההדרכות והמשימות. הכניסה היא עם כתובת המייל שאיתה נרשמתם.</p>
          </td>
        </tr>

        <tr>
          <td align="center" dir="ltr" style="padding:6px 44px 22px;text-align:center;direction:ltr;">
            <a href="${PORTAL_URL}" target="_blank" class="btn-portal" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-size:17px;font-weight:700;padding:16px 32px;border-radius:12px;text-align:center;">פתחו את הפורטל &larr;</a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 44px 24px;text-align:center;">
            <p style="font-size:13px;color:#888;margin:0;text-align:center;">כדאי לשמור במועדפים. זה הבית שלכם לאתגר הזה.</p>
          </td>
        </tr>

        <tr>
          <td class="card-pad" dir="rtl" style="padding:0 44px 0;direction:rtl;text-align:right;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 24px;">
              <tr>
                <td style="background:rgba(249,115,22,0.07);border:1px solid rgba(249,115,22,0.2);border-radius:14px;padding:22px 26px;direction:rtl;text-align:right;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#f97316;letter-spacing:1px;text-transform:uppercase;">יום 0 כבר באוויר</p>
                  <p style="margin:0 0 12px;font-size:17px;font-weight:700;color:#1a1a2e;">🛠️ מתחילים מהבסיס</p>
                  <p style="margin:0 0 14px;font-size:15px;color:#444;line-height:1.7;">היום הזה מוקדש כולו ליישור קו: התקנות, הגדרות, ולוודא שהשטח מוכן לעבודה.</p>
                  <p style="margin:0 0 8px;font-size:14px;color:#444;line-height:1.7;"><strong style="color:#1a1a2e;">🎁 בונוס מיוחד:</strong> הוספנו בפורטל הדרכה שפותרת את עניין העברית שמתהפכת בתוך הקוד (RTL). אל תפספסו.</p>
                  <ul style="margin:14px 0 0;padding-right:18px;font-size:14px;color:#444;line-height:1.85;">
                    <li>כבר עברתם את הוובינר? אתם מסודרים. תציצו רק בבונוס העברית.</li>
                    <li>חדשים לגמרי? יום 0 יסגור לכם את כל הפינות הטכניות.</li>
                  </ul>
                </td>
              </tr>
            </table>

            <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 24px;background:#f9f7f3;border-right:3px solid #f97316;padding:12px 16px;border-radius:6px;"><strong style="color:#1a1a2e;">טיפ:</strong> בתחתית כל עמוד יש צ'ק ליסט. סמנו V על כל משימה שביצעתם כדי לא לפספס כלום.</p>

            <h2 style="font-size:18px;font-weight:700;color:#1a1a2e;margin:28px 0 10px;">⏰ לוח זמנים</h2>
            <p style="font-size:15px;color:#444;line-height:1.75;margin:0 0 6px;">החל מיום ראשון 10/5, כל יום נפתח ב-<strong style="color:#1a1a2e;">11:00 בבוקר</strong>.</p>
            <p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 24px;">זה לא זום חי. ההדרכות מוקלטות כדי שתוכלו לצפות מתי שנוח לכם במהלך היום.</p>

            <h2 style="font-size:18px;font-weight:700;color:#1a1a2e;margin:28px 0 10px;">💬 קבוצת הוואטסאפ . התמיכה והקהילה</h2>
            <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 16px;">כל התמיכה, השאלות, והשיתופים מתנהלים בקבוצה. אם עוד לא הצטרפתם, זה הזמן.</p>
          </td>
        </tr>

        <tr>
          <td align="center" dir="ltr" style="padding:4px 44px 12px;text-align:center;direction:ltr;">
            <a href="${WA_LINK}" target="_blank" class="btn-wa" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 28px;border-radius:12px;text-align:center;">הצטרפות לקבוצת הוואטסאפ &larr;</a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 44px 24px;text-align:center;">
            <p style="font-size:13px;color:#888;margin:0;text-align:center;line-height:1.6;">בקבוצה תוכלו לשאול שאלות ולעזור אחד לשני.<br>טיפ: שימו על Mute והיכנסו כשנוח.</p>
          </td>
        </tr>

        <tr>
          <td class="card-pad" dir="rtl" style="padding:0 44px 36px;direction:rtl;text-align:right;">
            <h2 style="font-size:18px;font-weight:700;color:#1a1a2e;margin:8px 0 10px;">🎮 משימה לסופ\"ש</h2>
            <p style="font-size:15px;color:#444;line-height:1.75;margin:0 0 14px;">תתחילו לשחק עם Claude. קחו דוגמאות מהוובינר, תריצו אותן, תרגישו את העוצמה בידיים שלכם.</p>
            <p style="font-size:15px;color:#444;line-height:1.75;margin:0 0 8px;">וכשתצטרפו לקבוצה, ספרו לנו שם:</p>
            <ul style="margin:8px 0 24px;padding-right:20px;font-size:15px;color:#444;line-height:1.85;">
              <li>מי אתם ומה תחום העיסוק?</li>
              <li>מה המשימה מספר 1 שהייתם רוצים שעובד ה-AI שלכם ייקח מכם?</li>
            </ul>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
              <tr><td style="border-top:1px solid #e5e5eb;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>

            <p style="font-size:16px;color:#333;line-height:1.75;margin:0 0 6px;">נתראה ביום ראשון 🚀</p>
            <p style="font-size:16px;color:#333;font-weight:700;margin:0;">מנדי וג'יי</p>
          </td>
        </tr>

        <tr>
          <td align="center" style="background:#f5f5f7;padding:18px 40px;text-align:center;font-size:13px;color:#999;line-height:1.6;">
            Jay Margaliot &nbsp;&middot;&nbsp; אתגר קלוד קוד עם בינה<br>
            <a href="mailto:info@jaygptpro.com" style="color:#f97316;text-decoration:none;">info@jaygptpro.com</a>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;

  return { subject, html };
}

async function sendOne(email: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { subject, html } = buildEmail();
  try {
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

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const provided = body.secret || req.headers.get('x-form-secret') || '';
  if (!SHARED || provided !== SHARED) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }
  if (!resendKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY_BINA not configured' }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const dryRun = body.dryRun === true;
  let recipients: string[] = [];

  if (Array.isArray(body.emails) && body.emails.length > 0) {
    recipients = body.emails.map((e: string) => String(e).trim().toLowerCase()).filter(Boolean);
  } else {
    const targetRound = body.round === 'round2' ? 'round2' : 'round1';
    const { data, error } = await supabase
      .from('allowed_emails')
      .select('email')
      .in('round', [targetRound, 'both'])
      .is('access_revoked_at', null);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }
    recipients = (data || []).map(r => r.email.toLowerCase());
  }

  if (dryRun) {
    return new Response(JSON.stringify({ ok: true, dryRun: true, count: recipients.length, recipients }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  const results: any[] = [];
  let ok = 0, errors = 0;
  for (const email of recipients) {
    const r = await sendOne(email);
    if (r.ok) ok++; else errors++;
    results.push({ email, ok: r.ok, id: r.id, error: r.error });
  }

  return new Response(JSON.stringify({ ok: true, sent: ok, errors, results }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
});
