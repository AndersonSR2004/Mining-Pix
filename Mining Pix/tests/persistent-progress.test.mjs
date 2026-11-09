import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/202611090020_persistent_xp_foundation.sql', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/PersistentProgressPanel.tsx', import.meta.url), 'utf8')
const adminFunction = readFileSync(new URL('../supabase/functions/admin-control/index.ts', import.meta.url), 'utf8')

test('XP ledger is private, append-only to clients, and scoped to the owner', () => {
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /for select to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/i)
  assert.match(migration, /revoke all on table public\.player_xp_transactions from public, anon, authenticated/i)
  assert.match(migration, /grant select on public\.player_xp_transactions to authenticated/i)
})

test('daily XP is derived server-side and protected against duplicate claims', () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i)
  assert.match(migration, /now\(\) at time zone 'UTC'/i)
  assert.match(migration, /on conflict \(user_id, idempotency_key\) do nothing/i)
  assert.match(migration, /grant execute on function public\.claim_daily_login_xp\(\) to authenticated/i)
  assert.match(migration, /revoke all on function public\.claim_daily_login_xp\(\) from public, anon/i)
})

test('browser requests daily XP without choosing the amount, player id, or period', () => {
  assert.match(panel, /rpc\('claim_daily_login_xp'\)/)
  assert.doesNotMatch(panel, /p_user_id|p_amount|p_period|p_idempotency_key/)
})

test('admin control function requires the expected origin and JSON content type', () => {
  assert.match(adminFunction, /if \(origin !== allowedOrigin\)/)
  assert.match(adminFunction, /Content-Type must be application\/json/)
  assert.match(adminFunction, /verify_jwt/)
})
