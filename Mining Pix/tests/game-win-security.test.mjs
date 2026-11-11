import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/migrations/20261112020000_fail_closed_client_game_win_claims.sql', import.meta.url),
  'utf8',
).toLowerCase()

test('client-asserted wins cannot create game rewards before server verification exists', () => {
  assert.match(migration, /p_won is intentionally not trusted/)
  assert.match(migration, /won = false/)
  assert.match(migration, /hash_awarded = 0/)
  assert.match(migration, /'win_verified', false/)
  assert.match(migration, /'win_verification_pending', coalesce\(p_won, false\)/)
  assert.doesNotMatch(migration, /if p_won then[\s\S]*?v_hash:=1/)
})
