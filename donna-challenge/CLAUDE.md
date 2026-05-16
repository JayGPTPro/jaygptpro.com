# ⚠️ ENGLISH PORTAL ONLY

This folder is the **English** Donna Challenge. Different product, different customers, different language than the Hebrew Bina version.

**If you're working on Hebrew/Bina, you opened the wrong folder. Go to `/donna-challenge-bina/` instead.**

## Hard rules for any edit in this folder

1. **All copy stays in English.** No Hebrew strings anywhere. Not in headings, not in buttons, not in checklist labels, not in code comments meant to be read by users.
2. **All file references stay in English.** `donna-starter-kit` (English filename). NEVER `דונה - ערכת התחלה`.
3. **Never edit `donna-challenge-bina/` in the same commit.** One folder per commit.
4. **All round metadata lives in Supabase `rounds` table.** Do NOT hardcode WhatsApp links, dates, product IDs, or payment link IDs in this folder or in any edge function. To inspect: `SELECT * FROM rounds WHERE language='en';`. To change: UPDATE the row, do not edit code.
5. **Resend env var for sending email from this portal: `RESEND_API_KEY`** (not `RESEND_API_KEY_BINA`)
6. **Welcome email function:** `send-welcome-email` or `send-welcome-english` (NOT `send-welcome-bina`)

## Customers in this portal

International, mostly US/UK/Europe. Pay in USD. English rounds use canonical IDs `round1`, `round2`, `round4`, `round5` in `rounds`. NOT `bina_r1`/`bina_r2`. `allowed_emails.round` for these customers is the matching id (or `unknown`/`both`).

## Procedures

How to launch a new round, send welcome emails, reconcile NULL-round payments, etc., all live in the `runbooks` table:

```sql
SELECT id, title FROM runbooks ORDER BY id;
SELECT body FROM runbooks WHERE id = 'launch-new-round';
```

## Before pushing anything

1. `git pull` (parallel sessions may have pushed)
2. Confirm `git diff` shows only files in `donna-challenge/` (this folder)
3. If diff includes `donna-challenge-bina/` files . STOP, you crossed wires
