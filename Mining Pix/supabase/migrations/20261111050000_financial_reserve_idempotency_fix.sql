begin;

create unique index financial_commitments_paid_expense_unique_idx
  on private.financial_commitments(paid_expense_entry_id)
  where paid_expense_entry_id is not null;

create or replace function public.admin_record_reserve_movement(
  p_actor_user_id uuid,
  p_movement_type text,
  p_signed_amount_cents bigint,
  p_source_reference text,
  p_idempotency_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_balance numeric(30,0);
  v_existing private.reserve_fund_movements%rowtype;
begin
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'admin'='true') then
    raise exception 'Administrative permission required' using errcode='42501';
  end if;
  if p_movement_type not in ('contribution','withdrawal')
     or p_signed_amount_cents is null or p_signed_amount_cents=0
     or (p_movement_type='contribution' and p_signed_amount_cents<0)
     or (p_movement_type='withdrawal' and p_signed_amount_cents>0)
     or p_source_reference is null or char_length(trim(p_source_reference)) not between 1 and 160
     or p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 1 and 160
     or p_reason is null or char_length(trim(p_reason)) not between 3 and 500 then
    raise exception 'Invalid reserve movement' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('mining-pix-reserve-fund'));

  select * into v_existing from private.reserve_fund_movements
  where idempotency_key=trim(p_idempotency_key);
  if found then
    if v_existing.movement_type is distinct from p_movement_type
      or v_existing.signed_amount_cents is distinct from p_signed_amount_cents
      or v_existing.source_reference is distinct from trim(p_source_reference) then
      raise exception 'Idempotency key reused with different reserve data' using errcode='22023';
    end if;
    return jsonb_build_object('movement_id',v_existing.id,'duplicate',true);
  end if;

  select coalesce(sum(signed_amount_cents),0) into v_balance from private.reserve_fund_movements;
  if p_movement_type='withdrawal' and v_balance < abs(p_signed_amount_cents) then
    raise exception 'Reserve balance is insufficient for this withdrawal' using errcode='23514';
  end if;

  insert into private.reserve_fund_movements(
    movement_type,signed_amount_cents,source_reference,idempotency_key,reason
  ) values(
    p_movement_type,p_signed_amount_cents,trim(p_source_reference),trim(p_idempotency_key),trim(p_reason)
  )
  returning id into v_id;

  insert into private.financial_admin_events(
    actor_user_id,event_type,entity_type,entity_id,amount_cents,reason
  ) values(
    p_actor_user_id,
    case when p_movement_type='contribution' then 'reserve_contributed' else 'reserve_withdrawn' end,
    'reserve',v_id,p_signed_amount_cents,trim(p_reason)
  );

  return jsonb_build_object('movement_id',v_id,'duplicate',false);
end;
$$;

revoke all on function public.admin_record_reserve_movement(uuid,text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_record_reserve_movement(uuid,text,bigint,text,text,text) to service_role;

commit;