-- Patch any older user_trades table that pre-dates the closed_at / notes columns.
-- Safe to re-run (every statement is idempotent).

alter table public.user_trades add column if not exists notes      text;
alter table public.user_trades add column if not exists closed_at  timestamptz;

-- Tell PostgREST to refresh its column cache so the JS client sees the new columns.
notify pgrst, 'reload schema';
