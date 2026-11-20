create table depix_sandbox.royalty_offers (
  sku text primary key,
  family text not null check (family in ('rack','vip')),
  title text not null,
  tier integer not null check (tier between 1 and 5),
  bonus integer not null check (bonus between 0 and 100),
  amount bigint not null check (amount > 0),
  active boolean not null default true,
  unique (family,tier)
);
insert into depix_sandbox.royalty_offers (sku,family,title,tier,bonus,amount) values
('rack-i','rack','Rack I',1,10,299000000),('rack-ii','rack','Rack II',2,15,599000000),('rack-iii','rack','Rack III',3,20,1099000000),
('vip-barao','vip','Barão',1,10,3000000000),('vip-conde','vip','Conde',2,15,4500000000),
('vip-duque','vip','Duque',3,20,6000000000),('vip-principe','vip','Príncipe',4,25,8000000000),
('vip-rei','vip','Rei',5,30,10000000000);

create table depix_sandbox.royalty_receipts (
  id uuid primary key references depix_sandbox.journal,
  user_id uuid not null references auth.users,
  sku text not null references depix_sandbox.royalty_offers,
  amount bigint not null,
  title text not null,
  family text not null,
  bonus integer not null,
  started_at timestamptz not null default now(),
  valid_until timestamptz,
  replaced_at timestamptz
);
create index royalty_player_history_idx on depix_sandbox.royalty_receipts (user_id,family,started_at desc);
create unique index royalty_one_current_vip_idx on depix_sandbox.royalty_receipts(user_id)
  where family='vip' and replaced_at is null;

create table depix_sandbox.rack_mounts (
  equipment_id uuid primary key references public.player_equipment on delete cascade,
  rack_id uuid not null references depix_sandbox.royalty_receipts,
  room_id uuid not null references public.player_rooms
);
create index rack_mounts_rack_idx on depix_sandbox.rack_mounts (rack_id);

alter table depix_sandbox.royalty_offers enable row level security;
alter table depix_sandbox.royalty_receipts enable row level security;
alter table depix_sandbox.rack_mounts enable row level security;
revoke all on depix_sandbox.royalty_offers, depix_sandbox.royalty_receipts, depix_sandbox.rack_mounts from public, anon, authenticated, service_role;

create function public.royalty_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare player uuid := depix_sandbox.require_player();
begin
  return jsonb_build_object(
    'offers', (select coalesce(jsonb_agg(jsonb_build_object('sku',sku,'family',family,'title',title,'tier',tier,'bonus',bonus,
      'price',depix_sandbox.decimal_amount(amount)) order by family,tier),'[]') from depix_sandbox.royalty_offers where active),
    'vip', (select to_jsonb(r) - 'amount' - 'user_id' from depix_sandbox.royalty_receipts r
      where user_id = player and family='vip' and replaced_at is null and now() < valid_until),
    'racks', (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'bonus',r.bonus,
      'room_id',(select m.room_id from depix_sandbox.rack_mounts m where m.rack_id=r.id limit 1))
      order by r.started_at,r.id),'[]') from depix_sandbox.royalty_receipts r where r.user_id=player and r.family='rack'),
    'mounts', (select coalesce(jsonb_object_agg(m.equipment_id,m.rack_id),'{}')
      from depix_sandbox.rack_mounts m join depix_sandbox.royalty_receipts r on r.id=m.rack_id where r.user_id=player)
  );
end;
$$;

create function public.royalty_purchase(p_request_id uuid,p_sku text,p_price text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  player uuid := depix_sandbox.require_player();
  expected bigint := depix_sandbox.amount_units(p_price);
  offer depix_sandbox.royalty_offers%rowtype;
  receipt depix_sandbox.royalty_receipts%rowtype;
  started timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(player::text || ':royalty',0));
  started := clock_timestamp();
  select * into receipt from depix_sandbox.royalty_receipts where id=p_request_id;
  if found then
    if receipt.user_id <> player or receipt.sku is distinct from p_sku or receipt.amount <> expected then
      raise exception 'Identificador de compra em uso.' using errcode='22023';
    end if;
    return false;
  end if;
  select * into offer from depix_sandbox.royalty_offers where sku=p_sku and active for share;
  if not found or offer.amount <> expected then raise exception 'Oferta mudou. Atualize a página.' using errcode='22023'; end if;
  if not depix_sandbox.post(p_request_id,'purchase',player,'player_available','platform_sales',offer.amount) then
    raise exception 'Identificador de compra em uso.' using errcode='22023';
  end if;
  if offer.family='vip' then
    update depix_sandbox.royalty_receipts set replaced_at=started
    where user_id=player and family='vip' and replaced_at is null;
  end if;
  insert into depix_sandbox.royalty_receipts(id,user_id,sku,amount,title,family,bonus,started_at,valid_until)
  values (p_request_id,player,offer.sku,offer.amount,offer.title,offer.family,offer.bonus,started,
    case when offer.family='vip' then started + interval '720 hours' end);
  return true;
