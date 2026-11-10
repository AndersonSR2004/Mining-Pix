import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('admin finance month-close validation accepts YYYY-MM and rejects malformed values', async () => {
  const source = await readFile(new URL('../supabase/functions/admin-finance/index.ts', import.meta.url), 'utf8')
  const match = source.match(/!\/(\^.*?\$)\/\.test\(body\.month\)/)
  assert.ok(match, 'month validation regex must remain present in admin-finance')
  const monthPattern = new RegExp(match[1])
  assert.equal(monthPattern.test('2026-11'), true)
  assert.equal(monthPattern.test('2026/11'), false)
  assert.equal(monthPattern.test('2026-1'), false)
})
