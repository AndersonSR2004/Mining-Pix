begin;

-- Starter catalog: T0 machines are intentionally low-power onboarding equipment.
alter table public.equipment_catalog
  add column if not exists tier smallint,
  add column if not exists overclock_percent numeric(5,2) not null default 0,
  add column if not exists blessing_min_percent numeric(5,2),
  add column if not exists blessing_max_percent numeric(5,2);

alter table public.equipment_catalog
  drop constraint if exists equipment_catalog_tier_check,
  add constraint equipment_catalog_tier_check
    check (tier is null or tier between 0 and 5),
  drop constraint if exists equipment_catalog_overclock_percent_check,
  add constraint equipment_catalog_overclock_percent_check
    check (overclock_percent between 0 and 100),
  drop constraint if exists equipment_catalog_blessing_range_check,
  add constraint equipment_catalog_blessing_range_check
    check (
      (blessing_min_percent is null and blessing_max_percent is null)
      or (
        blessing_min_percent is not null
        and blessing_max_percent is not null
        and blessing_min_percent >= 0
        and blessing_max_percent >= blessing_min_percent
        and blessing_max_percent <= 100
      )
    );

alter table public.player_equipment
  add column if not exists blessing_percent numeric(5,2) not null default 0;

alter table public.player_equipment
  drop constraint if exists player_equipment_blessing_percent_check,
  add constraint player_equipment_blessing_percent_check
    check (blessing_percent between 0 and 100);

insert into public.equipment_catalog
  (sku, name, description, equipment_type, hashrate, price_pc, active, display_order,
   tier, overclock_percent, blessing_min_percent, blessing_max_percent)
values
  ('pix_starter_01', 'PIX Starter 01', 'Máquina T0 de entrada para iniciar sua operação.', 'Máquina inicial · Tier 0', 10, 100, true, 1, 0, 0, 0, 20),
  ('pix_starter_02', 'PIX Starter 02', 'Máquina T0 de entrada com potência incremental.', 'Máquina inicial · Tier 0', 15, 200, true, 2, 0, 0, 0, 20),
  ('pix_starter_03', 'PIX Starter 03', 'Máquina T0 de entrada com potência incremental.', 'Máquina inicial · Tier 0', 20, 300, true, 3, 0, 0, 0, 20),
  ('pix_starter_04', 'PIX Starter 04', 'Máquina T0 de entrada com potência incremental.', 'Máquina inicial · Tier 0', 25, 400, true, 4, 0, 0, 0, 20),
  ('pix_starter_05', 'PIX Starter 05', 'Máquina T0 de entrada com potência incremental.', 'Máquina inicial · Tier 0', 30, 500, true, 5, 0, 0, 0, 20),
  ('pix_starter_06', 'PIX Starter 06', 'Máquina T0 de entrada com potência incremental.', 'Máquina inicial · Tier 0', 35, 600, true, 6, 0, 0, 0, 20),
  ('pix_starter_07', 'PIX Starter 07', 'Máquina T0 de entrada com potência incremental.', 'Máquina inicial · Tier 0', 40, 700, true, 7, 0, 0, 0, 20),
  ('pix_starter_08', 'PIX Starter 08', 'Máquina T0 de entrada com potência incremental.', 'Máquina inicial · Tier 0', 45, 800, true, 8, 0, 0, 0, 20),
  ('pix_starter_09', 'PIX Starter 09', 'Máquina T0 de entrada com potência incremental.', 'Máquina inicial · Tier 0', 50, 900, true, 9, 0, 0, 0, 20),
  ('pix_starter_10', 'PIX Starter 10', 'Máquina T0 de entrada com potência incremental.', 'Máquina inicial · Tier 0', 55, 1000, true, 10, 0, 0, 0, 20)
on conflict (sku) do update set
  name = excluded.name,
  description = excluded.description,
  equipment_type = excluded.equipment_type,
  hashrate = excluded.hashrate,
  price_pc = excluded.price_pc,
  active = excluded.active,
  display_order = excluded.display_order,
  tier = excluded.tier,
  overclock_percent = excluded.overclock_percent,
  blessing_min_percent = excluded.blessing_min_percent,
  blessing_max_percent = excluded.blessing_max_percent,
  updated_at = now();

