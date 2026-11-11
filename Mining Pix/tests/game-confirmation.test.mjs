import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const games = readFileSync(new URL('../src/Games.tsx', import.meta.url), 'utf8')
const finishGame = games.slice(
  games.indexOf('async function finishGame'),
  games.indexOf('async function startGame'),
)

test('mission progress advances only after the backend confirms a finished game attempt', () => {
  assert.equal([...finishGame.matchAll(/onGameComplete\(/g)].length, 1)
  assert.match(
    finishGame,
    /if \(!attemptId\) \{[\s\S]*?return[\s\S]*?if \(error\) \{[\s\S]*?return[\s\S]*?if \(!data\) \{[\s\S]*?return[\s\S]*?setRewardError\(''\)[\s\S]*?onGameComplete\(/,
  )
})
