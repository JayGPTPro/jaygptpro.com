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
