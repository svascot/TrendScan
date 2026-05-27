-- =============================================================
-- TrendScan — full schema bootstrap.
-- Paste this whole file into Supabase SQL Editor and run once.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS,
-- DROP POLICY IF EXISTS, etc).
-- =============================================================


-- ---------- 1. user_trades ----------
create table if not exists public.user_trades (
  id           uuid          primary key default gen_random_uuid(),
  user_id      uuid          not null references auth.users(id) on delete cascade,
  ticker       varchar(12)   not null,
  entry_price  numeric(10,2) not null,
  target_tp    numeric(10,2) not null,
  target_sl    numeric(10,2) not null,
  status       varchar(20)   not null default 'OPEN'
               check (status in ('OPEN','HIT_TP','HIT_SL','CLOSED')),
  notes        text,
  created_at   timestamptz   not null default now(),
  closed_at    timestamptz
);

create index if not exists user_trades_user_status_idx
  on public.user_trades (user_id, status);

create index if not exists user_trades_user_created_idx
  on public.user_trades (user_id, created_at desc);


-- ---------- 2. user_settings ----------
create table if not exists public.user_settings (
  user_id        uuid          primary key references auth.users(id) on delete cascade,
  tp_pct         numeric(5,4)  not null default 0.0400,
  sl_pct         numeric(5,4)  not null default 0.0200,
  rsi_low        int           not null default 55,
  rsi_high       int           not null default 65,
  ma_short       int           not null default 50,
  ma_long        int           not null default 200,
  scanner_limit  int           not null default 10,
  updated_at     timestamptz   not null default now(),
  constraint rsi_band_ok   check (rsi_high > rsi_low),
  constraint ma_order_ok   check (ma_long > ma_short),
  constraint limit_ok      check (scanner_limit between 1 and 100)
);

create or replace function public.touch_user_settings()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch
  before update on public.user_settings
  for each row execute function public.touch_user_settings();


-- ---------- 3. Row-Level Security ----------
alter table public.user_trades   enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "trades_select_own"  on public.user_trades;
drop policy if exists "trades_insert_own"  on public.user_trades;
drop policy if exists "trades_update_own"  on public.user_trades;
drop policy if exists "trades_delete_own"  on public.user_trades;

create policy "trades_select_own" on public.user_trades
  for select using (auth.uid() = user_id);
create policy "trades_insert_own" on public.user_trades
  for insert with check (auth.uid() = user_id);
create policy "trades_update_own" on public.user_trades
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trades_delete_own" on public.user_trades
  for delete using (auth.uid() = user_id);

drop policy if exists "settings_select_own" on public.user_settings;
drop policy if exists "settings_insert_own" on public.user_settings;
drop policy if exists "settings_update_own" on public.user_settings;

create policy "settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
