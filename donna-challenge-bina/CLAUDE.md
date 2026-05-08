# ⚠️ פורטל בינה (עברית) בלבד

התיקייה הזו היא **אתגר בינה בעברית**. מוצר נפרד לחלוטין מהאתגר באנגלית. לקוחות שונים, שפה שונה, תקופות שונות.

**אם אתה עובד על האנגלית, פתחת את התיקייה הלא נכונה. עבור ל-`/donna-challenge/`.**

## כללים נוקשים לכל עריכה בתיקייה הזו

1. **כל הטקסט בעברית.** בלי מחרוזות באנגלית מלבד מונחים טכניים שמופיעים גם באפליקציה (Claude Code, Obsidian, Routines, Skills) . וגם אלה תמיד עם הסבר עברי בסוגריים באזכור הראשון.
2. **שמות קבצים:** `bina-starter-kit` (לא `donna-starter-kit` שהוא לאנגלית).
3. **לעולם אל תערוך `donna-challenge/` באותו commit.** תיקייה אחת לכל commit.
4. **קישורי וואטסאפ של הפורטל הזה:**
   - סבב 1: `https://chat.whatsapp.com/EitaKhbxnMRGOM2G3dq3Ji`
   - סבב 2: `https://chat.whatsapp.com/HiG8Px04WSJGvJUlmKQwsn`
5. **מוצרי Stripe של הפורטל הזה:**
   - בינה ר1: `prod_UQk3t4u4M4ktwO`
   - בינה ר2: `prod_UQk4gu2czKqQ6y`
6. **משתנה Resend לשליחת מייל מהפורטל הזה: `RESEND_API_KEY_BINA`** (לא `RESEND_API_KEY`)
7. **פונקציות מייל ייעודיות:** `send-welcome-bina`, `send-bina-kickoff` (לא `send-welcome-email` שהיא של האנגלית)

## הלקוחות בפורטל הזה

ישראלים. משלמים בשקלים (ILS) דרך Stripe או דרך מנדי (Cardcom . ידני). כ-38 פעילים נכון לסבב 1.

## תאריכי סבבים

מתוך טבלת `rounds` ב-Supabase. סבבי בינה הם `bina_r1` ו-`bina_r2`. הם מתחילים בימי ראשון בשעה 11:00 שעון ישראל. **לא** `round1`/`round2` (אלה של האתגר באנגלית).

לוח זמנים נוכחי:
- סבב 1: ראשון 10/5 . חמישי 14/5
- סבב 2: ראשון 24/5 . חמישי 28/5

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
