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
