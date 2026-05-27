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