-- Existing T2/T3 catalogue items remain unchanged and keep their existing Tier unset
-- until their mapping and blessing ranges are approved.

create or replace function public.purchase_equipment(
  p_sku text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.equipment_catalog%rowtype;
  v_wallet public.wallets%rowtype;
  v_existing public.wallet_transactions%rowtype;
  v_equipment_id uuid;
  v_balance_after numeric(20,0);
  v_blessing numeric(5,2) := 0;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '28000';
  end if;
  if p_sku is null or char_length(p_sku) not between 1 and 64 then
    raise exception 'Equipamento inválido.' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128 then
    raise exception 'Chave de compra inválida.' using errcode = '22023';
  end if;

  select * into v_item
  from public.equipment_catalog
  where sku = p_sku and active = true
  for share;
  if not found then
    raise exception 'Equipamento indisponível.' using errcode = 'P0002';
  end if;

  select * into v_wallet
  from public.wallets
  where user_id = v_user_id
  for update;
  if not found then
    raise exception 'Carteira não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.wallet_transactions
  where user_id = v_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.transaction_type <> 'purchase'
       or v_existing.reference_type <> 'equipment'
       or v_existing.reference_id <> p_sku
       or v_existing.amount <> -v_item.price_pc then
      raise exception 'Chave de idempotência já utilizada em outra operação.' using errcode = '22023';
    end if;
    select id into v_equipment_id
    from public.player_equipment
    where user_id = v_user_id and catalog_sku = p_sku
      and acquired_at = v_existing.created_at
    order by acquired_at desc limit 1;
    select blessing_percent into v_blessing
    from public.player_equipment where id = v_equipment_id;
    return jsonb_build_object(
      'success', true, 'replayed', true, 'equipment_id', v_equipment_id,
      'sku', p_sku, 'price_pc', v_item.price_pc,
      'balance_after', v_existing.balance_after,
      'blessing_percent', coalesce(v_blessing, 0)
    );
  end if;

  if v_wallet.balance < v_item.price_pc then
    raise exception 'Saldo insuficiente.' using errcode = 'P0001';
  end if;

  if v_item.blessing_min_percent is not null then
    v_blessing := round((
      v_item.blessing_min_percent
      + random() * (v_item.blessing_max_percent - v_item.blessing_min_percent)
    )::numeric, 2);
  end if;

  v_balance_after := v_wallet.balance - v_item.price_pc;
  update public.wallets
  set balance = v_balance_after, version = version + 1, updated_at = now()
  where user_id = v_user_id;

  insert into public.player_equipment(user_id, catalog_sku, purchase_price_pc, blessing_percent)
  values (v_user_id, p_sku, v_item.price_pc, v_blessing)
  returning id into v_equipment_id;

  insert into public.wallet_transactions(
    user_id, amount, balance_after, transaction_type,
    reference_type, reference_id, idempotency_key, description
  )
  values (
    v_user_id, -v_item.price_pc, v_balance_after, 'purchase',
    'equipment', p_sku, p_idempotency_key, 'Compra de ' || v_item.name
  );

  return jsonb_build_object(
    'success', true, 'replayed', false, 'equipment_id', v_equipment_id,
    'sku', p_sku, 'price_pc', v_item.price_pc,
    'balance_after', v_balance_after, 'blessing_percent', v_blessing
  );
end;
$$;

revoke all on function public.purchase_equipment(text, text) from public, anon;
grant execute on function public.purchase_equipment(text, text) to authenticated;

-- Authoritative daily game attempt accounting and bounded game rewards.
create table if not exists public.player_game_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null check (game_id in ('flappy_games', 'snake_games', 'coin_catch_games')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  won boolean,
  pc_awarded integer not null default 0 check (pc_awarded in (0, 1)),
  hash_awarded numeric(10,2) not null default 0 check (hash_awarded in (0, 1)),
  constraint player_game_attempts_finish_state_check
    check ((finished_at is null and won is null) or (finished_at is not null and won is not null))
);

create index if not exists player_game_attempts_user_game_started_idx
  on public.player_game_attempts(user_id, game_id, started_at desc);

alter table public.player_game_attempts enable row level security;
revoke all on public.player_game_attempts from public, anon, authenticated;
grant select on public.player_game_attempts to authenticated;
create policy player_game_attempts_select_own
  on public.player_game_attempts for select to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.player_game_hash_boosts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_hashrate numeric(10,2) not null default 0 check (active_hashrate >= 0),
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint player_game_hash_boosts_expiry_check
    check ((active_hashrate = 0 and expires_at is null) or (active_hashrate > 0 and expires_at is not null))
);

