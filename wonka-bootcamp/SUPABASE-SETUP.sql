-- ============================================================
-- WONKA CREATIVE BOOTCAMP . Supabase
--
-- THIS DATABASE IS SHARED. The project ref faqjilunlzljbgrnpcgi appears in
-- Jay's dashboard as the project named `donna-challenge`, and it runs the
-- LIVE Donna Challenge portals (English + Bina) as well as Wonka. The tables
-- (rounds, allowed_emails, user_progress, user_events), their columns and
-- their RLS policies already exist and are in daily use.
--
-- So everything here only INSERTS or UPDATES Wonka's own rows. No DDL, no
-- policy changes, nothing Donna depends on. Wonka rows are kept apart by
-- round = 'wonka_r1', the same way Donna's rounds sit beside each other.
--
-- Supabase > SQL Editor > New query > paste > Run.
-- ============================================================


-- ============================================================
-- ALREADY DONE on 20.7 . do not run again unless rebuilding
--   * the wonka_r1 round row exists
--   * info@jaygptpro.com and jmargaliot@gmail.com can get in
-- Jay's two addresses sit in allowed_emails as round='both', which is
-- DONNA's all-access value. Wonka's gate no longer honours 'both', so they
-- enter via ADMIN_EMAILS in index.html instead. Do NOT "fix" those rows to a
-- Wonka value: that would strip their Donna access.
-- ============================================================


-- ------------------------------------------------------------
-- ALREADY RUN (8.8). Round 1 is 1 to 17 September 2026, in three bands:
-- 1-4 Sept, 8-10 Sept, 15-17 Sept. The header used to say August; the August
-- dates are dead and only the September ones below are real.
-- Day N unlocks at 9:00 AM New York (16:00 Israel), the same moment the
-- landing page countdown reaches zero.
-- ------------------------------------------------------------
-- The 697 price forced a NEW payment link on 8.8 (Stripe prices are immutable and
-- a link's price cannot be swapped). stripe-webhook resolves the round from the
-- plink id first (roundFromPlink), so a stale id here silently drops every buyer
-- to the stripe_product_id fallback. Set the new one, and do NOT touch
-- stripe_plink_discounted until you have SEEN what is in it: if the Private Tour
-- link was parked there, clearing it breaks that buyer's routing.
-- ------------------------------------------------------------
-- look before you write:
-- select id, start_date::text, end_date::text,
--        stripe_plink_full_price, stripe_plink_discounted, stripe_product_id
--   from rounds where id = 'wonka_r1';

update rounds
   set start_date              = '2026-09-01',
       end_date                = '2026-09-17',
       welcome_dates_display   = 'September 1 . 17, 2026',
       stripe_plink_full_price = 'plink_1U1vCERqcDuiISNTjqJvj1P5'
 where id = 'wonka_r1';

-- NOTE: start_date and end_date only bracket the round. The daily unlocks come
-- from CONFIG.DAY_DATES in the portal, because the schedule skips whole days
-- (Tue-Fri, Tue-Thu, Tue-Thu). Moving these dates does NOT move the doors.
--
-- check: expect one row, wonka_r1 | 2026-09-01 | 2026-09-17
select id, start_date::text, end_date::text, status,
       stripe_plink_full_price, stripe_product_id
  from rounds where id = 'wonka_r1';


-- ============================================================
-- REFERENCE . not needed today
-- ============================================================

-- ---- creating the round from scratch (a future Wonka round) -------------
-- The rounds table has several NOT NULL columns beyond id/start_date; this is
-- the shape a real Donna round uses, which is why the first attempt on 20.7
-- failed on a null "name".
--
-- insert into rounds
--   (id, name, start_date, end_date, language, status,
--    target_paid, welcome_dates_display, whatsapp_link, portal_url, notes)
-- values
--   ('wonka_r2', 'Wonka Creative Bootcamp . Round 2',
--    'YYYY-MM-DD', 'YYYY-MM-DD', 'en', 'upcoming',
--    50, 'Month D . D, YYYY', '',
--    'https://jaygptpro.com/wonka-bootcamp/', 'Second Wonka round')
-- on conflict (id) do update
--   set name = excluded.name, start_date = excluded.start_date,
--       end_date = excluded.end_date;


-- ---- adding buyers as they come ----------------------------------------
-- One row per paying member.
--   round = 'wonka_r1'   this bootcamp
--   round = 'wonka_all'  every Wonka round
--   early_access_max_day = N  may open days 1..N before their unlock date
--
-- WARNING on conflict: if an address already exists (a Donna member who also
-- buys Wonka), the update below MOVES them to the Wonka round and they lose
-- Donna. Do not list such buyers here; that case is handled separately.
--
-- insert into allowed_emails (email, round, notes)
-- values
--   ('buyer@example.com', 'wonka_r1', 'round 1 buyer')
-- on conflict (email) do update
--   set round = excluded.round, notes = excluded.notes;


-- ---- who can currently get into Wonka -----------------------------------
-- select email, round, notes from allowed_emails
--  where round in ('wonka_r1', 'wonka_all') order by email;


-- ============================================================
-- NOT SQL . two dashboard steps, still open
--
-- 1. Authentication > URL Configuration > Redirect URLs
--    add:  https://jaygptpro.com/wonka-bootcamp/
--    (Donna's existing URLs stay; you are ADDING one, not replacing.)
--
-- 2. Sign in at https://jaygptpro.com/wonka-bootcamp/ with an address that is
--    NOT on the list and confirm you are refused, then with your own and
--    confirm you get in. A gate that has never said no has not been tested.
-- ============================================================
