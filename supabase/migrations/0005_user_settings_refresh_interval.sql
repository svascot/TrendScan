-- Add per-user auto-refresh interval (in minutes) for the dashboard scanner.
-- Safe to re-run.

alter table public.user_settings
  add column if not exists refresh_interval_minutes int not null default 5;

alter table public.user_settings
  drop constraint if exists refresh_interval_ok;

alter table public.user_settings
  add constraint refresh_interval_ok check (refresh_interval_minutes between 1 and 1440);

-- Tell PostgREST to refresh its column cache so the JS client sees the new column.
notify pgrst, 'reload schema';
