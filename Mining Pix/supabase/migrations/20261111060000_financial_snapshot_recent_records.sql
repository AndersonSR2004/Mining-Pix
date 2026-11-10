create or replace function public.admin_financial_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_revenue_months jsonb;
  v_expense_months jsonb;
  v_revenue_3m numeric(30,0);
  v_expenses_3m numeric(30,0);
  v_expense_target numeric(30,0);
  v_reserve_balance numeric(30,0);
  v_commitments_brl numeric(30,0);
  v_due_30d_brl numeric(30,0);
  v_commitments_mc numeric(38,8);
  v_pc_supply numeric(30,0);
  v_pc_issued numeric(30,0);
  v_pc_sunk numeric(30,0);
  v_latest_snapshot jsonb;
  v_prior_snapshot jsonb;
  v_active_7d bigint;
  v_active_30d bigint;
  v_event_24h bigint;
  v_forecast numeric(30,0);
  v_month_start date := date_trunc('month', now())::date;
begin
  if auth.uid() is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'admin','false') <> 'true' then
    raise exception 'Administrative permission required' using errcode = '42501';
  end if;

  select coalesce(sum(signed_amount_cents),0)
    into v_reserve_balance
  from private.reserve_fund_movements;

  select coalesce(sum(amount_cents),0)
    into v_commitments_brl
  from private.financial_commitments
  where status='open' and amount_cents is not null;

  select coalesce(sum(amount_cents),0)
    into v_due_30d_brl
  from private.financial_commitments
  where status='open' and amount_cents is not null
    and due_date between current_date and current_date + 30;

  select coalesce(sum(amount_mc),0)
    into v_commitments_mc
  from private.financial_commitments
  where status='open' and amount_mc is not null;

  select coalesce(sum(amount),0) into v_pc_issued
  from public.wallet_transactions where amount > 0;
  select coalesce(-sum(amount),0) into v_pc_sunk
  from public.wallet_transactions where amount < 0;
  select coalesce(sum(balance),0) into v_pc_supply from public.wallets;

  select coalesce(sum(amount_cents),0)
    into v_expenses_3m
  from private.operational_expense_entries
  where expense_date >= (v_month_start - interval '3 months')::date
    and expense_date < v_month_start;

  v_expense_target := v_expenses_3m;

  select coalesce(sum(signed_amount_cents),0)
    into v_revenue_3m
  from private.revenue_ledger_entries
  where settled_at >= (v_month_start - interval '3 months')::timestamptz
    and settled_at < v_month_start::timestamptz;

  v_forecast := greatest(round(v_revenue_3m::numeric / 3),0);

  select coalesce(jsonb_agg(jsonb_build_object(
    'month',to_char(month_start,'YYYY-MM'),
    'gross_cents',gross_cents,
    'deductions_cents',deductions_cents,
    'net_cents',gross_cents+deductions_cents
  ) order by month_start),'[]'::jsonb)
  into v_revenue_months
  from (
    select d.month_start,
      coalesce(sum(case when r.signed_amount_cents>0 then r.signed_amount_cents else 0 end),0)::numeric(30,0) gross_cents,
      coalesce(sum(case when r.signed_amount_cents<0 then r.signed_amount_cents else 0 end),0)::numeric(30,0) deductions_cents
    from generate_series(v_month_start - interval '11 months',v_month_start,interval '1 month') d(month_start)
    left join private.revenue_ledger_entries r
      on r.settled_at >= d.month_start
     and r.settled_at < d.month_start + interval '1 month'
    group by d.month_start
  ) m;

  select coalesce(jsonb_agg(jsonb_build_object(
    'month',to_char(month_start,'YYYY-MM'),
    'expense_cents',expense_cents
  ) order by month_start),'[]'::jsonb)
  into v_expense_months
  from (
    select d.month_start,
      coalesce(sum(e.amount_cents),0)::numeric(30,0) expense_cents
    from generate_series(v_month_start - interval '11 months',v_month_start,interval '1 month') d(month_start)
    left join private.operational_expense_entries e
      on e.expense_date >= d.month_start::date
     and e.expense_date < (d.month_start + interval '1 month')::date
    group by d.month_start
  ) m;

  select count(distinct user_id) into v_active_7d
  from private.player_activity_events where created_at >= now()-interval '7 days';
  select count(distinct user_id) into v_active_30d
  from private.player_activity_events where created_at >= now()-interval '30 days';
  select count(*) into v_event_24h
  from private.player_activity_events where created_at >= now()-interval '24 hours';

  select jsonb_build_object(
    'captured_at',captured_at,'pc_supply',pc_supply,'wallets_count',wallets_count,
    'active_equipment_count',active_equipment_count,'installed_hashrate',installed_hashrate,
    'players_count',players_count
  ) into v_latest_snapshot
  from private.economy_supply_snapshots order by captured_at desc limit 1;

  select jsonb_build_object(
    'captured_at',captured_at,'pc_supply',pc_supply
  ) into v_prior_snapshot
  from private.economy_supply_snapshots
  where captured_at <= now()-interval '30 days'
  order by captured_at desc limit 1;

  return jsonb_build_object(
    'generated_at',now(),
    'currency','BRL',
    'revenue_months',v_revenue_months,
    'expense_months',v_expense_months,
    'revenue_last_3_full_months_cents',v_revenue_3m,
    'revenue_forecast_next_month_cents',v_forecast,
    'forecast_method','Média simples da receita líquida conciliada dos três últimos meses completos; cenário indicativo, não garantia.',
    'expenses_last_3_full_months_cents',v_expenses_3m,
    'reserve_target_cents',v_expense_target,
    'reserve_balance_cents',v_reserve_balance,
    'reserve_gap_cents',greatest(v_expense_target-v_reserve_balance,0),
    'reserve_coverage_ratio',case when v_expense_target>0 then least(v_reserve_balance::numeric/v_expense_target,1) else null end,
    'commitments_open_brl_cents',v_commitments_brl,
    'commitments_due_30d_brl_cents',v_due_30d_brl,
    'commitments_open_mc',v_commitments_mc,
    'allocation_policy',jsonb_build_object(
      'pool_percent',30,'reserve_percent',30,'operations_percent',30,'administration_percent',10
    ),
    'pc_economy',jsonb_build_object(
      'current_supply',v_pc_supply,'gross_issued',v_pc_issued,'gross_sunk',v_pc_sunk,
      'net_issuance',v_pc_issued-v_pc_sunk,
      'net_issuance_vs_supply_percent',case when v_pc_supply>0 then round(((v_pc_issued-v_pc_sunk)/v_pc_supply)*100,4) else null end,
      'interpretation','Pressão de emissão líquida de PIX COIN no ledger; não é inflação de preços ao consumidor.'
    ),
    'supply_latest_snapshot',v_latest_snapshot,
    'supply_30d_baseline',v_prior_snapshot,
    'recent_expenses',coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.paid_at desc)
      from (
        select id,category,description,amount_cents,expense_date,paid_at,vendor_reference
        from private.operational_expense_entries order by paid_at desc limit 10
      ) recent
    ),'[]'::jsonb),
    'recent_commitments',coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.due_date asc)
      from (
        select id,commitment_type,category,description,amount_cents,amount_mc,due_date,status,created_at
        from private.financial_commitments order by
          case when status='open' then 0 else 1 end, due_date asc limit 20
      ) recent
    ),'[]'::jsonb),
    'recent_reserve_movements',coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select id,movement_type,signed_amount_cents,source_reference,reason,created_at
        from private.reserve_fund_movements order by created_at desc limit 10
      ) recent
    ),'[]'::jsonb),
    'player_activity',jsonb_build_object(
      'unique_players_7d',v_active_7d,'unique_players_30d',v_active_30d,'events_24h',v_event_24h,
      'telemetry_status','Aguardando integração do registro de eventos no cliente e backend.'
    )
  );
end;
$$;