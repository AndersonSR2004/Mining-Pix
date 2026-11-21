alter table public.player_equipment add column forge_level smallint not null default 0 check (forge_level between 0 and 10);
alter table depix_sandbox.parts_movements
  drop constraint parts_movements_source_check, drop constraint parts_movements_cpu_check,
  drop constraint parts_movements_gpu_check, drop constraint parts_movements_motherboard_check,
  add constraint parts_movements_amounts_check check (
    (source in ('machine_disassembly','rack_disassembly') and (cpu,gpu,motherboard)=(10,10,10))
    or (source='reward_pack' and (cpu,gpu,motherboard) in ((100,0,0),(0,100,0),(0,0,100)))
    or (source='forge' and cpu between -100 and -10 and cpu % 10=0 and cpu=gpu and gpu=motherboard)
  );

create function depix_sandbox.grant_parts_pack(p_player uuid,p_reward uuid,p_pack_index integer)
returns boolean language plpgsql set search_path='' as $$
declare material integer := (p_pack_index-1)%3;
begin
  if p_pack_index is null or p_pack_index<1 then raise exception 'Invalid pack index' using errcode='22023'; end if;
  insert into depix_sandbox.parts_movements(user_id,source,source_id,cpu,gpu,motherboard)
    values(p_player,'reward_pack',p_reward,case when material=0 then 100 else 0 end,
      case when material=1 then 100 else 0 end,case when material=2 then 100 else 0 end)
    on conflict(source,source_id) do nothing;
  if found then return true; end if;
  if not exists(select from depix_sandbox.parts_movements where source='reward_pack' and source_id=p_reward
    and user_id=p_player and (cpu,gpu,motherboard)=(case when material=0 then 100 else 0 end,
    case when material=1 then 100 else 0 end,case when material=2 then 100 else 0 end)) then
    raise exception 'Conflicting reward identity' using errcode='22023';
  end if;
  return false;
end $$;
revoke all on function depix_sandbox.grant_parts_pack(uuid,uuid,integer) from public,anon,authenticated,service_role;

create table depix_sandbox.forge_fees (
  level integer primary key check(level between 1 and 10),
  units bigint not null check(units>=0)
);
insert into depix_sandbox.forge_fees select level,0 from generate_series(1,10) level;
create table depix_sandbox.forge_fee_audit (
  id bigint generated always as identity primary key, actor uuid not null references auth.users,
  level integer not null, old_units bigint not null, new_units bigint not null,
  reason text not null, created_at timestamptz not null default clock_timestamp()
);
create table depix_sandbox.forge_orders (
  id uuid primary key, user_id uuid not null references auth.users,
  item_id uuid not null references public.player_equipment,
  level integer not null check(level between 1 and 10),
  fee bigint not null check(fee>=0), created_at timestamptz not null default clock_timestamp(),
  unique(item_id,level)
);
alter table depix_sandbox.forge_fees enable row level security;
alter table depix_sandbox.forge_fee_audit enable row level security;
alter table depix_sandbox.forge_orders enable row level security;
revoke all on depix_sandbox.forge_fees,depix_sandbox.forge_fee_audit,depix_sandbox.forge_orders from public,anon,authenticated,service_role;

