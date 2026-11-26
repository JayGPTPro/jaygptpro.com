-- Content Desk guard tests for migrations 5 and 6, on a throwaway local database (tests/run.sh).
-- Every check raises "FAIL: ..." when the rule does not hold, so the first broken rule stops the run.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

-- ---------- helpers ----------
-- blocked(label, sql, pattern): the statement must fail with an error that matches pattern.
create or replace function pg_temp.blocked(label text, stmt text, pattern text) returns void
language plpgsql as $f$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm ilike pattern then
      raise notice 'ok: %', label;
      return;
    end if;
    raise exception 'FAIL: % (blocked, but with "%")', label, sqlerrm;
  end;
  raise exception 'FAIL: % (it went through)', label;
end $f$;
-- check(label, condition)
create or replace function pg_temp.check(label text, cond boolean) returns void
language plpgsql as $f$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok: %', label;
end $f$;
-- as(email): act as a signed-in browser with this Google email, like PostgREST does.
create or replace function pg_temp.claims(email text) returns void
language sql as $f$
  select set_config('request.jwt.claims', json_build_object('email', email, 'role', 'authenticated')::text, false)
$f$;

-- ---------- fixture (as the database owner, like the SQL editor) ----------
reset role;
select set_config('request.jwt.claims', '', false);
insert into public.team_members (email, name, role) values
  ('jay@example.com', 'Jay', 'owner'), ('denisa@example.com', 'Denisa', 'writer')
on conflict (email) do nothing;

insert into public.posts (id, title, stage, status, author, published_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'A first draft', 'draft', 'waiting', 'denisa@example.com', null),
  ('00000000-0000-0000-0000-0000000000a1', 'An approved post', 'ready', 'approved', 'denisa@example.com', null),
  ('00000000-0000-0000-0000-0000000000b1', 'A published post', 'published', 'approved', 'denisa@example.com', now() - interval '1 day');

