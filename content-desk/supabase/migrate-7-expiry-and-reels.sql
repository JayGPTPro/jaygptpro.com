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

begin;

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

commit;

-- check: the ideas the next desk-agent call will move to Rejected. Right after this migration
-- no idea has an end date, so the list is empty.
select p.title, p.status, p.expires_on from public.posts p
where p.id in (select public.desk_stale_ideas()) order by p.expires_on;
