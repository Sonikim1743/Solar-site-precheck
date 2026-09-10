import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterPowerGridView } from '../src/services/powerGridView.js'

test('Terra comparison filter includes 22/66/77 and unknown, excludes 110; substations independent', () => {
  const data = { lines: [110, 22, 66, 77, null].map((voltageKv, i) => ({ id: i, voltageKv, distanceMeters: i + 1 })), substations: [{ id: 's', voltageKv: 220, distanceMeters: 2 }], summary: { nearestPreferredLine: { id: 0 } } }
  const result = filterPowerGridView(data)
  assert.deepEqual(result.lines.map(l => l.voltageKv), [22, 66, 77, null])
  assert.equal(result.summary.nearestLine.voltageKv, 22)
  assert.equal(result.summary.nearestPreferredLine, null)
  assert.equal(result.summary.nearestSubstation.id, 's')
  assert.equal(filterPowerGridView(data, { unknown: false }).lines.length, 3)
  assert.equal(filterPowerGridView(data, { showSubstations: false }).summary.nearestSubstation, null)
  assert.equal(data.lines.length, 5)
})

test('multi-voltage line matches any published voltage and sorts by distance', () => {
  const result = filterPowerGridView({ lines: [{ id: 'far', voltageKv: 66, distanceMeters: 20 }, { id: 'near', voltageKv: 110, voltageValuesKv: [110, 66], distanceMeters: 10 }], substations: [] })
  assert.equal(result.summary.nearestLine.id, 'near')
})
