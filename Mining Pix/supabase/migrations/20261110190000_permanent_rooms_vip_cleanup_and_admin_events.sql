-- Permanent player-owned rooms. VIP no longer provisions, deactivates, or limits rooms.
alter table public.player_progress drop constraint if exists player_progress_vip_tier_check;
alter table public.player_progress add constraint player_progress_vip_tier_check check (vip_tier between 0 and 5);
drop trigger if exists sync_player_rooms_after_progress_insert on public.player_progress;
drop trigger if exists sync_player_rooms_after_vip_update on public.player_progress;
drop function if exists public.sync_player_rooms_for_vip();

alter table public.player_rooms drop constraint if exists player_rooms_room_number_check;
alter table public.player_rooms add constraint player_rooms_room_number_check check (room_number between 1 and 50);
alter table public.player_rooms
  add column if not exists unlock_cost_pc numeric(20,0) not null default 0 check (unlock_cost_pc >= 0),
  add column if not exists maintenance_rate_percent numeric(5,2) not null default 1.50 check (maintenance_rate_percent between 0 and 100),
  add column if not exists grandfathered boolean not null default true,
  add column if not exists unlocked_at timestamptz not null default now();
update public.player_rooms set active=true;

update public.equipment_catalog set active=false,updated_at=now()
where lower(name) like 'pix miner %' or sku in ('pix_miner_i','pix_miner_ii','pix_miner_iii');

create or replace function public.purchase_player_room(p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user_id uuid:=auth.uid(); v_wallet public.wallets%rowtype; v_existing public.wallet_transactions%rowtype;
 v_room_id uuid; v_room_number integer; v_balance_after numeric(20,0); v_cost numeric(20,0):=10000;
begin
 if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='28000'; end if;
 if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128 then raise exception 'Chave de desbloqueio inválida.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user_id::text||':room-unlock',0));
 select * into v_existing from public.wallet_transactions where user_id=v_user_id and idempotency_key=p_idempotency_key;
 if found then
  if v_existing.transaction_type<>'purchase' or v_existing.reference_type<>'room_unlock' then raise exception 'Chave de idempotência já utilizada em outra operação.' using errcode='22023'; end if;
  return jsonb_build_object('success',true,'replayed',true,'room_id',v_existing.reference_id,'balance_after',v_existing.balance_after,'cost_pc',abs(v_existing.amount));
 end if;
 select * into v_wallet from public.wallets where user_id=v_user_id for update;
 if not found then raise exception 'Carteira PIX COIN não encontrada.' using errcode='P0002'; end if;
 if v_wallet.balance<v_cost then raise exception 'Saldo insuficiente: são necessários 10.000 PC.' using errcode='P0001'; end if;
 select coalesce(max(room_number),0)+1 into v_room_number from public.player_rooms where user_id=v_user_id;
 if v_room_number>50 then raise exception 'Limite de 50 salas por conta atingido.' using errcode='P0001'; end if;
 v_balance_after:=v_wallet.balance-v_cost;
 update public.wallets set balance=v_balance_after,version=version+1,updated_at=now() where user_id=v_user_id;
 insert into public.player_rooms(user_id,room_number,name,active,unlock_cost_pc,maintenance_rate_percent,grandfathered)
 values(v_user_id,v_room_number,'Sala '||v_room_number,true,v_cost,1.50,false) returning id into v_room_id;
 insert into public.wallet_transactions(user_id,amount,balance_after,transaction_type,reference_type,reference_id,idempotency_key,description)
 values(v_user_id,-v_cost,v_balance_after,'purchase','room_unlock',v_room_id::text,p_idempotency_key,'Desbloqueio permanente da Sala '||v_room_number);
 return jsonb_build_object('success',true,'replayed',false,'room_id',v_room_id,'room_number',v_room_number,'balance_after',v_balance_after,'cost_pc',v_cost,'maintenance_rate_percent',1.50);
end $$;
revoke all on function public.purchase_player_room(text) from public,anon;
grant execute on function public.purchase_player_room(text) to authenticated;

create or replace function public.install_player_equipment(p_equipment_id uuid,p_room_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user_id uuid:=auth.uid(); v_room public.player_rooms%rowtype; v_equipment public.player_equipment%rowtype;
 v_catalog public.equipment_catalog%rowtype; v_operation public.player_equipment_operations%rowtype; v_installed_count integer;
begin
 if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='28000'; end if;
 if p_equipment_id is null or p_room_id is null then raise exception 'Equipamento e sala são obrigatórios.' using errcode='22023'; end if;
 if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128 then raise exception 'Chave de operação inválida.' using errcode='22023'; end if;
 select * into v_room from public.player_rooms where id=p_room_id and user_id=v_user_id and active=true for update;
 if not found then raise exception 'Sala não encontrada nesta conta.' using errcode='P0002'; end if;
 select * into v_equipment from public.player_equipment where id=p_equipment_id and user_id=v_user_id for update;
 if not found then raise exception 'Equipamento não encontrado nesta conta.' using errcode='P0002'; end if;
 select * into v_operation from public.player_equipment_operations where user_id=v_user_id and idempotency_key=p_idempotency_key;
 if found then
  if v_operation.operation<>'install' or v_operation.equipment_id<>p_equipment_id or v_operation.room_id<>p_room_id then raise exception 'Chave de idempotência já utilizada em outra operação.' using errcode='22023'; end if;
  return jsonb_build_object('success',true,'replayed',true,'equipment_id',p_equipment_id,'room_id',p_room_id);
 end if;
 if v_equipment.status<>'inventory' then raise exception 'Somente equipamentos no inventário podem ser instalados.' using errcode='P0001'; end if;
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

create table public.game_events (
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(btrim(title)) between 3 and 100),
 description text not null default '' check(char_length(description)<=2000),
 event_type text not null check(event_type in ('event','battle_pass')),
 status text not null default 'draft' check(status in ('draft','scheduled','live','ended','cancelled')),
 starts_at timestamptz not null, ends_at timestamptz not null,
 payload jsonb not null default '{}'::jsonb,
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), published_at timestamptz,
 constraint game_events_valid_window check(ends_at>starts_at),
 constraint game_events_payload_object check(jsonb_typeof(payload)='object')
);
create index game_events_status_window_idx on public.game_events(status,starts_at,ends_at);
alter table public.game_events enable row level security;
revoke all on public.game_events from public,anon,authenticated;
grant select on public.game_events to authenticated;
create policy "Players can read live events" on public.game_events for select to authenticated
using(status='live' and starts_at<=now() and ends_at>now());

