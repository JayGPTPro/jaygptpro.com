-- AI Vault. Go-live operations (run seventh)
-- 1. WhatsApp links move from hardcoded JS into feature_flags (admin-editable)
-- 2. Start Here lessons get their CTA columns + the real 8-lesson seed
-- 3. Consultations self-heal: current quarter auto-created, stale ones expire

-- ===== 1. WhatsApp links =====
insert into feature_flags (key, enabled, payload) values
  ('whatsapp_links', true,
   '{"community_url": "", "updates_url": "https://chat.whatsapp.com/FWEhjKesDrvAP8wugfVbIs"}')
on conflict (key) do nothing;

create or replace function get_whatsapp_links()
returns jsonb language sql stable security definer set search_path = public as $$
  select payload from feature_flags
  where key = 'whatsapp_links' and enabled and has_vault_access(auth.uid());
$$;

-- ===== 2. Start Here lessons =====
alter table lessons add column if not exists cta  text;
alter table lessons add column if not exists link text;

insert into lessons (position, title, body, cta, link) values
  (1, 'Welcome to the Vault', 'What is inside, how to use it, and your first 10 minutes. Watch the newest episode when you are done here.', 'See the latest episode', '/ai-vault/episodes.html'),
  (2, 'Your quick win: run your first prompt', 'Open the Prompt Vault, grab one prompt, and run it on your own listing. Right now. This is the ten-minute win.', 'Open the Prompt Vault', 'https://prompt.jaygptpro.com'),
  (3, 'Find episodes by your problem', 'The library is tagged by problem, not by date. Filter to what you are stuck on and start there.', 'Browse AI Episodes', '/ai-vault/episodes.html'),
  (4, 'Join the WhatsApp group', 'This is where the daily conversation happens and where you get help fastest. Join and say hi.', 'Join the group', '/ai-vault/whatsapp.html'),
  (5, 'The AI Toolbox', 'The curated set of tools worth your money right now, kept current. Bookmark it.', 'Open the AI Toolbox', 'https://jaygptpro.com/ai-toolbox'),
  (6, 'Live sessions and masterminds', 'One deep dive and one mastermind every month. Add the next one to your calendar so you do not miss it.', 'See what is upcoming', '/ai-vault/live.html'),
  (7, 'Claim your quarterly 1-on-1', 'A private strategy call with Jay, a $400 session, included every quarter. It expires if you do not use it.', 'Book your call', '/ai-vault/consultation.html'),
  (8, 'The Buying Club', 'Member pricing on the tools you already pay for. Most members save more than the membership costs.', 'See member deals', '/ai-vault/tools.html')
on conflict (position) do nothing;

-- ===== 3. Consultations =====
-- Ensures the signed-in member always has a row for the current quarter and
-- expires 'available' rows from past quarters ('2026-Q3' sorts correctly as text).
create or replace function get_my_consultations()
returns setof consultations language plpgsql security definer set search_path = public as $$
declare cur_q text := to_char(now(), 'YYYY-"Q"Q');
begin
  if not has_vault_access(auth.uid()) then return; end if;
  update consultations set status = 'expired', updated_at = now()
    where user_id = auth.uid() and status = 'available' and quarter < cur_q;
  insert into consultations (user_id, quarter)
    values (auth.uid(), cur_q)
    on conflict (user_id, quarter) do nothing;
  return query select * from consultations where user_id = auth.uid() order by quarter;
end; $$;
