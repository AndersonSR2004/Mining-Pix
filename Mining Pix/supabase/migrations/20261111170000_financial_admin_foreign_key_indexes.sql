-- Cover foreign-key lookups and common actor-scoped audit queries.
-- Additive only: no data changes, no constraint changes, no financial side effects.
create index if not exists financial_admin_events_actor_created_idx
  on private.financial_admin_events (actor_user_id, created_at desc);

create index if not exists financial_commitment_events_actor_created_idx
  on private.financial_commitment_events (actor_user_id, created_at desc);

create index if not exists financial_expense_month_closings_closed_by_month_idx
  on private.financial_expense_month_closings (closed_by, month_start desc);

create index if not exists operational_expense_entries_created_by_date_idx
  on private.operational_expense_entries (created_by, expense_date desc);
