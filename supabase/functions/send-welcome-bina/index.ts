import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY_BINA')!;
// Two callers, two secrets (16.9.2026): stripe-webhook, cardcom-webhook and
// send-pending-welcomes-bina send EDGE_SHARED_SECRET; the public admin.html page sends
// ADMIN_PAGE_SECRET, which opens only this welcome function and its English sibling.
// FORM_SYNC_SECRET opens nothing any more.
const sharedSecret = Deno.env.get('EDGE_SHARED_SECRET') || '';
const adminPageSecret = Deno.env.get('ADMIN_PAGE_SECRET') || '';

const FROM_EMAIL = 'Jay Margaliot <info@jaygptpro.com>';
const REPLY_TO = 'info@jaygptpro.com';
const DEFAULT_PORTAL = 'https://jaygptpro.com/donna-challenge-bina/';

const FALLBACK: Record<string, { wa: string; dates: string }> = {
  r1: { wa: 'https://chat.whatsapp.com/EitaKhbxnMRGOM2G3dq3Ji?mode=gi_t', dates: '11-15 במאי 2026' },
  r2: { wa: 'https://chat.whatsapp.com/HiG8Px04WSJGvJUlmKQwsn?mode=gi_t', dates: '24-28 במאי 2026' },
};

const HEBREW_CAL: Record<string, string> = {
  r1: 'כ\"ד-כ\"ח אייר תשפ\"ו',
  r2: 'ח\' עד י\"ב סיון תשפ\"ו',
};

