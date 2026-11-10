alter table public.player_rooms add column active boolean not null default true;
drop policy if exists "Players can view their own rooms" on public.player_rooms;
create policy "Players can view their own active rooms" on public.player_rooms for select to authenticated using ((select auth.uid())=user_id and active=true);

create or replace function public.sync_player_rooms_for_vip()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_room_count integer:=1+new.vip_tier;
begin
 if tg_op='UPDATE' and new.vip_tier<old.vip_tier then
  if exists(select 1 from public.player_equipment pe join public.player_rooms pr on pr.id=pe.room_id and pr.user_id=pe.user_id where pe.user_id=new.user_id and pe.status='installed' and pr.room_number>v_room_count) then
   raise exception 'Desinstale os equipamentos das salas adicionais antes de reduzir o VIP.';
  end if;
  update public.player_rooms set active=false where user_id=new.user_id and room_number>v_room_count;
 end if;
 insert into public.player_rooms(user_id,room_number,name,active)
 select new.user_id,n,case when n=1 then 'Sala Principal' else 'Sala '||n::text end,true
 from generate_series(1,v_room_count) as n
 on conflict(user_id,room_number) do update set active=true;
 return new;
end $$;

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
 select * into v_room from public.player_rooms where id=p_room_id and user_id=v_user_id and active=true for update;
 if not found then raise exception 'Sala não encontrada ou indisponível nesta conta.' using errcode='P0002'; end if;
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

create or replace function public.rename_player_room(p_room_id uuid,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_name text:=btrim(coalesce(p_name,''));
begin
 if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='28000'; end if;
 if p_room_id is null or char_length(v_name) not between 1 and 30 then raise exception 'Nome de sala inválido (1 a 30 caracteres).' using errcode='22023'; end if;
 update public.player_rooms set name=v_name where id=p_room_id and user_id=v_user_id and active=true;
 if not found then raise exception 'Sala não encontrada ou indisponível nesta conta.' using errcode='P0002'; end if;
 return jsonb_build_object('success',true,'room_id',p_room_id,'name',v_name);
end $$;

create or replace function public.get_player_mining_summary()
returns table(total_hashrate numeric,installed_equipment_count bigint,room_count bigint,total_room_capacity bigint)
language sql stable security invoker set search_path='' as $$
 select
  coalesce((select sum(ec.hashrate) from public.player_equipment pe join public.equipment_catalog ec on ec.sku=pe.catalog_sku where pe.user_id=(select auth.uid()) and pe.status='installed'),0)::numeric,
  (select count(*) from public.player_equipment pe where pe.user_id=(select auth.uid()) and pe.status='installed'),
  (select count(*) from public.player_rooms pr where pr.user_id=(select auth.uid()) and pr.active=true),
  (select count(*)*10 from public.player_rooms pr where pr.user_id=(select auth.uid()) and pr.active=true)
 where (select auth.uid()) is not null;
$$;
