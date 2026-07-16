-- AI Vault. 5-day challenge engine (run fourth)
-- Cohort-style: day N unlocks at challenge.starts_at + (N-1) days. Late joiners see all past days open.

create table challenges (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  description text,
  hero_url    text,
  status      text not null default 'draft' check (status in ('draft','active','archived')),
  starts_at   timestamptz not null,
  created_at  timestamptz not null default now()
);

create table challenge_days (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  day_number   int not null check (day_number between 1 and 7),
  title        text not null,
  body         text,                 -- the day's mission, markdown-ish plain text
  vimeo_id     text,
  vimeo_hash   text,
  unique (challenge_id, day_number)
);

create table challenge_progress (
  user_id      uuid references profiles(id) on delete cascade,
  day_id       uuid references challenge_days(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, day_id)
);

alter table challenges         enable row level security;
alter table challenge_days     enable row level security;
alter table challenge_progress enable row level security;

create policy "members read challenges" on challenges     for select using (status in ('active','archived') and has_vault_access(auth.uid()));
-- day content stays hidden while the parent challenge is a draft
create policy "members read days"       on challenge_days for select using (has_vault_access(auth.uid()) and exists (select 1 from challenges c where c.id = challenge_id and c.status in ('active','archived')));
create policy "read own challenge prog" on challenge_progress for select using (user_id = auth.uid());

-- day content is readable, but COMPLETING a locked day is rejected server-side
create or replace function complete_challenge_day(p_slug text, p_day int)
returns void language plpgsql security definer set search_path = public as $$
declare did uuid; unlock_at timestamptz;
begin
  if not has_vault_access(auth.uid()) then raise exception 'no access'; end if;
  select d.id, c.starts_at + ((d.day_number - 1) * interval '1 day')
    into did, unlock_at
    from challenge_days d join challenges c on c.id = d.challenge_id
    where c.slug = p_slug and d.day_number = p_day and c.status in ('active','archived');
  if did is null then return; end if;
  if now() < unlock_at then raise exception 'day locked'; end if;
  insert into challenge_progress (user_id, day_id) values (auth.uid(), did) on conflict do nothing;
end; $$;
