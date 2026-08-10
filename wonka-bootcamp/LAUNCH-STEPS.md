# Wonka Bootcamp . what Jay has to do

> **STALE, kept for its explanations only. Written 20-25 July, and the dates in
> it are wrong.** The round is **1 to 17 September 2026** in three bands
> (1-4, 8-10, 15-17), not August. The unlock calendar that actually runs is
> `CONFIG.DAY_DATES` in `index.html`; the round row in Supabase is already set.
> The WhatsApp link is in, the gitignore is in, the DB gate is open. Before
> acting on any step below, check it against the live state. Current launch
> truth lives in `wonka/bootcamp/docs/` and in the project memory.

Everything below is the part a machine cannot do: it needs your accounts, your
decisions, or your money.

The portal, the map, the day pages, the locked-day state, the completion flow
and mobile have all been tested end to end, twice.

---

## 1. ~~Open the database gate~~  MOSTLY DONE (20.7)

The round exists and both your addresses can get in. Two small things left.

**a. Move the date** . the round row still says 27 July. Open
https://supabase.com/dashboard/project/faqjilunlzljbgrnpcgi/sql/new
and run this:

```sql
update rounds
   set start_date            = '2026-08-10',
       end_date              = '2026-08-21',
       welcome_dates_display = 'August 10 . 21, 2026'
 where id = 'wonka_r1';

select id, start_date::text, end_date::text from rounds where id = 'wonka_r1';
```

Expect one row: `wonka_r1 | 2026-08-10 | 2026-08-21`.

**b. The login redirect** . open
https://supabase.com/dashboard/project/faqjilunlzljbgrnpcgi/auth/url-configuration
→ **Redirect URLs** → **Add URL** → `https://jaygptpro.com/wonka-bootcamp/` →
Save. Donna's existing URLs stay, you are adding one. Without this the login
email lands on a blank page.

**c. Test the gate both ways.** Private window on
https://jaygptpro.com/wonka-bootcamp/ :
sign in with an address that is **not** on the list (must refuse), then with
one that is (must let you in). A gate that has never said no has not been
tested. Note since 10.8: `jmargaliot@gmail.com` is no longer an admin, he is
buyer #1 and sees locked doors like everyone else. `info@jaygptpro.com` is the
only address that opens every day.

Adding buyers later is two lines of SQL; send me the addresses and I will hand
you the exact block. If a buyer is also a Donna member, flag them . that case
is handled differently so their Donna access is not disturbed.

---

## 2. ~~Decide one number: when does a day open?~~  DONE (20.7)

There was a 5 hour 20 minute hole on launch day: the landing page counts down
to 9:00 AM New York, but the portal did not unlock Day 1 until 2:20 PM. A
customer whose countdown hit zero would have logged in to ten locked doors.

**The portal now unlocks each day at 9:00 AM New York sharp**, the same moment
the landing countdown hits zero (verified: both are 13:00 UTC; in Israel that
is 4:00 PM). Every locked door, tooltip and toast shows the new time
automatically.

If you ever want a different daily hour, it is one line: `UNLOCK_HOUR_NY` in
the CONFIG block of `index.html`.

---

## 3. Paste the WhatsApp group link  (2 minutes)

Create the group, copy its invite link, send it to me.
Until then the portal shows an honest "coming soon" state rather than a dead
button, so this is not urgent, but members will look for it on day 1.

---

## 4. Say yes to the source-repo cleanup  (1 minute)

The source project (`~/Downloads/Claude/wonka/bootcamp`) has never been saved to
GitHub because a plain save would try to upload 1,609 files and about 650MB, and
GitHub rejects anything over 100MB.

I have written the rule file that fixes it. It now saves **72 files, 45MB**:
the portal, the map it serves, the 10 day banners and the walk sprites. It skips
525MB of generation galleries we already chose from and 88MB of 3D models we do
not ship.

Just say "commit it" and I will.

---

## 5. Content . the real remaining work

Not blocking the portal, but it is what the product is made of.

- **51 lesson videos.** Every lesson currently points at a placeholder id. When
  they are recorded, upload to Vimeo, set each one to domain privacy with
  `jaygptpro.com` allowlisted, and send me the ids. I will wire them in.
- **Stripe links.** The landing page has three price tiers with the checkout
  links still empty: Factory Pass $299, Golden Ticket $499, Private Tour $2,997.
- The landing page itself is not deployed yet. Only the portal is live.

---

## Where things are

| what | where |
|---|---|
| The live portal | https://jaygptpro.com/wonka-bootcamp/ |
| Portal source (edit here) | `~/Downloads/Claude/jaygptpro.com/wonka-bootcamp/` |
| Database script | `SUPABASE-SETUP.sql` |
| Full technical history | `map-art/HANDOFF.md` |
| Pre-launch checklist | bottom of `index.html` |
