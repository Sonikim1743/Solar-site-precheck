import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeTerrainCrossSection } from '../src/services/gsi.js'
import { normalizeReportTerrainSection } from '../src/utils/reportTerrain.js'

// Synthetic elevations only: exercise the public service without sending any
// candidate location or relying on the live GSI service.
async function section(values, options = {}) {
  let calls = 0
  const result = await analyzeTerrainCrossSection(35, 135, {
    rangeMeters: 20, intervalMeters: 10, ...options,
    fetchElevationImpl: async () => {
      const value = values[calls++ % values.length]
      if (value instanceof Error) throw value
      return { value, dataSource: 'synthetic PNG fixture' }
    },
  })
  assert.equal(calls, values.length * 2)
  assert.deepEqual(result, normalizeReportTerrainSection(result), 'acquired and report summaries must agree')
  return result
}

test('cross-section preserves a failed interior observation and never bridges its rise or steepness', async () => {
  const result = await section([0, 1, new Error('mock missing tile'), 100, 102])
  for (const line of result.lines) {
    assert.equal(line.points[2].distance, 0)
    assert.equal(line.points[2].elevation, null)
    assert.equal(line.points[2].missing, true)
    assert.ok(Math.abs(line.summary.averageSlopePercent - 255) < 1e-10)
    assert.deepEqual({ ...line.summary, averageSlopePercent: 255 }, { minElevation: 0, maxElevation: 102, elevationDiff: 102, totalRise: 3, totalFall: 0, averageSlopePercent: 255, maxSlopePercent: 20 })
  }
  assert.equal(result.summary.sampleCount, 8)
})

test('one valid observation retains its elevation but has no endpoint or segment slope', async () => {
  const result = await section([null, null, 17, null, null])
  assert.deepEqual(result.lines[0].summary, { minElevation: 17, maxElevation: 17, elevationDiff: null, totalRise: 0, totalFall: 0, averageSlopePercent: null, maxSlopePercent: null })
  assert.equal(result.summary.sampleCount, 2)
})

test('a missing range endpoint does not shorten the requested average to interior samples', async () => {
  for (const values of [[null, 10, 8, 7, 6], [10, 8, 7, 6, null]]) {
    const result = await section(values)
    for (const line of result.lines) {
      assert.equal(line.rangeMeters, 20)
      assert.equal(line.summary.elevationDiff, null)
      assert.equal(line.summary.averageSlopePercent, null)
      assert.equal(line.summary.totalRise, 0)
      assert.equal(line.summary.totalFall, 4)
      assert.equal(line.summary.maxSlopePercent, 20)
    }
  }
})

test('zero elevation and equal endpoints remain valid despite an intermediate peak', async () => {
  const result = await section([0, 0, 10, 0, 0])
  assert.deepEqual(result.lines[0].summary, { minElevation: 0, maxElevation: 10, elevationDiff: 0, totalRise: 10, totalFall: 10, averageSlopePercent: 0, maxSlopePercent: 100 })
  assert.equal(result.summary.sampleCount, 10)
})

test('a line whose sampled sequence does not reach the requested endpoint has no endpoint average', async () => {
  const result = await section([0, 1, 2, 3, 4, 5], { rangeMeters: 25, intervalMeters: 10 })
  assert.equal(result.lines[0].points.at(-1).distance, 25)
  assert.equal(result.lines[0].summary.averageSlopePercent, 10)
  const incomplete = await section([0, 1, 2, 3, 4], { rangeMeters: 24, intervalMeters: 10 })
  assert.equal(incomplete.lines[0].points.at(-1).distance, 16)
  assert.equal(incomplete.lines[0].summary.averageSlopePercent, null)
})

test('all missing observations are a failure, never a completed flat terrain result', async () => {
  await assert.rejects(() => analyzeTerrainCrossSection(35, 135, { rangeMeters: 20, intervalMeters: 10, fetchElevationImpl: async () => { throw new Error('mock outage') } }), /標高データを取得できません/)
})

test('explicit cancellation propagates instead of being recorded as a missing observation', async () => {
  const controller = new AbortController()
  let calls = 0
  await assert.rejects(() => analyzeTerrainCrossSection(35, 135, {
    rangeMeters: 20, intervalMeters: 10, signal: controller.signal,
    fetchElevationImpl: async () => { calls++; controller.abort(); return { value: 100 } },
  }), { name: 'AbortError' })
  assert.equal(calls, 1)
})

test('invalid sampling cannot start an infinite or excessive acquisition loop', async () => {
  let calls = 0
  for (const options of [{ intervalMeters: 0 }, { intervalMeters: -1 }, { rangeMeters: Infinity }, { rangeMeters: 1000, intervalMeters: 1 }]) {
    await assert.rejects(() => analyzeTerrainCrossSection(35, 135, { ...options, fetchElevationImpl: async () => { calls++; return { value: 0 } } }), /範囲・間隔/)
  }
  assert.equal(calls, 0)
})
