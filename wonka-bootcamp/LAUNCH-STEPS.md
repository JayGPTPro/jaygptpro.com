# Wonka Bootcamp . what Jay has to do

Round 1 opens **Monday 27 July 2026**. Everything below is the part a machine
cannot do: it needs your accounts, your decisions, or your money.

Everything else is done. The portal, the map, the day pages, the locked-day
state, the completion flow and mobile have all been tested end to end.

---

## 1. Open the database gate  (10 minutes, do this first)

Nobody can log in until this is done. Not even you.

**This is the same Supabase project that runs your live Donna Challenge.** The
project is named `donna-challenge` in your dashboard, not `faqjilunlzljbgrnpcgi`
(that is its internal id). Wonka reuses Donna's tables and just adds its own
round, the same way Donna's own rounds sit side by side. I rewrote the script so
it **only inserts rows** and never touches anything Donna depends on.

1. Go to **https://supabase.com** and open the project **`donna-challenge`**.
2. Left sidebar → **SQL Editor** → **New query**.
3. Open the file `SUPABASE-SETUP.sql` (same folder as this one), copy all of it,
   paste it into the box.
4. **Before running**, find STEP 2 in the pasted text and replace
   `buyer1@example.com` / `buyer2@example.com` with the real buyer addresses,
   one line each. Your two addresses are already in the list.
   **If a buyer is also a Donna member, leave them out and tell me** . moving
   them to the Wonka round would disturb their Donna access, so that case needs
   handling separately.
5. Press **Run**.
6. Read the table it prints at the bottom. You should see the `wonka_r1` round
   dated 2026-07-27 and your members. If you see an error, copy it back to me.

Then two things that are not SQL:

7. Left sidebar → **Authentication** → **URL Configuration** → **Redirect URLs**
   → add `https://jaygptpro.com/wonka-bootcamp/` → Save. Donna's existing URLs
   stay; you are adding one. Without this the login email lands on a blank page.
8. Open `https://jaygptpro.com/wonka-bootcamp/` in a private window and try to
   sign in with an address that is **not** on the list. It must refuse you.
   A gate that has never said no has not been tested.

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
