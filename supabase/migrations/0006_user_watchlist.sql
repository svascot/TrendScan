create table if not exists public.user_watchlist (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  ticker      varchar(12) not null,
  created_at  timestamptz not null default now(),
  unique (user_id, ticker)
);

create index if not exists user_watchlist_user_created_idx
  on public.user_watchlist (user_id, created_at desc);

alter table public.user_watchlist enable row level security;

drop policy if exists "watchlist_select_own" on public.user_watchlist;
drop policy if exists "watchlist_insert_own" on public.user_watchlist;
drop policy if exists "watchlist_delete_own" on public.user_watchlist;

create policy "watchlist_select_own" on public.user_watchlist
  for select using (auth.uid() = user_id);
create policy "watchlist_insert_own" on public.user_watchlist
  for insert with check (auth.uid() = user_id);
create policy "watchlist_delete_own" on public.user_watchlist
  for delete using (auth.uid() = user_id);
