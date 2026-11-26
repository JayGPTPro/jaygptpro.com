-- Content Desk migration 5 (26.11.2026): Chandler writes as a team member, more channels as
-- plain text, a cap of 7 open ideas with a 7-day expiry, and clicks on the /go/ source links.
-- Run once in the SQL editor of "jaygptpro-team" (NOT the challenge project), BEFORE the new
-- front end goes live. Safe to run twice.

begin;

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

commit;

-- check: the ideas that Chandler's first call will move to Rejected as "expired" (Jay can bring
-- any of them back). Nothing here changes them; an empty list means nothing goes.
select p.title, p.status, p.author, p.updated_at::date as last_change
from public.posts p where p.id in (select public.desk_stale_ideas()) order by p.updated_at;
