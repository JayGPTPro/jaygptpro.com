-- Content Desk migration 2: the board model.
-- Before: one "stage" that mixed where a post is with whose turn it is (idea, writing, review, ...).
-- After:  "stage" is the column on the board, "status" is Jay's answer on that column.
--   stage:  idea -> draft -> final -> ready -> published
--   status: waiting (for Jay) | approved | changes (sent back with notes) | rejected
-- In "ready" the post gets its publishing date (pinned_date).
-- Run once in the SQL editor of "jaygptpro-team", BEFORE the new front end goes live. Safe to re-run.

begin;

alter table public.posts add column if not exists status text not null default 'waiting';

-- drop the old stage check, whatever its name
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.posts'::regclass and contype = 'c'
             and (pg_get_constraintdef(oid) ilike '%stage%' or pg_get_constraintdef(oid) ilike '%status%')
  loop
    execute format('alter table public.posts drop constraint %I', c);
  end loop;
end $$;

-- move every post to the new model without touching updated_at
alter table public.posts disable trigger posts_touch;

update public.posts p set
  status = case
    when p.stage in ('skipped', 'parked') then 'rejected'
    when p.stage = 'review' then 'waiting'
    when p.stage = 'writing' and p.text_ok then 'approved'
    when p.stage = 'writing' and not exists (select 1 from public.versions v where v.post_id = p.id) then 'approved'
    when p.stage = 'writing' and exists (select 1 from public.notes n where n.post_id = p.id and n.kind = 'note' and n.status = 'open') then 'changes'
    when p.stage = 'writing' then 'approved'
    when p.stage in ('ready', 'published') then 'approved'
    else p.status
  end,
  stage = case
    when p.stage in ('skipped', 'parked') then
      case when exists (select 1 from public.versions v where v.post_id = p.id) then 'draft' else 'idea' end
    when p.stage = 'writing' and not exists (select 1 from public.versions v where v.post_id = p.id) then 'idea'
    when p.stage = 'writing' and p.text_ok then 'draft'
    when p.stage = 'writing' and exists (select 1 from public.notes n where n.post_id = p.id and n.kind = 'note' and n.status = 'open') then 'draft'
    when p.stage = 'writing' then 'idea'  -- a draft the writer never sent: the approved idea, with its text kept
    when p.stage = 'review' and p.text_ok then 'final'
    when p.stage = 'review' then 'draft'
    else p.stage
  end
where p.stage in ('writing', 'review', 'ready', 'published', 'skipped', 'parked');  -- old values only, so a second run changes nothing

alter table public.posts enable trigger posts_touch;

alter table public.posts add constraint posts_stage_check
  check (stage in ('idea', 'draft', 'final', 'ready', 'published'));
alter table public.posts add constraint posts_status_check
  check (status in ('waiting', 'approved', 'changes', 'rejected'));
create index if not exists posts_status_idx on public.posts (status);

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

commit;

-- check: how many posts sit where now
select stage, status, count(*) from public.posts group by 1, 2 order by 1, 2;
