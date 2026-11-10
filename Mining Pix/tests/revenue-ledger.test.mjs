import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/20261110000000_revenue_ledger_foundation.sql', import.meta.url), 'utf8')
const policy = readFileSync(new URL('../supabase/migrations/20261110010000_revenue_ledger_service_role_policy.sql', import.meta.url), 'utf8')
const poolDoc = readFileSync(new URL('../docs/MINING_POOL.md', import.meta.url), 'utf8')
const revenueDoc = readFileSync(new URL('../docs/REVENUE_LEDGER.md', import.meta.url), 'utf8')

test('BRL revenue ledger uses integer cents and approved revenue categories', () => {
  assert.match(migration, /signed_amount_cents bigint not null/i)
  assert.match(migration, /'pix_coin', 'vip', 'premium_pass', 'advertising'/i)
  assert.match(migration, /'gross_receipt'/i)
  assert.match(migration, /'payment_fee'.*'tax'.*'refund'.*'chargeback'/is)
  assert.doesNotMatch(migration, /double precision|\breal\b/i)
})

test('revenue ledger is private, append-only, and not directly writable by clients', () => {
  assert.match(migration, /create table private\.revenue_ledger_entries/i)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /revoke all on table private\.revenue_ledger_entries from public, anon, authenticated, service_role/i)
  assert.match(migration, /before update or delete or truncate/i)
  assert.match(policy, /for select\s+to service_role/i)
  assert.match(policy, /grant select on private\.revenue_ledger_entries to service_role/i)
  assert.doesNotMatch(policy, /grant (insert|update|delete|all).*revenue_ledger_entries/i)
})

test('revenue insertion is backend-only and retries are idempotent', () => {
  assert.match(migration, /security definer\s+set search_path = ''/i)
  assert.match(migration, /current_setting\('request\.jwt\.claim\.role', true\) is distinct from 'service_role'/i)
  assert.match(migration, /on conflict \(idempotency_key\) do nothing/i)
  assert.match(migration, /already used with different revenue data/i)
  assert.match(migration, /grant execute on function private\.record_revenue_ledger_entry/i)
  assert.match(migration, /to service_role/i)
})

test('period summary uses half-open settlement-time windows and does not allocate funds', () => {
  assert.match(migration, /settled_at >= p_period_start/i)
  assert.match(migration, /settled_at < p_period_end/i)
  assert.match(migration, /net_cents_before_carryforward/i)
  assert.doesNotMatch(migration, /update public\.pool_cycles|update public\.mining_coin_wallets|distribution_enabled\s*=\s*true/i)
})

test('approved Mining Pool policies and current implementation gaps are documented', () => {
  for (const decision of ['D-019', 'D-020', 'D-021', 'D-022', 'D-023']) {
    assert.match(poolDoc, new RegExp(decision.replace('-', '\\-')))
  }
  assert.match(poolDoc, /HASH-hora.*ainda precisa ser implementado/i)
  assert.match(poolDoc, /numeric\(20,0\).*oito casas/i)
  assert.match(revenueDoc, /Nenhum gateway de pagamento/i)
})
