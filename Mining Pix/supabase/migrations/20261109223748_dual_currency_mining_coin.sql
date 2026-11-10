-- Mining Pix — D-012/D-013: separate PIX COIN from MINING COIN.
-- Existing PC balances and historical Pool allocations are preserved.
-- New Pool cycles are MC-only. No purchase, conversion, or withdrawal path is created.

begin;

comment on table public.wallets is
  'PIX COIN (PC) wallet. Existing balances and wallet_transactions remain denominated in PIX COIN.';

create table public.mining_coin_wallets (
  user_id uuid primary key references auth.users(id) on delete restrict,
  balance numeric(20,0) not null default 0 check (balance >= 0),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mining_coin_wallets is
  'Separate MINING COIN (MC) reward wallet. MC is credited only by the server-side Mining Pool in this phase; no purchase, conversion, withdrawal, or client-side write path exists.';

create table public.mining_coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(20,0) not null check (amount > 0),
  balance_after numeric(20,0) not null check (balance_after >= 0),
  source text not null check (source = 'pool_reward'),
  reference_type text not null check (reference_type = 'pool_cycle'),
  reference_id text not null,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 128),
  description text not null default 'Recompensa da Mining Pool' check (char_length(description) <= 160),
  created_at timestamptz not null default now(),
  constraint mining_coin_transactions_user_idempotency_key_key unique (user_id, idempotency_key)
);

create index mining_coin_transactions_user_created_idx
  on public.mining_coin_transactions (user_id, created_at desc);

alter table public.mining_coin_wallets enable row level security;
alter table public.mining_coin_transactions enable row level security;

revoke all on public.mining_coin_wallets from public, anon, authenticated;
revoke all on public.mining_coin_transactions from public, anon, authenticated;
grant select on public.mining_coin_wallets to authenticated;
grant select on public.mining_coin_transactions to authenticated;

create policy mining_coin_wallets_select_own
  on public.mining_coin_wallets for select to authenticated
  using ((select auth.uid()) = user_id);

create policy mining_coin_transactions_select_own
  on public.mining_coin_transactions for select to authenticated
  using ((select auth.uid()) = user_id);

