
create table private.vip_topup_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete restrict,
 provider text not null check (char_length(btrim(provider)) between 2 and 40),
 payment_reference text not null check (char_length(btrim(payment_reference)) between 3 and 180),
 amount_brl_cents bigint not null check (amount_brl_cents > 0),
 status text not null default 'pending' check (status in ('pending','confirmed','refunded','chargeback','cancelled')),
 confirmed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 metadata jsonb not null default '{}'::jsonb,
 constraint vip_topup_provider_reference_unique unique(provider,payment_reference),
 constraint vip_topup_confirmation_state_check check ((status='confirmed' and confirmed_at is not null) or (status<>'confirmed'))
);
create index vip_topup_events_user_confirmed_idx on private.vip_topup_events(user_id,confirmed_at desc) where status='confirmed';
alter table private.vip_topup_events enable row level security;
revoke all on private.vip_topup_events from public,anon,authenticated;
grant usage on schema private to service_role;
grant select,insert,update on private.vip_topup_events to service_role;

create or replace function private.vip_hash_multiplier(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
 select case coalesce((select vip_tier from public.player_progress where user_id=p_user_id),0)
  when 1 then 1.10::numeric
  when 2 then 1.15::numeric
  when 3 then 1.20::numeric
  when 4 then 1.25::numeric
  when 5 then 1.30::numeric
  else 1.00::numeric
 end;
$$;
revoke all on function private.vip_hash_multiplier(uuid) from public,anon,authenticated;

create or replace function public.get_my_vip_status()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 v_user_id uuid:=auth.uid();
 v_total_cents bigint:=0;
 v_tier smallint:=0;
 v_previous_tier smallint:=0;
 v_hash_boost numeric:=0;
 v_xp_multiplier numeric:=1;
 v_next_threshold bigint;
 v_window_start timestamptz:=now()-interval '30 days';
begin
 if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='28000'; end if;

 select coalesce(sum(amount_brl_cents),0)::bigint into v_total_cents
 from private.vip_topup_events
 where user_id=v_user_id and status='confirmed'
   and confirmed_at>=v_window_start and confirmed_at<=now();

 v_tier:=case
  when v_total_cents>=6000 then 5
  when v_total_cents>=5000 then 4
  when v_total_cents>=4500 then 3
  when v_total_cents>=4000 then 2
  when v_total_cents>=3000 then 1
  else 0 end;

 update public.player_progress
 set vip_tier=v_tier,updated_at=now()
 where user_id=v_user_id and vip_tier is distinct from v_tier
 returning vip_tier into v_previous_tier;

 v_hash_boost:=case v_tier when 1 then 10 when 2 then 15 when 3 then 20 when 4 then 25 when 5 then 30 else 0 end;
 v_xp_multiplier:=case v_tier when 1 then 2 when 2 then 2.5 when 3 then 3 when 4 then 4 when 5 then 5 else 1 end;
 v_next_threshold:=case v_tier when 0 then 3000 when 1 then 4000 when 2 then 4500 when 3 then 5000 when 4 then 6000 else null end;

 return jsonb_build_object(
  'vip_tier',v_tier,
  'qualifying_topups_brl_cents',v_total_cents,
  'window_started_at',v_window_start,
  'window_ends_at',now(),
  'hash_boost_percent',v_hash_boost,
  'mission_xp_multiplier',v_xp_multiplier,
  'next_tier_threshold_brl_cents',v_next_threshold,
  'recalculated_at',now()
 );
end;
$$;
revoke all on function public.get_my_vip_status() from public,anon;
grant execute on function public.get_my_vip_status() to authenticated;

create or replace function public.get_pool_dashboard()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_user_id uuid:=auth.uid();
 v_player_hashrate numeric(30,6);
 v_network_hashrate numeric(30,6);
 v_latest_cycle jsonb;
 v_history jsonb;
 v_vip_multiplier numeric(5,2);
begin
 if v_user_id is null then raise exception 'Authentication required'; end if;
 v_vip_multiplier:=private.vip_hash_multiplier(v_user_id);
 select (coalesce((select sum(c.hashrate*(1+c.overclock_percent/100+pe.blessing_percent/100))
   from public.player_equipment pe join public.equipment_catalog c on c.sku=pe.catalog_sku
   join public.player_rooms pr on pr.id=pe.room_id and pr.user_id=pe.user_id
   where pe.user_id=v_user_id and pe.status='installed' and pr.active=true),0)
   +coalesce((select b.active_hashrate from public.player_game_hash_boosts b where b.user_id=v_user_id and b.expires_at>now()),0))
   *v_vip_multiplier into v_player_hashrate;

 with raw_power as (
  select pe.user_id,c.hashrate*(1+c.overclock_percent/100+pe.blessing_percent/100) as hashrate
  from public.player_equipment pe join public.equipment_catalog c on c.sku=pe.catalog_sku
  join public.player_rooms pr on pr.id=pe.room_id and pr.user_id=pe.user_id
  where pe.status='installed' and pr.active=true
  union all
  select b.user_id,b.active_hashrate from public.player_game_hash_boosts b where b.expires_at>now()
 ),
 per_player as (
  select user_id,sum(hashrate)*private.vip_hash_multiplier(user_id) as effective_hashrate
  from raw_power group by user_id
 )
 select coalesce(sum(effective_hashrate),0) into v_network_hashrate from per_player;

 select jsonb_build_object('id',id,'cycle_key',cycle_key,'status',status,'budget_mc',budget_mc,
  'opened_at',opened_at,'total_hashrate',total_hashrate,'participant_count',participant_count)
 into v_latest_cycle from public.pool_cycles where status='open' order by opened_at desc limit 1;

 select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) into v_history
 from(select jsonb_build_object('cycle_key',pc.cycle_key,'amount_pc',pa.amount_pc,'amount_mc',pa.amount_mc,
  'hashrate_snapshot',pa.hashrate_snapshot,'share',pa.share,'created_at',pa.created_at) as item,pa.created_at
  from public.pool_allocations pa join public.pool_cycles pc on pc.id=pa.cycle_id
  where pa.user_id=v_user_id order by pa.created_at desc limit 10) recent;

 return jsonb_build_object(
  'player_hashrate',v_player_hashrate,'network_hashrate',v_network_hashrate,
  'participation',case when v_network_hashrate>0 then v_player_hashrate/v_network_hashrate else 0 end,
  'current_cycle',v_latest_cycle,'history',v_history,
  'vip_hash_boost_percent',round((v_vip_multiplier-1)*100,2)
 );
