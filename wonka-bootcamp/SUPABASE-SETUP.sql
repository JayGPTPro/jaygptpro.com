-- ============================================================
-- WONKA CREATIVE BOOTCAMP . round 1 database setup
-- Project: faqjilunlzljbgrnpcgi   (Supabase > SQL Editor > New query > paste > Run)
--
-- Run STEP 1 and STEP 2 now. STEP 3 is the RLS policies, run it once.
-- STEP 4 is the check: run it last and read the output.
-- The only thing you edit by hand is the email list in STEP 2.
-- ============================================================


-- ------------------------------------------------------------
-- STEP 1 . the round row
-- The portal reads this to know when each day unlocks. Day N opens at
-- 14:20 New York time on start_date + (N-1) days.
-- Round 1 starts Monday 27 July 2026, so day 10 opens 5 August.
-- ------------------------------------------------------------
insert into rounds (id, start_date)
values ('wonka_r1', '2026-07-27')
on conflict (id) do update set start_date = excluded.start_date;


-- ------------------------------------------------------------
-- STEP 2 . who is allowed in
-- One row per paying member. Replace the sample addresses with the real
-- buyer list; keep your own address in so you can get past the gate.
--   round = 'wonka_r1'  -> this bootcamp only
--   round = 'both'      -> all access, every round
--   early_access_max_day = N -> that member can open days 1..N before
--                               their unlock date (handy for a reviewer)
-- ------------------------------------------------------------
insert into allowed_emails (email, round, notes)
values
  ('info@jaygptpro.com',  'both',      'Jay . admin'),
  ('jmargaliot@gmail.com','both',      'Jay . second address'),
  ('buyer1@example.com',  'wonka_r1',  'round 1 buyer'),
  ('buyer2@example.com',  'wonka_r1',  'round 1 buyer')
on conflict (email) do update
  set round = excluded.round,
      notes = excluded.notes;


-- ------------------------------------------------------------
-- STEP 3 . row level security
-- The portal talks to Supabase with the public anon key, so these policies
-- are what actually decide who can read and write. Run once.
-- ------------------------------------------------------------
alter table allowed_emails enable row level security;
alter table user_progress  enable row level security;
alter table user_events    enable row level security;

-- anyone may check whether an address is on the list (that is the gate itself)
drop policy if exists wonka_allowed_read on allowed_emails;
create policy wonka_allowed_read on allowed_emails
  for select to anon
  using (round in ('wonka_r1', 'both'));

-- progress and events: writable only for this round
drop policy if exists wonka_progress_read on user_progress;
create policy wonka_progress_read on user_progress
  for select to anon using (round = 'wonka_r1');

drop policy if exists wonka_progress_write on user_progress;
create policy wonka_progress_write on user_progress
  for insert to anon with check (round = 'wonka_r1');

drop policy if exists wonka_progress_update on user_progress;
create policy wonka_progress_update on user_progress
  for update to anon using (round = 'wonka_r1') with check (round = 'wonka_r1');

drop policy if exists wonka_events_write on user_events;
create policy wonka_events_write on user_events
  for insert to anon with check (round = 'wonka_r1');


-- ------------------------------------------------------------
-- STEP 4 . check it worked
-- Expect: one round row dated 2026-07-27, your emails listed,
-- and a policy row for each of the five policies above.
-- ------------------------------------------------------------
select 'round'   as what, id as a, start_date::text as b from rounds where id = 'wonka_r1'
union all
select 'member', email, round from allowed_emails where round in ('wonka_r1','both')
union all
select 'policy', tablename, policyname from pg_policies
where policyname like 'wonka_%'
order by what, a;


-- ============================================================
-- NOT SQL . two things to click in the dashboard afterwards
--
-- 1. Authentication > URL Configuration > Redirect URLs
--    add:  https://jaygptpro.com/wonka-bootcamp/
--    Without this the magic-link email bounces the member to a blank page.
--
-- 2. Sign in at https://jaygptpro.com/wonka-bootcamp/ with an address that is
--    NOT on the list, and confirm you are refused. A gate that never says no
--    has not been tested.
-- ============================================================
