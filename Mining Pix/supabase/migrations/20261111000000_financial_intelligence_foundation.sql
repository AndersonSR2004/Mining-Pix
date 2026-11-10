-- Mining Pix Financial Intelligence Center — foundation.
-- Private ledgers and admin-only read models. No money movement, MC issuance,
-- redemption, provider integration, or automatic payment is enabled.

begin;

create table private.operational_expense_entries (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'infrastructure','software','marketing','support','legal','tax',
    'payment_processing','contractors','administration','other'
  )),
  description text not null check (char_length(trim(description)) between 3 and 240),
  amount_cents bigint not null check (amount_cents > 0),
  expense_date date not null,
  paid_at timestamptz not null,
  vendor_reference text,
  source_reference text not null check (char_length(trim(source_reference)) between 1 and 160),
  idempotency_key text not null unique check (char_length(trim(idempotency_key)) between 1 and 160),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096),
  created_at timestamptz not null default now()
);

create index operational_expenses_paid_date_idx
  on private.operational_expense_entries (expense_date desc, paid_at desc);

create table private.financial_commitments (
  id uuid primary key default gen_random_uuid(),
  commitment_type text not null check (commitment_type in (
    'operational','contractor','tax','player_reward_brl','other'
  )),
  category text not null check (char_length(trim(category)) between 2 and 80),
  description text not null check (char_length(trim(description)) between 3 and 240),
  amount_cents bigint,
  amount_mc numeric(30,8),
  due_date date not null,
  status text not null default 'open' check (status in ('open','paid','cancelled')),
  paid_at timestamptz,
  paid_expense_entry_id uuid references private.operational_expense_entries(id) on delete restrict,
  source_reference text not null check (char_length(trim(source_reference)) between 1 and 160),
  idempotency_key text not null unique check (char_length(trim(idempotency_key)) between 1 and 160),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096),
  created_at timestamptz not null default now(),
  check (
    (commitment_type = 'player_reward_brl' and amount_mc is not null and amount_mc > 0 and amount_cents is null)
    or (commitment_type <> 'player_reward_brl' and amount_cents is not null and amount_cents > 0 and amount_mc is null)
  ),
  check (
    (status = 'paid' and paid_at is not null and (commitment_type = 'player_reward_brl' or paid_expense_entry_id is not null))
    or (status <> 'paid' and paid_at is null and paid_expense_entry_id is null)
  )
);

create index financial_commitments_due_idx
  on private.financial_commitments (due_date, status);

create table private.financial_commitment_events (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null references private.financial_commitments(id) on delete restrict,
  event_type text not null check (event_type in ('created','paid','cancelled','reopened')),
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index financial_commitment_events_history_idx
  on private.financial_commitment_events (commitment_id, created_at desc);

create table private.reserve_fund_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type text not null check (movement_type in ('contribution','withdrawal','correction')),
  signed_amount_cents bigint not null check (signed_amount_cents <> 0),
  reference_period date,
  source_reference text not null check (char_length(trim(source_reference)) between 1 and 160),
  idempotency_key text not null unique check (char_length(trim(idempotency_key)) between 1 and 160),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  check (
    (movement_type = 'contribution' and signed_amount_cents > 0)
    or (movement_type = 'withdrawal' and signed_amount_cents < 0)
    or movement_type = 'correction'
  )
);

create index reserve_fund_movements_created_idx
  on private.reserve_fund_movements (created_at desc);

create table private.economy_supply_snapshots (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  pc_supply numeric(30,0) not null check (pc_supply >= 0),
  wallets_count bigint not null check (wallets_count >= 0),
  active_equipment_count bigint not null check (active_equipment_count >= 0),
  installed_hashrate numeric(30,6) not null check (installed_hashrate >= 0),
  players_count bigint not null check (players_count >= 0)
);

create index economy_supply_snapshots_captured_idx
  on private.economy_supply_snapshots (captured_at desc);

create table private.player_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in (
    'session_seen','game_started','game_completed','shop_opened',
    'purchase_completed','equipment_installed','room_opened'
  )),
  idempotency_key text not null unique check (char_length(trim(idempotency_key)) between 1 and 160),
  source text not null default 'client_telemetry' check (source in ('client_telemetry','server_event')),
  created_at timestamptz not null default now()
);

create index player_activity_events_created_idx
  on private.player_activity_events (created_at desc);
create index player_activity_events_user_created_idx
  on private.player_activity_events (user_id, created_at desc);