end;
$$;

create function public.royalty_mount(p_equipment uuid,p_rack uuid)
returns void language plpgsql security definer set search_path='' as $$
declare player uuid := depix_sandbox.require_player(); room uuid;
begin
  select room_id into room from public.player_equipment
    where id=p_equipment and user_id=player and status='installed' for update;
  if room is null then raise exception 'Instale o equipamento em uma sala.' using errcode='22023'; end if;
  if p_rack is null then
    delete from depix_sandbox.rack_mounts where equipment_id=p_equipment;
    return;
  end if;
  perform 1 from depix_sandbox.royalty_receipts where id=p_rack and user_id=player and family='rack' for update;
  if not found then raise exception 'Rack indisponível.' using errcode='42501'; end if;
  if exists (select 1 from depix_sandbox.rack_mounts where rack_id=p_rack and room_id<>room) then
    raise exception 'O rack está sendo usado em outra sala.' using errcode='22023';
  end if;
  insert into depix_sandbox.rack_mounts(equipment_id,rack_id,room_id) values (p_equipment,p_rack,room)
    on conflict (equipment_id) do update set rack_id=excluded.rack_id,room_id=excluded.room_id;
end;
$$;

create function depix_sandbox.unmount_on_room_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from depix_sandbox.rack_mounts where equipment_id=new.id;
  return new;
end;
$$;
create trigger royalty_unmount_on_room_change after update of room_id on public.player_equipment
  for each row when (old.room_id is distinct from new.room_id) execute function depix_sandbox.unmount_on_room_change();
revoke all on function depix_sandbox.unmount_on_room_change() from public, anon, authenticated, service_role;
revoke all on function public.royalty_snapshot(),public.royalty_purchase(uuid,text,text),public.royalty_mount(uuid,uuid) from public, anon, authenticated;
grant execute on function public.royalty_snapshot(),public.royalty_purchase(uuid,text,text),public.royalty_mount(uuid,uuid) to authenticated;

create or replace function public.competition_hashrates(p_at timestamptz)
returns table(user_id uuid, hashrate numeric)
language sql
stable
set search_path = ''
as $$
  with sources as (
    select pe.user_id,
      c.hashrate * (1 + c.overclock_percent / 100 + pe.blessing_percent / 100 + coalesce(rack.bonus,0)::numeric / 100) as power
    from public.player_equipment pe
    join public.equipment_catalog c on c.sku = pe.catalog_sku
    join public.player_rooms r on r.id = pe.room_id and r.user_id = pe.user_id
    left join depix_sandbox.rack_mounts m on m.equipment_id=pe.id and m.room_id=r.id
    left join depix_sandbox.royalty_receipts rack on rack.id=m.rack_id and rack.started_at <= p_at
    where pe.status = 'installed' and r.active and pe.acquired_at <= p_at
    union all
    select b.user_id, b.active_hashrate
    from public.player_game_hash_boosts b
    where b.updated_at <= p_at and b.expires_at > p_at
    union all
    select m.user_id, 10::numeric
    from mining_competition.starter_miners m
    where m.claimed_at <= p_at
    union all
    select x.user_id, 2::numeric
    from public.player_xp_transactions x
    where x.source = 'daily_login' and x.created_at > p_at - interval '24 hours' and x.created_at <= p_at
    group by x.user_id
  )
  select s.user_id, (sum(s.power) * (1 + coalesce(max(vip.bonus),0)::numeric / 100))::numeric(30,6)
  from sources s
  join auth.users u on u.id = s.user_id
  join public.profiles p on p.user_id = s.user_id
  left join depix_sandbox.royalty_receipts vip on vip.user_id=s.user_id and vip.family='vip'
    and vip.started_at <= p_at and p_at < vip.valid_until and (vip.replaced_at is null or p_at < vip.replaced_at)
  where not coalesce(u.is_anonymous, false) and (u.banned_until is null or u.banned_until <= p_at)
  group by s.user_id
  having sum(s.power) > 0
$$;