-- ---------- 1. channels ----------
select pg_temp.check('one channel check on versions, named versions_channel_check',
  (select count(*) = 1 and bool_and(conname = 'versions_channel_check') from pg_constraint
   where conrelid = 'public.versions'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%channel%'));

set role authenticated;
select pg_temp.claims('denisa@example.com');
insert into public.versions (post_id, channel, n, body) values
  ('00000000-0000-0000-0000-0000000000d1', 'facebook', 1, 'fb text'),
  ('00000000-0000-0000-0000-0000000000d1', 'threads', 1, 'threads text'),
  ('00000000-0000-0000-0000-0000000000d1', 'whatsapp_he', 1, 'טקסט לקבוצה העברית'),
  ('00000000-0000-0000-0000-0000000000d1', 'x', 1, 'x text'),
  ('00000000-0000-0000-0000-0000000000d1', 'linkedin', 1, 'li text'),
  ('00000000-0000-0000-0000-0000000000d1', 'whatsapp', 1, 'wa text'),
  ('00000000-0000-0000-0000-0000000000d1', 'email', 1, '<p>mail</p>');
select pg_temp.check('a writer saves facebook, threads, whatsapp_he, x, linkedin, whatsapp and email versions',
  (select count(*) = 7 from public.versions where post_id = '00000000-0000-0000-0000-0000000000d1'));
select pg_temp.blocked('an unknown channel is refused',
  $$insert into public.versions (post_id, channel, n, body) values ('00000000-0000-0000-0000-0000000000d1', 'snapchat', 1, 'x')$$,
  '%versions_channel_check%');
select pg_temp.blocked('a writer cannot add WhatsApp text to an approved post',
  $$insert into public.versions (post_id, channel, n, body) values ('00000000-0000-0000-0000-0000000000a1', 'whatsapp', 1, 'x')$$,
  '%Jay already approved%');
insert into public.versions (post_id, channel, n, body) values
  ('00000000-0000-0000-0000-0000000000a1', 'whatsapp_he', 1, 'עיבוד לקבוצה העברית'),
  ('00000000-0000-0000-0000-0000000000b1', 'linkedin', 1, 'after publishing');
select pg_temp.check('a writer adds the Hebrew group and LinkedIn versions after the approval, like the email',
  (select count(*) = 2 from public.versions where channel in ('whatsapp_he', 'linkedin') and post_id <> '00000000-0000-0000-0000-0000000000d1'));

-- ---------- 2. Chandler is a writer, not more ----------
reset role;
select pg_temp.check('Chandler is an active writer',
  exists (select 1 from public.team_members where email = 'chandler@agent.jaygptpro.com' and role = 'writer' and active));

set role authenticated;
select pg_temp.claims('chandler@agent.jaygptpro.com');
select pg_temp.check('Chandler is on the team and not the owner', public.is_team() and not public.is_owner());
insert into public.posts (id, title, stage, status, author) values
  ('00000000-0000-0000-0000-0000000000c1', 'Chandler idea', 'idea', 'approved', 'jay@example.com');
select pg_temp.check('his idea is his and waits for Jay, whatever he sends',
  (select author = 'chandler@agent.jaygptpro.com' and status = 'waiting' from public.posts where id = '00000000-0000-0000-0000-0000000000c1'));
select pg_temp.blocked('Chandler cannot approve',
  $$update public.posts set status = 'approved' where id = '00000000-0000-0000-0000-0000000000d1'$$, '%Only the owner%');
select pg_temp.blocked('Chandler cannot move a post to another column',
  $$update public.posts set stage = 'final' where id = '00000000-0000-0000-0000-0000000000d1'$$, '%Only the owner%');
select pg_temp.blocked('Chandler cannot change a published post',
  $$update public.posts set title = 'changed' where id = '00000000-0000-0000-0000-0000000000b1'$$, '%Only the owner%');
select pg_temp.blocked('Chandler cannot create a post straight in Ready',
  $$insert into public.posts (title, stage) values ('sneaky', 'ready')$$, '%Only the owner%');
select pg_temp.blocked('Chandler cannot make himself the owner',
  $q$do $x$ declare c int; begin
      update public.team_members set role = 'owner' where email = 'chandler@agent.jaygptpro.com';
      get diagnostics c = row_count;
      if c = 0 then raise exception 'no rows'; end if; end $x$$q$, '%no rows%');
select pg_temp.blocked('Chandler cannot delete a post',
  $q$do $x$ declare c int; begin
      delete from public.posts where id = '00000000-0000-0000-0000-0000000000c1';
      get diagnostics c = row_count;
      if c = 0 then raise exception 'no rows'; end if; end $x$$q$, '%no rows%');
insert into public.versions (post_id, channel, n, body, author) values
  ('00000000-0000-0000-0000-0000000000d1', 'x', 2, 'second x', 'denisa@example.com');
select pg_temp.check('a version Chandler saves is signed with his name',
  (select author = 'chandler@agent.jaygptpro.com' from public.versions
   where post_id = '00000000-0000-0000-0000-0000000000d1' and channel = 'x' and n = 2));

-- a browser sign-in always carries an issuer; desk-agent's own claims do not
select set_config('request.jwt.claims', '{"email":"chandler@agent.jaygptpro.com","role":"authenticated","iss":"https://sjdcvjunibwxkwqzjitw.supabase.co/auth/v1"}', false);
select pg_temp.check('someone who signs up in a browser with Chandler''s address gets no rights',
  not public.is_team() and (select count(*) = 0 from public.posts));
select pg_temp.blocked('nor can they write as him',
  $$insert into public.posts (title, stage) values ('pretending', 'idea')$$, '%row-level security%');
select set_config('request.jwt.claims', '{"email":"denisa@example.com","role":"authenticated","iss":"https://sjdcvjunibwxkwqzjitw.supabase.co/auth/v1"}', false);
select pg_temp.check('a person''s real sign-in still works as before', public.is_team() and not public.is_owner());
select set_config('request.jwt.claims', '{"email":"jay@example.com","role":"authenticated","iss":"https://sjdcvjunibwxkwqzjitw.supabase.co/auth/v1"}', false);
select pg_temp.check('and Jay is still the owner', public.is_owner());

-- ---------- 3. ideas expire after 7 untouched days ----------
reset role;
select set_config('request.jwt.claims', '', false);
-- inserted with old timestamps: an update would not move updated_at back (desk_touch)
insert into public.posts (id, title, stage, status, author, created_at, updated_at, pinned_date, skip_reason) values
  ('00000000-0000-0000-0000-00000000e001', 'stale waiting idea',        'idea', 'waiting',  'denisa@example.com', now() - interval '20 days', now() - interval '8 days', null, null),
  ('00000000-0000-0000-0000-00000000e002', 'fresh idea',                'idea', 'waiting',  'denisa@example.com', now() - interval '20 days', now() - interval '6 days', null, null),
  ('00000000-0000-0000-0000-00000000e003', 'stale idea, recent note',   'idea', 'waiting',  'denisa@example.com', now() - interval '20 days', now() - interval '9 days', null, null),
  ('00000000-0000-0000-0000-00000000e004', 'stale idea, date ahead',    'idea', 'waiting',  'denisa@example.com', now() - interval '20 days', now() - interval '9 days', current_date + 3, null),
  ('00000000-0000-0000-0000-00000000e005', 'stale idea, date passed',   'idea', 'waiting',  'denisa@example.com', now() - interval '20 days', now() - interval '9 days', current_date - 3, null),
  ('00000000-0000-0000-0000-00000000e006', 'stale approved idea',       'idea', 'approved', 'denisa@example.com', now() - interval '20 days', now() - interval '9 days', null, null),
  ('00000000-0000-0000-0000-00000000e007', 'stale rejected idea',       'idea', 'rejected', 'denisa@example.com', now() - interval '20 days', now() - interval '9 days', null, 'Not now'),
  ('00000000-0000-0000-0000-00000000e008', 'stale draft',               'draft','waiting',  'denisa@example.com', now() - interval '20 days', now() - interval '9 days', null, null),
  ('00000000-0000-0000-0000-00000000e009', 'stale idea, recent version','idea', 'changes',  'denisa@example.com', now() - interval '20 days', now() - interval '9 days', null, null),
  ('00000000-0000-0000-0000-00000000e010', 'stale idea, recent file',   'idea', 'waiting',  'denisa@example.com', now() - interval '20 days', now() - interval '9 days', null, null),
  ('00000000-0000-0000-0000-00000000e011', 'stale idea, old note',      'idea', 'waiting',  'denisa@example.com', now() - interval '20 days', now() - interval '9 days', null, null),
  ('00000000-0000-0000-0000-00000000e012', 'stale idea sent back',      'idea', 'changes',  'denisa@example.com', now() - interval '20 days', now() - interval '9 days', null, null);
insert into public.notes (post_id, body, author, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000e003', 'still on it', 'jay@example.com', now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000e011', 'old note', 'jay@example.com', now() - interval '8 days', now() - interval '8 days');
insert into public.versions (post_id, channel, n, body, author, created_at) values
  ('00000000-0000-0000-0000-00000000e009', 'linkedin', 1, 'a version', 'denisa@example.com', now() - interval '1 day');
insert into public.assets (post_id, path, filename, author, created_at) values
  ('00000000-0000-0000-0000-00000000e010', 'x/e010.png', 'e010.png', 'denisa@example.com', now() - interval '1 day');

select pg_temp.check('the preview at the end of the migration lists exactly the ideas the expiry will take',
  (select array_agg(p.title order by p.title) = array['stale idea sent back', 'stale idea, date passed', 'stale idea, old note', 'stale waiting idea']
   from public.posts p where p.id in (select public.desk_stale_ideas())));

set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select pg_temp.blocked('a visitor who is not signed in cannot run the expiry',
  $$select public.desk_expire_ideas()$$, '%permission denied%');
set role authenticated;
select pg_temp.claims('stranger@gmail.com');
select pg_temp.blocked('a Google account outside the team cannot run the expiry',
  $$select public.desk_expire_ideas()$$, '%Not a team member%');
select pg_temp.claims('denisa@example.com');
select pg_temp.blocked('the list of stale ideas is for the database owner only',
  $$select public.desk_stale_ideas()$$, '%permission denied%');

select pg_temp.claims('chandler@agent.jaygptpro.com');
create temp table expired as select * from public.desk_expire_ideas();
select pg_temp.check('four stale ideas expire (waiting, date passed, old note, sent back) and come back by title',
  (select array_agg(post_title order by post_title) = array['stale idea sent back', 'stale idea, date passed', 'stale idea, old note', 'stale waiting idea'] from expired));
select pg_temp.check('the expired ones are rejected with the reason "expired"',
  (select bool_and(status = 'rejected' and skip_reason = 'expired') and count(*) = 4 from public.posts
   where id in ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e005',
                '00000000-0000-0000-0000-00000000e011', '00000000-0000-0000-0000-00000000e012')));
select pg_temp.check('the rest stay as they were, an idea Jay approved included',
  (select bool_and(status <> 'rejected') and count(*) = 7 from public.posts
   where id in ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000e003',
                '00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-00000000e006',
                '00000000-0000-0000-0000-00000000e008', '00000000-0000-0000-0000-00000000e009',
                '00000000-0000-0000-0000-00000000e010')));
