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


-- ===== migration 3 (16.11.2026), kept here too so this file alone rebuilds the database =====
-- Content Desk migration 3 (16.11.2026): tighter writer permissions, email on a Ready post,
-- sign-in hardening, and a daily cap on AI calls. Safe to run twice.

-- 1. Who wrote a row is decided by the database, and rows cannot be moved or re-signed.
--    Jay (owner) and server code are not limited.
create or replace function public.desk_row_guard() returns trigger
language plpgsql as $$
declare
  me text := public.desk_email();
  o jsonb;
  n jsonb;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if public.is_owner() then return new; end if;
  if tg_op = 'INSERT' then
    new.author := me;                       -- nobody writes in someone else's name
    return new;
  end if;
  if new.author is distinct from old.author then
    raise exception 'Only the owner can change who wrote this';
  end if;
  -- one table at a time: a column is only read inside the block of the table that has it
  if tg_table_name <> 'posts' then
    if new.post_id is distinct from old.post_id then
      raise exception 'Only the owner can move this to another post';
    end if;
  end if;
  if tg_table_name = 'versions' then
    if new.n is distinct from old.n or new.channel is distinct from old.channel then
      raise exception 'Only the owner can renumber a version';
    end if;
  end if;
  if tg_table_name = 'notes' then
    if new.is_rule is distinct from old.is_rule then
      raise exception 'Only the owner can make a house rule';
    end if;
    -- on someone else's note a writer may only tick it fixed or open it again (and add a translation)
    if old.author <> me then
      o := public.desk_strip(to_jsonb(old)) - 'status' - 'closed_in' - 'updated_at';
      n := public.desk_strip(to_jsonb(new)) - 'status' - 'closed_in' - 'updated_at';
      if o is distinct from n then
        raise exception 'Only the owner can change a note someone else wrote';
      end if;
    end if;
  end if;
  if tg_table_name = 'assets' then
    if old.status = 'approved' and public.desk_strip(to_jsonb(new)) is distinct from public.desk_strip(to_jsonb(old)) then
      raise exception 'Only the owner can change an approved visual';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists posts_row_guard on public.posts;
create trigger posts_row_guard before insert on public.posts for each row execute function public.desk_row_guard();
drop trigger if exists versions_row_guard on public.versions;
create trigger versions_row_guard before insert or update on public.versions for each row execute function public.desk_row_guard();
drop trigger if exists notes_row_guard on public.notes;
create trigger notes_row_guard before insert or update on public.notes for each row execute function public.desk_row_guard();
drop trigger if exists assets_row_guard on public.assets;
create trigger assets_row_guard before insert or update on public.assets for each row execute function public.desk_row_guard();

-- 2. Once Jay approved a post, only he changes its WhatsApp text. The email version stays open:
--    it is usually written after the approval.
create or replace function public.desk_version_guard() returns trigger
language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if public.is_owner() then return new; end if;
  if new.channel <> 'whatsapp' then return new; end if;
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

-- 3. A session without an email is never on the team, and a member row needs a real address.
create or replace function public.is_team() returns boolean
language sql stable security definer set search_path = public as $$
  select public.desk_email() <> '' and exists (select 1 from public.team_members where email = public.desk_email() and active)
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select public.desk_email() <> '' and exists (select 1 from public.team_members where email = public.desk_email() and active and role = 'owner')
$$;
alter table public.team_members drop constraint if exists team_members_email_shape;
alter table public.team_members add constraint team_members_email_shape check (email like '%_@_%');

-- 4. A daily cap on AI calls per member (translate and split). The edge function calls desk_ai_tick().
create table if not exists public.ai_calls (
  email text not null,
  day   date not null,
  n     int  not null default 0,
  primary key (email, day)
);
alter table public.ai_calls enable row level security;
revoke all on public.ai_calls from anon, authenticated;

create or replace function public.desk_ai_tick() returns int
language plpgsql security definer set search_path = public as $$
declare
  me text := public.desk_email();
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  c int;
begin
  if not public.is_team() then raise exception 'Not a team member'; end if;
  insert into public.ai_calls as a (email, day, n) values (me, today, 1)
  on conflict (email, day) do update set n = a.n + 1
  returning a.n into c;
  delete from public.ai_calls where day < today - 30;
  return c;
end $$;
revoke all on function public.desk_ai_tick() from public, anon;
grant execute on function public.desk_ai_tick() to authenticated;


-- ===== migration 4 (16.11.2026) =====
-- Content Desk migration 4 (16.11.2026): a note can be about one picture. Safe to run twice.
alter table public.notes add column if not exists asset_id uuid references public.assets (id) on delete set null;
create index if not exists notes_asset_idx on public.notes (asset_id) where asset_id is not null;


-- ===== migration 5 (26.11.2026) =====
-- Content Desk migration 5 (26.11.2026): Chandler writes as a team member, more channels as
-- plain text, a cap of 7 open ideas with a 7-day expiry, and clicks on the /go/ source links.

