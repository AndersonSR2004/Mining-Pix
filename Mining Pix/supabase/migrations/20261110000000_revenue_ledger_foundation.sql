-- Mining Pix: append-only BRL revenue ledger foundation.
-- Records only settled and reconciled financial events supplied by trusted backend services.
-- No payment provider, automatic allocation, BRL/MC conversion, or MC issuance is enabled here.

begin;

create table private.revenue_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  source_category text not null
    check (source_category in ('pix_coin', 'vip', 'premium_pass', 'advertising')),
  entry_type text not null
    check (entry_type in (
      'gross_receipt',
      'payment_fee',
      'tax',
      'refund',
      'chargeback',
      'other_deduction',
      'correction'
    )),
  signed_amount_cents bigint not null check (signed_amount_cents <> 0),
  source_reference text not null
    check (char_length(trim(source_reference)) between 1 and 160),
  settlement_reference text not null
    check (char_length(trim(settlement_reference)) between 1 and 160),
  idempotency_key text not null unique
    check (char_length(trim(idempotency_key)) between 1 and 160),
  settled_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096),
  created_at timestamptz not null default now(),
  constraint revenue_ledger_entry_sign_check check (
    (entry_type = 'gross_receipt' and signed_amount_cents > 0)
    or (entry_type in (
      'payment_fee', 'tax', 'refund', 'chargeback', 'other_deduction'
    ) and signed_amount_cents < 0)
    or entry_type = 'correction'
  )
);

create index revenue_ledger_entries_settled_at_idx
  on private.revenue_ledger_entries (settled_at desc);

create index revenue_ledger_entries_source_settled_idx
  on private.revenue_ledger_entries (source_category, settled_at desc);

alter table private.revenue_ledger_entries enable row level security;
revoke all on table private.revenue_ledger_entries from public, anon, authenticated, service_role;

create or replace function private.prevent_revenue_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Revenue ledger is append-only; corrections must be recorded as new entries'
    using errcode = '55000';
end;
$$;

revoke all on function private.prevent_revenue_ledger_mutation() from public, anon, authenticated, service_role;

create trigger revenue_ledger_entries_append_only
before update or delete or truncate on private.revenue_ledger_entries
for each statement
execute function private.prevent_revenue_ledger_mutation();

