create or replace function public.admin_record_operational_expense(
  p_actor_user_id uuid,
  p_category text,
  p_description text,
  p_amount_cents bigint,
  p_expense_date date,
  p_source_reference text,
  p_idempotency_key text,
  p_reason text,
  p_vendor_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing private.operational_expense_entries%rowtype;
begin
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'admin'='true') then
    raise exception 'Administrative permission required' using errcode='42501';
  end if;
  if p_category not in ('infrastructure','software','marketing','support','legal','tax','payment_processing','contractors','administration','other')
     or p_description is null or char_length(trim(p_description)) not between 3 and 240
     or p_amount_cents is null or p_amount_cents <= 0
     or p_expense_date is null or p_expense_date > current_date
     or p_source_reference is null or char_length(trim(p_source_reference)) not between 1 and 160
     or p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 1 and 160
     or p_reason is null or char_length(trim(p_reason)) not between 3 and 500 then
    raise exception 'Invalid operational expense data' using errcode='22023';
  end if;

  if exists (
    select 1 from private.financial_expense_month_closings
    where month_start=date_trunc('month',p_expense_date)::date
  ) then
    raise exception 'Expense month is already closed; direct backdated insertion is blocked until a separately approved adjustment workflow exists'
      using errcode='55000';
  end if;

  insert into private.operational_expense_entries(
    category,description,amount_cents,expense_date,paid_at,vendor_reference,
    source_reference,idempotency_key,created_by,metadata
  ) values (
    p_category,trim(p_description),p_amount_cents,p_expense_date,now(),
    nullif(trim(coalesce(p_vendor_reference,'')),''),
    trim(p_source_reference),trim(p_idempotency_key),p_actor_user_id,
    jsonb_build_object('recorded_by_admin',true)
  )
  on conflict(idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing from private.operational_expense_entries
    where idempotency_key=trim(p_idempotency_key);
    if not found or v_existing.category is distinct from p_category
      or v_existing.description is distinct from trim(p_description)
      or v_existing.amount_cents is distinct from p_amount_cents
      or v_existing.expense_date is distinct from p_expense_date
      or v_existing.source_reference is distinct from trim(p_source_reference) then
      raise exception 'Idempotency key reused with different expense data' using errcode='22023';
    end if;
    return jsonb_build_object('expense_id',v_existing.id,'duplicate',true);
  end if;

  insert into private.financial_admin_events(
    actor_user_id,event_type,entity_type,entity_id,amount_cents,reason
  ) values(p_actor_user_id,'expense_recorded','expense',v_id,p_amount_cents,trim(p_reason));

  return jsonb_build_object('expense_id',v_id,'duplicate',false);
end;
$$;

revoke all on function public.admin_record_operational_expense(uuid,text,text,bigint,date,text,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_record_operational_expense(uuid,text,text,bigint,date,text,text,text,text) to service_role;

commit;