alter table public.player_game_hash_boosts enable row level security;
revoke all on public.player_game_hash_boosts from public, anon, authenticated;
grant select on public.player_game_hash_boosts to authenticated;
create policy player_game_hash_boosts_select_own
  on public.player_game_hash_boosts for select to authenticated
  using ((select auth.uid()) = user_id);


create or replace function public.get_player_mining_summary()
returns table(total_hashrate numeric, installed_equipment_count bigint, room_count bigint, total_room_capacity bigint)
language sql stable security invoker set search_path = ''
as $$
  select
    (
      coalesce((
        select sum(ec.hashrate * (1 + ec.overclock_percent / 100 + pe.blessing_percent / 100))
        from public.player_equipment pe
        join public.equipment_catalog ec on ec.sku = pe.catalog_sku
        where pe.user_id = (select auth.uid()) and pe.status = 'installed'
      ), 0)
      + coalesce((
        select b.active_hashrate from public.player_game_hash_boosts b
        where b.user_id = (select auth.uid()) and b.expires_at > now()
      ), 0)
    )::numeric,
    (select count(*) from public.player_equipment pe where pe.user_id = (select auth.uid()) and pe.status = 'installed'),
    (select count(*) from public.player_rooms pr where pr.user_id = (select auth.uid()) and pr.active = true),
    (select count(*) * 10 from public.player_rooms pr where pr.user_id = (select auth.uid()) and pr.active = true)
  where (select auth.uid()) is not null;
$$;

create or replace function public.get_player_room_summaries()
returns table(id uuid, room_number smallint, name text, installed_count bigint, total_hashrate numeric, capacity integer)
language sql stable set search_path = ''
as $$
  select
    pr.id,
    pr.room_number,
    pr.name,
    count(pe.id),
    coalesce(sum(ec.hashrate * (1 + ec.overclock_percent / 100 + pe.blessing_percent / 100)), 0)::numeric,
    10
  from public.player_rooms pr
  left join public.player_equipment pe
    on pe.user_id = pr.user_id and pe.room_id = pr.id and pe.status = 'installed'
  left join public.equipment_catalog ec on ec.sku = pe.catalog_sku
  where pr.user_id = (select auth.uid()) and pr.active = true
  group by pr.id, pr.room_number, pr.name
  order by pr.room_number;