-- 1. More channels. A version can now also be for Facebook, Threads and the Hebrew WhatsApp
--    group (whatsapp_he: an adaptation for that group, not a translation).
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.versions'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%channel%'
  loop
    execute format('alter table public.versions drop constraint %I', c);
  end loop;
end $$;
alter table public.versions add constraint versions_channel_check
  check (channel in ('whatsapp', 'whatsapp_he', 'email', 'linkedin', 'x', 'facebook', 'threads'));

-- 2. Chandler, the content AI employee, is a writer. He signs nothing in with Google: the
--    desk-agent function runs his writes as this member, so every writer rule applies to him.
--    The address has no mailbox and must never get one.
insert into public.team_members (email, name, role, color)
values ('chandler@agent.jaygptpro.com', 'Chandler', 'writer', '#7a4bd1')
on conflict (email) do nothing;

--    An @agent.jaygptpro.com address counts as a team member only inside a desk-agent call, which
--    sets its own claims without an issuer. Every sign-in token from Supabase Auth has one ("iss"),
--    so signing up with Chandler's address in a browser gives no rights on the Desk.
create or replace function public.is_team() returns boolean
language sql stable security definer set search_path = public as $$
  select public.desk_email() <> ''
    and (public.desk_email() not like '%@agent.jaygptpro.com' or (auth.jwt() ->> 'iss') is null)
    and exists (select 1 from public.team_members where email = public.desk_email() and active)
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select public.desk_email() <> ''
    and (public.desk_email() not like '%@agent.jaygptpro.com' or (auth.jwt() ->> 'iss') is null)
    and exists (select 1 from public.team_members where email = public.desk_email() and active and role = 'owner')
$$;

