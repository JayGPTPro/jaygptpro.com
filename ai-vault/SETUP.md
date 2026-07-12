# AI Vault Portal. Setup Guide (Jay's manual steps)

The portal works RIGHT NOW in demo mode (open `index.html`, everything renders with sample data).
To go live, walk these steps in order. Every step says exactly where to click.
Estimated total: about half a day, most of it waiting for Vimeo uploads.

---

## Step 1. New Supabase project (~10 min)

1. supabase.com → New project. Name: `ai-vault`. Region: closest to US East. Save the database password in your password manager.
2. Project Settings → API: copy the **Project URL** and the **anon public key**.
3. Open `assets/js/vault.js` and fill the two values at the top (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). This is what switches the portal from demo mode to live.
4. SQL Editor → paste and run the files in `supabase/migrations/` IN ORDER: `0001` through `0007` (schema, security, engagement, challenges, community, buying club, go-live ops).
5. Authentication → Providers → Google → enable. (Use the same Google Cloud OAuth client as Donna or create one. APIs and Services → OAuth consent screen must be **In production**, not Testing.)
6. Authentication → URL Configuration → Site URL: `https://jaygptpro.com/ai-vault/index.html`. Add `https://jaygptpro.com/ai-vault/*` to redirect URLs.
7. Make yourself admin. SQL Editor:
   ```sql
   -- run AFTER you sign in to the portal once with Google:
   insert into admin_users (user_id, role)
   select id, 'owner' from profiles where google_email = 'YOUR_GOOGLE_EMAIL';
   -- and give yourself free access:
   insert into comped_emails (email, note) values ('YOUR_GOOGLE_EMAIL', 'owner');
   update profiles set access_type = 'comped' where google_email = 'YOUR_GOOGLE_EMAIL';
   ```

## Step 2. Stripe (~15 min)

1. dashboard.stripe.com → Product catalog → Add product: **AI Vault Membership**.
2. Add price #1: $100 USD, recurring monthly. After saving, open the price → three-dot menu → set **lookup key** = `vault_monthly`.
3. Add price #2: $1,000 USD, recurring yearly. Lookup key = `vault_annual`.
4. Settings → Billing → Customer portal: enable cancel at period end, payment method update, invoice history, plan switching between the two prices.
5. Settings → Business → Branding: upload the vault logo, set brand color `#C9A227`.
6. Settings → Business → Public details: set the Terms of Service URL to `https://jaygptpro.com/ai-vault/terms.html` (the checkout asks for consent).
7. Coupons: create when you are ready to run promos (Product catalog → Coupons → then create a Promotion Code for each). Veteran coupons: duration = forever, amount = whatever keeps their old price ($20 off for the $80 crowd, $50 off for the $50 cohort).
8. Developers → API keys: copy the **Secret key** (starts sk_live, or sk_test while testing).

## Step 3. Deploy the edge functions (~15 min, Claude Code does this with you)

Needs the Supabase CLI (`brew install supabase/tap/supabase`), then from the `ai-vault/` folder:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF

supabase secrets set STRIPE_SECRET_KEY=sk_...
supabase secrets set RESEND_API_KEY_VAULT=re_...        # a NEW Resend key for the Vault
supabase secrets set SITE_URL=https://jaygptpro.com/ai-vault

supabase functions deploy create-checkout
supabase functions deploy create-portal-session
supabase functions deploy admin-api
supabase functions deploy stripe-webhook --no-verify-jwt   # Stripe calls it, not a browser
```

Then connect the webhook:
1. Stripe → Developers → Webhooks → Add endpoint: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
2. Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`
3. Copy the signing secret (whsec_...) → `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`
4. In the webhook settings, pin the API version to match the code: 2026-03-25.

## Step 4. Vimeo (~30 min + upload time)

1. Buy **Vimeo Standard, annual**.
2. Account settings → Videos → Privacy defaults: view = "Hide from Vimeo", embed = "Specific domains" → add `jaygptpro.com`, downloads OFF.
3. Upload the 17 episodes (folders: "Episodes Published"). For each video: Manage → the link contains `vimeo.com/VIDEO_ID/HASH`. You need both values.
4. Optional but recommended: upload a branded 1920x1080 thumbnail per episode, enable captions.

## Step 5. Publish the episodes (~30 min)

Sign in to the portal → open `admin.html` → publish each episode with its Vimeo ID + hash, tags, and the resources (the "all links in one place" content from Circle). Claude Code can also bulk-seed all 17 straight into the database from your Circle export, ask for it.

## Step 6. Go-live test (do all of these BEFORE sending anyone)

- [ ] In Stripe TEST mode first: pay with card 4242 4242 4242 4242 → welcome page → sign in → door opens → episode plays
- [ ] Refund the test payment in Stripe → confirm access dies (sign out + sign in)
- [ ] Real mode: pay yourself with a real card, then refund it (costs ~$3 in fees, worth it)
- [ ] Phone test: iPhone Safari → sign in, play video, resume position
- [ ] Cancel flow: account page → Manage billing → cancel → confirm access survives until period end
- [ ] Wrong-account flow: sign in with another Google account → see the "key does not fit" plate

## Step 7. Push live

The folder deploys with the site: `git add ai-vault && git commit && git push` (ask Claude Code, push needs your approval). The portal is then live at **jaygptpro.com/ai-vault/**.

Optional pretty entrance: nothing needed, that IS the URL.

---

## Notes

- **Legal pages** (`terms.html`, `privacy.html`, `refunds.html`) are solid reasonable defaults written for the Vault. They are not a law firm's work. Worth a one-time professional review when convenient.
- **The public repo is fine.** The anon key in vault.js is designed to be public; RLS inside Supabase is what protects the data. The secrets (service role, Stripe secret, Resend, webhook secret) live ONLY in Supabase edge function env, never in this repo.
- **Veteran migration (Phase B)** machinery is specced in `AI VAULT/docs/MIGRATION.md` and gets built when you say go.

## Round 5 additions (community, programs, deals)

- **WhatsApp links** live in the database (`feature_flags` key `whatsapp_links`, seeded by migration 0007) and are managed from the admin page (Portal settings). Until the community invite link is set, the button falls back to an email request flow. Demo mode still reads `assets/js/demo-data.js`.
- **Programs catalog** (`programs` table) and **Member Deals** (`tool_deals` table): both have admin forms now. The demo ships with the Ambassador challenge (free for members) and the Claude Code challenge (sample coupon VAULT-CC, replace with the real one), plus Genrupt with coupon JAY20.
- **Ask the AI Experts** is now a community board: members post questions and answer each other (RPCs `get_qa`/`add_reply`). Jay moderates with the service role.
