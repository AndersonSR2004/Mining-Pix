alter table depix_sandbox.royalty_receipts add column disassembled_at timestamptz;

create table depix_sandbox.parts_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  source text not null check (source in ('machine_disassembly','rack_disassembly')),
  source_id uuid not null,
  cpu integer not null check (cpu = 10),
  gpu integer not null check (gpu = 10),
  motherboard integer not null check (motherboard = 10),
  created_at timestamptz not null default clock_timestamp(),
  unique (source, source_id)
);
create index parts_movements_player_idx on depix_sandbox.parts_movements(user_id);
alter table depix_sandbox.parts_movements enable row level security;
revoke all on depix_sandbox.parts_movements from public, anon, authenticated, service_role;

create function public.genesis_parts_inventory()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cpu', coalesce(sum(m.cpu),0)::text,
    'gpu', coalesce(sum(m.gpu),0)::text,
    'motherboard', coalesce(sum(m.motherboard),0)::text)
  from (select depix_sandbox.require_player() as id) player
  left join depix_sandbox.parts_movements m on m.user_id = player.id
$$;

create function public.genesis_disassemble(p_kind text, p_item uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  player uuid := depix_sandbox.require_player();
  machine public.player_equipment%rowtype;
  rack depix_sandbox.royalty_receipts%rowtype;
begin
  if p_kind = 'machine' then
    select * into machine from public.player_equipment
      where id = p_item and user_id = player for update;
    if not found then raise exception 'Máquina indisponível.' using errcode = 'P0002'; end if;
    if exists (select 1 from depix_sandbox.parts_movements where source='machine_disassembly' and source_id=p_item) then
      return false;
    end if;
    if machine.status <> 'inventory' then
      raise exception 'Somente máquinas desinstaladas podem ser desmontadas.' using errcode = '55000';
    end if;
    update public.player_equipment set status='retired' where id=p_item;
  elsif p_kind = 'rack' then
    select * into rack from depix_sandbox.royalty_receipts
      where id = p_item and user_id = player and family='rack' for update;
    if not found then raise exception 'Rack indisponível.' using errcode = 'P0002'; end if;
    if rack.disassembled_at is not null then return false; end if;
    if exists (select 1 from depix_sandbox.rack_mounts where rack_id=p_item) then
      raise exception 'Remova as máquinas antes de desmontar o rack.' using errcode = '55000';
    end if;
    update depix_sandbox.royalty_receipts set disassembled_at=clock_timestamp() where id=p_item;
  else
    raise exception 'Tipo de equipamento inválido.' using errcode = '22023';
  end if;

  insert into depix_sandbox.parts_movements(user_id,source,source_id,cpu,gpu,motherboard)
  values (player,p_kind || '_disassembly',p_item,10,10,10);
  return true;
end;
$$;

revoke all on function public.genesis_parts_inventory(),public.genesis_disassemble(text,uuid)
from public, anon, authenticated;
grant execute on function public.genesis_parts_inventory(),public.genesis_disassemble(text,uuid)
to authenticated;

create or replace function public.royalty_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare player uuid := depix_sandbox.require_player();
begin
  return jsonb_build_object(
    'offers', (select coalesce(jsonb_agg(jsonb_build_object('sku',sku,'family',family,'title',title,'tier',tier,'bonus',bonus,
      'price',depix_sandbox.decimal_amount(amount)) order by family,tier),'[]') from depix_sandbox.royalty_offers where active and family='rack'),
    'vip', null,
    'racks', (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'bonus',r.bonus,
      'room_id',(select m.room_id from depix_sandbox.rack_mounts m where m.rack_id=r.id limit 1))
      order by r.started_at,r.id),'[]') from depix_sandbox.royalty_receipts r where r.user_id=player and r.family='rack' and r.disassembled_at is null),
    'mounts', (select coalesce(jsonb_object_agg(m.equipment_id,m.rack_id),'{}')
      from depix_sandbox.rack_mounts m join depix_sandbox.royalty_receipts r on r.id=m.rack_id where r.user_id=player)
  );
end;
$$;

create or replace function public.royalty_mount(p_equipment uuid,p_rack uuid)
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
  perform 1 from depix_sandbox.royalty_receipts where id=p_rack and user_id=player and family='rack' and disassembled_at is null for update;
  if not found then raise exception 'Rack indisponível.' using errcode='42501'; end if;
  if exists (select 1 from depix_sandbox.rack_mounts where rack_id=p_rack and room_id<>room) then
    raise exception 'O rack está sendo usado em outra sala.' using errcode='22023';
  end if;
  insert into depix_sandbox.rack_mounts(equipment_id,rack_id,room_id) values (p_equipment,p_rack,room)
    on conflict (equipment_id) do update set rack_id=excluded.rack_id,room_id=excluded.room_id;
end;
$$;
