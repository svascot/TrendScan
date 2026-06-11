-- Add per-user money-management knobs used by the GMMA scanner to compute
-- per-row position sizing: how many shares to buy so that hitting the
-- structural stop loss costs exactly `risk_per_trade_pct` of `total_capital`.
-- Safe to re-run.

alter table public.user_settings
  add column if not exists total_capital numeric(12, 2) not null default 10000.00;

alter table public.user_settings
  add column if not exists risk_per_trade_pct numeric(5, 2) not null default 1.00;

alter table public.user_settings
  drop constraint if exists total_capital_ok;

alter table public.user_settings
  add constraint total_capital_ok check (total_capital >= 0);

alter table public.user_settings
  drop constraint if exists risk_per_trade_pct_ok;

alter table public.user_settings
  add constraint risk_per_trade_pct_ok check (risk_per_trade_pct > 0 and risk_per_trade_pct <= 10);

-- Tell PostgREST to refresh its column cache so the JS client sees the new columns.
notify pgrst, 'reload schema';