insert into public.mining_coin_wallets (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_display_name text;
begin
  safe_display_name := nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 32), '');
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(safe_display_name, 'Minerador'))
  on conflict (user_id) do nothing;

  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.mining_coin_wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.player_progress (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

alter table public.pool_cycles
  add column budget_mc numeric(20,0) not null default 0
  check (budget_mc >= 0);

alter table public.pool_allocations
  add column amount_mc numeric(20,0) not null default 0
  check (amount_mc >= 0),
  add column mining_coin_transaction_id uuid
  references public.mining_coin_transactions(id) on delete restrict;

alter table public.pool_allocations
  add constraint pool_allocations_mc_transaction_consistency
  check (
    (amount_mc = 0 and mining_coin_transaction_id is null)
    or (amount_mc > 0 and mining_coin_transaction_id is not null)
  );

create index pool_allocations_mining_coin_transaction_idx
  on public.pool_allocations (mining_coin_transaction_id);

drop function public.open_pool_cycle(text, numeric);

create function public.open_pool_cycle(p_cycle_key text, p_budget_mc numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_cycle_key is null or length(trim(p_cycle_key)) not between 1 and 100 then
    raise exception 'Invalid cycle key';
  end if;
  if p_budget_mc is null or p_budget_mc < 0 or p_budget_mc <> trunc(p_budget_mc)
     or p_budget_mc > 99999999999999999999 then
    raise exception 'Invalid MINING COIN pool budget';
  end if;

  insert into public.pool_cycles (cycle_key, budget_pc, budget_mc)
  values (trim(p_cycle_key), 0, p_budget_mc)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.open_pool_cycle(text, numeric) from public, anon, authenticated;
grant execute on function public.open_pool_cycle(text, numeric) to service_role;

create or replace function public.settle_pool_cycle(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle public.pool_cycles%rowtype;
  v_total_hashrate numeric(30,6);
  v_participants integer;
  v_allocation record;
  v_wallet_balance numeric(20,0);
  v_transaction_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;

  select * into v_cycle
  from public.pool_cycles
  where id = p_cycle_id
  for update;

  if not found then raise exception 'Pool cycle not found'; end if;
  if v_cycle.status = 'settled' then
    return jsonb_build_object('cycle_id', v_cycle.id, 'status', 'settled', 'already_settled', true);
  end if;
  if v_cycle.status <> 'open' then raise exception 'Pool cycle is not open'; end if;

  select coalesce(sum(c.hashrate), 0), count(distinct pe.user_id)
    into v_total_hashrate, v_participants
  from public.player_equipment pe
  join public.equipment_catalog c on c.sku = pe.catalog_sku
  join public.player_rooms pr on pr.id = pe.room_id and pr.user_id = pe.user_id
  where pe.status = 'installed' and pr.active = true;

  if v_total_hashrate <= 0 then
    update public.pool_cycles
      set status = 'settled', closed_at = now(), total_hashrate = 0, participant_count = 0
      where id = p_cycle_id;
    return jsonb_build_object(
      'cycle_id', p_cycle_id, 'status', 'settled',
      'participants', 0, 'distributed_mc', 0
    );
  end if;

  for v_allocation in
    with player_power as (
      select pe.user_id, sum(c.hashrate)::numeric(30,6) as hashrate
      from public.player_equipment pe
      join public.equipment_catalog c on c.sku = pe.catalog_sku
      join public.player_rooms pr on pr.id = pe.room_id and pr.user_id = pe.user_id
      where pe.status = 'installed' and pr.active = true
      group by pe.user_id
    ), base as (
      select user_id, hashrate,
        floor(v_cycle.budget_mc * hashrate / v_total_hashrate)::numeric(20,0) as base_reward,
        (v_cycle.budget_mc * hashrate / v_total_hashrate)
          - floor(v_cycle.budget_mc * hashrate / v_total_hashrate) as fractional_remainder
      from player_power
    ), ranked as (
      select *, row_number() over (order by fractional_remainder desc, user_id asc) as remainder_rank,
        v_cycle.budget_mc - sum(base_reward) over () as remaining_mc
      from base
    )
    select user_id, hashrate,
      (base_reward + case when remainder_rank <= remaining_mc then 1 else 0 end)::numeric(20,0) as reward_mc
    from ranked
    order by user_id
  loop
    v_transaction_id := null;
    if v_allocation.reward_mc > 0 then
      insert into public.mining_coin_wallets (user_id)
      values (v_allocation.user_id)
      on conflict (user_id) do nothing;

      select balance into v_wallet_balance
      from public.mining_coin_wallets
      where user_id = v_allocation.user_id
      for update;

      if not found then raise exception 'MINING COIN wallet not found for pool participant'; end if;

      update public.mining_coin_wallets
        set balance = balance + v_allocation.reward_mc,
            version = version + 1,
            updated_at = now()
        where user_id = v_allocation.user_id
        returning balance into v_wallet_balance;

      insert into public.mining_coin_transactions (
        user_id, amount, balance_after, source,
        reference_type, reference_id, idempotency_key, description
      ) values (
        v_allocation.user_id, v_allocation.reward_mc, v_wallet_balance, 'pool_reward',
        'pool_cycle', p_cycle_id::text, 'pool:' || p_cycle_id::text,
        'Recompensa da Mining Pool'
      ) returning id into v_transaction_id;
    end if;

    insert into public.pool_allocations (
      cycle_id, user_id, hashrate_snapshot, share,
      amount_pc, wallet_transaction_id, amount_mc, mining_coin_transaction_id
    ) values (
      p_cycle_id, v_allocation.user_id, v_allocation.hashrate,
      v_allocation.hashrate / v_total_hashrate,
      0, null, v_allocation.reward_mc, v_transaction_id
    );
  end loop;

  update public.pool_cycles
    set status = 'settled', closed_at = now(),
        total_hashrate = v_total_hashrate, participant_count = v_participants
    where id = p_cycle_id;

  return jsonb_build_object(
    'cycle_id', p_cycle_id, 'status', 'settled',
    'participants', v_participants, 'total_hashrate', v_total_hashrate,
    'distributed_mc', v_cycle.budget_mc
  );
end;
$$;

revoke all on function public.settle_pool_cycle(uuid) from public, anon, authenticated;
grant execute on function public.settle_pool_cycle(uuid) to service_role;

create or replace function public.get_pool_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_player_hashrate numeric(30,6);
  v_network_hashrate numeric(30,6);
  v_latest_cycle jsonb;
  v_history jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(sum(c.hashrate), 0)
    into v_player_hashrate
  from public.player_equipment pe
  join public.equipment_catalog c on c.sku = pe.catalog_sku
  join public.player_rooms pr on pr.id = pe.room_id and pr.user_id = pe.user_id
  where pe.user_id = v_user_id and pe.status = 'installed' and pr.active = true;

  select coalesce(sum(c.hashrate), 0)
    into v_network_hashrate
  from public.player_equipment pe
  join public.equipment_catalog c on c.sku = pe.catalog_sku
  join public.player_rooms pr on pr.id = pe.room_id and pr.user_id = pe.user_id
  where pe.status = 'installed' and pr.active = true;

  select jsonb_build_object(
    'id', id, 'cycle_key', cycle_key, 'status', status,
    'budget_mc', budget_mc, 'opened_at', opened_at,
    'total_hashrate', total_hashrate, 'participant_count', participant_count
  ) into v_latest_cycle
  from public.pool_cycles
  where status = 'open'
  order by opened_at desc
  limit 1;

  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
    into v_history
  from (
    select jsonb_build_object(
      'cycle_key', pc.cycle_key,
      'amount_pc', pa.amount_pc,
      'amount_mc', pa.amount_mc,
      'hashrate_snapshot', pa.hashrate_snapshot,
      'share', pa.share,
      'created_at', pa.created_at
    ) as item, pa.created_at
    from public.pool_allocations pa
    join public.pool_cycles pc on pc.id = pa.cycle_id
    where pa.user_id = v_user_id
    order by pa.created_at desc
    limit 10
  ) recent;

  return jsonb_build_object(
    'player_hashrate', v_player_hashrate,
    'network_hashrate', v_network_hashrate,
    'participation', case when v_network_hashrate > 0 then v_player_hashrate / v_network_hashrate else 0 end,
    'current_cycle', v_latest_cycle,
    'history', v_history
  );
end;
$$;

revoke all on function public.get_pool_dashboard() from public, anon;
grant execute on function public.get_pool_dashboard() to authenticated;

comment on function public.settle_pool_cycle(uuid) is
  'Settles the persistent Mining Pool into MINING COIN only. PC balances and PC ledger are never touched. Service role only; transaction and allocation are idempotent and atomic.';

commit;
