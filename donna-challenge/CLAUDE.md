# ⚠️ ENGLISH PORTAL ONLY

This folder is the **English** Donna Challenge. Different product, different customers, different language than the Hebrew Bina version.

**If you're working on Hebrew/Bina, you opened the wrong folder. Go to `/donna-challenge-bina/` instead.**

## Hard rules for any edit in this folder

1. **All copy stays in English.** No Hebrew strings anywhere. Not in headings, not in buttons, not in checklist labels, not in code comments meant to be read by users.
2. **All file references stay in English.** `donna-starter-kit` (English filename). NEVER `דונה - ערכת התחלה`.
3. **Never edit `donna-challenge-bina/` in the same commit.** One folder per commit.
4. **WhatsApp links here:**
   - Round 1: `https://chat.whatsapp.com/Kw459iL73jV4zSTSxd18tS`
   - Round 2: `https://chat.whatsapp.com/GZLCWjQAKmILir6X40caUB`
5. **Stripe products tied to this portal:**
   - Generic English: `prod_UCzffM0SU6fWW5` (currently selling Round 2)
   - Round 4: `prod_URZEzjLnIA9yPX`
   - Round 5: `prod_URZEKiFdSoJTO6`
6. **Resend env var for sending email from this portal: `RESEND_API_KEY`** (not `RESEND_API_KEY_BINA`)
7. **Welcome email function:** `send-welcome-email` or `send-welcome-english` (NOT `send-welcome-bina`)

## Customers in this portal

International, mostly US/UK/Europe. Pay in USD. ~80+ active in `allowed_emails` for `round1`/`round2` (English semantics, NOT Bina).

## Round dates

Live rounds dynamic from `rounds` table. English rounds use IDs `round1`, `round2`, `round4`, `round5`. NOT `bina_r1`/`bina_r2`.

## Before pushing anything

1. `git pull` (parallel sessions may have pushed)
2. Confirm `git diff` shows only files in `donna-challenge/` (this folder)
3. If diff includes `donna-challenge-bina/` files . STOP, you crossed wires
