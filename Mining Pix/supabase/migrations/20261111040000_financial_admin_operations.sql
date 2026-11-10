begin;

alter table private.operational_expense_entries
  add column created_by uuid references auth.users(id) on delete set null;

create table private.financial_admin_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in (
    'expense_recorded','commitment_created','commitment_paid',
    'commitment_cancelled','reserve_contributed','reserve_withdrawn'
  )),
  entity_type text not null check (entity_type in ('expense','commitment','reserve')),
  entity_id uuid not null,
  amount_cents bigint,
  amount_mc numeric(30,8),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now()
);

alter table private.financial_admin_events enable row level security;
revoke all on table private.financial_admin_events from public, anon, authenticated, service_role;

create index financial_admin_events_created_idx
  on private.financial_admin_events(created_at desc);

create trigger financial_admin_events_append_only
before update or delete or truncate on private.financial_admin_events
for each statement execute function private.prevent_financial_ledger_mutation();

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

create or replace function public.admin_create_financial_commitment(
  p_actor_user_id uuid,
  p_commitment_type text,
  p_category text,
  p_description text,
  p_amount_cents bigint,
  p_amount_mc numeric,
  p_due_date date,
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
  v_existing private.financial_commitments%rowtype;
begin
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'admin'='true') then
    raise exception 'Administrative permission required' using errcode='42501';
  end if;
  if p_commitment_type not in ('operational','contractor','tax','player_reward_mc','other')
     or p_category is null or char_length(trim(p_category)) not between 2 and 80
     or p_description is null or char_length(trim(p_description)) not between 3 and 240
     or p_due_date is null
     or p_source_reference is null or char_length(trim(p_source_reference)) not between 1 and 160
     or p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 1 and 160
     or p_reason is null or char_length(trim(p_reason)) not between 3 and 500 then
    raise exception 'Invalid commitment data' using errcode='22023';
  end if;
  if p_commitment_type='player_reward_mc' then
    if p_amount_mc is null or p_amount_mc<=0 or p_amount_mc<>round(p_amount_mc,8) or p_amount_cents is not null then
      raise exception 'Player reward commitments must be denominated in MC (up to 8 decimals)' using errcode='22023';
    end if;
  elsif p_amount_cents is null or p_amount_cents<=0 or p_amount_mc is not null then
    raise exception 'Financial commitments must be denominated in BRL cents' using errcode='22023';
  end if;

  insert into private.financial_commitments(
    commitment_type,category,description,amount_cents,amount_mc,due_date,
    source_reference,idempotency_key,metadata
  ) values(
    p_commitment_type,trim(p_category),trim(p_description),p_amount_cents,p_amount_mc,p_due_date,
    trim(p_source_reference),trim(p_idempotency_key),jsonb_build_object('created_by_admin',p_actor_user_id)
  )
  on conflict(idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing from private.financial_commitments
    where idempotency_key=trim(p_idempotency_key);
    if not found or v_existing.commitment_type is distinct from p_commitment_type
      or v_existing.category is distinct from trim(p_category)
      or v_existing.description is distinct from trim(p_description)
      or v_existing.amount_cents is distinct from p_amount_cents
      or v_existing.amount_mc is distinct from p_amount_mc
      or v_existing.due_date is distinct from p_due_date then
      raise exception 'Idempotency key reused with different commitment data' using errcode='22023';
    end if;
    return jsonb_build_object('commitment_id',v_existing.id,'duplicate',true);
  end if;

  insert into private.financial_commitment_events(
    commitment_id,event_type,actor_user_id,reason
  ) values(v_id,'created',p_actor_user_id,trim(p_reason));

  insert into private.financial_admin_events(
    actor_user_id,event_type,entity_type,entity_id,amount_cents,amount_mc,reason
  ) values(p_actor_user_id,'commitment_created','commitment',v_id,p_amount_cents,p_amount_mc,trim(p_reason));

  return jsonb_build_object('commitment_id',v_id,'duplicate',false);
end;
$$;

revoke all on function public.admin_create_financial_commitment(uuid,text,text,text,bigint,numeric,date,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_create_financial_commitment(uuid,text,text,text,bigint,numeric,date,text,text,text) to service_role;

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
  select coalesce(sum(signed_amount_cents),0) into v_balance from private.reserve_fund_movements;

  if p_movement_type='withdrawal' and v_balance < abs(p_signed_amount_cents) then
    raise exception 'Reserve balance is insufficient for this withdrawal' using errcode='23514';
  end if;

  insert into private.reserve_fund_movements(
    movement_type,signed_amount_cents,source_reference,idempotency_key,reason
  ) values(
    p_movement_type,p_signed_amount_cents,trim(p_source_reference),trim(p_idempotency_key),trim(p_reason)
  )
  on conflict(idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing from private.reserve_fund_movements
    where idempotency_key=trim(p_idempotency_key);
    if not found or v_existing.movement_type is distinct from p_movement_type
      or v_existing.signed_amount_cents is distinct from p_signed_amount_cents
      or v_existing.source_reference is distinct from trim(p_source_reference) then
      raise exception 'Idempotency key reused with different reserve data' using errcode='22023';
    end if;
    return jsonb_build_object('movement_id',v_existing.id,'duplicate',true);
  end if;

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

create or replace function public.admin_transition_financial_commitment(
  p_actor_user_id uuid,
  p_commitment_id uuid,
  p_new_status text,
  p_paid_expense_entry_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commitment private.financial_commitments%rowtype;
  v_event text;
begin
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'admin'='true') then
    raise exception 'Administrative permission required' using errcode='42501';
  end if;
  if p_new_status not in ('paid','cancelled') or p_reason is null or char_length(trim(p_reason)) not between 3 and 500 then
    raise exception 'Invalid commitment transition' using errcode='22023';
  end if;

  select * into v_commitment from private.financial_commitments
  where id=p_commitment_id for update;
  if not found then raise exception 'Commitment not found' using errcode='P0002'; end if;
  if v_commitment.status<>'open' then raise exception 'Only open commitments can transition' using errcode='55000'; end if;

  if p_new_status='paid' then
    if v_commitment.amount_cents is null or p_paid_expense_entry_id is null then
      raise exception 'Only BRL commitments can be settled against a paid expense entry' using errcode='22023';
    end if;
    if not exists(
      select 1 from private.operational_expense_entries e
      where e.id=p_paid_expense_entry_id and e.amount_cents=v_commitment.amount_cents
    ) then
      raise exception 'A matching paid expense entry is required' using errcode='23514';
    end if;
    update private.financial_commitments
      set status='paid',paid_at=now(),paid_expense_entry_id=p_paid_expense_entry_id
      where id=p_commitment_id;
    v_event:='paid';
  else
    update private.financial_commitments set status='cancelled' where id=p_commitment_id;
    v_event:='cancelled';
  end if;

  insert into private.financial_commitment_events(
    commitment_id,event_type,actor_user_id,reason,metadata
  ) values(p_commitment_id,v_event,p_actor_user_id,trim(p_reason),
    jsonb_build_object('paid_expense_entry_id',p_paid_expense_entry_id));

  insert into private.financial_admin_events(
    actor_user_id,event_type,entity_type,entity_id,amount_cents,amount_mc,reason
  ) values(
    p_actor_user_id,
    case when p_new_status='paid' then 'commitment_paid' else 'commitment_cancelled' end,
    'commitment',p_commitment_id,v_commitment.amount_cents,v_commitment.amount_mc,trim(p_reason)
  );

  return jsonb_build_object('commitment_id',p_commitment_id,'status',p_new_status);
end;
$$;

revoke all on function public.admin_transition_financial_commitment(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_transition_financial_commitment(uuid,uuid,text,uuid,text) to service_role;

commit;