create or replace function public.admin_list_game_events()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_events jsonb;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'admin','false')<>'true' then raise exception 'Administrative permission required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.starts_at desc),'[]'::jsonb) into v_events
 from (select * from public.game_events order by starts_at desc limit 100) e;
 return jsonb_build_object('events',v_events,'generated_at',now());
end $$;
revoke all on function public.admin_list_game_events() from public,anon;
grant execute on function public.admin_list_game_events() to authenticated;

create or replace function public.admin_save_game_event(p_id uuid,p_title text,p_description text,p_event_type text,p_starts_at timestamptz,p_ends_at timestamptz,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_before jsonb; v_after jsonb; v_reason text;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'admin','false')<>'true' then raise exception 'Administrative permission required' using errcode='42501'; end if;
 if char_length(btrim(coalesce(p_title,''))) not between 3 and 100 or char_length(coalesce(p_description,''))>2000
  or p_event_type not in ('event','battle_pass') or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at
  or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>50000 then
  raise exception 'Dados do evento inválidos.' using errcode='22023';
 end if;
 if p_id is null then
  insert into public.game_events(title,description,event_type,status,starts_at,ends_at,payload,created_by,updated_by)
  values(btrim(p_title),coalesce(p_description,''),p_event_type,'draft',p_starts_at,p_ends_at,p_payload,auth.uid(),auth.uid())
  returning id,to_jsonb(game_events) into v_id,v_after;
  v_reason:='Criação de evento/temporada em rascunho';
 else
  select to_jsonb(e) into v_before from public.game_events e where id=p_id for update;
  if not found then raise exception 'Evento não encontrado.' using errcode='P0002'; end if;
  if v_before->>'status' not in ('draft','scheduled') then raise exception 'Somente rascunhos ou eventos agendados podem ser editados.' using errcode='P0001'; end if;
  update public.game_events set title=btrim(p_title),description=coalesce(p_description,''),event_type=p_event_type,starts_at=p_starts_at,ends_at=p_ends_at,payload=p_payload,updated_by=auth.uid(),updated_at=now()
  where id=p_id returning id,to_jsonb(game_events) into v_id,v_after;
  v_reason:='Atualização de evento/temporada';
 end if;
 insert into public.admin_audit_logs(actor_user_id,action,entity_type,entity_id,reason,before_data,after_data,metadata)
 values(auth.uid(),'game_event.saved','game_event',v_id::text,v_reason,v_before,v_after,jsonb_build_object('event_type',p_event_type));
 return jsonb_build_object('success',true,'id',v_id,'status',v_after->>'status');
end $$;
revoke all on function public.admin_save_game_event(uuid,text,text,text,timestamptz,timestamptz,jsonb) from public,anon;
grant execute on function public.admin_save_game_event(uuid,text,text,text,timestamptz,timestamptz,jsonb) to authenticated;

create or replace function public.admin_set_game_event_status(p_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.game_events%rowtype; v_before jsonb;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'admin','false')<>'true' then raise exception 'Administrative permission required' using errcode='42501'; end if;
 if p_id is null or p_status not in ('draft','scheduled','live','ended','cancelled') then raise exception 'Transição de evento inválida.' using errcode='22023'; end if;
 select * into v_event from public.game_events where id=p_id for update;
 if not found then raise exception 'Evento não encontrado.' using errcode='P0002'; end if;
 v_before:=to_jsonb(v_event);
 if p_status='live' and (now()<v_event.starts_at or now()>=v_event.ends_at) then raise exception 'O evento só pode ser iniciado dentro da janela configurada.' using errcode='P0001'; end if;
 if p_status='scheduled' and v_event.ends_at<=now() then raise exception 'Não é possível agendar um evento com término no passado.' using errcode='P0001'; end if;
 update public.game_events set status=p_status,updated_by=auth.uid(),updated_at=now(),published_at=case when p_status in ('scheduled','live') then coalesce(published_at,now()) else published_at end
 where id=p_id returning * into v_event;
 insert into public.admin_audit_logs(actor_user_id,action,entity_type,entity_id,reason,before_data,after_data,metadata)
 values(auth.uid(),'game_event.status_changed','game_event',p_id::text,'Alteração manual do estado do evento',v_before,to_jsonb(v_event),jsonb_build_object('status',p_status));
 return jsonb_build_object('success',true,'id',p_id,'status',p_status);
end $$;
revoke all on function public.admin_set_game_event_status(uuid,text) from public,anon;
grant execute on function public.admin_set_game_event_status(uuid,text) to authenticated;
