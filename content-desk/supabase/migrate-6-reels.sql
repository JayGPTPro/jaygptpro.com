-- Content Desk migration 6 (27.11.2026): a reel can live on a card. Plan sections 13 S5 and 14 V1.
-- Run once in the SQL editor of "jaygptpro-team" (NOT the challenge project), AFTER migration 5
-- and BEFORE the new front end goes live. Safe to run twice.
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

begin;

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

commit;
