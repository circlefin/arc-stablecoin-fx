-- Arc FX initial schema: profiles linked to a Circle SCA wallet, swap lifecycle
-- records, and a per-user balance snapshot used to drive the UI via realtime.

create extension if not exists "pgcrypto";

-- profiles: 1:1 with auth.users; holds the Circle wallet handle.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  circle_wallet_id text not null,
  wallet_address text not null,
  created_at timestamptz not null default now()
);

create unique index profiles_wallet_address_idx on public.profiles (lower(wallet_address));

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- swaps: lifecycle of every USDC<->EURC trade.
create type public.swap_token as enum ('USDC', 'EURC');
create type public.swap_status as enum ('pending', 'submitted', 'confirmed', 'failed');

create table public.swaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  from_token public.swap_token not null,
  to_token public.swap_token not null,
  amount_in numeric(38, 18) not null check (amount_in > 0),
  quoted_out numeric(38, 18),
  min_out numeric(38, 18),
  slippage_bps integer not null check (slippage_bps between 0 and 10000),
  app_fee_bps integer not null check (app_fee_bps between 0 and 10000),
  status public.swap_status not null default 'pending',
  circle_tx_id text,
  tx_hash text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swaps_distinct_tokens check (from_token <> to_token)
);

create index swaps_user_created_idx on public.swaps (user_id, created_at desc);

alter table public.swaps enable row level security;

create policy "swaps_select_own" on public.swaps
  for select using (auth.uid() = user_id);

-- wallet_balances: cached snapshot, kept fresh by server actions after every
-- Circle call. Realtime fans the changes out to all open tabs.
create table public.wallet_balances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  usdc numeric(38, 6) not null default 0,
  eurc numeric(38, 6) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.wallet_balances enable row level security;

create policy "wallet_balances_select_own" on public.wallet_balances
  for select using (auth.uid() = user_id);

-- updated_at maintenance.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger swaps_set_updated_at
  before update on public.swaps
  for each row execute function public.set_updated_at();

create trigger wallet_balances_set_updated_at
  before update on public.wallet_balances
  for each row execute function public.set_updated_at();

-- Realtime: stream changes to swaps and wallet_balances to logged-in users.
alter publication supabase_realtime add table public.swaps;
alter publication supabase_realtime add table public.wallet_balances;
