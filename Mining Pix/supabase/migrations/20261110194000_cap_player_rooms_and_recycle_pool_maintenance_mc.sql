-- Applied to Mining Pix DEV: four permanent rooms maximum and 1.5% MC maintenance recycled into future Pool cycles.
alter table public.player_rooms
  add constraint player_rooms_room_number_max_4
  check (room_number between 1 and 4);

alter table public.pool_allocations
  add column if not exists gross_amount_mc numeric(20,0) not null default 0,
  add column if not exists maintenance_amount_mc numeric(20,0) not null default 0;

create table if not exists private.pool_mc_reserve (
  id smallint primary key check (id = 1),
  balance_mc numeric(20,0) not null default 0 check (balance_mc >= 0),
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into private.pool_mc_reserve(id,balance_mc) values (1,0) on conflict(id) do nothing;

create table if not exists private.pool_mc_reserve_transactions (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('maintenance_retained','cycle_funded')),
  source_cycle_id uuid not null references public.pool_cycles(id),
  amount_mc numeric(20,0) not null check (amount_mc > 0),
  balance_after_mc numeric(20,0) not null check (balance_after_mc >= 0),
  created_at timestamptz not null default now(),
  unique(source_cycle_id,entry_type)
);
alter table private.pool_mc_reserve enable row level security;
alter table private.pool_mc_reserve_transactions enable row level security;
revoke all on private.pool_mc_reserve from public, anon, authenticated;
revoke all on private.pool_mc_reserve_transactions from public, anon, authenticated;
grant select,insert,update on private.pool_mc_reserve to service_role;
grant select,insert on private.pool_mc_reserve_transactions to service_role;