$$;

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
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select
    coalesce((
      select sum(c.hashrate * (1 + c.overclock_percent / 100 + pe.blessing_percent / 100))
      from public.player_equipment pe
      join public.equipment_catalog c on c.sku = pe.catalog_sku
      join public.player_rooms pr on pr.id = pe.room_id and pr.user_id = pe.user_id
      where pe.user_id = v_user_id and pe.status = 'installed' and pr.active = true
    ), 0)
    + coalesce((
      select b.active_hashrate from public.player_game_hash_boosts b
      where b.user_id = v_user_id and b.expires_at > now()
    ), 0)
  into v_player_hashrate;

  select
    coalesce((
      select sum(c.hashrate * (1 + c.overclock_percent / 100 + pe.blessing_percent / 100))
      from public.player_equipment pe
      join public.equipment_catalog c on c.sku = pe.catalog_sku
      join public.player_rooms pr on pr.id = pe.room_id and pr.user_id = pe.user_id
      where pe.status = 'installed' and pr.active = true
    ), 0)
    + coalesce((
      select sum(b.active_hashrate) from public.player_game_hash_boosts b
      where b.expires_at > now()
    ), 0)
  into v_network_hashrate;

  select jsonb_build_object(
    'id', id, 'cycle_key', cycle_key, 'status', status,
    'budget_mc', budget_mc, 'opened_at', opened_at,
    'total_hashrate', total_hashrate, 'participant_count', participant_count
  ) into v_latest_cycle
  from public.pool_cycles
  where status = 'open'
  order by opened_at desc limit 1;

  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
  into v_history
  from (
    select jsonb_build_object(
      'cycle_key', pc.cycle_key, 'amount_pc', pa.amount_pc,
      'amount_mc', pa.amount_mc, 'hashrate_snapshot', pa.hashrate_snapshot,
      'share', pa.share, 'created_at', pa.created_at
    ) as item, pa.created_at
    from public.pool_allocations pa
    join public.pool_cycles pc on pc.id = pa.cycle_id
    where pa.user_id = v_user_id
    order by pa.created_at desc limit 10
  ) recent;

  return jsonb_build_object(
    'player_hashrate', v_player_hashrate,
    'network_hashrate', v_network_hashrate,
    'participation', case when v_network_hashrate > 0 then v_player_hashrate / v_network_hashrate else 0 end,
    'current_cycle', v_latest_cycle, 'history', v_history
  );
end;
$$;

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

  select * into v_cycle from public.pool_cycles where id = p_cycle_id for update;
  if not found then raise exception 'Pool cycle not found'; end if;
  if v_cycle.status = 'settled' then
    return jsonb_build_object('cycle_id', v_cycle.id, 'status', 'settled', 'already_settled', true);
  end if;
  if v_cycle.status <> 'open' then raise exception 'Pool cycle is not open'; end if;

  with player_power as (
    select user_id, sum(hashrate)::numeric(30,6) as hashrate
    from (
      select pe.user_id,
        ec.hashrate * (1 + ec.overclock_percent / 100 + pe.blessing_percent / 100) as hashrate
      from public.player_equipment pe
      join public.equipment_catalog ec on ec.sku = pe.catalog_sku
      join public.player_rooms pr on pr.id = pe.room_id and pr.user_id = pe.user_id
      where pe.status = 'installed' and pr.active = true
      union all
      select b.user_id, b.active_hashrate
      from public.player_game_hash_boosts b
      where b.expires_at > now() and b.active_hashrate > 0
    ) sources
    group by user_id
  )
  select coalesce(sum(hashrate), 0), count(*)::integer
  into v_total_hashrate, v_participants
  from player_power;

  if v_total_hashrate <= 0 then
    update public.pool_cycles set status = 'settled', closed_at = now(), total_hashrate = 0, participant_count = 0
    where id = p_cycle_id;
    return jsonb_build_object('cycle_id', p_cycle_id, 'status', 'settled', 'participants', 0, 'distributed_mc', 0);
  end if;

  for v_allocation in
    with player_power as (
      select user_id, sum(hashrate)::numeric(30,6) as hashrate
      from (
        select pe.user_id,
          ec.hashrate * (1 + ec.overclock_percent / 100 + pe.blessing_percent / 100) as hashrate
        from public.player_equipment pe
        join public.equipment_catalog ec on ec.sku = pe.catalog_sku
        join public.player_rooms pr on pr.id = pe.room_id and pr.user_id = pe.user_id
        where pe.status = 'installed' and pr.active = true
        union all
        select b.user_id, b.active_hashrate
        from public.player_game_hash_boosts b
        where b.expires_at > now() and b.active_hashrate > 0
      ) sources
      group by user_id
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
    from ranked order by user_id
  loop
    v_transaction_id := null;
    if v_allocation.reward_mc > 0 then
      insert into public.mining_coin_wallets(user_id) values(v_allocation.user_id)
      on conflict (user_id) do nothing;
      select balance into v_wallet_balance from public.mining_coin_wallets
      where user_id = v_allocation.user_id for update;
      if not found then raise exception 'MINING COIN wallet not found for pool participant'; end if;
      update public.mining_coin_wallets
      set balance = balance + v_allocation.reward_mc, version = version + 1, updated_at = now()
      where user_id = v_allocation.user_id returning balance into v_wallet_balance;
      insert into public.mining_coin_transactions(
        user_id, amount, balance_after, source, reference_type, reference_id, idempotency_key, description
      ) values(
        v_allocation.user_id, v_allocation.reward_mc, v_wallet_balance, 'pool_reward',
        'pool_cycle', p_cycle_id::text, 'pool:' || p_cycle_id::text, 'Recompensa da Mining Pool'
      ) returning id into v_transaction_id;
    end if;

    insert into public.pool_allocations(
      cycle_id, user_id, hashrate_snapshot, share, amount_pc,
      wallet_transaction_id, amount_mc, mining_coin_transaction_id
    ) values(
      p_cycle_id, v_allocation.user_id, v_allocation.hashrate,
      v_allocation.hashrate / v_total_hashrate, 0, null,
      v_allocation.reward_mc, v_transaction_id
    );
  end loop;

  update public.pool_cycles
  set status = 'settled', closed_at = now(), total_hashrate = v_total_hashrate, participant_count = v_participants
  where id = p_cycle_id;

  return jsonb_build_object(
    'cycle_id', p_cycle_id, 'status', 'settled',
    'participants', v_participants, 'total_hashrate', v_total_hashrate,
    'distributed_mc', v_cycle.budget_mc
  );
end;
$$;

create or replace function public.start_player_game_attempt(p_game_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_count integer;
  v_attempt_id uuid;
begin
  if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode = '28000'; end if;
  if p_game_id not in ('flappy_games', 'snake_games', 'coin_catch_games') then
    raise exception 'Jogo inválido.' using errcode = '22023';
  end if;

  update public.player_game_attempts
  set finished_at = now(), won = false
  where user_id = v_user_id and game_id = p_game_id
    and finished_at is null and started_at < now() - interval '10 minutes';

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_game_id, 0));

  select count(*) into v_count
  from public.player_game_attempts
  where user_id = v_user_id and game_id = p_game_id and started_at >= v_today_start;

  if v_count >= 30 then
    raise exception 'Limite diário de 30 partidas atingido para este jogo.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.player_game_attempts
    where user_id = v_user_id and game_id = p_game_id and finished_at is null
  ) then
    raise exception 'Você já possui uma partida em andamento neste jogo.' using errcode = 'P0001';
  end if;

  insert into public.player_game_attempts(user_id, game_id)
  values(v_user_id, p_game_id)
  returning id into v_attempt_id;

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'daily_limit', 30,
    'daily_used', v_count + 1,
    'daily_remaining', 29 - v_count
  );
