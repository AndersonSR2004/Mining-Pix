create table public.player_rooms (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 room_number smallint not null check (room_number between 1 and 4),
 name text not null check (char_length(btrim(name)) between 1 and 30),
 created_at timestamptz not null default now(),
 constraint player_rooms_user_room_unique unique (user_id,room_number),
 constraint player_rooms_id_user_unique unique (id,user_id)
);
alter table public.player_rooms enable row level security;
revoke all on public.player_rooms from public,anon,authenticated;
grant select on public.player_rooms to authenticated;
create policy "Players can view their own rooms" on public.player_rooms for select to authenticated using ((select auth.uid())=user_id);

alter table public.player_equipment add constraint player_equipment_id_user_unique unique (id,user_id), add column room_id uuid null;
update public.player_equipment set status='inventory',room_id=null where status='installed';
alter table public.player_equipment
 add constraint player_equipment_room_owner_fkey foreign key (room_id,user_id) references public.player_rooms(id,user_id) on delete restrict,
 add constraint player_equipment_status_room_check check ((status='installed' and room_id is not null) or (status in ('inventory','retired') and room_id is null));
create index player_equipment_user_status_idx on public.player_equipment(user_id,status);
create index player_equipment_room_idx on public.player_equipment(room_id) where room_id is not null;

create table public.player_equipment_operations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 equipment_id uuid not null,
 operation text not null check (operation in ('install','uninstall')),
 room_id uuid null,
 idempotency_key text not null check (char_length(idempotency_key) between 1 and 128),
 created_at timestamptz not null default now(),
 constraint player_equipment_operations_user_key_unique unique(user_id,idempotency_key),
 constraint player_equipment_operations_equipment_owner_fkey foreign key(equipment_id,user_id) references public.player_equipment(id,user_id) on delete restrict,
 constraint player_equipment_operations_room_owner_fkey foreign key(room_id,user_id) references public.player_rooms(id,user_id) on delete restrict
);
alter table public.player_equipment_operations enable row level security;
revoke all on public.player_equipment_operations from public,anon,authenticated;
grant select on public.player_equipment_operations to authenticated;
create policy "Players can view their own equipment operations" on public.player_equipment_operations for select to authenticated using ((select auth.uid())=user_id);

create or replace function public.sync_player_rooms_for_vip() returns trigger language plpgsql security definer set search_path='' as $$
declare v_room_count integer := 1 + new.vip_tier;
begin
 if tg_op='UPDATE' and new.vip_tier<old.vip_tier then
  if exists(select 1 from public.player_equipment pe join public.player_rooms pr on pr.id=pe.room_id and pr.user_id=pe.user_id where pe.user_id=new.user_id and pe.status='installed' and pr.room_number>v_room_count) then
   raise exception 'Desinstale os equipamentos das salas adicionais antes de reduzir o VIP.';
  end if;
  delete from public.player_rooms where user_id=new.user_id and room_number>v_room_count;
 end if;
 insert into public.player_rooms(user_id,room_number,name)
 select new.user_id,n,case when n=1 then 'Sala Principal' else 'Sala '||n::text end
 from generate_series(1,v_room_count) as n on conflict(user_id,room_number) do nothing;
 return new;
end $$;
revoke all on function public.sync_player_rooms_for_vip() from public,anon,authenticated;
create trigger sync_player_rooms_after_progress_insert after insert on public.player_progress for each row execute function public.sync_player_rooms_for_vip();
create trigger sync_player_rooms_after_vip_update after update of vip_tier on public.player_progress for each row when(old.vip_tier is distinct from new.vip_tier) execute function public.sync_player_rooms_for_vip();
insert into public.player_rooms(user_id,room_number,name)
select pp.user_id,n,case when n=1 then 'Sala Principal' else 'Sala '||n::text end
from public.player_progress pp cross join lateral generate_series(1,1+pp.vip_tier) as n
on conflict(user_id,room_number) do nothing;

