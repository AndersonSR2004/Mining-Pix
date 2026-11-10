import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/20261111000000_financial_intelligence_foundation.sql', import.meta.url), 'utf8')
const currencyFix = readFileSync(new URL('../supabase/migrations/20261111010000_financial_commitment_currency_label.sql', import.meta.url), 'utf8')
const snapshotFix = readFileSync(new URL('../supabase/migrations/20261111020000_financial_snapshot_expense_column_fix.sql', import.meta.url), 'utf8')
const dashboard = readFileSync(new URL('../src/admin/FinanceCenter.tsx', import.meta.url), 'utf8')
const admin = readFileSync(new URL('../src/admin/AdminDashboard.tsx', import.meta.url), 'utf8')

test('financial ledgers are private, RLS-protected and append-only', () => {
  for (const table of ['operational_expense_entries','financial_commitments','financial_commitment_events','reserve_fund_movements','economy_supply_snapshots','player_activity_events']) {
    assert.match(migration, new RegExp(`create table private\\.${table}`, 'i'))
    assert.match(migration, /enable row level security/i)
    assert.match(migration, /execute format\('revoke all on table private\.%I from public, anon, authenticated, service_role'/i)
  }
  assert.match(migration, /before update or delete or truncate/i)
  assert.match(migration, /financial_commitments_transition_guard/i)
})

test('expense records use integer BRL cents and only paid expenses feed reserve target', () => {
  assert.match(migration, /amount_cents bigint not null check \(amount_cents > 0\)/i)
  assert.match(snapshotFix, /sum\(amount_cents\)/i)
  assert.match(snapshotFix, /expense_date >= \(v_month_start - interval '3 months'\)/i)
  assert.match(snapshotFix, /expense_date < v_month_start/i)
  assert.match(dashboard, /Soma das despesas efetivas dos três últimos meses completos/i)
})

test('player reward commitments are denominated in MC, not BRL', () => {
  assert.match(currencyFix, /player_reward_mc/i)
  assert.match(currencyFix, /amount_mc is not null and amount_mc > 0 and amount_cents is null/i)
  assert.match(dashboard, /Compromissos de recompensa/i)
  assert.match(dashboard, /MC.*sem valor de resgate atribuído/i)
})

test('reserve target is the sum of the last three complete months, not a projected triple average', () => {
  assert.match(snapshotFix, /v_expense_target := v_expenses_3m/i)
  assert.match(snapshotFix, /reserve_gap_cents/i)
  assert.match(dashboard, /Meta da reserva · 3 meses/i)
})

test('finance dashboard is admin-only and exposes policy, forecast, supply and activity indicators', () => {
  assert.match(migration, /auth\.jwt\(\) -> 'app_metadata' ->> 'admin'/i)
  assert.match(migration, /admin_financial_snapshot/i)
  assert.match(migration, /admin_capture_economy_snapshot/i)
  for (const text of ['revenue_forecast_next_month_cents','allocation_policy','net_issuance_vs_supply_percent','unique_players_7d','unique_players_30d']) {
    assert.match(snapshotFix, new RegExp(text))
  }
  assert.match(admin, /FinanceCenter/)
  assert.match(admin, /FINANCIAL INTELLIGENCE/)
  assert.match(dashboard, /Aguardando linha de base/)
  assert.match(dashboard, /Telemetria inicial ativa/)
})

const operations = readFileSync(new URL('../supabase/migrations/20261111040000_financial_admin_operations.sql', import.meta.url), 'utf8')
const reserveFix = readFileSync(new URL('../supabase/migrations/20261111050000_financial_reserve_idempotency_fix.sql', import.meta.url), 'utf8')
const snapshotRecords = readFileSync(new URL('../supabase/migrations/20261111070000_financial_snapshot_commitment_schedule.sql', import.meta.url), 'utf8')
const cumulative = readFileSync(new URL('../supabase/migrations/20261111080000_financial_cumulative_totals.sql', import.meta.url), 'utf8')
const activityStatus = readFileSync(new URL('../supabase/migrations/20261111090000_activity_telemetry_status.sql', import.meta.url), 'utf8')
const monthClose = readFileSync(new URL('../supabase/migrations/20261111100000_financial_month_close_controls.sql', import.meta.url), 'utf8')
const monthCloseHistory = readFileSync(new URL('../supabase/migrations/20261111110000_financial_month_close_history.sql', import.meta.url), 'utf8')
const closedMonthGuard = readFileSync(new URL('../supabase/migrations/20261111120000_prevent_expenses_in_closed_months.sql', import.meta.url), 'utf8')
const closeTotals = readFileSync(new URL('../supabase/migrations/20261111130000_snapshot_expense_total_on_close.sql', import.meta.url), 'utf8')
const closeHistoryTotals = readFileSync(new URL('../supabase/migrations/20261111140000_expose_closed_expense_totals.sql', import.meta.url), 'utf8')
const closeMessage = readFileSync(new URL('../supabase/migrations/20261111150000_closed_month_adjustment_message.sql', import.meta.url), 'utf8')
const edge = readFileSync(new URL('../supabase/functions/admin-finance/index.ts', import.meta.url), 'utf8')

test('admin financial operations require backend role and revalidate admin identity', () => {
  assert.match(operations, /request\.jwt\.claim\.role.*service_role/i)
  assert.match(operations, /raw_app_meta_data->>'admin'='true'/i)
  assert.match(operations, /admin_record_operational_expense/i)
  assert.match(operations, /admin_create_financial_commitment/i)
  assert.match(operations, /admin_record_reserve_movement/i)
  assert.match(operations, /admin_transition_financial_commitment/i)
  assert.match(operations, /financial_admin_events/i)
})

test('reserve withdrawals cannot exceed balance and retries remain idempotent', () => {
  assert.match(reserveFix, /pg_advisory_xact_lock/i)
  assert.match(reserveFix, /idempotency_key=trim\(p_idempotency_key\)/i)
  assert.match(reserveFix, /v_balance < abs\(p_signed_amount_cents\)/i)
  assert.match(reserveFix, /financial_commitments_paid_expense_unique_idx/i)
})

test('monthly player reward commitments remain in MC and finance actions are backend authenticated', () => {
  assert.match(snapshotRecords, /reward_commitments_monthly/i)
  assert.match(snapshotRecords, /recent_financial_events/i)
  assert.match(edge, /auth\.getUser\(token\)/i)
  assert.match(edge, /app_metadata\?\.admin !== true/i)
  assert.match(edge, /admin_record_reserve_movement/i)
  assert.match(edge, /Origin not allowed/i)
  assert.match(edge, /Deno\.serve/i)
})

test('Finance Center exposes controlled entry forms and separates MC from BRL', () => {
  assert.match(dashboard, /Registrar despesa efetiva/i)
  assert.match(dashboard, /Registrar compromisso/i)
  assert.match(dashboard, /Registrar movimento contábil/i)
  assert.match(dashboard, /Compromissos de recompensa por mês/i)
  assert.match(dashboard, /Auditoria financeira/i)
  assert.match(dashboard, /admin-finance/i)
})

test('financial center includes cumulative totals and truthful telemetry status', () => {
  assert.match(cumulative, /revenue_accumulated_cents/i)
  assert.match(cumulative, /expenses_accumulated_cents/i)
  assert.match(cumulative, /net_operating_result_accumulated_cents/i)
  assert.match(activityStatus, /Telemetria inicial ativa/i)
  assert.match(dashboard, /RECEITA LÍQUIDA ACUMULADA/i)
  assert.match(dashboard, /DESPESAS EFETIVAS ACUMULADAS/i)
  assert.match(dashboard, /RESULTADO OPERACIONAL REGISTRADO/i)
  assert.match(dashboard, /Telemetria inicial ativa/i)
  assert.match(dashboard, /submitCommitmentTransition/i)
  assert.match(dashboard, /matchingExpenses/i)
})

test('reserve target requires three immutable completed expense-month closes', () => {
  assert.match(monthClose, /financial_expense_month_closings/i)
  assert.match(monthClose, /only completed months can be closed/i)
  assert.match(monthClose, /v_expense_months_closed = 3/i)
  assert.match(monthClose, /reserve_history_complete/i)
  assert.match(monthCloseHistory, /expense_month_closings/i)
  assert.match(edge, /close_expense_month/i)
  assert.match(dashboard, /Fechamento irreversível/i)
  assert.match(dashboard, /Aguardando fechamento/i)
})

test('closed expense months cannot be silently altered and preserve a close-time total', () => {
  assert.match(closedMonthGuard, /financial_expense_month_closings/i)
  assert.match(closedMonthGuard, /direct backdated insertion is blocked/i)
  assert.match(closeTotals, /expense_total_cents/i)
  assert.match(closeTotals, /sum\(amount_cents\)/i)
  assert.match(closeHistoryTotals, /expense_total_cents/i)
  assert.match(closeMessage, /separately approved adjustment workflow/i)
  assert.match(dashboard, /Despesas apuradas/i)
})
