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
