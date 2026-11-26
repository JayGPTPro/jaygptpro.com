-- Content Desk migration 5 (26.11.2026): Chandler writes as a team member, more channels as
-- plain text, and a cap of 7 open ideas with a 7-day expiry.
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

-- 3. An idea nobody touched for 7 days goes to Rejected with the reason "expired", so the
--    ideas column (at most 7 open ideas) never fills up with old news.
--    Touched: the post itself changed (a translation does not count), or someone added a note,
--    a version or a file. An idea with a planned date that is still ahead stays.
--    Runs for any team member; desk-agent calls it before it lists or adds ideas.
create or replace function public.desk_expire_ideas() returns int
language plpgsql security definer set search_path = public as $$
declare
  claims text := current_setting('request.jwt.claims', true);
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  c int;
begin
  if not public.is_team() then raise exception 'Not a team member'; end if;
  -- the expiry is nobody's edit: no "updated by" on the card and no "new" mark for the team
  perform set_config('request.jwt.claims', '', true);
  update public.posts p set status = 'rejected', skip_reason = 'expired'
  where p.stage = 'idea' and p.status <> 'rejected'
    and (p.pinned_date is null or p.pinned_date < today)
    and greatest(
          p.updated_at,
          (select max(greatest(n.created_at, n.updated_at)) from public.notes n where n.post_id = p.id),
          (select max(v.created_at) from public.versions v where v.post_id = p.id),
          (select max(a.created_at) from public.assets a where a.post_id = p.id)
        ) < now() - interval '7 days';
  get diagnostics c = row_count;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  return c;
end $$;
revoke all on function public.desk_expire_ideas() from public, anon;
grant execute on function public.desk_expire_ideas() to authenticated;

commit;

-- check: Chandler's row, and how many ideas are open
select email, name, role, active from public.team_members where email = 'chandler@agent.jaygptpro.com';
select count(*) as open_ideas from public.posts where stage = 'idea' and status <> 'rejected';
