-- Restore the DEV bootstrap on fresh databases and keep existing rows intact.
create table if not exists public.depix_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(20,8) not null default 0 check (balance >= 0),
  reserved numeric(20,8) not null default 0 check (reserved between 0 and balance),
  updated_at timestamptz not null default now()
);
create table if not exists public.depix_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  provider_reference text unique,
  network text not null default 'liquid' check (network = 'liquid'),
  amount numeric(20,8) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','confirmed','credited','expired','rejected')),
  txid text unique,
  created_at timestamptz not null default now()
);
create table if not exists public.depix_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  amount numeric(20,8) not null check (amount <> 0),
  entry_type text not null check (entry_type in ('deposit','purchase','pool_reward','withdrawal','refund','adjustment','reserve','release')),
  reference_id text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.depix_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  destination_address text not null,
  amount numeric(20,8) not null check (amount > 0),
  status text not null default 'requested' check (status in ('requested','approved','rejected','broadcast','confirmed','failed')),
  txid text unique,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.depix_accounts enable row level security;
alter table public.depix_deposits enable row level security;
alter table public.depix_ledger enable row level security;
alter table public.depix_withdrawals enable row level security;

do $$
declare
  item record;
begin
  for item in select * from (values
    ('depix_accounts', 'read own depix account'),
    ('depix_deposits', 'read own depix deposits'),
    ('depix_ledger', 'read own depix ledger'),
    ('depix_withdrawals', 'read own depix withdrawals')
  ) as policies(table_name, policy_name)
  loop
    if not exists (
      select 1 from pg_policies where schemaname = 'public'
        and tablename = item.table_name and policyname = item.policy_name
    ) then
      execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
        item.policy_name, item.table_name);
    end if;
    execute format('revoke all on public.%I from public, anon, authenticated', item.table_name);
    execute format('grant select on public.%I to authenticated', item.table_name);
  end loop;
end;
$$;

create index if not exists depix_ledger_user_recent_idx
  on public.depix_ledger (user_id, created_at desc, id desc);

-- Return decimal strings so the browser never rounds a financial value.
create function public.depix_wallet_snapshot()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'total', coalesce(a.balance, 0)::text,
    'reserved', coalesce(a.reserved, 0)::text,
    'available', coalesce(a.balance - a.reserved, 0)::text,
    'entries', coalesce((
      select jsonb_agg(to_jsonb(entry) order by entry.created_at desc, entry.id desc)
      from (
        select id, amount::text as amount, entry_type, created_at
        from public.depix_ledger where user_id = viewer.id
        order by created_at desc, id desc limit 20
      ) entry
    ), '[]'::jsonb)
  )
  from (select auth.uid() as id) viewer
  left join public.depix_accounts a on a.user_id = viewer.id
  where viewer.id is not null
$$;

revoke execute on function public.depix_wallet_snapshot() from public, anon, authenticated;
grant execute on function public.depix_wallet_snapshot() to authenticated;