-- 3. An idea nobody touched for 7 days goes to Rejected with the reason "expired", so the
--    ideas column (at most 7 open ideas) never fills up with old news.
--    Only ideas that wait (for Jay's answer, or for a fix after his notes) expire: an idea Jay
--    approved stays until someone writes it or Jay decides otherwise.
--    Touched: the post itself changed (a translation does not count), or someone added a note,
--    a version or a file. An idea with a planned date that is still ahead stays.
--    desk_stale_ideas() says which ideas that is (the SQL editor can call it to see them first);
--    desk_expire_ideas() moves them, for any team member, and returns them. desk-agent calls it
--    before it lists or adds ideas, so Chandler can tell Jay which ones went.
create or replace function public.desk_stale_ideas() returns setof uuid
language sql stable set search_path = public as $$
  select p.id from public.posts p
  where p.stage = 'idea' and p.status in ('waiting', 'changes')
    and (p.pinned_date is null or p.pinned_date < (now() at time zone 'Asia/Jerusalem')::date)
    and greatest(
          p.updated_at,
          (select max(greatest(n.created_at, n.updated_at)) from public.notes n where n.post_id = p.id),
          (select max(v.created_at) from public.versions v where v.post_id = p.id),
          (select max(a.created_at) from public.assets a where a.post_id = p.id)
        ) < now() - interval '7 days'
$$;
revoke all on function public.desk_stale_ideas() from public, anon, authenticated;

drop function if exists public.desk_expire_ideas();
create function public.desk_expire_ideas() returns table (post_id uuid, post_title text)
language plpgsql security definer set search_path = public as $$
declare
  claims text := current_setting('request.jwt.claims', true);
begin
  if not public.is_team() then raise exception 'Not a team member'; end if;
  -- the expiry is nobody's edit: no "updated by" on the card and no "new" mark for the team
  perform set_config('request.jwt.claims', '', true);
  return query
    with gone as (
      update public.posts p set status = 'rejected', skip_reason = 'expired'
      where p.id in (select public.desk_stale_ideas()) and p.status in ('waiting', 'changes')
      returning p.id, p.title
    )
    select gone.id, gone.title from gone order by gone.title;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
end $$;
revoke all on function public.desk_expire_ideas() from public, anon;
grant execute on function public.desk_expire_ideas() to authenticated;

-- 4. Clicks on the source links jaygptpro.com/go/<src>/ (ig, tt, yt, li, fb, x, th, email), so the
--    weekly report can count group joins by where they came from. A table of its own, apart from
--    the hiring links, which live in the challenge project and measure candidates.
--    Only the go-clicks function writes here; the team can read it.
create table if not exists public.go_clicks (
  id           bigint generated always as identity primary key,
  src          text not null check (src ~ '^[a-z]{1,12}$'),
  created_at   timestamptz not null default now(),
  ref_domain   text,                 -- the referring site's domain only, never the full address
  is_bot       boolean not null default false,
  is_repeat    boolean not null default false,
  visitor_hash text                  -- tells repeat visitors apart within one day, nothing more
);
create index if not exists go_clicks_src_day_idx on public.go_clicks (src, created_at);
alter table public.go_clicks enable row level security;
revoke all on public.go_clicks from anon, authenticated;
grant select on public.go_clicks to authenticated;
drop policy if exists team_read on public.go_clicks;
create policy team_read on public.go_clicks for select to authenticated using (public.is_team());


-- ===== migration 6 (27.11.2026) =====
-- Content Desk migration 6 (27.11.2026): a reel can live on a card. Plan sections 13 S5 and 14 V1.
--
-- What it adds, and nothing more:
--   posts.kind   'text' (every post today) or 'reel'.
--   posts.reel   the reel's own fields, written by reel-ideas and reel-texts:
--                { hook_a, hook_b, cta, code_word, video_url, video_b_url, cover_url }
--                cta is one of code_word, follow, whatsapp, none (Jay, 27.11: the CTA rotates).
--                The links point to the files (a Drive link or a file uploaded to the card); the
--                card plays a link that is a video file.
--   versions     three more channels for the reel captions (instagram, tiktok, youtube), and
--                versions.extra for the fields a caption carries beside its text:
--                { title, comment, alt_text, dm_1, dm_2, switches }, as in post-texts.md.


-- 1. A post is a text post or a reel.
alter table public.posts add column if not exists kind text not null default 'text';
alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check check (kind in ('text', 'reel'));

-- 2. The reel's fields. An object; cta only from the four kinds.
alter table public.posts add column if not exists reel jsonb not null default '{}'::jsonb;
alter table public.posts drop constraint if exists posts_reel_check;
alter table public.posts add constraint posts_reel_check check (
  jsonb_typeof(reel) = 'object'
  and (reel ->> 'cta' is null or reel ->> 'cta' in ('code_word', 'follow', 'whatsapp', 'none'))
);

-- 3. The reel channels. Same plain-text versions as every channel since migration 5.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.versions'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%channel%'
  loop
    execute format('alter table public.versions drop constraint %I', c);
  end loop;
end $$;
alter table public.versions add constraint versions_channel_check
  check (channel in ('whatsapp', 'whatsapp_he', 'email', 'linkedin', 'x', 'facebook', 'threads',
                     'instagram', 'tiktok', 'youtube'));

-- 4. What a caption carries beside its text: the YouTube title, the pinned or first comment,
--    the Instagram alt text, the two DM messages for the code word, and which switches to turn on.
alter table public.versions add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.versions drop constraint if exists versions_extra_check;
alter table public.versions add constraint versions_extra_check check (jsonb_typeof(extra) = 'object');


-- ===== migration 7 (27.11.2026) =====
-- Content Desk migration 7 (27.11.2026): no cap on open ideas, an end date only for ideas that
-- age badly, and a reel made from a post.
-- Run once in the SQL editor of "jaygptpro-team" (NOT the challenge project), AFTER migration 6
-- and BEFORE the new front end goes live. Safe to run twice.
--
-- Jay, 27.11: no limit on open ideas, unless an idea goes stale (a Black Friday post after Black
-- Friday). And a clear split between posts and reels, though some posts become reels.
--
--   posts.expires_on      the last day the idea still makes sense. Empty for most ideas: they never expire.
--   posts.source_post_id  on a reel made from a post, that post.


-- 1. The last day an idea is still relevant.
alter table public.posts add column if not exists expires_on date;

-- 2. A reel made from a post points to it. Deleting the post keeps the reel.
alter table public.posts add column if not exists source_post_id uuid;
alter table public.posts drop constraint if exists posts_source_post_id_fkey;
alter table public.posts add constraint posts_source_post_id_fkey
  foreign key (source_post_id) references public.posts(id) on delete set null;
alter table public.posts drop constraint if exists posts_source_not_self;
alter table public.posts add constraint posts_source_not_self check (source_post_id is null or source_post_id <> id);
create index if not exists posts_source_post_id_idx on public.posts (source_post_id) where source_post_id is not null;

-- 3. The expiry. Replaces migration 5's 7 days without activity: an idea expires only when its
--    expires_on is before today in Israel. Nothing else ever expires. An idea Jay already
--    rejected keeps his reason.
create or replace function public.desk_stale_ideas() returns setof uuid
language sql stable set search_path = public as $$
  select p.id from public.posts p
  where p.stage = 'idea' and p.status <> 'rejected'
    and p.expires_on is not null
    and p.expires_on < (now() at time zone 'Asia/Jerusalem')::date
$$;
revoke all on function public.desk_stale_ideas() from public, anon, authenticated;

create or replace function public.desk_expire_ideas() returns table (post_id uuid, post_title text)
language plpgsql security definer set search_path = public as $$
declare
  claims text := current_setting('request.jwt.claims', true);
begin
  if not public.is_team() then raise exception 'Not a team member'; end if;
  -- the expiry is nobody's edit: no "updated by" on the card and no "new" mark for the team
  perform set_config('request.jwt.claims', '', true);
  return query
    with gone as (
      update public.posts p set status = 'rejected', skip_reason = 'expired'
      where p.id in (select public.desk_stale_ideas()) and p.status <> 'rejected'
      returning p.id, p.title
    )
    select gone.id, gone.title from gone order by gone.title;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
end $$;
revoke all on function public.desk_expire_ideas() from public, anon;
grant execute on function public.desk_expire_ideas() to authenticated;
