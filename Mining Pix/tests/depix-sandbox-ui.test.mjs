import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDepix, formatSandboxUnits, parseSandboxAmount } from '../src/lib/depixSandbox.ts'

test('DePix sandbox validates decimal input and preserves all eight fractional digits', () => {
  assert.deepEqual(parseSandboxAmount(' 9999999999,99999999 '), {
    value: '9999999999.99999999',
    units: 999999999999999999n,
  })
  assert.equal(parseSandboxAmount('1.000000001'), null)
  assert.equal(parseSandboxAmount('10000000000'), null)
  assert.equal(parseSandboxAmount('-0.01'), null)
  assert.equal(parseSandboxAmount('1e2'), null)
})

test('DePix display preserves subunit signs and amounts above the safe integer number limit', () => {
  assert.equal(formatDepix('-0.00000001'), '-0,00000001 DePix')
  assert.equal(formatSandboxUnits('-1'), '-0,00000001 DePix')
  assert.equal(formatSandboxUnits('9007199254740993'), '90.071.992,54740993 DePix')
})
