-- AI Vault. Community Q&A, programs catalog, member deals (run fifth)

-- ===== Ask the AI Experts becomes a community board =====
-- questions stay in the existing table. Visibility is PUBLISHED-OR-OWN, never
-- "every member reads every row": questions default to public=false, so a blanket
-- read policy would expose every member's private question through PostgREST
-- (RLS policies are permissive and OR together, so this must not exist at all).
-- NOTE: an earlier version of this file shipped a blanket policy. If this project
-- ever ran that version, 0008_qa_visibility_fix.sql is what actually removes it.
drop policy if exists "members read all questions"       on questions;
drop policy if exists "members read published questions" on questions;
create policy "members read published questions" on questions
  for select using (has_vault_access(auth.uid()) and (public or user_id = auth.uid()));

create table question_replies (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index on question_replies (question_id, created_at);

alter table question_replies enable row level security;
-- replies inherit the parent question's visibility, or the same private threads
-- leak one table over
drop policy if exists "members read replies" on question_replies;
create policy "members read replies" on question_replies
  for select using (
    has_vault_access(auth.uid())
    and exists (select 1 from questions q where q.id = question_id and (q.public or q.user_id = auth.uid()))
  );

create or replace function add_reply(p_question uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_vault_access(auth.uid()) then raise exception 'no access'; end if;
  if length(trim(p_body)) < 2 then raise exception 'too short'; end if;
  -- you can only answer a thread you are allowed to see
  if not exists (select 1 from questions q where q.id = p_question and (q.public or q.user_id = auth.uid())) then return; end if;
  insert into question_replies (question_id, user_id, body) values (p_question, auth.uid(), left(p_body, 4000));
end; $$;

-- one call returns the whole board with author first names (profiles are RLS own-row,
-- so names come through this security-definer function only)
create or replace function get_qa(p_limit int default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(q order by q->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', q.id,
      'body', q.body,
      'created_at', q.created_at,
      'author', coalesce(split_part(p.display_name, ' ', 1), 'Member'),
      'answer', q.answer,
      'answered_at', q.answered_at,
      'public', q.public,          -- the board marks a member's own private rows
      'replies', coalesce((
        select jsonb_agg(jsonb_build_object(
          'body', r.body,
          'created_at', r.created_at,
          'author', coalesce(split_part(rp.display_name, ' ', 1), 'Member')
        ) order by r.created_at)
        from question_replies r join profiles rp on rp.id = r.user_id
        where r.question_id = q.id
      ), '[]'::jsonb)
    ) as q
    from questions q join profiles p on p.id = q.user_id
    where has_vault_access(auth.uid())
      -- SECURITY: this function is security definer, so it must reproduce the RLS
      -- intent itself. questions default to public=false (ask_question never sets
      -- it), so without this every member would read every other member's private
      -- question. A member sees the published board plus their own questions.
      and (q.public or q.user_id = auth.uid())
    order by q.created_at desc limit p_limit
  ) sub;
$$;

-- ===== Programs: challenges, courses, bootcamps with member pricing =====
create table programs (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  kind        text not null default 'challenge' check (kind in ('challenge','course','bootcamp','seminar')),
  badge       text not null default 'member_deal' check (badge in ('free_members','member_deal','coming_soon')),
  description text,
  price_note  text,           -- e.g. 'Free for Vault members' / 'Special member price'
  coupon      text,           -- e.g. 'VAULT20'
  url         text,           -- sales page or internal challenges page
  image_url   text,
  sort        int not null default 0,
  active      boolean not null default true
);
alter table programs enable row level security;
create policy "members read programs" on programs for select using (active and has_vault_access(auth.uid()));

-- ===== Member deals: tools with special Vault pricing =====
create table tool_deals (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  deal_note   text,           -- e.g. '20% off for Vault members'
  coupon      text,           -- e.g. 'JAY20'
  url         text,
  sort        int not null default 0,
  active      boolean not null default true
);
alter table tool_deals enable row level security;
create policy "members read deals" on tool_deals for select using (active and has_vault_access(auth.uid()));
