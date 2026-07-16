-- AI Vault. Schema (run first)
-- Design source: AI VAULT/docs/research/data-model.md (gamification removed per D10)

-- ===== identity =====
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  member_number int generated always as identity,
  display_name  text,
  avatar_url    text,
  google_email  text not null,
  primary_email text,                   -- the email they PAID with, if different
  access_type   text not null default 'member' check (access_type in ('member','comped')),
  created_at    timestamptz not null default now()
);

create table admin_users (
  user_id uuid primary key references profiles(id) on delete cascade,
  role    text not null default 'admin' check (role in ('admin','owner'))
);

create table comped_emails (            -- free access granted before first login (guest experts, Jay)
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

create table login_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ===== billing (Stripe mirror, only written by verified webhooks) =====
create table billing_customers (
  user_id            uuid primary key references profiles(id) on delete cascade,
  stripe_customer_id text unique not null,
  cohort             text not null default 'standard',
  blocked            boolean not null default false,
  created_at         timestamptz not null default now()
);

create table subscriptions (
  id                   text primary key,               -- Stripe subscription id
  user_id              uuid not null references profiles(id) on delete cascade,
  status               text not null,
  price_lookup_key     text,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end            timestamptz,
  dunning_since        timestamptz,
  access_blocked       boolean not null default false,
  last_event_created   bigint,
  updated_at           timestamptz not null default now()
);
create index on subscriptions (user_id);

create table stripe_events (
  id           text primary key,
  type         text not null,
  created      bigint not null,               -- Stripe event time, ordering guard only
  claimed_at   timestamptz not null default now(),  -- when THIS claim was taken (staleness base)
  processed_at timestamptz
);

create table refunds_log (
  user_id    uuid primary key references profiles(id) on delete cascade,
  refund_id  text not null,
  reason     text,
  created_at timestamptz not null default now()
);

create table emails_log (               -- atomic claim dedup for every send
  key        text primary key,
  user_id    uuid references profiles(id) on delete set null,
  kind       text not null,
  claimed_at timestamptz not null default now(),  -- when a sender claimed the key
  sent_at    timestamptz                          -- set ONLY after a 2xx from the provider
);

create table migration_allowlist (      -- veterans from Circle (phase B)
  email         text primary key,
  cohort        text not null,
  circle_level  int,
  paid_through  date,
  notes         text,
  claimed_by    uuid references profiles(id),
  claimed_at    timestamptz
);

-- ===== content =====
create table episodes (
  id                 uuid primary key default gen_random_uuid(),
  ep_number          int unique not null,
  slug               text unique not null,
  title              text not null,
  description        text,
  guest_name         text,
  vimeo_id           text,
  vimeo_hash         text,
  duration_seconds   int,
  thumbnail_url      text,
  status             text not null default 'draft' check (status in ('draft','published')),
  published_at       timestamptz,
  updated_note       text,
  content_updated_at timestamptz,
  created_at         timestamptz not null default now()
);
create index on episodes (status, published_at desc);

create table tags (
  id   int generated always as identity primary key,
  slug text unique not null,
  name text not null
);

create table episode_tags (
  episode_id uuid references episodes(id) on delete cascade,
  tag_id     int references tags(id) on delete cascade,
  primary key (episode_id, tag_id)
);
create index on episode_tags (tag_id);

create table episode_chapters (
  id         bigint generated always as identity primary key,
  episode_id uuid not null references episodes(id) on delete cascade,
  title      text not null,
  starts_at  int not null,
  position   int not null default 0
);

create table episode_resources (
  id           bigint generated always as identity primary key,
  episode_id   uuid not null references episodes(id) on delete cascade,
  kind         text not null check (kind in ('prompt','link','file','slides','tool')),
  title        text not null,
  url          text,
  storage_path text,
  body         text,
  position     int not null default 0
);

create table lessons (
  id               uuid primary key default gen_random_uuid(),
  position         int unique not null,
  title            text not null,
  vimeo_id         text,
  vimeo_hash       text,
  body             text,
  duration_seconds int
);

create table live_sessions (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  guest_name text,
  starts_at  timestamptz not null,
  zoom_url   text,
  episode_id uuid references episodes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on live_sessions (starts_at);

-- ===== progress =====
create table watch_progress (
  user_id          uuid references profiles(id) on delete cascade,
  episode_id       uuid references episodes(id) on delete cascade,
  position_seconds int not null default 0,
  completed_at     timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (user_id, episode_id)
);
create index on watch_progress (user_id, updated_at desc);

create table lesson_progress (
  user_id      uuid references profiles(id) on delete cascade,
  lesson_id    uuid references lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- ===== self-analytics =====
create table portal_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references profiles(id) on delete set null,
  event_type text not null,
  ref        text,
  created_at timestamptz not null default now()
);
create index on portal_events (user_id, created_at desc);

create table email_preferences (
  user_id      uuid primary key references profiles(id) on delete cascade,
  digest       boolean not null default true,
  product      boolean not null default true,
  updated_at   timestamptz not null default now()
);

create table feature_flags (
  key     text primary key,
  enabled boolean not null default false,
  payload jsonb
);

-- ===== profile auto-creation on first Google login =====
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, google_email, display_name, avatar_url, access_type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    case when exists (select 1 from comped_emails c where lower(c.email) = lower(new.email)) then 'comped' else 'member' end
  );
  insert into login_events (user_id) values (new.id);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ===== seed: problem-first tags =====
insert into tags (slug, name) values
  ('images', 'Images'), ('listings', 'Listings'), ('video', 'Video'),
  ('automation', 'Automation'), ('claude-code', 'Claude Code'),
  ('sourcing', 'Sourcing'), ('research', 'Research');
