-- Content Desk migration 4 (16.11.2026): a note can be about one picture. Safe to run twice.
alter table public.notes add column if not exists asset_id uuid references public.assets (id) on delete set null;
create index if not exists notes_asset_idx on public.notes (asset_id) where asset_id is not null;
