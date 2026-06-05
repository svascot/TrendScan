-- Add per-user ATR volatility floor (fraction, e.g. 0.0150 = 1.5%) used by the
-- scanner's gatekeeper to filter out assets whose daily range is too small to
-- reach the configured Take Profit inside the 1–5 day window.
-- Safe to re-run.

alter table public.user_settings
  add column if not exists atr_min_pct numeric(5,4) not null default 0.0150;

alter table public.user_settings
  drop constraint if exists atr_min_pct_ok;

alter table public.user_settings
  add constraint atr_min_pct_ok check (atr_min_pct >= 0 and atr_min_pct <= 0.2000);

-- Tell PostgREST to refresh its column cache so the JS client sees the new column.
notify pgrst, 'reload schema';