create or replace function private.record_revenue_ledger_entry(
  p_source_category text,
  p_entry_type text,
  p_signed_amount_cents bigint,
  p_source_reference text,
  p_idempotency_key text,
  p_settlement_reference text,
  p_settled_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns table(entry_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing private.revenue_ledger_entries%rowtype;
  v_entry_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_source_category not in ('pix_coin', 'vip', 'premium_pass', 'advertising') then
    raise exception 'Invalid revenue source category' using errcode = '22023';
  end if;
  if p_entry_type not in (
    'gross_receipt', 'payment_fee', 'tax', 'refund',
    'chargeback', 'other_deduction', 'correction'
  ) then
    raise exception 'Invalid revenue entry type' using errcode = '22023';
  end if;
  if p_signed_amount_cents is null or p_signed_amount_cents = 0 then
    raise exception 'Revenue amount must be a non-zero integer number of BRL cents'
      using errcode = '22023';
  end if;
  if p_entry_type = 'gross_receipt' and p_signed_amount_cents < 0 then
    raise exception 'Gross receipts must be positive' using errcode = '22023';
  end if;
  if p_entry_type in (
    'payment_fee', 'tax', 'refund', 'chargeback', 'other_deduction'
  ) and p_signed_amount_cents > 0 then
    raise exception 'Deductions must be negative' using errcode = '22023';
  end if;
  if p_source_reference is null or char_length(trim(p_source_reference)) not between 1 and 160
     or p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 1 and 160
     or p_settlement_reference is null or char_length(trim(p_settlement_reference)) not between 1 and 160 then
    raise exception 'Invalid revenue reference or idempotency key' using errcode = '22023';
  end if;
  if p_settled_at is null or p_settled_at > now() + interval '5 minutes' then
    raise exception 'A valid settlement timestamp is required' using errcode = '22023';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object'
     or pg_column_size(p_metadata) > 4096 then
    raise exception 'Metadata must be a JSON object up to 4096 bytes' using errcode = '22023';
  end if;

  insert into private.revenue_ledger_entries (
    source_category, entry_type, signed_amount_cents,
    source_reference, idempotency_key, settlement_reference,
    settled_at, metadata
  )
  values (
    p_source_category, p_entry_type, p_signed_amount_cents,
    trim(p_source_reference), trim(p_idempotency_key), trim(p_settlement_reference),
    p_settled_at, p_metadata
  )
  on conflict (idempotency_key) do nothing
  returning id into v_entry_id;

  if v_entry_id is not null then
    return query select v_entry_id, true;
    return;
  end if;

  select *
    into v_existing
  from private.revenue_ledger_entries
  where idempotency_key = trim(p_idempotency_key);

  if not found then
    raise exception 'Revenue ledger idempotency conflict; retry the operation'
      using errcode = '40001';
  end if;

  if v_existing.source_category is distinct from p_source_category
     or v_existing.entry_type is distinct from p_entry_type
     or v_existing.signed_amount_cents is distinct from p_signed_amount_cents
     or v_existing.source_reference is distinct from trim(p_source_reference)
     or v_existing.settlement_reference is distinct from trim(p_settlement_reference)
     or v_existing.settled_at is distinct from p_settled_at
     or v_existing.metadata is distinct from p_metadata then
    raise exception 'Idempotency key was already used with different revenue data'
      using errcode = '22023';
  end if;

  return query select v_existing.id, false;
end;
$$;

revoke all on function private.record_revenue_ledger_entry(
  text, text, bigint, text, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function private.record_revenue_ledger_entry(
  text, text, bigint, text, text, text, timestamptz, jsonb
) to service_role;

create or replace function private.get_revenue_period_summary(
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gross numeric(30,0);
  v_deductions numeric(30,0);
  v_net numeric(30,0);
  v_sources jsonb;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'Invalid revenue reporting period' using errcode = '22023';
  end if;

  select
    coalesce(sum(case when signed_amount_cents > 0 then signed_amount_cents else 0 end), 0),
    coalesce(sum(case when signed_amount_cents < 0 then signed_amount_cents else 0 end), 0)
  into v_gross, v_deductions
  from private.revenue_ledger_entries
  where settled_at >= p_period_start
    and settled_at < p_period_end;

  v_net := v_gross + v_deductions;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source_category', source_category,
        'gross_receipts_cents', gross_cents,
        'deductions_cents', deduction_cents,
        'net_cents', gross_cents + deduction_cents
      ) order by source_category
    ),
    '[]'::jsonb
  )
  into v_sources
  from (
    select
      source_category,
      coalesce(sum(case when signed_amount_cents > 0 then signed_amount_cents else 0 end), 0)::numeric(30,0) as gross_cents,
      coalesce(sum(case when signed_amount_cents < 0 then signed_amount_cents else 0 end), 0)::numeric(30,0) as deduction_cents
    from private.revenue_ledger_entries
    where settled_at >= p_period_start
      and settled_at < p_period_end
    group by source_category
  ) grouped_sources;

  return jsonb_build_object(
    'currency', 'BRL',
    'minor_unit', 'cent',
    'period_start', p_period_start,
    'period_end', p_period_end,
    'gross_receipts_cents', v_gross,
    'deductions_cents', v_deductions,
    'net_cents_before_carryforward', v_net,
    'positive_net_cents', greatest(v_net, 0),
    'sources', v_sources
  );
end;
$$;

revoke all on function private.get_revenue_period_summary(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function private.get_revenue_period_summary(timestamptz, timestamptz)
  to service_role;

comment on table private.revenue_ledger_entries is
  'Append-only BRL revenue ledger. Contains only settled and reconciled receipts/deductions supplied by trusted backend integrations. Amounts are signed integer cents; never accept browser-originated financial facts.';
comment on function private.record_revenue_ledger_entry(
  text, text, bigint, text, text, text, timestamptz, jsonb
) is
  'Service-role-only idempotent insertion for settled and reconciled BRL events. This does not connect a payment provider or authorize Pool funding.';
comment on function private.get_revenue_period_summary(timestamptz, timestamptz) is
  'Service-role-only summary of settled BRL ledger entries. Does not allocate revenue or create MC.';

commit;
