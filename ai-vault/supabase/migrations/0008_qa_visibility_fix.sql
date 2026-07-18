-- AI Vault. Q&A visibility fix (run eighth, AFTER 0005 in any environment)
--
-- WHY THIS EXISTS AS A SEPARATE FILE:
-- 0005 originally shipped a blanket "members read all questions" policy. Editing
-- 0005 in place fixes a fresh install but changes NOTHING in a database that has
-- already run it: the old policy keeps existing, and RLS policies are permissive
-- (they OR together), so the blanket one would keep granting every member every
-- row. This migration is idempotent and safe to run on both fresh and migrated
-- databases.
--
-- The intended model: a question is PRIVATE to its author until Jay publishes it
-- (questions.public defaults to false, ask_question never sets it). Published
-- threads become the community board everyone learns from.

-- ===== questions: published-or-own, never "all" =====
drop policy if exists "members read all questions"       on questions;
drop policy if exists "members read published questions" on questions;
create policy "members read published questions" on questions
  for select using (has_vault_access(auth.uid()) and (public or user_id = auth.uid()));

-- ===== replies inherit the parent question's visibility =====
drop policy if exists "members read replies" on question_replies;
create policy "members read replies" on question_replies
  for select using (
    has_vault_access(auth.uid())
    and exists (
      select 1 from questions q
      where q.id = question_id and (q.public or q.user_id = auth.uid())
    )
  );

-- ===== you can only answer a thread you are allowed to see =====
create or replace function add_reply(p_question uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_vault_access(auth.uid()) then raise exception 'no access'; end if;
  if length(trim(p_body)) < 2 then raise exception 'too short'; end if;
  if not exists (
    select 1 from questions q
    where q.id = p_question and (q.public or q.user_id = auth.uid())
  ) then return; end if;
  insert into question_replies (question_id, user_id, body)
  values (p_question, auth.uid(), left(p_body, 4000));
end; $$;

-- ===== the board RPC reproduces the same rule (it is security definer) =====
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
      'public', q.public,
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
      and (q.public or q.user_id = auth.uid())
    order by q.created_at desc limit p_limit
  ) s;
$$;

-- ===== access predicate answers only about the caller =====
-- has_vault_access(uid) takes a target uid, so as an RPC it let any member probe
-- another member's subscription state (comped / active / past_due / lapsed).
--
-- DO NOT revoke execute on it. RLS policy predicates are inlined into the
-- member's own query and evaluated as the "authenticated" role, so revoking
-- would make every gated table read (episodes, lessons, live_sessions,
-- challenges, programs, questions...) fail with "permission denied for function"
-- and blank the portal for every member at once.
--
-- Instead the function refuses to answer about anyone else: same signature, same
-- callers, no probing. Admins keep the ability to check another member.
create or replace function has_vault_access(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when uid is distinct from auth.uid()
         and not exists (select 1 from admin_users a where a.user_id = auth.uid())
      then false
    else exists (
      select 1 from profiles p where p.id = uid and p.access_type = 'comped'
    ) or exists (
      select 1 from subscriptions s
      where s.user_id = uid
        and s.status in ('active','trialing','past_due')
        and not s.access_blocked
    )
  end;
$$;
grant execute on function has_vault_access(uuid) to authenticated;
-- NOTE for future work: every current caller passes auth.uid(), so the self-only
-- rule is invisible to them. Server-side code runs as service_role, which bypasses
-- RLS entirely and must read profiles/subscriptions directly (as stripe-webhook
-- already does) rather than calling this function with someone else's uid.

-- Verify after running:
--   select policyname, qual from pg_policies where tablename in ('questions','question_replies');
--     There must be NO policy on questions whose predicate is has_vault_access alone.
--   set local role authenticated; select count(*) from episodes;
--     Must NOT raise "permission denied for function has_vault_access".