function isEvergreen(round: string): boolean {
  return /^bina_wk_/.test(round);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function shortToCanonical(short: string): string {
  if (short === 'r1') return 'bina_r1';
  if (short === 'r2') return 'bina_r2';
  return short; // evergreen ids (bina_wk_*) are already canonical
}

async function loadRoundMeta(supabase: any, round: string): Promise<{ wa: string; dates: string; portal: string } | null> {
  const canonical = shortToCanonical(round);
  try {
    const { data, error } = await supabase
      .from('rounds')
      .select('whatsapp_link, welcome_dates_display, portal_url')
      .eq('id', canonical)
      .maybeSingle();
    if (error) { console.error('rounds lookup error:', error); }
    if (data && data.welcome_dates_display) {
      return { wa: data.whatsapp_link || '', dates: data.welcome_dates_display, portal: data.portal_url || DEFAULT_PORTAL };
    }
  } catch (e) { console.error('loadRoundMeta exception:', e); }
  if (FALLBACK[round]) return { wa: FALLBACK[round].wa, dates: FALLBACK[round].dates, portal: DEFAULT_PORTAL };
  // Evergreen with a missing row: still allow send (no dates needed in evergreen email).
  if (isEvergreen(round)) return { wa: '', dates: '', portal: DEFAULT_PORTAL };
  return null;
}

function step(num: string, text: string): string {
  return `
  <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin-bottom:14px;direction:rtl;\">
    <tr>
      <td width=\"36\" valign=\"top\" style=\"padding-left:12px;\">
        <span style=\"display:inline-block;width:26px;height:26px;background:#ffedd5;border-radius:50%;text-align:center;line-height:26px;font-size:13px;font-weight:800;color:#ea580c;\">${num}</span>
      </td>
      <td valign=\"top\" style=\"font-size:15px;color:#333333;line-height:1.65;padding-top:3px;text-align:right;direction:rtl;\">${text}</td>
    </tr>
  </table>`;
}

// ---- Fixed-round (r1/r2) email: WhatsApp-centric, unchanged ----
function buildEmail(round: string, waLink: string, dates: string): { subject: string; html: string } {
  const roundNum = round === 'r1' ? '1' : '2';
  const hebrewDates = HEBREW_CAL[round] || HEBREW_CAL['r1'];
  const subject = `ברוכים הבאים לאתגר קלוד קוד עם בינה`;
  const html = `<!DOCTYPE html>
<html lang=\"he\" dir=\"rtl\" xmlns=\"http://www.w3.org/1999/xhtml\">
<head>
<meta charset=\"UTF-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\">
<title>ברוכים הבאים</title>
<style type=\"text/css\">
body, table, td, a { direction: rtl !important; text-align: right !important; }
body { margin:0 !important; padding:0 !important; background-color:#f5f5f7; font-family:'Helvetica Neue',Arial,sans-serif; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
table { border-collapse:collapse !important; mso-table-lspace:0pt; mso-table-rspace:0pt; }
img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
.btn-wa { display:block; background:#25D366; color:#ffffff !important; text-decoration:none; font-size:17px; font-weight:700; padding:16px 32px; border-radius:12px; text-align:center !important; }
@media screen and (max-width: 525px) {
  .wrapper { width:100% !important; max-width:100% !important; }
  .card-pad { padding:28px 22px !important; }
  .h1 { font-size:22px !important; }
}
</style>
</head>
<body dir=\"rtl\" style=\"margin:0;padding:0;background-color:#f5f5f7;direction:rtl;text-align:right;\">
<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background-color:#f5f5f7;direction:rtl;\">
  <tr><td align=\"center\" style=\"padding:32px 16px;direction:rtl;\">
    <table class=\"wrapper\" width=\"580\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);direction:rtl;\">
      <tr><td style=\"background:linear-gradient(135deg,#1a1a2e 0%,#2d1b4e 100%);padding:44px 44px 36px;text-align:center;direction:rtl;\">
        <div style=\"font-size:48px;line-height:1;margin-bottom:16px;\">✅</div>
        <h1 class=\"h1\" style=\"margin:0 0 10px;font-size:28px;font-weight:800;color:#ffffff;line-height:1.25;direction:rtl;text-align:center;\">ברוכים הבאים לאתגר!</h1>
        <p style=\"margin:0;font-size:16px;color:rgba(255,255,255,0.75);text-align:center;direction:rtl;\">הרשמה עברה בהצלחה. מקומך בסבב ${roundNum} שמור.</p>
      </td></tr>
      <tr><td class=\"card-pad\" style=\"padding:36px 44px;direction:rtl;text-align:right;\">
        <p style=\"font-size:11px;font-weight:700;color:#f97316;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 10px;direction:rtl;text-align:right;\">צעד אחד נדרש</p>
        <p style=\"font-size:16px;color:#333333;line-height:1.75;margin:0 0 22px;direction:rtl;text-align:right;\">הצטרפו לקבוצת הוואצאפ של סבב ${roundNum}. זה המקום שבו תקבלו את כל הקישורים היומיים, עדכונים ותמיכה ישירה במהלך האתגר.</p>
        <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\">
          <tr><td align=\"center\" style=\"padding-bottom:8px;\"><a href=\"${waLink}\" target=\"_blank\" class=\"btn-wa\" style=\"display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-size:17px;font-weight:700;padding:16px 36px;border-radius:12px;text-align:center;\">הצטרפות לקבוצת סבב ${roundNum} &#128172;</a></td></tr>
          <tr><td align=\"center\" style=\"padding-bottom:24px;\"><span style=\"font-size:13px;color:#999999;\">לחצו כדי להצטרף ישר לקבוצה הסגורה</span></td></tr>
        </table>
        <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin-bottom:28px;\">
          <tr><td style=\"background:rgba(249,115,22,0.07);border:1px solid rgba(249,115,22,0.2);border-radius:14px;padding:18px 24px;text-align:center;direction:rtl;\">
            <p style=\"margin:0 0 4px;font-size:11px;font-weight:700;color:#f97316;letter-spacing:1px;text-transform:uppercase;\">תאריך האתגר</p>
            <p style=\"margin:0 0 2px;font-size:20px;font-weight:800;color:#1a1a2e;\">${dates}</p>
            <p style=\"margin:0;font-size:13px;color:#666666;\">${hebrewDates}</p>
          </td></tr>
        </table>
        <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin-bottom:20px;\"><tr><td style=\"border-top:1px solid #e5e5eb;font-size:0;line-height:0;\">&nbsp;</td></tr></table>
        <p style=\"font-size:15px;font-weight:700;color:#1a1a2e;margin:0 0 16px;direction:rtl;text-align:right;\">השלבים הבאים</p>
        ${step('1', 'הצטרפו לקבוצת הוואצאפ (הלינק למעלה)')}
        ${step('2', 'בדקו את תיבת המייל. קיבלתם קבלה עם פרטי הרכישה')}
        ${step('3', 'כמה ימים לפני האתגר תקבלו בקבוצה את כל חומרי ההכנה')}
        <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:20px 0;\"><tr><td style=\"border-top:1px solid #e5e5eb;font-size:0;line-height:0;\">&nbsp;</td></tr></table>
        <p style=\"font-size:15px;color:#333333;line-height:1.75;margin:0 0 8px;direction:rtl;text-align:right;\">שאלות? פשוט תגיבו למייל הזה. אני קורא הכל.</p>
        <p style=\"font-size:15px;color:#333333;line-height:1.75;margin:0 0 20px;direction:rtl;text-align:right;\">מחכים לבנות יחד ב-${dates} 🚀</p>
        <p style=\"font-size:15px;color:#333333;font-weight:700;margin:0;direction:rtl;text-align:right;\">Jay</p>
      </td></tr>
      <tr><td style=\"background:#f5f5f7;padding:20px 44px;text-align:center;font-size:13px;color:#999999;line-height:1.6;direction:rtl;\">Jay Margaliot &nbsp;&middot;&nbsp; אתגר קלוד קוד עם בינה<br><a href=\"mailto:info@jaygptpro.com\" style=\"color:#f97316;text-decoration:none;\">info@jaygptpro.com</a></td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  return { subject, html };
}

// ---- Evergreen (bina_wk_*) email: email-only, NO WhatsApp, NO dates, NO round number ----
function buildEvergreenEmail(portal: string): { subject: string; html: string } {
  const subject = `ברוכים הבאים לאתגר קלוד קוד עם בינה`;
  const html = `<!DOCTYPE html>
<html lang=\"he\" dir=\"rtl\" xmlns=\"http://www.w3.org/1999/xhtml\">
<head>
<meta charset=\"UTF-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\">
<title>ברוכים הבאים</title>
<style type=\"text/css\">
body, table, td, a { direction: rtl !important; text-align: right !important; }
body { margin:0 !important; padding:0 !important; background-color:#f5f5f7; font-family:'Helvetica Neue',Arial,sans-serif; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
table { border-collapse:collapse !important; mso-table-lspace:0pt; mso-table-rspace:0pt; }
img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
@media screen and (max-width: 525px) {
  .wrapper { width:100% !important; max-width:100% !important; }
  .card-pad { padding:28px 22px !important; }
  .h1 { font-size:22px !important; }
}
</style>
</head>
<body dir=\"rtl\" style=\"margin:0;padding:0;background-color:#f5f5f7;direction:rtl;text-align:right;\">
<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background-color:#f5f5f7;direction:rtl;\">
  <tr><td align=\"center\" style=\"padding:32px 16px;direction:rtl;\">
    <table class=\"wrapper\" width=\"580\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);direction:rtl;\">
      <tr><td style=\"background:linear-gradient(135deg,#1a1a2e 0%,#2d1b4e 100%);padding:44px 44px 36px;text-align:center;direction:rtl;\">
        <div style=\"font-size:48px;line-height:1;margin-bottom:16px;\">✅</div>
        <h1 class=\"h1\" style=\"margin:0 0 10px;font-size:28px;font-weight:800;color:#ffffff;line-height:1.25;direction:rtl;text-align:center;\">ברוכים הבאים לאתגר!</h1>
        <p style=\"margin:0;font-size:16px;color:rgba(255,255,255,0.75);text-align:center;direction:rtl;\">התשלום עבר בהצלחה. המקום שלך באתגר שמור.</p>
      </td></tr>
      <tr><td class=\"card-pad\" style=\"padding:36px 44px;direction:rtl;text-align:right;\">
        <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin-bottom:28px;\">
          <tr><td style=\"background:rgba(249,115,22,0.07);border:1px solid rgba(249,115,22,0.2);border-radius:14px;padding:18px 24px;text-align:center;direction:rtl;\">
            <p style=\"margin:0 0 4px;font-size:11px;font-weight:700;color:#f97316;letter-spacing:1px;text-transform:uppercase;\">מתי מתחילים</p>
            <p style=\"margin:0 0 2px;font-size:20px;font-weight:800;color:#1a1a2e;\">יום ראשון הקרוב, 11:00</p>
            <p style=\"margin:0;font-size:13px;color:#666666;\">שעון ישראל</p>
          </td></tr>
        </table>
        <p style=\"font-size:16px;color:#333333;line-height:1.75;margin:0 0 22px;direction:rtl;text-align:right;\">כל השיעורים, המשימות והחומרים מחכים לך בפורטל הקורס. שמרו את הקישור הזה.</p>
        <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\">
          <tr><td align=\"center\" style=\"padding-bottom:8px;\"><a href=\"${portal}\" target=\"_blank\" style=\"display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-size:17px;font-weight:700;padding:16px 40px;border-radius:12px;text-align:center;\">כניסה לפורטל הקורס</a></td></tr>
          <tr><td align=\"center\" style=\"padding-bottom:24px;\"><span style=\"font-size:13px;color:#999999;\">התחברו עם כתובת המייל שאיתה נרשמתם</span></td></tr>
        </table>
        <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin-bottom:20px;\"><tr><td style=\"border-top:1px solid #e5e5eb;font-size:0;line-height:0;\">&nbsp;</td></tr></table>
        <p style=\"font-size:15px;font-weight:700;color:#1a1a2e;margin:0 0 16px;direction:rtl;text-align:right;\">השלבים הבאים</p>
        ${step('1', 'שמרו את הקישור לפורטל. כאן יופיעו כל השיעורים והחומרים.')}
        ${step('2', 'ביום ראשון בשעה 11:00 (שעון ישראל) ייפתח היום הראשון של האתגר. כל יום נפתח שלב חדש.')}
        ${step('3', 'חשבונית/קבלה על התשלום נשלחה אליכם בנפרד מ-Cardcom.')}
        <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:20px 0;\"><tr><td style=\"border-top:1px solid #e5e5eb;font-size:0;line-height:0;\">&nbsp;</td></tr></table>
        <p style=\"font-size:15px;color:#333333;line-height:1.75;margin:0 0 8px;direction:rtl;text-align:right;\">שאלות? פשוט תגיבו למייל הזה. אני קורא הכל.</p>
        <p style=\"font-size:15px;color:#333333;line-height:1.75;margin:0 0 20px;direction:rtl;text-align:right;\">מחכים לבנות יחד 🚀</p>
        <p style=\"font-size:15px;color:#333333;font-weight:700;margin:0;direction:rtl;text-align:right;\">Jay</p>
      </td></tr>
      <tr><td style=\"background:#f5f5f7;padding:20px 44px;text-align:center;font-size:13px;color:#999999;line-height:1.6;direction:rtl;\">Jay Margaliot &nbsp;&middot;&nbsp; אתגר קלוד קוד עם בינה<br><a href=\"mailto:info@jaygptpro.com\" style=\"color:#f97316;text-decoration:none;\">info@jaygptpro.com</a></td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  return { subject, html };
}

async function recordResult(supabase: any, email: string, round: string, ok: boolean, errMsg: string | null) {
  if (!email) return;
  const lower = email.toLowerCase();
  await supabase.from('bina_registrations').upsert({ email: lower, round, welcome_email_sent_at: ok ? new Date().toISOString() : null, welcome_email_error: ok ? null : (errMsg || 'unknown').substring(0, 500) }, { onConflict: 'email' });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders() });

  const provided = req.headers.get('x-form-secret') || '';
  const okStrong = !!sharedSecret && provided === sharedSecret;
  const okAdmin = !!adminPageSecret && provided === adminPageSecret;
  if (!okStrong && !okAdmin) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  if (!resendKey) return new Response(JSON.stringify({ error: 'RESEND_API_KEY_BINA not configured' }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });

  let email = ''; let round = '';
  try {
    const body = await req.json();
    email = String(body.email || '').trim();
    round = String(body.round || '').trim().toLowerCase();
    if (!email) return new Response(JSON.stringify({ error: 'Missing email' }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    const evergreen = isEvergreen(round);
    if (round !== 'r1' && round !== 'r2' && !evergreen) return new Response(JSON.stringify({ error: 'round must be r1, r2, or bina_wk_*' }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });

    const supabase = createClient(supabaseUrl, supabaseKey);
    const meta = await loadRoundMeta(supabase, round);
    if (!meta) return new Response(JSON.stringify({ error: `No round row found for ${round}` }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });

    const { subject, html } = evergreen ? buildEvergreenEmail(meta.portal) : buildEmail(round, meta.wa, meta.dates);

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [email], reply_to: REPLY_TO, subject, html }),
    });
    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      const errMsg = resendData?.message || `Resend HTTP ${resendRes.status}`;
      await recordResult(supabase, email, round, false, errMsg);
      console.error('Resend error:', resendData);
      return new Response(JSON.stringify({ error: 'Resend send failed', detail: resendData }), { status: 502, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }
    await recordResult(supabase, email, round, true, null);
    return new Response(JSON.stringify({ ok: true, email, round, resendId: resendData.id }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('send-welcome-bina error:', err);
    if (email) { try { const supabase = createClient(supabaseUrl, supabaseKey); await recordResult(supabase, email, round, false, String(err)); } catch (_) {} }
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }
});