end;
$$;

create or replace function public.settle_pool_cycle(p_cycle_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_cycle public.pool_cycles%rowtype;
 v_total_hashrate numeric(30,6);
 v_participants integer;
 v_allocation record;
 v_wallet_balance numeric(20,0);
 v_transaction_id uuid;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
  raise exception 'Service role required';
 end if;
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
  select b.user_id,b.active_hashrate from public.player_game_hash_boosts b
  where b.expires_at>now() and b.active_hashrate>0
 ),
 player_power as (
  select user_id,sum(hashrate)*private.vip_hash_multiplier(user_id) as hashrate
  from raw_power group by user_id
 )
 select coalesce(sum(hashrate),0),count(*)::integer into v_total_hashrate,v_participants from player_power;

 if v_total_hashrate<=0 then
  update public.pool_cycles set status='settled',closed_at=now(),total_hashrate=0,participant_count=0 where id=p_cycle_id;
  return jsonb_build_object('cycle_id',p_cycle_id,'status','settled','participants',0,'distributed_mc',0);
 end if;

 for v_allocation in
  with raw_power as (
   select pe.user_id,ec.hashrate*(1+ec.overclock_percent/100+pe.blessing_percent/100) as hashrate
   from public.player_equipment pe join public.equipment_catalog ec on ec.sku=pe.catalog_sku
   join public.player_rooms pr on pr.id=pe.room_id and pr.user_id=pe.user_id
   where pe.status='installed' and pr.active=true
   union all
   select b.user_id,b.active_hashrate from public.player_game_hash_boosts b
   where b.expires_at>now() and b.active_hashrate>0
  ),
  player_power as (
   select user_id,sum(hashrate)*private.vip_hash_multiplier(user_id) as hashrate
   from raw_power group by user_id
  ),
  base as (
   select user_id,hashrate,
    floor(v_cycle.budget_mc*hashrate/v_total_hashrate)::numeric(20,0) as base_reward,
    (v_cycle.budget_mc*hashrate/v_total_hashrate)-floor(v_cycle.budget_mc*hashrate/v_total_hashrate) as fractional_remainder
   from player_power
  ),
  ranked as (
   select *,row_number() over(order by fractional_remainder desc,user_id asc) as remainder_rank,
    v_cycle.budget_mc-sum(base_reward) over() as remaining_mc
   from base
  )
  select user_id,hashrate,(base_reward+case when remainder_rank<=remaining_mc then 1 else 0 end)::numeric(20,0) as reward_mc
  from ranked order by user_id
 loop
  v_transaction_id:=null;
  if v_allocation.reward_mc>0 then
   insert into public.mining_coin_wallets(user_id) values(v_allocation.user_id) on conflict(user_id) do nothing;
   select balance into v_wallet_balance from public.mining_coin_wallets where user_id=v_allocation.user_id for update;
   if not found then raise exception 'MINING COIN wallet not found for pool participant'; end if;
   update public.mining_coin_wallets set balance=balance+v_allocation.reward_mc,version=version+1,updated_at=now()
   where user_id=v_allocation.user_id returning balance into v_wallet_balance;
   insert into public.mining_coin_transactions(user_id,amount,balance_after,source,reference_type,reference_id,idempotency_key,description)
   values(v_allocation.user_id,v_allocation.reward_mc,v_wallet_balance,'pool_reward','pool_cycle',p_cycle_id::text,
    'pool:'||p_cycle_id::text,'Recompensa da Mining Pool') returning id into v_transaction_id;
  end if;
  insert into public.pool_allocations(cycle_id,user_id,hashrate_snapshot,share,amount_pc,wallet_transaction_id,amount_mc,mining_coin_transaction_id)
  values(p_cycle_id,v_allocation.user_id,v_allocation.hashrate,v_allocation.hashrate/v_total_hashrate,0,null,v_allocation.reward_mc,v_transaction_id);
 end loop;

 update public.pool_cycles set status='settled',closed_at=now(),total_hashrate=v_total_hashrate,participant_count=v_participants
 where id=p_cycle_id;
 return jsonb_build_object('cycle_id',p_cycle_id,'status','settled','participants',v_participants,
  'total_hashrate',v_total_hashrate,'distributed_mc',v_cycle.budget_mc);
end;
$$;
revoke all on function public.settle_pool_cycle(uuid) from public,anon,authenticated;
grant execute on function public.settle_pool_cycle(uuid) to service_role;