select pg_temp.check('an idea Jay already rejected keeps his reason',
  (select skip_reason = 'Not now' from public.posts where id = '00000000-0000-0000-0000-00000000e007'));
select pg_temp.check('the expiry is nobody''s edit: no name in updated_by, updated_at is now',
  (select bool_and(updated_by = '' and updated_at > now() - interval '1 minute') from public.posts where skip_reason = 'expired'));
-- in one transaction, like desk-agent: the cleared claims must come back before the next statement
do $$ begin
  perform public.desk_expire_ideas();
  if public.desk_email() <> 'chandler@agent.jaygptpro.com' then
    raise exception 'FAIL: after the expiry, the same transaction is no longer Chandler but "%"', public.desk_email();
  end if;
end $$;
select pg_temp.check('after the expiry the same transaction is still Chandler', true);
select pg_temp.check('a second run expires nothing', (select count(*) = 0 from public.desk_expire_ideas()));

-- ---------- 4. source clicks: written by the go-clicks function only, read by the team ----------
reset role;
select set_config('request.jwt.claims', '', false);
insert into public.go_clicks (src, ref_domain, visitor_hash) values ('ig', 'instagram.com', 'abcd'), ('tt', null, null);
select pg_temp.blocked('a source code must be a short lowercase word',
  $$insert into public.go_clicks (src) values ('Whatsapp-Group')$$, '%go_clicks_src_check%');

