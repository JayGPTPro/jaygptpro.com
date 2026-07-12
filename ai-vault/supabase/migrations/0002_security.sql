-- AI Vault. RLS + access functions (run second)
-- THE VAULT DOOR. Every content read passes through has_vault_access, enforced inside Postgres.

-- ===== the one access rule =====
create or replace function has_vault_access(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p where p.id = uid and p.access_type = 'comped'
  ) or exists (
    select 1 from subscriptions s
    where s.user_id = uid
      and s.status in ('active','trialing','past_due')
      and not s.access_blocked
  );
$$;

-- one round trip for the frontend: session -> everything the UI needs
create or replace function get_my_access()
returns table (
  has_access boolean, is_admin boolean, member_number int,
  member_since timestamptz, plan text, status text
) language sql stable security definer set search_path = public as $$
  select
    has_vault_access(auth.uid()),
    exists (select 1 from admin_users a where a.user_id = auth.uid()),
    p.member_number,
    p.created_at,
    case
      when p.access_type = 'comped' then 'Guest access'
      when s.price_lookup_key = 'vault_annual' then 'Annual, $1,000'
      when s.price_lookup_key = 'vault_monthly' then 'Monthly, $100'
      else coalesce(s.price_lookup_key, 'AI Vault')
    end,
    coalesce(s.status, case when p.access_type = 'comped' then 'active' else 'none' end)
  from profiles p
  left join lateral (
    select * from subscriptions s where s.user_id = p.id
    order by (s.status in ('active','trialing','past_due')) desc, s.updated_at desc limit 1
  ) s on true
  where p.id = auth.uid();
$$;

-- ===== member-write RPCs (validated writes, no direct table writes from clients) =====
create or replace function record_watch_progress(p_episode_slug text, p_position int, p_completed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare eid uuid; dur int;
begin
  if not has_vault_access(auth.uid()) then raise exception 'no access'; end if;
  select id, duration_seconds into eid, dur from episodes where slug = p_episode_slug and status = 'published';
  if eid is null then return; end if;
  insert into watch_progress (user_id, episode_id, position_seconds, completed_at, updated_at)
  values (auth.uid(), eid, greatest(0, least(p_position, coalesce(dur, p_position))), case when p_completed then now() end, now())
  on conflict (user_id, episode_id) do update set
    position_seconds = excluded.position_seconds,
    completed_at = coalesce(watch_progress.completed_at, excluded.completed_at),
    updated_at = now();
end; $$;

create or replace function complete_lesson(p_position int)
returns void language plpgsql security definer set search_path = public as $$
declare lid uuid;
begin
  if not has_vault_access(auth.uid()) then raise exception 'no access'; end if;
  select id into lid from lessons where position = p_position;
  if lid is null then return; end if;
  insert into lesson_progress (user_id, lesson_id) values (auth.uid(), lid) on conflict do nothing;
end; $$;

create or replace function log_event(p_event text, p_ref text default null)
returns void language sql security definer set search_path = public as $$
  insert into portal_events (user_id, event_type, ref)
  select auth.uid(), left(p_event, 40), left(p_ref, 200)
  where auth.uid() is not null;  -- anonymous callers cannot flood the events table
$$;

-- ===== RLS =====
alter table profiles          enable row level security;
alter table admin_users       enable row level security;
alter table comped_emails     enable row level security;
alter table login_events      enable row level security;
alter table billing_customers enable row level security;
alter table subscriptions     enable row level security;
alter table stripe_events     enable row level security;
alter table refunds_log       enable row level security;
alter table emails_log        enable row level security;
alter table migration_allowlist enable row level security;
alter table episodes          enable row level security;
alter table tags              enable row level security;
alter table episode_tags      enable row level security;
alter table episode_chapters  enable row level security;
alter table episode_resources enable row level security;
alter table lessons           enable row level security;
alter table live_sessions     enable row level security;
alter table watch_progress    enable row level security;
alter table lesson_progress   enable row level security;
alter table portal_events     enable row level security;
alter table email_preferences enable row level security;
alter table feature_flags     enable row level security;

-- own-row reads
create policy "read own profile"       on profiles          for select using (id = auth.uid());
create policy "read own subscription"  on subscriptions     for select using (user_id = auth.uid());
create policy "read own prefs"         on email_preferences for select using (user_id = auth.uid());
create policy "write own prefs"        on email_preferences for insert with check (user_id = auth.uid());
create policy "update own prefs"       on email_preferences for update using (user_id = auth.uid());

-- content: members only (the actual vault door)
create policy "members read episodes"  on episodes          for select using (status = 'published' and has_vault_access(auth.uid()));
create policy "members read tags"      on tags              for select using (has_vault_access(auth.uid()));
create policy "members read ep tags"   on episode_tags      for select using (has_vault_access(auth.uid()));
create policy "members read chapters"  on episode_chapters  for select using (has_vault_access(auth.uid()));
create policy "members read resources" on episode_resources for select using (has_vault_access(auth.uid()));
create policy "members read lessons"   on lessons           for select using (has_vault_access(auth.uid()));
create policy "members read sessions"  on live_sessions     for select using (has_vault_access(auth.uid()));

-- progress: own rows, written only via the RPCs above
create policy "read own progress"      on watch_progress    for select using (user_id = auth.uid());
create policy "read own lessons"       on lesson_progress   for select using (user_id = auth.uid());

-- everything else: no client policies at all = service role only
-- (billing_customers, stripe_events, refunds_log, emails_log, migration_allowlist,
--  login_events, admin_users, comped_emails, portal_events, feature_flags)
