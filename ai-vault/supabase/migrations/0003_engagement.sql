-- AI Vault. Engagement layer: reactions, private ratings, questions, consultations, social proof
-- (run third)

-- Jay-controlled social proof
alter table episodes add column likes_base int not null default 0;
insert into feature_flags (key, enabled, payload) values
  ('member_counter', true, '{"base": 213, "base_date": "2026-07-11", "days_per_member": 2}');

-- member reactions: like / watch later / more like this
create table episode_reactions (
  user_id    uuid references profiles(id) on delete cascade,
  episode_id uuid references episodes(id) on delete cascade,
  kind       text not null check (kind in ('like','watch_later','more_please')),
  created_at timestamptz not null default now(),
  primary key (user_id, episode_id, kind)
);
create index on episode_reactions (episode_id, kind);

-- private ratings: ONLY Jay sees results (no member-facing read policy)
create table episode_ratings (
  user_id    uuid references profiles(id) on delete cascade,
  episode_id uuid references episodes(id) on delete cascade,
  stars      int not null check (stars between 1 and 5),
  note       text,
  updated_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);

-- Ask Jay / Ask the AI Experts
create table questions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  body        text not null,
  context_ref text,                 -- episode slug or page it was asked from
  created_at  timestamptz not null default now(),
  answered_at timestamptz,
  answer      text,
  public      boolean not null default false   -- Jay can publish good Q&As
);

-- quarterly 1-on-1 strategy calls
create table consultations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  quarter       text not null,      -- '2026-Q3'
  status        text not null default 'available' check (status in ('available','booked','done','expired')),
  scheduled_for timestamptz,
  notes         text,
  updated_at    timestamptz not null default now(),
  unique (user_id, quarter)
);

-- monthly masterminds on the schedule board
alter table live_sessions add column kind text not null default 'episode'
  check (kind in ('episode','mastermind','workshop'));

-- ===== RLS =====
alter table episode_reactions enable row level security;
alter table episode_ratings   enable row level security;
alter table questions         enable row level security;
alter table consultations     enable row level security;

create policy "read own reactions"  on episode_reactions for select using (user_id = auth.uid());
create policy "read own questions"  on questions         for select using (user_id = auth.uid());
create policy "read public answers" on questions         for select using (public = true and has_vault_access(auth.uid()));
create policy "read own consults"   on consultations     for select using (user_id = auth.uid());
-- episode_ratings: NO select policy for members at all. Write via RPC only. Jay reads with service role.

-- ===== RPCs (all writes validated server-side) =====
create or replace function react_episode(p_slug text, p_kind text, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  if not has_vault_access(auth.uid()) then raise exception 'no access'; end if;
  if p_kind not in ('like','watch_later','more_please') then raise exception 'bad kind'; end if;
  select id into eid from episodes where slug = p_slug and status = 'published';
  if eid is null then return; end if;
  if p_on then
    insert into episode_reactions (user_id, episode_id, kind) values (auth.uid(), eid, p_kind) on conflict do nothing;
  else
    delete from episode_reactions where user_id = auth.uid() and episode_id = eid and kind = p_kind;
  end if;
end; $$;

create or replace function rate_episode(p_slug text, p_stars int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  if not has_vault_access(auth.uid()) then raise exception 'no access'; end if;
  if p_stars < 1 or p_stars > 5 then raise exception 'bad stars'; end if;
  select id into eid from episodes where slug = p_slug and status = 'published';
  if eid is null then return; end if;
  insert into episode_ratings (user_id, episode_id, stars, note, updated_at)
  values (auth.uid(), eid, p_stars, p_note, now())
  on conflict (user_id, episode_id) do update set stars = excluded.stars, note = excluded.note, updated_at = now();
end; $$;

create or replace function ask_question(p_body text, p_context text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_vault_access(auth.uid()) then raise exception 'no access'; end if;
  if length(trim(p_body)) < 5 then raise exception 'too short'; end if;
  insert into questions (user_id, body, context_ref) values (auth.uid(), left(p_body, 4000), p_context);
end; $$;

-- public like counts: likes_base + real likes, exposed per published episode
create or replace function get_episode_social()
returns table (slug text, likes int, my_like boolean, my_watch_later boolean, my_more boolean, my_stars int)
language sql stable security definer set search_path = public as $$
  select e.slug,
    e.likes_base + (select count(*) from episode_reactions r where r.episode_id = e.id and r.kind = 'like')::int,
    exists (select 1 from episode_reactions r where r.episode_id = e.id and r.kind = 'like' and r.user_id = auth.uid()),
    exists (select 1 from episode_reactions r where r.episode_id = e.id and r.kind = 'watch_later' and r.user_id = auth.uid()),
    exists (select 1 from episode_reactions r where r.episode_id = e.id and r.kind = 'more_please' and r.user_id = auth.uid()),
    (select stars from episode_ratings x where x.episode_id = e.id and x.user_id = auth.uid())
  from episodes e where e.status = 'published' and has_vault_access(auth.uid());
$$;

-- displayed member count (Jay-controlled base + slow automatic growth)
create or replace function get_member_count()
returns int language sql stable security definer set search_path = public as $$
  select (payload->>'base')::int +
         greatest(0, (extract(epoch from (now() - (payload->>'base_date')::timestamptz)) / 86400 / nullif((payload->>'days_per_member')::int, 0))::int)
  from feature_flags where key = 'member_counter' and enabled;
$$;
