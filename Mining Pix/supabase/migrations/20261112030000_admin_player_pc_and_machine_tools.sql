begin;
alter table public.player_equipment add column if not exists admin_granted boolean not null default false;
alter table public.player_equipment drop constraint if exists player_equipment_purchase_price_pc_check;
alter table public.player_equipment add constraint player_equipment_purchase_price_pc_check check(purchase_price_pc>=0);
alter table private.sandbox_admin_events add column if not exists target_user_id uuid references auth.users(id);

create or replace function public.admin_adjust_player_pc(p_target_user_id uuid,p_amount numeric,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_wallet public.wallets%rowtype; v_existing public.wallet_transactions%rowtype; v_after numeric(20,0); v_key text;
begin
 v_actor:=private.assert_sandbox_admin();
 if p_target_user_id is null or p_amount is null or p_amount=0 or p_amount<>trunc(p_amount) or abs(p_amount)>999999999999999999 or p_request_id is null or length(trim(coalesce(p_reason,'')))<5 then raise exception 'Invalid player PC adjustment' using errcode='22023'; end if;
 v_key:='admin:'||p_request_id::text;
 select * into v_existing from public.wallet_transactions where user_id=p_target_user_id and idempotency_key=v_key;
 if found then return jsonb_build_object('success',true,'duplicate',true,'balance_after',v_existing.balance_after,'transaction_id',v_existing.id); end if;
 select * into v_wallet from public.wallets where user_id=p_target_user_id for update;
 if not found then raise exception 'Player wallet not found' using errcode='P0002'; end if;
 v_after:=v_wallet.balance+p_amount;
 if v_after<0 then raise exception 'Adjustment would make the PC balance negative' using errcode='23514'; end if;
 update public.wallets set balance=v_after,version=version+1,updated_at=now() where user_id=p_target_user_id;
 insert into public.wallet_transactions(user_id,amount,balance_after,transaction_type,reference_type,reference_id,idempotency_key,description)
 values(p_target_user_id,p_amount,v_after,'admin_adjustment','admin_adjustment',p_request_id::text,v_key,left('Ajuste administrativo: '||trim(p_reason),160)) returning * into v_existing;
 insert into private.sandbox_admin_events(actor_user_id,target_user_id,action,reason,before_data,after_data,request_id)
 values(v_actor,p_target_user_id,'player_pc_adjusted',trim(p_reason),jsonb_build_object('balance',v_wallet.balance),jsonb_build_object('balance',v_after,'amount',p_amount,'ledger_id',v_existing.id),p_request_id);
 return jsonb_build_object('success',true,'duplicate',false,'balance_after',v_after,'transaction_id',v_existing.id);
end; $$;

create or replace function public.admin_grant_player_equipment(p_target_user_id uuid,p_sku text,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_item public.equipment_catalog%rowtype; v_equipment_id uuid; v_blessing numeric(5,2); v_existing private.sandbox_admin_events%rowtype;
begin
 v_actor:=private.assert_sandbox_admin();
 if p_target_user_id is null or p_sku is null or length(trim(p_sku)) not between 1 and 64 or p_request_id is null or length(trim(coalesce(p_reason,'')))<5 then raise exception 'Invalid equipment grant' using errcode='22023'; end if;
 select * into v_existing from private.sandbox_admin_events where request_id=p_request_id;
 if found then return coalesce(v_existing.after_data,'{}'::jsonb)||jsonb_build_object('duplicate',true); end if;
 if not exists(select 1 from auth.users where id=p_target_user_id) then raise exception 'Player not found' using errcode='P0002'; end if;
 select * into v_item from public.equipment_catalog where sku=trim(p_sku) and active=true;
 if not found then raise exception 'Active equipment SKU not found' using errcode='P0002'; end if;
 v_blessing:=0;
 if v_item.blessing_min_percent is not null then v_blessing:=round((v_item.blessing_min_percent+random()*(v_item.blessing_max_percent-v_item.blessing_min_percent))::numeric,2); end if;
 insert into public.player_equipment(user_id,catalog_sku,purchase_price_pc,status,blessing_percent,admin_granted)
 values(p_target_user_id,v_item.sku,0,'inventory',v_blessing,true) returning id into v_equipment_id;
 insert into private.sandbox_admin_events(actor_user_id,target_user_id,action,reason,before_data,after_data,request_id)
 values(v_actor,p_target_user_id,'player_equipment_granted',trim(p_reason),null,jsonb_build_object('equipment_id',v_equipment_id,'sku',v_item.sku,'name',v_item.name,'hashrate',v_item.hashrate,'blessing_percent',v_blessing,'admin_granted',true),p_request_id);
 return jsonb_build_object('success',true,'duplicate',false,'equipment_id',v_equipment_id,'sku',v_item.sku,'name',v_item.name,'blessing_percent',v_blessing);
end; $$;
revoke all on function public.admin_adjust_player_pc(uuid,numeric,text,uuid) from public,anon,authenticated;
revoke all on function public.admin_grant_player_equipment(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_adjust_player_pc(uuid,numeric,text,uuid) to authenticated,service_role;
grant execute on function public.admin_grant_player_equipment(uuid,text,text,uuid) to authenticated,service_role;
commit;