create or replace function public.purchase_player_room(p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.wallets%rowtype;
  v_existing public.wallet_transactions%rowtype;
  v_room_id uuid;
  v_room_number integer;
  v_room_count integer;
  v_balance_after numeric(20,0);
  v_cost numeric(20,0) := 10000;
begin
  if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='28000'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128 then
    raise exception 'Chave de desbloqueio inválida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':room-unlock', 0));
  select * into v_existing from public.wallet_transactions
   where user_id=v_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.transaction_type <> 'purchase' or v_existing.reference_type <> 'room_unlock' then
      raise exception 'Chave de idempotência já utilizada em outra operação.' using errcode='22023';
    end if;
    return jsonb_build_object('success',true,'replayed',true,'room_id',v_existing.reference_id,
      'balance_after',v_existing.balance_after,'cost_pc',abs(v_existing.amount));
  end if;
  select count(*)::integer,coalesce(max(room_number),0)+1 into v_room_count,v_room_number
    from public.player_rooms where user_id=v_user_id;
  if v_room_count >= 4 or v_room_number > 4 then
    raise exception 'Limite máximo de 4 salas por jogador atingido.' using errcode='P0001';
  end if;
  select * into v_wallet from public.wallets where user_id=v_user_id for update;
  if not found then raise exception 'Carteira PIX COIN não encontrada.' using errcode='P0002'; end if;
  if v_wallet.balance < v_cost then raise exception 'Saldo insuficiente: são necessários 10.000 PC.' using errcode='P0001'; end if;
  v_balance_after := v_wallet.balance-v_cost;
  update public.wallets set balance=v_balance_after,version=version+1,updated_at=now() where user_id=v_user_id;
  insert into public.player_rooms(user_id,room_number,name,active,unlock_cost_pc,maintenance_rate_percent,grandfathered)
    values(v_user_id,v_room_number,'Sala '||v_room_number,true,v_cost,1.50,false) returning id into v_room_id;
  insert into public.wallet_transactions(user_id,amount,balance_after,transaction_type,reference_type,reference_id,idempotency_key,description)
    values(v_user_id,-v_cost,v_balance_after,'purchase','room_unlock',v_room_id::text,p_idempotency_key,'Desbloqueio permanente da Sala '||v_room_number);
  return jsonb_build_object('success',true,'replayed',false,'room_id',v_room_id,'room_number',v_room_number,
    'balance_after',v_balance_after,'cost_pc',v_cost,'maintenance_rate_percent',1.50,'room_limit',4);
end;
$function$;

create or replace function public.open_pool_cycle(p_cycle_key text,p_budget_mc numeric)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_id uuid;
  v_reserve numeric(20,0);
  v_total_budget numeric(20,0);
begin
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if p_cycle_key is null or length(trim(p_cycle_key)) not between 1 and 100 then raise exception 'Invalid cycle key'; end if;
  if p_budget_mc is null or p_budget_mc<0 or p_budget_mc<>trunc(p_budget_mc)
     or p_budget_mc>99999999999999999999 then raise exception 'Invalid MINING COIN pool budget'; end if;
  select balance_mc into v_reserve from private.pool_mc_reserve where id=1 for update;
  v_total_budget:=p_budget_mc+coalesce(v_reserve,0);
  if v_total_budget>99999999999999999999 then raise exception 'Combined MINING COIN pool budget exceeds supported balance'; end if;
  insert into public.pool_cycles(cycle_key,budget_pc,budget_mc) values(trim(p_cycle_key),0,v_total_budget) returning id into v_id;
  if coalesce(v_reserve,0)>0 then
    update private.pool_mc_reserve set balance_mc=0,version=version+1,updated_at=now() where id=1;
    insert into private.pool_mc_reserve_transactions(entry_type,source_cycle_id,amount_mc,balance_after_mc)
      values('cycle_funded',v_id,v_reserve,0);
  end if;
  return v_id;
end;
$function$;

create or replace function public.settle_pool_cycle(p_cycle_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
 v_cycle public.pool_cycles%rowtype;
 v_total_hashrate numeric(30,6);
 v_participants integer;
 v_allocation record;
 v_wallet_balance numeric(20,0);
 v_transaction_id uuid;
 v_gross_reward numeric(20,0);
 v_maintenance numeric(20,0);
 v_net_reward numeric(20,0);
 v_total_maintenance numeric(20,0):=0;
 v_total_net numeric(20,0):=0;
 v_reserve_after numeric(20,0);
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then raise exception 'Service role required'; end if;
 select * into v_cycle from public.pool_cycles where id=p_cycle_id for update;
 if not found then raise exception 'Pool cycle not found'; end if;
 if v_cycle.status='settled' then return jsonb_build_object('cycle_id',v_cycle.id,'status','settled','already_settled',true); end if;
 if v_cycle.status<>'open' then raise exception 'Pool cycle is not open'; end if;
 with raw_power as (
  select pe.user_id,ec.hashrate*(1+ec.overclock_percent/100+pe.blessing_percent/100) as hashrate
  from public.player_equipment pe join public.equipment_catalog ec on ec.sku=pe.catalog_sku
  join public.player_rooms pr on pr.id=pe.room_id and pr.user_id=pe.user_id
  where pe.status='installed' and pr.active=true
  union all
  select b.user_id,b.active_hashrate from public.player_game_hash_boosts b where b.expires_at>now() and b.active_hashrate>0
 ), player_power as (
  select user_id,sum(hashrate)*private.vip_hash_multiplier(user_id) as hashrate from raw_power group by user_id
 )
 select coalesce(sum(hashrate),0),count(*)::integer into v_total_hashrate,v_participants from player_power;
 if v_total_hashrate<=0 then
  update public.pool_cycles set status='settled',closed_at=now(),total_hashrate=0,participant_count=0 where id=p_cycle_id;
  return jsonb_build_object('cycle_id',p_cycle_id,'status','settled','participants',0,'gross_allocated_mc',0,'net_distributed_mc',0,'maintenance_returned_mc',0);
 end if;
 for v_allocation in
  with raw_power as (
   select pe.user_id,ec.hashrate*(1+ec.overclock_percent/100+pe.blessing_percent/100) as hashrate
   from public.player_equipment pe join public.equipment_catalog ec on ec.sku=pe.catalog_sku
   join public.player_rooms pr on pr.id=pe.room_id and pr.user_id=pe.user_id
   where pe.status='installed' and pr.active=true
   union all
   select b.user_id,b.active_hashrate from public.player_game_hash_boosts b where b.expires_at>now() and b.active_hashrate>0
  ), player_power as (
   select user_id,sum(hashrate)*private.vip_hash_multiplier(user_id) as hashrate from raw_power group by user_id
  ), base as (
   select user_id,hashrate,
    floor(v_cycle.budget_mc*hashrate/v_total_hashrate)::numeric(20,0) as base_reward,
    (v_cycle.budget_mc*hashrate/v_total_hashrate)-floor(v_cycle.budget_mc*hashrate/v_total_hashrate) as fractional_remainder
   from player_power
  ), ranked as (
   select *,row_number() over(order by fractional_remainder desc,user_id asc) as remainder_rank,
    v_cycle.budget_mc-sum(base_reward) over() as remaining_mc from base
  )
  select user_id,hashrate,(base_reward+case when remainder_rank<=remaining_mc then 1 else 0 end)::numeric(20,0) as gross_reward_mc
  from ranked order by user_id
 loop
  v_gross_reward:=v_allocation.gross_reward_mc;
  v_maintenance:=floor(v_gross_reward*1.5/100)::numeric(20,0);
  v_net_reward:=v_gross_reward-v_maintenance;
  v_total_maintenance:=v_total_maintenance+v_maintenance;
  v_total_net:=v_total_net+v_net_reward;
  v_transaction_id:=null;
  if v_net_reward>0 then
   insert into public.mining_coin_wallets(user_id) values(v_allocation.user_id) on conflict(user_id) do nothing;
   select balance into v_wallet_balance from public.mining_coin_wallets where user_id=v_allocation.user_id for update;
   if not found then raise exception 'MINING COIN wallet not found for pool participant'; end if;
   update public.mining_coin_wallets set balance=balance+v_net_reward,version=version+1,updated_at=now()
    where user_id=v_allocation.user_id returning balance into v_wallet_balance;
   insert into public.mining_coin_transactions(user_id,amount,balance_after,source,reference_type,reference_id,idempotency_key,description)
    values(v_allocation.user_id,v_net_reward,v_wallet_balance,'pool_reward','pool_cycle',p_cycle_id::text,'pool:'||p_cycle_id::text,
    'Recompensa líquida da Mining Pool após retenção de manutenção') returning id into v_transaction_id;
  end if;
  insert into public.pool_allocations(cycle_id,user_id,hashrate_snapshot,share,amount_pc,wallet_transaction_id,amount_mc,mining_coin_transaction_id,gross_amount_mc,maintenance_amount_mc)
   values(p_cycle_id,v_allocation.user_id,v_allocation.hashrate,v_allocation.hashrate/v_total_hashrate,0,null,v_net_reward,v_transaction_id,v_gross_reward,v_maintenance);
 end loop;
 if v_total_maintenance>0 then
  update private.pool_mc_reserve set balance_mc=balance_mc+v_total_maintenance,version=version+1,updated_at=now()
   where id=1 returning balance_mc into v_reserve_after;
  insert into private.pool_mc_reserve_transactions(entry_type,source_cycle_id,amount_mc,balance_after_mc)
   values('maintenance_retained',p_cycle_id,v_total_maintenance,v_reserve_after);
 else
  select balance_mc into v_reserve_after from private.pool_mc_reserve where id=1;
 end if;
 update public.pool_cycles set status='settled',closed_at=now(),total_hashrate=v_total_hashrate,participant_count=v_participants where id=p_cycle_id;
 return jsonb_build_object('cycle_id',p_cycle_id,'status','settled','participants',v_participants,'total_hashrate',v_total_hashrate,
  'gross_allocated_mc',v_cycle.budget_mc,'net_distributed_mc',v_total_net,'maintenance_returned_mc',v_total_maintenance,'pool_reserve_mc',coalesce(v_reserve_after,0));
end;
$function$;
