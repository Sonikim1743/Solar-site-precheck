import test from 'node:test'
import assert from 'node:assert/strict'
import { createCandidateRequests } from '../src/utils/candidateRequests.js'
import { generationCsvRows } from '../src/utils/generationCsv.js'

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('a previous candidate cannot overwrite elevation, terrain or snow after the new result', async () => {
  const scope = createCandidateRequests()
  const stored = {}
  const oldJobs = ['elevation', 'terrain', 'section', 'snow', 'adjacent'].map(kind => {
    const job = deferred()
    const current = scope.start(kind)
    const done = job.promise.then(value => { if (current()) stored[kind] = value })
    return { job, done }
  })
  scope.invalidateAll()
  const current = scope.start('elevation')
  if (current()) stored.elevation = 'candidate B'
  oldJobs.forEach(({ job }) => job.resolve('candidate A'))
  await Promise.all(oldJobs.map(({ done }) => done))
  assert.deepEqual(stored, { elevation: 'candidate B' })
})

test('confirmed snow supersedes a delayed nearest-station lookup without cancelling other analyses', () => {
  const scope = createCandidateRequests()
  const nearest = scope.start('snow')
  const terrain = scope.start('terrain')
  const confirmed = scope.start('snow')
  assert.equal(nearest(), false)
  assert.equal(confirmed(), true)
  assert.equal(terrain(), true)
  scope.invalidate('terrain')
  assert.equal(terrain(), false)
  assert.equal(confirmed(), true)
  scope.invalidateAll()
  assert.equal(confirmed(), false)
})

test('generation CSV preserves zero output, every month, assumptions and evidence', () => {
  const position = { lat: 34.9, lon: 133.5 }
  const generation = {
    inputs: { ...position, peakpower: 50, angle: 20, aspect: 0, loss: 14 }, annualKwh: 0,
    monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, kwh: 0 })),
    source: 'PVGIS test source', period: '2005–2023', fetchedAt: '2026-09-11T00:00:00Z', sourceUrl: 'https://example.test/source',
  }
  const rows = generationCsvRows(generation, position)
  assert.equal(rows.find(([key]) => key === 'PVGIS参考年間発電量(kWh)')[1], 0)
  assert.equal(rows.filter(([key]) => /月 PVGIS参考/.test(key)).length, 12)
  assert.equal(rows.find(([key]) => key === 'PVGISシステム損失(%)')[1], 14)
  assert.equal(rows.find(([key]) => key === 'PVGIS出典URL')[1], generation.sourceUrl)
  assert.match(rows.at(-1)[1], /系統出力制御は未反映/)
  assert.deepEqual(generationCsvRows(generation, { ...position, lon: 134 }), [['PVGIS参考発電量', '未計算']])
  assert.deepEqual(generationCsvRows(null, position), [['PVGIS参考発電量', '未計算']])
})
