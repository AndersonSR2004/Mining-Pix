import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeEconomy, runSandboxIntegrityChecks } from '../src/lib/intelligence.ts'

const base = {
  balance: 1000,
  totalRewards: 100,
  machines: [{ id: 1, name: 'Miner I', hashrate: 100, price: 500, roomId: 1 }],
  inventory: [],
  rooms: [{ id: 1, name: 'Sala Principal', capacity: 10 }],
  bots: [{ id: 2, name: 'Bot 1', hashrate: 50, active: true, balance: 200, totalRewards: 50 }],
  poolHistory: [{
    id: 1, date: '2026-11-09', reward: 100, participation: 66.6,
    playerHashrate: 100, networkHashrate: 150, budget: 150, botCount: 1,
  }],
}

test('economy metrics summarize only the balances and history provided', () => {
  const result = analyzeEconomy(base)
  assert.equal(result.visibleWalletSupply, 1200)
  assert.equal(result.botWalletSupply, 200)
  assert.equal(result.playerWalletShare, 1000 / 1200 * 100)
  assert.equal(result.recordedPoolBudget, 150)
  assert.equal(result.recordedDistributedRewards, 150)
  assert.equal(result.cyclesAnalyzed, 1)
  assert.equal(result.activeBots, 1)
})

test('economy metrics handle an empty sandbox', () => {
  const result = analyzeEconomy({ balance: 0, totalRewards: 0, bots: [], poolHistory: [] })
  assert.equal(result.visibleWalletSupply, 0)
  assert.equal(result.playerWalletShare, 0)
  assert.equal(result.averageCycleBudget, 0)
})

test('integrity audit returns a warning-only clean result for valid data', () => {
  const issues = runSandboxIntegrityChecks(base)
  assert.deepEqual(issues.map((issue) => issue.id), ['sandbox-clean'])
})

test('integrity audit detects duplicate equipment IDs and invalid room capacity', () => {
  const issues = runSandboxIntegrityChecks({
    ...base,
    inventory: [{ id: 1, name: 'Duplicate', hashrate: 10, price: 0, roomId: 0 }],
    rooms: [{ id: 1, name: 'Sala Principal', capacity: 0 }],
  })
  assert.ok(issues.some((issue) => issue.id === 'duplicate-machine-id' && issue.severity === 'error'))
  assert.ok(issues.some((issue) => issue.id === 'room-capacity-1' && issue.severity === 'error'))
})

test('integrity audit detects invalid bot and inconsistent cycle values', () => {
  const issues = runSandboxIntegrityChecks({
    ...base,
    bots: [{ ...base.bots[0], balance: -1 }],
    poolHistory: [{ ...base.poolHistory[0], reward: 999, budget: 100 }],
  })
  assert.ok(issues.some((issue) => issue.id === 'bot-values-2'))
  assert.ok(issues.some((issue) => issue.id === 'cycle-values-1'))
})

test('integrity audit detects invalid player balance and missing room reference', () => {
  const issues = runSandboxIntegrityChecks({
    ...base,
    balance: Number.NaN,
    machines: [{ ...base.machines[0], roomId: 99 }],
  })
  assert.ok(issues.some((issue) => issue.id === 'player-balance'))
  assert.ok(issues.some((issue) => issue.id === 'machine-room-1'))
})
