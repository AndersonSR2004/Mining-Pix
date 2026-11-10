import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMissionState,
  DAILY_REWARDED_AD_LIMIT,
  getMissionPeriods,
  getMissionProgress,
  MISSIONS,
  PAID_LUCKY_BOX_PRICE,
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

test('daily missions track their own event targets', () => {
  const now = new Date(2026, 10, 9, 12)
  let state = createMissionState(now)
  for (let i = 0; i < 10; i++) state = recordMissionProgress(state, 'flappy_games', 1, now)
  assert.equal(state.dailyProgress.flappy_games, 10)
  const mission = MISSIONS.find((item) => item.id === 'daily-flappy')
  assert.ok(mission)
  assert.equal(getMissionProgress(state, mission), 10)
})

test('each daily mission increments weekly completion exactly once when its target is reached', () => {
  const now = new Date(2026, 10, 9, 12)
  let state = createMissionState(now)
  state = recordMissionProgress(state, 'flappy_games', 10, now)
  assert.equal(state.weeklyCompletedDailyMissions, 1)
  state = recordMissionProgress(state, 'flappy_games', 5, now)
  assert.equal(state.weeklyCompletedDailyMissions, 1)
  state = recordMissionProgress(state, 'snake_games', 10, now)
  state = recordMissionProgress(state, 'ad_lucky_boxes', 10, now)
  state = recordMissionProgress(state, 'room_energy_recharges', 1, now)
  state = recordMissionProgress(state, 'pix_coin_purchased', 100, now)
  assert.equal(state.weeklyCompletedDailyMissions, 5)
})

test('the three additional daily missions each count once toward the weekly total', () => {
  const now = new Date(2026, 10, 9, 12)
  let state = createMissionState(now)
  state = recordMissionProgress(state, 'paid_lucky_boxes', 1, now)
  state = recordMissionProgress(state, 'daily_login', 1, now)
  state = recordMissionProgress(state, 'rewarded_ads', 1, now)
  assert.equal(state.weeklyCompletedDailyMissions, 3)
  state = recordMissionProgress(state, 'daily_login', 1, now)
  assert.equal(state.weeklyCompletedDailyMissions, 3)
})

test('rewarded ads are capped at five per local day and reset the next day', () => {
  const day = new Date(2026, 10, 9, 12)
  let state = createMissionState(day)
  state = recordMissionProgress(state, 'rewarded_ads', 5, day)
  assert.equal(state.dailyProgress.rewarded_ads, DAILY_REWARDED_AD_LIMIT)
  state = recordMissionProgress(state, 'rewarded_ads', 1, day)
  assert.equal(state.dailyProgress.rewarded_ads, 5)
  assert.equal(state.weeklyCompletedDailyMissions, 1)
  state = refreshMissionState(state, new Date(2026, 10, 10, 12))
  assert.equal(state.dailyProgress.rewarded_ads, 0)
  assert.equal(state.weeklyCompletedDailyMissions, 1)
})

test('PIX COIN mission accumulates purchase quantity rather than number of transactions', () => {
  const now = new Date(2026, 10, 9, 12)
  let state = createMissionState(now)
  state = recordMissionProgress(state, 'pix_coin_purchased', 40, now)
  state = recordMissionProgress(state, 'pix_coin_purchased', 60, now)
  assert.equal(state.dailyProgress.pix_coin_purchased, 100)
  assert.equal(state.weeklyCompletedDailyMissions, 1)
})

test('daily login can be recorded repeatedly without double-counting its mission', () => {
  const now = new Date(2026, 10, 9, 12)
  let state = createMissionState(now)
  state = recordMissionProgress(state, 'daily_login', 1, now)
  state = recordMissionProgress(state, 'daily_login', 1, now)
  assert.equal(state.weeklyCompletedDailyMissions, 1)
})

test('daily reset clears daily progress while preserving weekly completion count', () => {
  const monday = new Date(2026, 10, 9, 12)
  let state = recordMissionProgress(createMissionState(monday), 'flappy_games', 10, monday)
  state = refreshMissionState(state, new Date(2026, 10, 10, 12))
  assert.equal(state.dailyProgress.flappy_games, 0)
  assert.equal(state.weeklyCompletedDailyMissions, 1)
  assert.deepEqual(state.completedDailyMissionIds, [])
})

test('weekly reset clears weekly completion and claims', () => {
  const monday = new Date(2026, 10, 9, 12)
  let state = recordMissionProgress(createMissionState(monday), 'flappy_games', 10, monday)
  state = { ...state, claimed: ['daily-flappy', 'weekly-10'] }
  state = refreshMissionState(state, new Date(2026, 10, 16, 12))
  assert.equal(state.weeklyCompletedDailyMissions, 0)
  assert.deepEqual(state.claimed, [])
})

test('weekly milestones are 10, 20, 30, 40 and 50 daily missions; nine daily missions allow 63 weekly completions', () => {
  assert.deepEqual(
    MISSIONS.filter((mission) => mission.period === 'weekly').map((mission) => mission.target),
    [10, 20, 30, 40, 50],
  )
  assert.equal(MISSIONS.filter((mission) => mission.period === 'daily').length, 9)
  assert.equal(9 * 7, 63)
  assert.ok(MISSIONS.every((mission) => mission.rewardXp > 0))
})

test('paid lucky box price is explicit and rewarded ads do not promise PIX COIN', () => {
  assert.equal(PAID_LUCKY_BOX_PRICE, 100)
  assert.equal(DAILY_REWARDED_AD_LIMIT, 5)
  const rewardedAdMission = MISSIONS.find((mission) => mission.id === 'daily-rewarded-ad')
  assert.ok(rewardedAdMission)
  assert.doesNotMatch(rewardedAdMission.description, /PIX COIN|PC/i)
})


test('Coin Catch completions advance the dedicated daily mission', () => {
  const now = new Date(2026, 10, 9, 12)
  let state = createMissionState(now)
  state = recordMissionProgress(state, 'coin_catch_games', 10, now)
  const mission = MISSIONS.find((item) => item.id === 'daily-coin-catch')
  assert.ok(mission)
  assert.equal(getMissionProgress(state, mission), 10)
  assert.equal(state.weeklyCompletedDailyMissions, 1)
})
