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
    assert.match(migration, new RegExp(`alter table private\\.${table} enable row level security`, 'i'))
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
  assert.match(admin, /FinancialCenter/)
  assert.match(admin, /FINANCIAL INTELLIGENCE/)
  assert.match(dashboard, /Aguardando linha de base/)
  assert.match(dashboard, /Telemetria ainda não conectada/)
})
