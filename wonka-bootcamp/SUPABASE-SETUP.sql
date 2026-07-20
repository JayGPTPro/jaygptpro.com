-- ============================================================
-- WONKA CREATIVE BOOTCAMP . round 1 database setup
--
-- IMPORTANT: this database is SHARED. The project ref
-- faqjilunlzljbgrnpcgi is the same one that runs the LIVE Donna Challenge
-- (English + Bina) portals. The tables (rounds, allowed_emails,
-- user_progress, user_events) and their row-level-security policies ALREADY
-- EXIST and are in daily use.
--
-- Therefore this script ONLY INSERTS ROWS. It does not create tables, does
-- not touch RLS, does not drop or replace any policy. Wonka rows are kept
-- apart from Donna's by round = 'wonka_r1', exactly the way Donna keeps her
-- own rounds apart from each other. Verified 20.7: the existing SELECT policy
-- already lets the portal read any allowed_emails row by address, and the
-- existing write policies already accept user_progress / user_events inserts,
-- so no policy change is needed for Wonka to work.
--
-- Supabase > SQL Editor > New query > paste all > edit STEP 2 > Run.
-- ============================================================


-- ------------------------------------------------------------
-- STEP 1 . the round row
-- Day N unlocks at 9:00 AM New York on start_date + (N-1) days.
-- Round 1 starts Monday 27 July 2026 (day 10 opens 5 August).
-- 'wonka_r1' is a brand-new id, so this cannot collide with any Donna round.
-- ------------------------------------------------------------
insert into rounds (id, start_date)
values ('wonka_r1', '2026-07-27')
on conflict (id) do update set start_date = excluded.start_date;


-- ------------------------------------------------------------
-- STEP 2 . who is allowed in
-- One row per paying member. Replace the two sample lines with the real
-- buyers, one per line. Your two addresses are already here.
--   round = 'wonka_r1'   -> this bootcamp
--   round = 'wonka_all'  -> every Wonka round (Donna's 'both' does NOT open
--                           Wonka; the table is shared and 'both' is hers)
--   early_access_max_day = N -> may open days 1..N before their unlock date
--
-- on conflict (email): if an address already exists (e.g. a Donna member who
-- also bought Wonka), this MOVES them to the Wonka round. If you have buyers
-- who are in BOTH programs, do not list them here . tell me and we handle
-- that case separately so their Donna access is not disturbed.
-- ------------------------------------------------------------
insert into allowed_emails (email, round, notes)
values
  ('info@jaygptpro.com',   'both',     'Jay . admin'),
  ('jmargaliot@gmail.com', 'both',     'Jay . second address'),
  ('buyer1@example.com',   'wonka_r1', 'round 1 buyer'),
  ('buyer2@example.com',   'wonka_r1', 'round 1 buyer')
on conflict (email) do update
  set round = excluded.round,
      notes = excluded.notes;


-- ------------------------------------------------------------
-- STEP 3 . check it worked (reads only, changes nothing)
-- Expect: the wonka_r1 round dated 2026-07-27, and your members.
-- ------------------------------------------------------------
select 'round'  as what, id    as a, start_date::text as b
  from rounds where id = 'wonka_r1'
union all
select 'member', email, round
  from allowed_emails where round in ('wonka_r1', 'both')
order by what, a;


-- ============================================================
-- NOT SQL . two dashboard steps afterwards
--
-- 1. Authentication > URL Configuration > Redirect URLs
--    add:  https://jaygptpro.com/wonka-bootcamp/
--    (Donna's existing URLs stay; you are ADDING one, not replacing.)
--
-- 2. Sign in at https://jaygptpro.com/wonka-bootcamp/ with an address that is
--    NOT on the list and confirm you are refused.
-- ============================================================
