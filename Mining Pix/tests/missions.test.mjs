import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMissionState,
  getMissionPeriods,
  getMissionProgress,
  MISSIONS,
  recordMissionProgress,
  refreshMissionState,
} from '../src/lib/missions.ts'

test('daily and weekly periods use local dates and Monday week starts', () => {
  assert.deepEqual(getMissionPeriods(new Date(2026, 10, 9, 12)), {
    daily: '2026-11-09',
    weekly: '2026-11-09',
  })
  assert.equal(getMissionPeriods(new Date(2026, 10, 11, 12)).weekly, '2026-11-09')
})

test('records cycle and installation progress in both periods', () => {
  const now = new Date(2026, 10, 9, 12)
  const afterCycle = recordMissionProgress(createMissionState(now), 'cycles', now)
  const afterInstall = recordMissionProgress(afterCycle, 'installs', now)
  assert.equal(afterInstall.dailyCycles, 1)
  assert.equal(afterInstall.weeklyCycles, 1)
  assert.equal(afterInstall.dailyInstalls, 1)
  assert.equal(afterInstall.weeklyInstalls, 1)
})

test('resets daily progress on a new date but preserves weekly progress', () => {
  const monday = new Date(2026, 10, 9, 12)
  let state = recordMissionProgress(createMissionState(monday), 'cycles', monday)
  state = refreshMissionState(state, new Date(2026, 10, 10, 12))
  assert.equal(state.dailyCycles, 0)
  assert.equal(state.weeklyCycles, 1)
  assert.equal(state.dailyPeriod, '2026-11-10')
  assert.equal(state.weeklyPeriod, '2026-11-09')
})

test('resets weekly progress and claims on the next Monday', () => {
  const monday = new Date(2026, 10, 9, 12)
  let state = recordMissionProgress(createMissionState(monday), 'cycles', monday)
  state = { ...state, claimed: ['daily-cycles', 'weekly-cycles'] }
  state = refreshMissionState(state, new Date(2026, 10, 16, 12))
  assert.equal(state.weeklyCycles, 0)
  assert.deepEqual(state.claimed, [])
})

test('mission progress is capped for display and mission targets are explicit', () => {
  const mission = MISSIONS.find((item) => item.id === 'daily-cycles')
  assert.ok(mission)
  const state = { ...createMissionState(), dailyCycles: 4 }
  assert.equal(getMissionProgress(state, mission), 4)
  assert.equal(mission.target, 3)
  assert.equal(mission.rewardXp, 100)
})
