-- Content Desk: database schema for the Supabase project "jaygptpro-team" (ref sjdcvjunibwxkwqzjitw).
-- Run once in the SQL editor. Safe to re-run: every statement is idempotent.
--
-- Access model: a signed-in Google account can read or write only if its email is an
-- active row in team_members. "Automatically expose new tables" is off on this project,
-- so nothing is reachable until it is granted below, and anon gets nothing at all.
-- Team members and their emails are NOT in this file (the repo is public); they are
-- inserted from the dashboard.

create extension if not exists pgcrypto;

-- ---------- team ----------
create table if not exists public.team_members (
  email      text primary key check (email = lower(email)),
  name       text not null,
  role       text not null check (role in ('owner', 'writer')),
  color      text not null default '#2b4f86',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.desk_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where email = public.desk_email() and active)
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where email = public.desk_email() and active and role = 'owner')
$$;

-- ---------- posts ----------
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,                       -- working title, English
  title_he      text,
  category      text not null default 'tip' check (category in ('news', 'tip', 'skill', 'deals', 'other')),
  stage         text not null default 'idea' check (stage in ('idea', 'draft', 'final', 'ready', 'published')),   -- the board column
  status        text not null default 'waiting' check (status in ('waiting', 'approved', 'changes', 'rejected')), -- Jay's answer on that column
  idea          text,                                -- the pitch: hook, why now, what readers get
  idea_he       text,
  author        text not null default public.desk_email(),
  score         int check (score between 1 and 10),  -- the writer's own score for the idea
  covered_before text,                               -- "you posted X on 29 Mar" style note
  news_date     date,                                -- when the news itself came out
  tried_myself  boolean,                             -- has Jay tried it himself
  text_ok       boolean not null default false,      -- unused since migration 2, kept for old rows
  hot           boolean not null default false,      -- jumps to the front of the queue
  pinned_date   date,                                -- the publishing date
  queue_pos     double precision not null default extract(epoch from now()),
  email_too     boolean not null default false,      -- also goes out as an email
  skip_reason   text,
  published_at  timestamptz,
  published_text text,
  reactions     int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    text default public.desk_email()
);
create index if not exists posts_stage_idx on public.posts (stage);
create index if not exists posts_status_idx on public.posts (status);

-- ---------- versions (one row per saved draft, per channel) ----------
create table if not exists public.versions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  channel     text not null default 'whatsapp' check (channel in ('whatsapp', 'email', 'linkedin', 'x')),
  n           int not null,
  headlines   jsonb not null default '[]'::jsonb,   -- [{ "en": "...", "he": "...", "pick": true }]
  chosen      int,                                 -- index into headlines picked by the owner
  body        text not null default '',
  body_he     text,
  sources     jsonb not null default '[]'::jsonb,   -- [{ "url": "...", "label": "...", "official": true }]
  writer_note text,                                -- "what changed" / notes for Jay
  writer_note_he text,
  author      text not null default public.desk_email(),
  created_at  timestamptz not null default now(),
  unique (post_id, channel, n)
);
create index if not exists versions_post_idx on public.versions (post_id);

