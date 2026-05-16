# ⚠️ פורטל בינה (עברית) בלבד

התיקייה הזו היא **אתגר בינה בעברית**. מוצר נפרד לחלוטין מהאתגר באנגלית. לקוחות שונים, שפה שונה, תקופות שונות.

**אם אתה עובד על האנגלית, פתחת את התיקייה הלא נכונה. עבור ל-`/donna-challenge/`.**

## כללים נוקשים לכל עריכה בתיקייה הזו

1. **כל הטקסט בעברית.** בלי מחרוזות באנגלית מלבד מונחים טכניים שמופיעים גם באפליקציה (Claude Code, Obsidian, Routines, Skills) . וגם אלה תמיד עם הסבר עברי בסוגריים באזכור הראשון.
2. **שמות קבצים:** `bina-starter-kit` (לא `donna-starter-kit` שהוא לאנגלית).
3. **לעולם אל תערוך `donna-challenge/` באותו commit.** תיקייה אחת לכל commit.
4. **כל הנתונים התפעוליים של סבבי בינה נמצאים בטבלת `rounds` ב-Supabase.** אל תקבע ערכים קשיחים (WhatsApp, תאריכים, מוצרי Stripe, payment links) בקבצי הפורטל הזה או ב-edge functions. לבדיקה: `SELECT * FROM rounds WHERE language='he';`. לשינוי: UPDATE על השורה, לא לערוך קוד.
5. **משתנה Resend לשליחת מייל מהפורטל הזה: `RESEND_API_KEY_BINA`** (לא `RESEND_API_KEY`)
6. **פונקציות מייל ייעודיות:** `send-welcome-bina`, `send-bina-kickoff` (לא `send-welcome-email` שהיא של האנגלית)

## הלקוחות בפורטל הזה

ישראלים. משלמים בשקלים (ILS) דרך Stripe או דרך מנדי (Cardcom, ידני). הם מתחילים בימי ראשון בשעה 11:00 שעון ישראל.

## תאריכי סבבים ומידע תפעולי

סבבי בינה הם `bina_r1` ו-`bina_r2` ב-`rounds`. **לא** `round1`/`round2` (אלה של האתגר באנגלית). לתאריכים, קישורי וואטסאפ, מוצרי Stripe, וכל מטא-דאטה אחרת:

```sql
SELECT id, start_date, end_date, welcome_dates_display, whatsapp_link, stripe_product_id
FROM rounds WHERE id LIKE 'bina_%' ORDER BY start_date;
```

## פנימי: מבנה משתמשים

הפורטל הזה בודק גישה דרך טבלת `allowed_emails` המשותפת עם האנגלית. ערכי `round` ('round1', 'round2') משותפים. כדי לסנן רק לקוחות בינה, הפילטר הוא:

```sql
EXISTS (SELECT 1 FROM bina_registrations br WHERE LOWER(br.email)=LOWER(ae.email))
   OR ae.notes ILIKE '%Bina%'
   OR ae.notes ILIKE '%Cardcom%'
   OR ae.notes ILIKE '%Mendi%'
   OR ae.notes ILIKE '%מנדי%'
```

(שכבה 2 של ההפרדה תוסיף עמודת `program` ל-`allowed_emails` שתבטל את הצורך בפילטר הזה.)

## לפני כל push

1. `git pull` (סשנים מקבילים אולי דחפו משהו)
2. ודא ש-`git diff` מראה רק קבצים בתיקייה `donna-challenge-bina/`
3. אם diff כולל `donna-challenge/` . עצור, התבלבלת