create or replace function public.install_player_equipment(p_equipment_id uuid,p_room_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user_id uuid:=auth.uid(); v_room public.player_rooms%rowtype; v_equipment public.player_equipment%rowtype;
 v_catalog public.equipment_catalog%rowtype; v_operation public.player_equipment_operations%rowtype;
 v_installed_count integer; v_vip_tier smallint;
begin
 if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='28000'; end if;
 if p_equipment_id is null or p_room_id is null then raise exception 'Equipamento e sala são obrigatórios.' using errcode='22023'; end if;
 if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128 then raise exception 'Chave de operação inválida.' using errcode='22023'; end if;
 select * into v_room from public.player_rooms where id=p_room_id and user_id=v_user_id for update;
 if not found then raise exception 'Sala não encontrada nesta conta.' using errcode='P0002'; end if;
 select * into v_equipment from public.player_equipment where id=p_equipment_id and user_id=v_user_id for update;
 if not found then raise exception 'Equipamento não encontrado nesta conta.' using errcode='P0002'; end if;
 select * into v_operation from public.player_equipment_operations where user_id=v_user_id and idempotency_key=p_idempotency_key;
 if found then
  if v_operation.operation<>'install' or v_operation.equipment_id<>p_equipment_id or v_operation.room_id<>p_room_id then raise exception 'Chave de idempotência já utilizada em outra operação.' using errcode='22023'; end if;
  return jsonb_build_object('success',true,'replayed',true,'equipment_id',p_equipment_id,'room_id',p_room_id);
 end if;
 if v_equipment.status<>'inventory' then raise exception 'Somente equipamentos no inventário podem ser instalados.' using errcode='P0001'; end if;
 select vip_tier into v_vip_tier from public.player_progress where user_id=v_user_id;
 if v_room.room_number>1+coalesce(v_vip_tier,0) then raise exception 'Seu plano atual não permite utilizar esta sala.' using errcode='42501'; end if;
 select count(*) into v_installed_count from public.player_equipment where user_id=v_user_id and room_id=p_room_id and status='installed';
 if v_installed_count>=10 then raise exception 'Esta sala atingiu o limite de 10 equipamentos.' using errcode='P0001'; end if;
 select * into v_catalog from public.equipment_catalog where sku=v_equipment.catalog_sku;
 if not found then raise exception 'Catálogo do equipamento não encontrado.' using errcode='P0002'; end if;
 update public.player_equipment set status='installed',room_id=p_room_id where id=p_equipment_id and user_id=v_user_id;
 insert into public.player_equipment_operations(user_id,equipment_id,operation,room_id,idempotency_key) values(v_user_id,p_equipment_id,'install',p_room_id,p_idempotency_key);
 return jsonb_build_object('success',true,'replayed',false,'equipment_id',p_equipment_id,'room_id',p_room_id,'hashrate',v_catalog.hashrate);
end $$;
revoke all on function public.install_player_equipment(uuid,uuid,text) from public,anon;
grant execute on function public.install_player_equipment(uuid,uuid,text) to authenticated;

create or replace function public.uninstall_player_equipment(p_equipment_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user_id uuid:=auth.uid(); v_equipment public.player_equipment%rowtype; v_catalog public.equipment_catalog%rowtype;
 v_operation public.player_equipment_operations%rowtype; v_previous_room_id uuid;
begin
 if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='28000'; end if;
 if p_equipment_id is null then raise exception 'Equipamento obrigatório.' using errcode='22023'; end if;
 if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128 then raise exception 'Chave de operação inválida.' using errcode='22023'; end if;
 select * into v_equipment from public.player_equipment where id=p_equipment_id and user_id=v_user_id for update;
 if not found then raise exception 'Equipamento não encontrado nesta conta.' using errcode='P0002'; end if;
 select * into v_operation from public.player_equipment_operations where user_id=v_user_id and idempotency_key=p_idempotency_key;
 if found then
  if v_operation.operation<>'uninstall' or v_operation.equipment_id<>p_equipment_id then raise exception 'Chave de idempotência já utilizada em outra operação.' using errcode='22023'; end if;
  return jsonb_build_object('success',true,'replayed',true,'equipment_id',p_equipment_id);
 end if;
 if v_equipment.status<>'installed' or v_equipment.room_id is null then raise exception 'Este equipamento não está instalado.' using errcode='P0001'; end if;
 v_previous_room_id:=v_equipment.room_id;
 select * into v_catalog from public.equipment_catalog where sku=v_equipment.catalog_sku;
 update public.player_equipment set status='inventory',room_id=null where id=p_equipment_id and user_id=v_user_id;
 insert into public.player_equipment_operations(user_id,equipment_id,operation,room_id,idempotency_key) values(v_user_id,p_equipment_id,'uninstall',null,p_idempotency_key);
 return jsonb_build_object('success',true,'replayed',false,'equipment_id',p_equipment_id,'previous_room_id',v_previous_room_id,'hashrate_removed',coalesce(v_catalog.hashrate,0));
end $$;
revoke all on function public.uninstall_player_equipment(uuid,text) from public,anon;
grant execute on function public.uninstall_player_equipment(uuid,text) to authenticated;

create or replace function public.rename_player_room(p_room_id uuid,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_name text:=btrim(coalesce(p_name,''));
begin
 if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='28000'; end if;
 if p_room_id is null or char_length(v_name) not between 1 and 30 then raise exception 'Nome de sala inválido (1 a 30 caracteres).' using errcode='22023'; end if;
 update public.player_rooms set name=v_name where id=p_room_id and user_id=v_user_id;
 if not found then raise exception 'Sala não encontrada nesta conta.' using errcode='P0002'; end if;
 return jsonb_build_object('success',true,'room_id',p_room_id,'name',v_name);
end $$;
revoke all on function public.rename_player_room(uuid,text) from public,anon;
grant execute on function public.rename_player_room(uuid,text) to authenticated;

create or replace function public.get_player_mining_summary()
returns table(total_hashrate numeric,installed_equipment_count bigint,room_count bigint,total_room_capacity bigint)
language sql stable security invoker set search_path='' as $$
 select
  coalesce((select sum(ec.hashrate) from public.player_equipment pe join public.equipment_catalog ec on ec.sku=pe.catalog_sku where pe.user_id=(select auth.uid()) and pe.status='installed'),0)::numeric,
  (select count(*) from public.player_equipment pe where pe.user_id=(select auth.uid()) and pe.status='installed'),
  (select count(*) from public.player_rooms pr where pr.user_id=(select auth.uid())),
  (select count(*)*10 from public.player_rooms pr where pr.user_id=(select auth.uid()))
 where (select auth.uid()) is not null;
$$;
revoke all on function public.get_player_mining_summary() from public,anon;
grant execute on function public.get_player_mining_summary() to authenticated;
