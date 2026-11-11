-- Preserve fractional 1.5% maintenance accrual per player across cycles.
alter table public.pool_allocations
  add column if not exists maintenance_accrued_mc numeric(20,6) not null default 0;

create table if not exists private.player_pool_maintenance_accrual (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fractional_mc numeric(12,6) not null default 0 check (fractional_mc >= 0 and fractional_mc < 1),
  updated_at timestamptz not null default now()
);
alter table private.player_pool_maintenance_accrual enable row level security;
revoke all on private.player_pool_maintenance_accrual from public, anon, authenticated;
grant select,insert,update on private.player_pool_maintenance_accrual to service_role;

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
 v_exact_maintenance numeric(20,6);
 v_fractional_before numeric(12,6);
 v_fractional_after numeric(12,6);
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
  insert into private.player_pool_maintenance_accrual(user_id) values(v_allocation.user_id) on conflict(user_id) do nothing;
  select fractional_mc into v_fractional_before from private.player_pool_maintenance_accrual where user_id=v_allocation.user_id for update;
  v_exact_maintenance:=v_gross_reward*0.015+coalesce(v_fractional_before,0);
  v_maintenance:=floor(v_exact_maintenance)::numeric(20,0);
  v_fractional_after:=(v_exact_maintenance-v_maintenance)::numeric(12,6);
  update private.player_pool_maintenance_accrual set fractional_mc=v_fractional_after,updated_at=now() where user_id=v_allocation.user_id;
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
  insert into public.pool_allocations(cycle_id,user_id,hashrate_snapshot,share,amount_pc,wallet_transaction_id,amount_mc,mining_coin_transaction_id,gross_amount_mc,maintenance_amount_mc,maintenance_accrued_mc)
   values(p_cycle_id,v_allocation.user_id,v_allocation.hashrate,v_allocation.hashrate/v_total_hashrate,0,null,v_net_reward,v_transaction_id,v_gross_reward,v_maintenance,v_exact_maintenance);
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