-- All financial and telemetry tables are private; direct client access is denied.
do $$
declare
  t text;
begin
  foreach t in array array[
    'operational_expense_entries',
    'financial_commitments',
    'financial_commitment_events',
    'reserve_fund_movements',
    'economy_supply_snapshots',
    'player_activity_events'
  ] loop
    execute format('alter table private.%I enable row level security', t);
    execute format('revoke all on table private.%I from public, anon, authenticated, service_role', t);
  end loop;
end;
$$;

create or replace function private.prevent_financial_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Financial history is append-only; record a compensating entry instead'
    using errcode = '55000';
end;
$$;

revoke all on function private.prevent_financial_ledger_mutation() from public, anon, authenticated, service_role;

create trigger operational_expenses_append_only
before update or delete or truncate on private.operational_expense_entries
for each statement execute function private.prevent_financial_ledger_mutation();

create trigger reserve_movements_append_only
before update or delete or truncate on private.reserve_fund_movements
for each statement execute function private.prevent_financial_ledger_mutation();

create trigger commitment_events_append_only
before update or delete or truncate on private.financial_commitment_events
for each statement execute function private.prevent_financial_ledger_mutation();

create trigger economy_snapshots_append_only
before update or delete or truncate on private.economy_supply_snapshots
for each statement execute function private.prevent_financial_ledger_mutation();

create trigger player_activity_events_append_only
before update or delete or truncate on private.player_activity_events
for each statement execute function private.prevent_financial_ledger_mutation();

create or replace function private.guard_financial_commitment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if row(new.commitment_type,new.category,new.description,new.amount_cents,new.amount_mc,
         new.due_date,new.source_reference,new.idempotency_key,new.metadata,new.created_at)
     is distinct from
     row(old.commitment_type,old.category,old.description,old.amount_cents,old.amount_mc,
         old.due_date,old.source_reference,old.idempotency_key,old.metadata,old.created_at) then
    raise exception 'Commitment terms are immutable; only status transitions are allowed'
      using errcode = '55000';
  end if;
  if old.status <> 'open' or new.status not in ('paid','cancelled') then
    raise exception 'Only open commitments can be paid or cancelled'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_financial_commitment_update() from public, anon, authenticated, service_role;

create trigger financial_commitments_transition_guard
before update on private.financial_commitments
for each row execute function private.guard_financial_commitment_update();

create or replace function public.admin_capture_economy_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot_id uuid;
  v_supply numeric(30,0);
  v_wallets bigint;
  v_equipment bigint;
  v_hashrate numeric(30,6);
  v_players bigint;
begin
  if auth.uid() is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'admin','false') <> 'true' then
    raise exception 'Administrative permission required' using errcode = '42501';
  end if;

  select coalesce(sum(balance),0), count(*) into v_supply,v_wallets from public.wallets;
  select count(*), coalesce(sum(c.hashrate),0)
    into v_equipment,v_hashrate
  from public.player_equipment pe
  join public.equipment_catalog c on c.sku=pe.catalog_sku
  join public.player_rooms pr on pr.id=pe.room_id and pr.user_id=pe.user_id
  where pe.status='installed' and pr.active=true;
  select count(*) into v_players from public.profiles;

  insert into private.economy_supply_snapshots(
    pc_supply,wallets_count,active_equipment_count,installed_hashrate,players_count
  ) values(v_supply,v_wallets,v_equipment,v_hashrate,v_players)
  returning id into v_snapshot_id;

  return jsonb_build_object(
    'snapshot_id',v_snapshot_id,'captured_at',now(),'pc_supply',v_supply,
    'wallets_count',v_wallets,'active_equipment_count',v_equipment,
    'installed_hashrate',v_hashrate,'players_count',v_players
  );
end;
$$;

revoke all on function public.admin_capture_economy_snapshot() from public, anon;
grant execute on function public.admin_capture_economy_snapshot() to authenticated;

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

  select coalesce(sum(signed_amount_cents),0)
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
    'player_activity',jsonb_build_object(
      'unique_players_7d',v_active_7d,'unique_players_30d',v_active_30d,'events_24h',v_event_24h,
      'telemetry_status','Aguardando integração do registro de eventos no cliente e backend.'
    )
  );
end;
$$;

revoke all on function public.admin_financial_snapshot() from public, anon;
grant execute on function public.admin_financial_snapshot() to authenticated;

commit;
