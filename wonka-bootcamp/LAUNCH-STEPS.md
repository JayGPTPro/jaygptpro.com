# Wonka Bootcamp . what Jay has to do

Round 1 opens **Monday 27 July 2026**. Everything below is the part a machine
cannot do: it needs your accounts, your decisions, or your money.

Everything else is done. The portal, the map, the day pages, the locked-day
state, the completion flow and mobile have all been tested end to end.

---

## 1. Open the database gate  (20 minutes, do this first)

Nobody can log in until this is done. Not even you.

1. Go to **https://supabase.com** and open the project `faqjilunlzljbgrnpcgi`.
2. Left sidebar → **SQL Editor** → **New query**.
3. Open the file `SUPABASE-SETUP.sql` (same folder as this one), copy all of it,
   paste it into the box.
4. **Before running**, find STEP 2 in the pasted text and replace
   `buyer1@example.com` / `buyer2@example.com` with the real buyer addresses,
   one line each. Your two addresses are already in the list.
5. Press **Run**.
6. Read the table it prints at the bottom. You should see one `round` row dated
   2026-07-27, your members, and five `policy` rows. If you see an error
   instead, copy it back to me.

Then two things that are not SQL:

7. Left sidebar → **Authentication** → **URL Configuration** → **Redirect URLs**
   → add `https://jaygptpro.com/wonka-bootcamp/` → Save.
   Without this the login email sends people to a blank page.
8. Open `https://jaygptpro.com/wonka-bootcamp/` in a private window and try to
   sign in with an address that is **not** on the list. It must refuse you.
   A gate that has never said no has not been tested.

---

## 2. Decide one number: when does a day open?  (2 minutes)

**There is a 5 hour 20 minute hole on launch day and it will generate support
emails.**

- Your landing page counts down to **9:00 AM New York** on 27 July.
- The portal does not unlock Day 1 until **2:20 PM New York**.

So a customer whose countdown hits zero logs in, finds every door locked, and
writes to you. Pick one:

- **Option A (recommended):** move the portal to 9:00 AM New York so it matches
  what the landing page already promises. 9 AM is also a better daily habit for
  a US audience. One line, tell me and it is done.
- **Option B:** move the landing countdown to 2:20 PM New York instead.

Either is fine. Leaving them different is the only wrong answer.

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
