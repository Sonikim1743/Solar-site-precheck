import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generationUrl, parseGeneration } from '../shared/generation.js'
import { buildGenerationScenario, scenarioHorizon } from '../shared/generationScenario.js'

const position = { lat: 34.65, lon: 133.9 }
const inputs = { ...position, peakpower: 50, loss: 14, angle: 20, aspect: 0 }
const fetchedAt = '2026-09-11T02:53:01.606Z'
const calculatedAt = '2026-09-11T04:00:00.000Z'
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`)
function result({ conditions = inputs, monthly = Array.from({ length: 12 }, (_, index) => (index + 1) * 100), annual = monthly.reduce((sum, value) => sum + value, 0) } = {}) {
  return { ...parseGeneration({ inputs: { meteo_data: { year_min: 2005, year_max: 2023 } }, outputs: { totals: { fixed: { E_y: annual } }, monthly: { fixed: monthly.map((kwh, index) => ({ month: index + 1, E_m: kwh })) } } }, conditions), fetchedAt }
}
function terrain(count = 8) {
  return { position: { ...position }, positionKey: '34.6500000,133.9000000', obstructionHeight: 20, samples: Array.from({ length: count }, (_, index) => ({ bearing: index * 360 / count, terrainAngle: index, angle: index + 20, missingCount: 0 })) }
}
const snow = { rates: Array(12).fill(.5), weight: 25, mesh: '51330000', source: 'NEDO 月別10cm以上積雪出現率・確認用' }

test('scenario horizon sorts all 8 or 36 bearings north-clockwise using terrainAngle only', () => {
  for (const count of [8, 36]) {
    const data = terrain(count)
    data.samples.reverse()
    const before = structuredClone(data)
    assert.deepEqual(scenarioHorizon(data, position), Array.from({ length: count }, (_, index) => index))
    assert.deepEqual(data, before)
  }
  const flat = terrain()
  flat.samples.forEach(sample => { sample.terrainAngle = 0; sample.angle = 89 })
  assert.deepEqual(scenarioHorizon(flat, position), Array(8).fill(0))
})

test('scenario horizon rejects missing coordinates, stale sites, missing DEM and irregular bearings', () => {
  const patches = [
    data => { delete data.position },
    data => { data.position.lat += .000000001 },
    data => { data.positionKey = '35.0000000,133.9000000' },
    data => { data.samples.pop() },
    data => { data.samples[0].bearing = 45 },
    data => { data.samples.forEach(sample => { sample.bearing += 1 }) },
    data => { data.samples[0].terrainAngle = null },
    data => { delete data.samples[0].terrainAngle },
    data => { data.samples[0].terrainAngle = Infinity },
    data => { data.samples[0].terrainAngle = -1 },
    data => { data.samples[0].terrainAngle = 91 },
    data => { data.samples[0].missing = true },
    data => { data.samples[0].missingCount = 1 },
    data => { data.samples[0].profile = [{ terrainAngle: 0 }, { terrainAngle: null, missing: true }] },
    data => { data.samples[0].profile = [] },
    data => { data.partial = true },
  ]
  for (const patch of patches) {
    const data = terrain(); patch(data)
    assert.throws(() => scenarioHorizon(data, position))
  }
  assert.throws(() => scenarioHorizon(terrain(), { ...position, lat: NaN }))
})

test('no adjustments and zero snow weight preserve the original annual value and input data', () => {
  const base = result({ annual: 7800.01 })
  const before = structuredClone(base)
  const disabled = buildGenerationScenario(base, { calculatedAt })
  assert.equal(disabled.annualKwh, base.annualKwh)
  assert.deepEqual(disabled.monthly, base.monthly)
  assert.equal(disabled.differenceKwh, 0)
  assert.equal(disabled.differencePercent, 0)
  assert.equal(disabled.snow, null)
  assert.equal(disabled.terrain, null)
  const config = { ...snow, weight: 0 }
  const scenario = buildGenerationScenario(base, { snow: config, calculatedAt })
  assert.equal(scenario.annualKwh, base.annualKwh)
  assert.deepEqual(scenario.monthly, base.monthly)
  assert.deepEqual(base, before)
  assert.notEqual(scenario.monthly, base.monthly)
  assert.notEqual(scenario.snow.rates, config.rates)
  assert.equal(scenario.calculatedAt, calculatedAt)
})

test('snow adjustment uses monthly probability times explicit weight without applying system loss twice', () => {
  const base = result()
  const scenario = buildGenerationScenario(base, { snow, calculatedAt })
  near(scenario.annualKwh, 7800 * .875)
  near(scenario.monthly[0].kwh, 100 * .875)
  near(scenario.differenceKwh, -975)
  near(scenario.differencePercent, -12.5)
  const januaryOnly = buildGenerationScenario(base, { snow: { ...snow, rates: [1, ...Array(11).fill(0)], weight: 50 }, calculatedAt })
  near(januaryOnly.annualKwh, 7750)
  assert.equal(januaryOnly.monthly[0].kwh, 50)
  assert.equal(januaryOnly.monthly[11].kwh, 1200)
  assert.equal(base.inputs.loss, 14)
  assert.equal(base.annualKwh, 7800)
})

test('full snow loss yields zero even when PVGIS annual differs from its monthly sum by .01', () => {
  for (const annual of [7800, 7800.01, 7799.99]) {
    const base = result({ annual })
    const scenario = buildGenerationScenario(base, { snow: { ...snow, rates: Array(12).fill(1), weight: 100 }, calculatedAt })
    assert.equal(scenario.annualKwh, 0)
    assert.ok(scenario.monthly.every(row => row.kwh === 0))
    assert.equal(scenario.differenceKwh, -annual)
    assert.equal(scenario.differencePercent, -100)
  }
  const zero = buildGenerationScenario(result({ monthly: Array(12).fill(0) }), { snow, calculatedAt })
  assert.equal(zero.annualKwh, 0)
  assert.equal(zero.differenceKwh, 0)
  assert.equal(zero.differencePercent, null)
  assert.throws(() => buildGenerationScenario(result({ monthly: Array(12).fill(0), annual: .01 }), { calculatedAt }))
})

test('terrain replacement can increase yield and keeps normalized full source data before snow', () => {
  const base = result()
  const replacement = result({ conditions: { ...inputs, userhorizon: Array(8).fill(0) }, monthly: Array.from({ length: 12 }, (_, index) => (index + 1) * 110) })
  replacement.monthly.reverse()
  replacement.sourceUrl = 'https://example.invalid/untrusted-source'
  const before = structuredClone(replacement)
  const scenario = buildGenerationScenario(base, { terrain: replacement, calculatedAt })
  assert.equal(scenario.annualKwh, 8580)
  near(scenario.differencePercent, 10)
  assert.equal(scenario.terrain.sourceUrl, generationUrl(replacement.inputs))
  assert.equal(scenario.terrain.source, base.source)
  assert.equal(scenario.terrain.period, '2005–2023')
  assert.equal(scenario.terrain.fetchedAt, fetchedAt)
  assert.equal(scenario.monthly[0].month, 1)
  assert.equal(scenario.monthly[0].kwh, 110)
  assert.deepEqual(replacement, before)
  const combined = buildGenerationScenario(base, { terrain: replacement, snow, calculatedAt })
  near(combined.annualKwh, 8580 * .875)
  near(combined.differenceKwh, 8580 * .875 - 7800)
})

test('terrain comparison rejects all changed base inputs and requires an explicit valid horizon', () => {
  const base = result()
  const conditions = { ...inputs, userhorizon: Array(8).fill(2) }
  for (const key of ['lat', 'lon', 'peakpower', 'loss', 'angle', 'aspect']) {
    const replacement = result({ conditions: { ...conditions, [key]: conditions[key] + 1 } })
    assert.throws(() => buildGenerationScenario(base, { terrain: replacement, calculatedAt }))
  }
  assert.throws(() => buildGenerationScenario(base, { terrain: result(), calculatedAt }))
  const malformed = result({ conditions }); malformed.inputs.userhorizon = [1, 2]
  assert.throws(() => buildGenerationScenario(base, { terrain: malformed, calculatedAt }))
  const changedPeriod = result({ conditions }); changedPeriod.period = '2010–2024'
  assert.throws(() => buildGenerationScenario(base, { terrain: changedPeriod, calculatedAt }))
})

test('scenario rejects invalid monthly results, dates, annual consistency and snow metadata', () => {
  const base = result()
  for (const patch of [
    value => { value.monthly.pop() },
    value => { value.monthly[0].month = 2 },
    value => { value.monthly[0].kwh = NaN },
    value => { value.monthly[0].kwh = -1 },
    value => { value.annualKwh = Infinity },
    value => { value.annualKwh = 1 },
    value => { value.annualKwh += .2 },
    value => { value.inputs.lat = '34.65' },
    value => { value.fetchedAt = 'not a date' },
  ]) {
    const invalid = structuredClone(base); patch(invalid)
    assert.throws(() => buildGenerationScenario(invalid, { calculatedAt }))
  }
  for (const patch of [{ rates: [] }, { rates: Array(12) }, { rates: Array(12).fill(1.01) }, { rates: Array(12).fill('0') }, { weight: -1 }, { weight: 101 }, { weight: NaN }, { weight: '25' }, { mesh: '123' }, { mesh: 51330000 }, { source: '' }]) {
    assert.throws(() => buildGenerationScenario(base, { snow: { ...snow, ...patch }, calculatedAt }))
  }
  assert.throws(() => buildGenerationScenario(base, { calculatedAt: 'invalid date' }))
  const invalidTerrain = result({ conditions: { ...inputs, userhorizon: Array(8).fill(0) } })
  invalidTerrain.monthly[0].kwh = Infinity
  assert.throws(() => buildGenerationScenario(base, { terrain: invalidTerrain, calculatedAt }))
})
