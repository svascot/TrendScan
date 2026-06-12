-- Add per-user broker fee (USD per round trip: entry + exit combined).
-- The GMMA scanner raises the take-profit by fee / shares so a winning
-- trade still nets 2x the risked amount after commissions.
-- Safe to re-run.

alter table public.user_settings
  add column if not exists broker_fee_usd numeric(8, 2) not null default 2.00;

alter table public.user_settings
  drop constraint if exists broker_fee_usd_ok;

alter table public.user_settings
  add constraint broker_fee_usd_ok check (broker_fee_usd >= 0 and broker_fee_usd <= 100);

-- Tell PostgREST to refresh its column cache so the JS client sees the new column.
notify pgrst, 'reload schema';
