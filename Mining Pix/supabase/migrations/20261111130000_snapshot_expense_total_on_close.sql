begin;
alter table private.financial_expense_month_closings
  add column expense_total_cents bigint not null default 0 check (expense_total_cents >= 0);
create or replace function public.admin_close_expense_month(
  p_actor_user_id uuid,
  p_month_start date,
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
  v_existing private.financial_expense_month_closings%rowtype;
  v_expense_total bigint;
begin
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'admin'='true') then
    raise exception 'Administrative permission required' using errcode='42501';
  end if;
  if p_month_start is null or extract(day from p_month_start)<>1
     or p_month_start >= date_trunc('month',current_date)::date
     or p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 1 and 160
     or p_reason is null or char_length(trim(p_reason)) not between 10 and 500 then
    raise exception 'Invalid month close request; only completed months can be closed with a detailed reason'
      using errcode='22023';
  end if;

  select coalesce(sum(amount_cents),0) into v_expense_total
  from private.operational_expense_entries
  where expense_date >= p_month_start and expense_date < (p_month_start + interval '1 month')::date;

  insert into private.financial_expense_month_closings(month_start,closed_by,idempotency_key,reason,expense_total_cents)
  values(p_month_start,p_actor_user_id,trim(p_idempotency_key),trim(p_reason),v_expense_total)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing from private.financial_expense_month_closings
    where month_start=p_month_start or idempotency_key=trim(p_idempotency_key)
    limit 1;
    if not found or v_existing.month_start<>p_month_start
      or v_existing.idempotency_key<>trim(p_idempotency_key)
      or v_existing.reason<>trim(p_reason) then
      raise exception 'Month already closed or idempotency key reused with different data'
        using errcode='23505';
    end if;
    return jsonb_build_object('closing_id',v_existing.id,'month_start',v_existing.month_start,'expense_total_cents',v_existing.expense_total_cents,'duplicate',true);
  end if;

  insert into private.financial_admin_events(
    actor_user_id,event_type,entity_type,entity_id,reason,metadata
  ) values(
    p_actor_user_id,'expense_month_closed','month_closing',v_id,trim(p_reason),
    jsonb_build_object('month_start',p_month_start,'expense_total_cents',v_expense_total)
  );

  return jsonb_build_object('closing_id',v_id,'month_start',p_month_start,'expense_total_cents',v_expense_total,'duplicate',false);
end;
$$;

revoke all on function public.admin_close_expense_month(uuid,date,text,text) from public,anon,authenticated;
grant execute on function public.admin_close_expense_month(uuid,date,text,text) to service_role;


commit;