end;
$$;

revoke all on function public.start_player_game_attempt(text) from public, anon;
grant execute on function public.start_player_game_attempt(text) to authenticated;

create or replace function public.finish_player_game_attempt(p_attempt_id uuid, p_won boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt public.player_game_attempts%rowtype;
  v_wallet public.wallets%rowtype;
  v_balance numeric(20,0);
  v_pc integer := 0;
  v_hash numeric(10,2) := 0;
  v_active_hash numeric(10,2) := 0;
  v_expires_at timestamptz;
  v_today_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_daily_used integer;
begin
  if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode = '28000'; end if;
  if p_attempt_id is null or p_won is null then raise exception 'Resultado inválido.' using errcode = '22023'; end if;

  select * into v_attempt
  from public.player_game_attempts
  where id = p_attempt_id and user_id = v_user_id
  for update;
  if not found then raise exception 'Partida não encontrada.' using errcode = 'P0002'; end if;

  if v_attempt.finished_at is not null then
    select active_hashrate, expires_at into v_active_hash, v_expires_at
    from public.player_game_hash_boosts where user_id = v_user_id;
    select count(*) into v_daily_used
    from public.player_game_attempts
    where user_id = v_user_id and game_id = v_attempt.game_id and started_at >= v_today_start;
    return jsonb_build_object(
      'replayed', true, 'won', v_attempt.won, 'pc_awarded', v_attempt.pc_awarded,
      'hash_awarded', v_attempt.hash_awarded,
      'active_hashrate', case when v_expires_at > now() then v_active_hash else 0 end,
      'expires_at', v_expires_at, 'daily_used', v_daily_used, 'daily_remaining', greatest(0, 30-v_daily_used)
    );
  end if;

  if v_attempt.started_at < now() - interval '2 minutes' then
    raise exception 'A partida expirou. Inicie uma nova partida.' using errcode = 'P0001';
  end if;

  if p_won and now() - v_attempt.started_at < interval '1 second' then
    raise exception 'Resultado de vitória recebido cedo demais.' using errcode = '22023';
  end if;

  select * into v_wallet from public.wallets where user_id = v_user_id for update;
  if not found then raise exception 'Carteira não encontrada.' using errcode = 'P0002'; end if;

  select active_hashrate, expires_at into v_active_hash, v_expires_at
  from public.player_game_hash_boosts where user_id = v_user_id
  for update;

  if p_won then
    v_pc := 1;
    v_hash := 1;
    if v_expires_at is null or v_expires_at <= now() then v_active_hash := 0; end if;
    v_active_hash := v_active_hash + 1;
    v_expires_at := now() + interval '24 hours';

    update public.wallets
    set balance = balance + 1, version = version + 1, updated_at = now()
    where user_id = v_user_id returning balance into v_balance;

    insert into public.wallet_transactions(
      user_id, amount, balance_after, transaction_type, reference_type,
      reference_id, idempotency_key, description
    ) values (
      v_user_id, 1, v_balance, 'game_reward', 'game_attempt',
      p_attempt_id::text, 'game:' || p_attempt_id::text,
      'Recompensa por vitória em ' || v_attempt.game_id
    );

    insert into public.player_game_hash_boosts(user_id, active_hashrate, expires_at, updated_at)
    values(v_user_id, v_active_hash, v_expires_at, now())
    on conflict(user_id) do update
      set active_hashrate = excluded.active_hashrate,
          expires_at = excluded.expires_at,
          updated_at = now();
  elsif v_active_hash > 0 and v_expires_at > now() then
    -- Existing active temporary HASH retains the established refresh-on-completion rule.
    update public.player_game_hash_boosts
    set expires_at = now() + interval '24 hours', updated_at = now()
    where user_id = v_user_id;
    v_expires_at := now() + interval '24 hours';
  end if;

  update public.player_game_attempts
  set finished_at = now(), won = p_won, pc_awarded = v_pc, hash_awarded = v_hash
  where id = p_attempt_id and user_id = v_user_id;

  select count(*) into v_daily_used
  from public.player_game_attempts
  where user_id = v_user_id and game_id = v_attempt.game_id and started_at >= v_today_start;

  return jsonb_build_object(
    'replayed', false, 'won', p_won, 'pc_awarded', v_pc,
    'hash_awarded', v_hash,
    'active_hashrate', case when v_expires_at > now() then v_active_hash else 0 end,
    'expires_at', v_expires_at, 'daily_used', v_daily_used, 'daily_remaining', greatest(0, 30-v_daily_used)
  );
end;
$$;

revoke all on function public.finish_player_game_attempt(uuid, boolean) from public, anon;
grant execute on function public.finish_player_game_attempt(uuid, boolean) to authenticated;

create or replace function public.get_player_game_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_counts jsonb;
  v_hash numeric(10,2) := 0;
  v_expires timestamptz;
begin
  if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode = '28000'; end if;

  select coalesce(jsonb_object_agg(game_id, used), '{}'::jsonb)
  into v_counts
  from (
    select game_id, count(*)::integer as used
    from public.player_game_attempts
    where user_id = v_user_id and started_at >= v_today_start
    group by game_id
  ) counts;

  select active_hashrate, expires_at into v_hash, v_expires
  from public.player_game_hash_boosts where user_id = v_user_id;

  return jsonb_build_object(
    'daily_limit', 30,
    'daily_used', v_counts,
    'active_hashrate', case when v_expires > now() then coalesce(v_hash,0) else 0 end,
    'expires_at', v_expires
  );
end;
$$;

revoke all on function public.get_player_game_status() from public, anon;
grant execute on function public.get_player_game_status() to authenticated;

commit;