-- ---------- notes, questions, team comments ----------
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  kind        text not null default 'note' check (kind in ('note', 'question', 'team')),
  body        text not null,
  body_he     text,
  version_n   int,                                 -- version the note was written on
  status      text not null default 'open' check (status in ('open', 'closed')),
  closed_in   int,                                 -- version that fixed it
  answer      text,                                -- for questions
  answer_he   text,
  answered_by text,
  is_rule     boolean not null default false,
  author      text not null default public.desk_email(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists notes_post_idx on public.notes (post_id);

-- ---------- visuals ----------
create table if not exists public.assets (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  path       text not null unique,                 -- storage path in bucket "desk"
  filename   text not null,
  mime       text,
  size       bigint,
  stage      text not null default 'sketch' check (stage in ('sketch', 'final')),
  status     text not null default 'pending' check (status in ('pending', 'approved', 'replaced')),
  note       text,
  author     text not null default public.desk_email(),
  created_at timestamptz not null default now()
);
create index if not exists assets_post_idx on public.assets (post_id);

-- ---------- house rules and settings ----------
create table if not exists public.rules (
  id         uuid primary key default gen_random_uuid(),
  body       text not null,
  body_he    text,
  source     text,                                 -- the quote it came from, with a date
  check_key  text check (check_key in ('headlines', 'brackets', 'cta', 'length', 'tried')),
  sort       int not null default 100,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- triggers ----------
-- A row without its translation columns and its own timestamps, so that a background
-- translation does not count as someone touching the post.
create or replace function public.desk_strip(j jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(j)
  where key not like '%\_he' and key not in ('updated_at', 'updated_by')
$$;

create or replace function public.desk_touch() returns trigger
language plpgsql as $$
begin
  if public.desk_strip(to_jsonb(new)) = public.desk_strip(to_jsonb(old)) then
    new.updated_at := old.updated_at;
    if tg_table_name = 'posts' then new.updated_by := old.updated_by; end if;
    return new;
  end if;
  new.updated_at := now();
  if tg_table_name = 'posts' then new.updated_by := public.desk_email(); end if;
  return new;
end $$;

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts for each row execute function public.desk_touch();
drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes for each row execute function public.desk_touch();

-- Who may do what. Jay (owner) may do anything. A writer may:
--   create an idea or a first draft (it always starts as waiting),
--   move an approved idea to a first draft and an approved first draft to the final version,
--   send a post back to Jay (status waiting) after changes,
--   change dates, hot and the other details.
-- Only Jay approves, sends back, rejects, moves to ready and marks published.
create or replace function public.desk_stage_guard() returns trigger
language plpgsql as $$
begin
  -- the dashboard SQL editor and server code run without a signed-in user
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if public.is_owner() then return new; end if;
  if tg_op = 'INSERT' then
    if new.stage not in ('idea', 'draft') then
      raise exception 'Only the owner can create a post in %', new.stage;
    end if;
    new.status := 'waiting';
    new.published_at := null;
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status <> 'waiting' then
      raise exception 'Only the owner can set the status to %', new.status;
    end if;
    if old.status = 'rejected' then
      raise exception 'Only the owner can bring back a rejected post';
    end if;
    if new.stage not in ('idea', 'draft', 'final') then
      raise exception 'Only the owner can change the status of a % post', new.stage;
    end if;
  end if;
  if new.stage is distinct from old.stage then
    -- a writer moves an approved idea or draft one column on, and it goes to Jay
    if not ((old.stage = 'idea' and new.stage = 'draft' and old.status = 'approved' and new.status = 'waiting')
         or (old.stage = 'draft' and new.stage = 'final' and old.status = 'approved' and new.status = 'waiting')) then
      raise exception 'Only the owner can move a post from % to %', old.stage, new.stage;
    end if;
  end if;
  if new.published_at is distinct from old.published_at
     or new.published_text is distinct from old.published_text
     or new.reactions is distinct from old.reactions
     or new.author is distinct from old.author then
    raise exception 'Only the owner can change this';
  end if;
  -- a published post is done: writers only add translations to it
  if old.stage = 'published' and public.desk_strip(to_jsonb(new)) is distinct from public.desk_strip(to_jsonb(old)) then
    raise exception 'Only the owner can change a published post';
  end if;
  return new;
end $$;

drop trigger if exists posts_stage_guard on public.posts;
create trigger posts_stage_guard before insert or update on public.posts
  for each row execute function public.desk_stage_guard();

-- A version row without its translations: every *_he column and the "he" inside each headline.
create or replace function public.desk_version_core(j jsonb) returns jsonb
language sql immutable as $$
  select public.desk_strip(j - 'headlines') || jsonb_build_object('headlines',
    coalesce((select jsonb_agg(h - 'he' order by i) from jsonb_array_elements(j -> 'headlines') with ordinality as x(h, i)), '[]'::jsonb))
$$;

-- Once Jay approved a post (ready or published), only he changes its text.
create or replace function public.desk_version_guard() returns trigger
language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if public.is_owner() then return new; end if;
  if (select stage from public.posts where id = new.post_id) not in ('ready', 'published') then
    return new;
  end if;
  -- on an approved post a writer may only add translations (the *_he columns and each headline's "he")
  if tg_op = 'UPDATE' and new.post_id = old.post_id
     and public.desk_version_core(to_jsonb(new)) = public.desk_version_core(to_jsonb(old)) then
    return new;
  end if;
  raise exception 'Jay already approved this post. Ask him to send it back before changing the text';
end $$;

drop trigger if exists versions_guard on public.versions;
create trigger versions_guard before insert or update on public.versions
  for each row execute function public.desk_version_guard();

-- Writers cannot approve their own visuals.
create or replace function public.desk_asset_guard() returns trigger
language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if public.is_owner() then return new; end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    raise exception 'Only the owner can approve a visual';
  end if;
  return new;
end $$;

drop trigger if exists assets_guard on public.assets;
create trigger assets_guard before insert or update on public.assets for each row execute function public.desk_asset_guard();

-- ---------- row level security ----------
alter table public.team_members enable row level security;
alter table public.posts        enable row level security;
alter table public.versions     enable row level security;
alter table public.notes        enable row level security;
alter table public.assets       enable row level security;
alter table public.rules        enable row level security;
alter table public.settings     enable row level security;

revoke all on public.team_members, public.posts, public.versions, public.notes,
              public.assets, public.rules, public.settings from anon;
grant select, insert, update, delete on public.team_members, public.posts, public.versions,
              public.notes, public.assets, public.rules, public.settings to authenticated;

do $$
declare t text;
begin
  -- the team reads everything and writes posts, versions, notes and assets
  foreach t in array array['posts', 'versions', 'notes', 'assets'] loop
    execute format('drop policy if exists team_read on public.%I', t);
    execute format('create policy team_read on public.%I for select to authenticated using (public.is_team())', t);
    execute format('drop policy if exists team_insert on public.%I', t);
    execute format('create policy team_insert on public.%I for insert to authenticated with check (public.is_team())', t);
    execute format('drop policy if exists team_update on public.%I', t);
    execute format('create policy team_update on public.%I for update to authenticated using (public.is_team()) with check (public.is_team())', t);
    execute format('drop policy if exists owner_delete on public.%I', t);
    execute format('create policy owner_delete on public.%I for delete to authenticated using (public.is_owner())', t);
  end loop;
  -- the team reads members, rules and settings; only the owner changes them
  foreach t in array array['team_members', 'rules', 'settings'] loop
    execute format('drop policy if exists team_read on public.%I', t);
    execute format('create policy team_read on public.%I for select to authenticated using (public.is_team())', t);
    execute format('drop policy if exists owner_write on public.%I', t);
    execute format('create policy owner_write on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
end $$;

-- A writer may delete their own sketch upload and their own notes.
drop policy if exists author_delete on public.assets;
create policy author_delete on public.assets for delete to authenticated
  using (public.is_team() and author = public.desk_email() and status <> 'approved');
drop policy if exists author_delete on public.notes;
create policy author_delete on public.notes for delete to authenticated
  using (public.is_team() and author = public.desk_email());

-- ---------- storage: private bucket "desk" ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('desk', 'desk', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists desk_team_read on storage.objects;
create policy desk_team_read on storage.objects for select to authenticated
  using (bucket_id = 'desk' and public.is_team());
drop policy if exists desk_team_insert on storage.objects;
create policy desk_team_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'desk' and public.is_team());
-- Overwriting or deleting a file: the owner, or the person who uploaded it while it isn't approved.
drop policy if exists desk_team_update on storage.objects;
create policy desk_team_update on storage.objects for update to authenticated
  using (bucket_id = 'desk' and (public.is_owner() or (public.is_team() and owner_id = (select auth.uid())::text
    and not exists (select 1 from public.assets a where a.path = name and a.status = 'approved'))))
  with check (bucket_id = 'desk' and public.is_team());
drop policy if exists desk_team_delete on storage.objects;
create policy desk_team_delete on storage.objects for delete to authenticated
  using (bucket_id = 'desk' and (public.is_owner() or (public.is_team() and owner_id = (select auth.uid())::text
    and not exists (select 1 from public.assets a where a.path = name and a.status = 'approved'))));