set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select pg_temp.blocked('a visitor cannot read the clicks', $$select count(*) from public.go_clicks$$, '%permission denied%');
select pg_temp.blocked('a visitor cannot write a click straight to the table',
  $$insert into public.go_clicks (src) values ('ig')$$, '%permission denied%');
set role authenticated;
select pg_temp.claims('stranger@gmail.com');
select pg_temp.check('a Google account outside the team sees no clicks', (select count(*) = 0 from public.go_clicks));
select pg_temp.claims('denisa@example.com');
select pg_temp.check('the team reads the clicks', (select count(*) = 2 from public.go_clicks));
select pg_temp.blocked('a team member cannot add or change clicks',
  $$insert into public.go_clicks (src) values ('ig')$$, '%permission denied%');

reset role;
select set_config('request.jwt.claims', '', false);
-- ---------- 5. reels (migration 6) ----------
select pg_temp.check('every post is a text post until someone says reel',
  (select bool_and(kind = 'text' and reel = '{}'::jsonb) from public.posts));
set role authenticated;
select pg_temp.claims('denisa@example.com');
update public.posts set kind = 'reel',
  reel = '{"hook_a": "Stop asking AI for answers", "hook_b": "Your ChatGPT is guessing", "cta": "code_word", "code_word": "INTERVIEW", "video_url": "https://example.com/r.mp4"}'
  where id = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.check('a writer turns a draft into a reel with its hooks and CTA',
  (select kind = 'reel' and reel ->> 'code_word' = 'INTERVIEW' from public.posts where id = '00000000-0000-0000-0000-0000000000d1'));
select pg_temp.blocked('a CTA outside the four kinds is refused',
  $$update public.posts set reel = '{"cta": "link_in_bio"}' where id = '00000000-0000-0000-0000-0000000000d1'$$, '%posts_reel_check%');
select pg_temp.blocked('the reel fields are an object, never a list',
  $$update public.posts set reel = '["hook"]' where id = '00000000-0000-0000-0000-0000000000d1'$$, '%posts_reel_check%');
select pg_temp.blocked('a kind outside text and reel is refused',
  $$update public.posts set kind = 'carousel' where id = '00000000-0000-0000-0000-0000000000d1'$$, '%posts_kind_check%');
select pg_temp.blocked('a writer cannot change the reel of a published post',
  $$update public.posts set reel = '{"hook_b": "x"}' where id = '00000000-0000-0000-0000-0000000000b1'$$, '%published post%');
insert into public.versions (post_id, channel, n, body, extra) values
  ('00000000-0000-0000-0000-0000000000d1', 'instagram', 1, 'ig caption', '{"comment": "pinned", "alt_text": "alt", "dm_1": "Want it?", "dm_2": "Here"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'tiktok', 1, 'tt caption', '{"comment": "pinned"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'youtube', 1, 'yt description', '{"title": "A title", "comment": "the prompt"}');
select pg_temp.check('a writer saves Instagram, TikTok and YouTube captions with their extra fields',
  (select count(*) = 3 from public.versions where channel in ('instagram', 'tiktok', 'youtube') and extra <> '{}'::jsonb));
select pg_temp.blocked('extra is an object',
  $$insert into public.versions (post_id, channel, n, body, extra) values ('00000000-0000-0000-0000-0000000000d1', 'linkedin', 2, 'x', '"comment"')$$,
  '%versions_extra_check%');
insert into public.versions (post_id, channel, n, body, extra) values
  ('00000000-0000-0000-0000-0000000000a1', 'instagram', 1, 'after approval', '{"comment": "c"}');
select pg_temp.check('reel captions stay open after Jay approved, like every channel but WhatsApp',
  (select count(*) = 1 from public.versions where post_id = '00000000-0000-0000-0000-0000000000a1' and channel = 'instagram'));
reset role;
select set_config('request.jwt.claims', '', false);
\echo guards_test.sql: all checks passed
