-- Add a per-user toggle for browser (Chrome) notifications.
-- When on, the GMMA scanner fires a Web Notification for each new setup that
-- appears in a refresh while the dashboard tab is open. Actual delivery still
-- depends on the browser-level Notification permission being granted.
-- Safe to re-run.

alter table public.user_settings
  add column if not exists notifications_enabled boolean not null default false;

-- Tell PostgREST to refresh its column cache so the JS client sees the new column.
notify pgrst, 'reload schema';
