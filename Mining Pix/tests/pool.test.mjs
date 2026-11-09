import assert from 'node:assert/strict'
import test from 'node:test'
import { distributePoolBudget } from '../src/lib/pool.ts'

test('single participant receives the full cycle budget', () => {
  assert.deepEqual(
    distributePoolBudget(250, [{ id: 'player', hashrate: 100 }]),
    { player: 250 },
  )
})

test('distributes the complete integer budget proportionally', () => {
  const result = distributePoolBudget(1000, [
    { id: 'player', hashrate: 100 },
    { id: 'bot-1', hashrate: 300 },
  ])

  assert.deepEqual(result, { player: 250, 'bot-1': 750 })
  assert.equal(Object.values(result).reduce((sum, reward) => sum + reward, 0), 1000)
})

test('largest remainder assigns leftover units deterministically', () => {
  const result = distributePoolBudget(10, [
    { id: 'c', hashrate: 1 },
    { id: 'b', hashrate: 1 },
    { id: 'a', hashrate: 1 },
  ])

  assert.deepEqual(result, { c: 3, b: 3, a: 4 })
})

test('ignores participants with zero or invalid hashrate', () => {
  assert.deepEqual(
    distributePoolBudget(50, [
      { id: 'player', hashrate: 10 },
      { id: 'offline', hashrate: 0 },
      { id: 'invalid', hashrate: Number.NaN },
    ]),
    { player: 50 },
  )
})

test('returns no allocations when budget or total hashrate is zero', () => {
  assert.deepEqual(distributePoolBudget(0, [{ id: 'player', hashrate: 10 }]), {})
  assert.deepEqual(distributePoolBudget(100, [{ id: 'offline', hashrate: 0 }]), {})
})

test('floors fractional budgets to whole PIX COIN units', () => {
  assert.deepEqual(
    distributePoolBudget(10.9, [{ id: 'player', hashrate: 1 }]),
    { player: 10 },
  )
})


test('rejects budgets outside the safe integer range', () => {
  assert.deepEqual(
    distributePoolBudget(Number.MAX_SAFE_INTEGER + 1, [{ id: 'player', hashrate: 1 }]),
    {},
  )
})

test('rejects aggregate hashrate overflow', () => {
  assert.deepEqual(
    distributePoolBudget(100, [
      { id: 'a', hashrate: Number.MAX_VALUE },
      { id: 'b', hashrate: Number.MAX_VALUE },
    ]),
    {},
  )
})
