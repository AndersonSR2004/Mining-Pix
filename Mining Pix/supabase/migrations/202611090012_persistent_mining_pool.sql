-- Mining Pix Phase 3: authoritative Mining Pool ledger and settlement.
-- Pool budgets are explicit per cycle; this migration does not mint or schedule PC automatically.

create table public.pool_cycles (
  id uuid primary key default gen_random_uuid(),
  cycle_key text not null unique check (length(cycle_key) between 1 and 100),
  status text not null default 'open' check (status in ('open','settled','cancelled')),
  budget_pc numeric(20,0) not null check (budget_pc >= 0),
  total_hashrate numeric(30,6) not null default 0 check (total_hashrate >= 0),
  participant_count integer not null default 0 check (participant_count >= 0),
  rules_version integer not null default 1 check (rules_version > 0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'open' and closed_at is null) or (status <> 'open' and closed_at is not null))
);

create unique index pool_cycles_single_open_idx on public.pool_cycles ((status)) where status = 'open';
create index pool_cycles_history_idx on public.pool_cycles (closed_at desc) where status = 'settled';

create table public.pool_allocations (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.pool_cycles(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  hashrate_snapshot numeric(30,6) not null check (hashrate_snapshot > 0),
  share numeric(30,18) not null check (share > 0 and share <= 1),
  amount_pc numeric(20,0) not null check (amount_pc >= 0),
  wallet_transaction_id uuid references public.wallet_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (cycle_id, user_id),
  check ((amount_pc = 0 and wallet_transaction_id is null) or (amount_pc > 0 and wallet_transaction_id is not null))
);

create index pool_allocations_user_history_idx on public.pool_allocations (user_id, created_at desc);
create index pool_allocations_cycle_idx on public.pool_allocations (cycle_id);

alter table public.pool_cycles enable row level security;
alter table public.pool_allocations enable row level security;

create policy "Authenticated users can read settled pool cycles"
on public.pool_cycles for select to authenticated
using (status = 'settled');

create policy "Users can read their own pool allocations"
on public.pool_allocations for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.pool_cycles from anon, authenticated;
revoke all on public.pool_allocations from anon, authenticated;
grant select on public.pool_cycles to authenticated;
grant select on public.pool_allocations to authenticated;

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
    'budget_pc', budget_pc, 'opened_at', opened_at,
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

create or replace function public.open_pool_cycle(p_cycle_key text, p_budget_pc numeric)
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
  if p_budget_pc is null or p_budget_pc < 0 or p_budget_pc <> trunc(p_budget_pc) or p_budget_pc > 99999999999999999999 then
    raise exception 'Invalid pool budget';
  end if;

  insert into public.pool_cycles (cycle_key, budget_pc)
  values (trim(p_cycle_key), p_budget_pc)
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
    return jsonb_build_object('cycle_id', p_cycle_id, 'status', 'settled', 'participants', 0, 'distributed_pc', 0);
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
        floor(v_cycle.budget_pc * hashrate / v_total_hashrate)::numeric(20,0) as base_reward,
        (v_cycle.budget_pc * hashrate / v_total_hashrate)
          - floor(v_cycle.budget_pc * hashrate / v_total_hashrate) as fractional_remainder
      from player_power
    ), ranked as (
      select *, row_number() over (order by fractional_remainder desc, user_id asc) as remainder_rank,
        v_cycle.budget_pc - sum(base_reward) over () as remaining_pc
      from base
    )
    select user_id, hashrate,
      (base_reward + case when remainder_rank <= remaining_pc then 1 else 0 end)::numeric(20,0) as reward_pc
    from ranked
    order by user_id
  loop
    v_transaction_id := null;
    if v_allocation.reward_pc > 0 then
      select balance into v_wallet_balance
      from public.wallets where user_id = v_allocation.user_id for update;
      if not found then raise exception 'Wallet not found for pool participant'; end if;

      update public.wallets
        set balance = balance + v_allocation.reward_pc,
            version = version + 1,
            updated_at = now()
        where user_id = v_allocation.user_id
        returning balance into v_wallet_balance;

      insert into public.wallet_transactions (
        user_id, amount, balance_after, transaction_type,
        reference_type, reference_id, idempotency_key, description
      ) values (
        v_allocation.user_id, v_allocation.reward_pc, v_wallet_balance, 'pool_reward',
        'pool_cycle', p_cycle_id::text, 'pool:' || p_cycle_id::text,
        'Recompensa da Mining Pool'
      ) returning id into v_transaction_id;
    end if;

    insert into public.pool_allocations (
      cycle_id, user_id, hashrate_snapshot, share, amount_pc, wallet_transaction_id
    ) values (
      p_cycle_id, v_allocation.user_id, v_allocation.hashrate,
      v_allocation.hashrate / v_total_hashrate, v_allocation.reward_pc, v_transaction_id
    );
  end loop;

  update public.pool_cycles
    set status = 'settled', closed_at = now(),
        total_hashrate = v_total_hashrate, participant_count = v_participants
    where id = p_cycle_id;

  return jsonb_build_object(
    'cycle_id', p_cycle_id, 'status', 'settled',
    'participants', v_participants, 'total_hashrate', v_total_hashrate,
    'distributed_pc', v_cycle.budget_pc
  );
end;
$$;

revoke all on function public.settle_pool_cycle(uuid) from public, anon, authenticated;
grant execute on function public.settle_pool_cycle(uuid) to service_role;