create function public.genesis_set_forge_fee(p_level integer,p_fee text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid := depix_sandbox.require_admin();
  prior bigint;
  next_fee bigint;
begin
  if p_fee is null or length(trim(coalesce(p_reason,''))) not between 5 and 500 then
    raise exception 'Informe valor e justificativa.' using errcode='22023';
  end if;
  next_fee := case when p_fee ~ '^0([.]0{1,8})?$' then 0 else depix_sandbox.amount_units(p_fee) end;
  select units into prior from depix_sandbox.forge_fees where level=p_level for update;
  if not found then raise exception 'Nível inválido.' using errcode='22023'; end if;
  if prior=next_fee then return; end if;
  update depix_sandbox.forge_fees set units=next_fee where level=p_level;
  insert into depix_sandbox.forge_fee_audit(actor,level,old_units,new_units,reason)
    values(actor,p_level,prior,next_fee,trim(p_reason));
end $$;

create function depix_sandbox.forge_fee_for(p_player uuid,p_level integer)
returns bigint language sql stable set search_path='' as $$
  select floor(f.units::numeric*(100-l.forge_discount)/100)::bigint
  from depix_sandbox.forge_fees f
  cross join depix_sandbox.vip_qualification(p_player,statement_timestamp()) q
  join depix_sandbox.vip_levels() l on l.tier=q.tier
  where f.level=p_level
$$;
revoke all on function depix_sandbox.forge_fee_for(uuid,integer) from public,anon,authenticated,service_role;

create function public.genesis_forge_quote(p_item uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  player uuid := depix_sandbox.require_player();
  next_level integer;
begin
  select forge_level+1 into next_level from public.player_equipment
    where id=p_item and user_id=player and status<>'retired';
  if not found or next_level>10 then raise exception 'Máquina indisponível para forja.' using errcode='55000'; end if;
  return jsonb_build_object('level',next_level,'parts',10*next_level,
    'fee',depix_sandbox.decimal_amount(depix_sandbox.forge_fee_for(player,next_level)));
end $$;

create function public.genesis_forge(p_request uuid,p_item uuid,p_level integer,p_fee text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  player uuid := depix_sandbox.require_player();
  machine public.player_equipment%rowtype;
  receipt depix_sandbox.forge_orders%rowtype;
  cost integer;
  fee bigint;
  expected bigint;
begin
  if p_request is null or p_level is null or p_level not between 1 and 10 or p_fee is null then
    raise exception 'Solicitação inválida.' using errcode='22023';
  end if;
  expected := case when p_fee ~ '^0([.]0{1,8})?$' then 0 else depix_sandbox.amount_units(p_fee) end;
  perform pg_advisory_xact_lock(hashtextextended(player::text || ':genesis-forge',0));

  select * into receipt from depix_sandbox.forge_orders where id=p_request;
  if found then
    if (receipt.user_id,receipt.item_id,receipt.level,receipt.fee) is distinct from (player,p_item,p_level,expected) then
      raise exception 'Identificador de forja já utilizado.' using errcode='22023';
    end if;
    return false;
  end if;

  select * into machine from public.player_equipment
    where id=p_item and user_id=player and status<>'retired' for update;
  if not found or machine.forge_level+1<>p_level then
    raise exception 'O nível mudou ou a máquina está indisponível.' using errcode='55000';
  end if;
  -- Serialize with fee edits before rechecking the quoted price.
  perform 1 from depix_sandbox.forge_fees where level=p_level for share;
  fee := depix_sandbox.forge_fee_for(player,p_level);
  if fee is distinct from expected then raise exception 'A taxa mudou. Consulte a nova cotação.' using errcode='22023'; end if;
  cost := 10*p_level;

  if (select least(coalesce(sum(cpu),0),coalesce(sum(gpu),0),coalesce(sum(motherboard),0))
      from depix_sandbox.parts_movements where user_id=player) < cost then
    raise exception 'Parts insuficientes.' using errcode='55000';
  end if;

  if fee>0 and not depix_sandbox.post(p_request,'purchase',player,'player_available','platform_sales',fee) then
    raise exception 'Identificador de pagamento já utilizado.' using errcode='22023';
  end if;
  insert into depix_sandbox.forge_orders(id,user_id,item_id,level,fee) values(p_request,player,p_item,p_level,fee);
  insert into depix_sandbox.parts_movements(user_id,source,source_id,cpu,gpu,motherboard)
    values(player,'forge',p_request,-cost,-cost,-cost);
  update public.player_equipment set forge_level=p_level where id=p_item;
  return true;
end $$;

revoke all on function public.genesis_forge_quote(uuid),public.genesis_forge(uuid,uuid,integer,text),
  public.genesis_set_forge_fee(integer,text,text) from public,anon,authenticated;
grant execute on function public.genesis_forge_quote(uuid),public.genesis_forge(uuid,uuid,integer,text),
  public.genesis_set_forge_fee(integer,text,text) to authenticated;
CREATE OR REPLACE FUNCTION public.competition_hashrates(p_at timestamp with time zone)
 RETURNS TABLE(user_id uuid, hashrate numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with sources as (
    select pe.user_id,
      c.hashrate * (1 + c.overclock_percent / 100 + pe.blessing_percent / 100 + coalesce((select max(o.level) from depix_sandbox.forge_orders o where o.item_id=pe.id and o.created_at<=p_at),0)*0.05 + coalesce(rack.bonus,0)::numeric / 100) as power, c.hashrate as vip_base
    from public.player_equipment pe
    join public.equipment_catalog c on c.sku = pe.catalog_sku
    join public.player_rooms r on r.id = pe.room_id and r.user_id = pe.user_id
    left join depix_sandbox.rack_mounts m on m.equipment_id=pe.id and m.room_id=r.id
    left join depix_sandbox.royalty_receipts rack on rack.id=m.rack_id and rack.started_at <= p_at
    where pe.status = 'installed' and r.active and pe.acquired_at <= p_at
    union all
    select b.user_id, b.active_hashrate, 0::numeric
    from public.player_game_hash_boosts b
    where b.updated_at <= p_at and b.expires_at > p_at
    union all
    select m.user_id, 10::numeric, 10::numeric
    from mining_competition.starter_miners m
    where m.claimed_at <= p_at
    union all
    select x.user_id, 2::numeric, 0::numeric
    from public.player_xp_transactions x
    where x.source = 'daily_login' and x.created_at > p_at - interval '24 hours' and x.created_at <= p_at
    group by x.user_id
  ), player_power as (
    select user_id, sum(power) as power, sum(vip_base) as vip_base
    from sources group by user_id having sum(power) > 0
  )
  select s.user_id, (s.power + s.vip_base * vip.hash_bonus / 100)::numeric(30,6)
  from player_power s
  join auth.users u on u.id = s.user_id
  join public.profiles p on p.user_id = s.user_id
  cross join lateral depix_sandbox.vip_qualification(s.user_id, p_at) vip
  where not coalesce(u.is_anonymous, false) and (u.banned_until is null or u.banned_until <= p_at)
$function$;

CREATE OR REPLACE FUNCTION public.get_player_mining_summary()
 RETURNS TABLE(total_hashrate numeric, installed_equipment_count bigint, room_count bigint, total_room_capacity bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select (coalesce((select sum(ec.hashrate*(1+ec.overclock_percent/100+pe.blessing_percent/100+pe.forge_level*0.05)) from public.player_equipment pe join public.equipment_catalog ec on ec.sku=pe.catalog_sku where pe.user_id=(select auth.uid()) and pe.status='installed'),0)+coalesce((select b.active_hashrate from public.player_game_hash_boosts b where b.user_id=(select auth.uid()) and b.expires_at>now()),0))::numeric,(select count(*) from public.player_equipment pe where pe.user_id=(select auth.uid()) and pe.status='installed'),(select count(*) from public.player_rooms pr where pr.user_id=(select auth.uid()) and pr.active=true),(select count(*)*10 from public.player_rooms pr where pr.user_id=(select auth.uid()) and pr.active=true) where (select auth.uid()) is not null; $function$;

CREATE OR REPLACE FUNCTION public.get_player_room_summaries()
 RETURNS TABLE(id uuid, room_number smallint, name text, installed_count bigint, total_hashrate numeric, capacity integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select pr.id,pr.room_number,pr.name,count(pe.id),coalesce(sum(ec.hashrate*(1+ec.overclock_percent/100+pe.blessing_percent/100+pe.forge_level*0.05)),0)::numeric,10 from public.player_rooms pr left join public.player_equipment pe on pe.user_id=pr.user_id and pe.room_id=pr.id and pe.status='installed' left join public.equipment_catalog ec on ec.sku=pe.catalog_sku where pr.user_id=(select auth.uid()) and pr.active=true group by pr.id,pr.room_number,pr.name order by pr.room_number; $function$;

create or replace function public.get_event_shop_progress(p_event uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  viewer uuid := depix_sandbox.require_player();
  event public.game_events%rowtype;
  points numeric;
begin
  select * into event from public.game_events
  where id = p_event and event_type = 'event' and status = 'live'
    and starts_at <= now() and ends_at > now()
    and payload->>'mechanic' = 'progression';
  if not found then
    raise exception 'Evento indisponível.' using errcode = 'P0002';
  end if;

  with verified as (
    select j.amount from depix_sandbox.purchases p
    join depix_sandbox.prices s on s.product = p.product and s.category in ('equipment', 'room')
    join depix_sandbox.journal j on j.id = p.request_id and j.kind = 'purchase' and j.user_id = p.user_id
    where p.user_id = viewer and j.created_at >= event.starts_at and j.created_at < event.ends_at
    union all
    select j.amount from depix_sandbox.royalty_receipts r
    join depix_sandbox.journal j on j.id = r.id and j.kind = 'purchase' and j.user_id = r.user_id
    where r.user_id = viewer and r.family = 'rack'
      and j.created_at >= event.starts_at and j.created_at < event.ends_at
  )
  select trim_scale(coalesce(sum(amount), 0) * 0.00001) into points from verified;
  -- Keep the empty field for already loaded clients during deployment.
  return jsonb_build_object('points', trunc(points)::text, 'exact_points', points::text, 'ranking', '[]'::jsonb);
end;
$$;
