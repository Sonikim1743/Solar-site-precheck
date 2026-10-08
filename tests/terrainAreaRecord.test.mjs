import test from 'node:test'
import assert from 'node:assert/strict'
import { createReviewRecord, exampleReviewRecord, parseReviewRecord, REVIEW_SCHEMA_VERSION } from '../src/utils/reviewRecord.js'
import { createEmptyParcelReview, setReviewParcel, measureParcelReview } from '../src/utils/parcelReview.js'
import { createTerrainPlan, normalizeTerrainArea, terrainAreaSnapshot, terrainTilePoint } from '../src/utils/terrainArea.js'

// Synthetic shapes only. No downloaded site records, parcel numbers or private imagery.
const square = (x = 135, y = 35, size = .0008) => ({ type: 'Polygon', coordinates: [[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]] })
const source = { fileName: 'synthetic-terrain.geojson', importedAt: '2026-10-01T00:00:00.000Z' }
const feature = (id, geometry) => ({ type: 'Feature', id, properties: { 地番: id }, geometry })
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)

function reviewFixture() {
  let review = setReviewParcel(createEmptyParcelReview(), feature('test-target', square()), 'target', source)
  review = setReviewParcel(review, feature('test-reference', square(135.001, 35, .0003)), 'reference', source)
  review.boundary = square(135.00005, 35.00005, .0007)
  review.exclusions = [square(135.0003, 35.0003, .0001)]
  return review
}

function analysisFixture(review, { partial = false, geometry = measureParcelReview(review).geometry } = {}) {
  const plan = createTerrainPlan(geometry), grid = plan.grid
  const elevations = Array.from({ length: grid.width * grid.height }, (_, i) => 100 + .1 * (grid.xMin + i % grid.width * 5))
  const sourceIds = elevations.map(() => 'dem5b_png')
  const urls = new Set()
  for (let i = 0; i < elevations.length; i++) {
    const [lon, lat] = plan.positionAt(i), [px, py] = terrainTilePoint(lon, lat, 15)
    urls.add(`https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/15/${Math.floor(px / 256)}/${Math.floor(py / 256)}.png`)
  }
  if (partial) {
    const missing = grid.inside.findIndex(Boolean)
    elevations[missing] = null
    sourceIds[missing] = null
  }
  return normalizeTerrainArea({ version: 1, geometryKey: plan.geometryKey, geometry: plan.geometry,
    fetchedAt: '2026-09-01T01:02:03.000Z', source: { urls: [...urls], cached: true }, grid: { ...grid, elevations, sourceIds } })
}

function exportFixture({ partial = false } = {}) {
  const review = reviewFixture(), analysis = analysisFixture(review, { partial })
  const record = createReviewRecord({
    report: { appVersion: '1.28-test', position: { lat: 35.0002, lon: 135.0002 }, siteName: '合成データ', memo: '境界は参考範囲', fieldMemo: '排水未確認',
      elevation: 0, elevationSource: '合成標高', obstructionHeight: 20, snowBase: .95, parcelReview: review, terrainArea: analysis },
    generationDraft: { peakpower: 50, angle: 20, aspect: 0, loss: 14 },
  })
  return { record, analysis, review }
}

test('schema 3 export → JSON → reopen retains effective geometry, original retrieval date and recomputable terrain', () => {
  const { record, analysis, review } = exportFixture({ partial: true })
  assert.equal(REVIEW_SCHEMA_VERSION, 3)
  assert.equal(record.schemaVersion, 3)
  const reopened = parseReviewRecord(JSON.stringify(record))
  assert.deepEqual(reopened.candidate.parcelReview, review)
  assert.deepEqual(reopened, record)
  const stored = reopened.results.terrainArea
  assert.equal(stored.fetchedAt, '2026-09-01T01:02:03.000Z')
  assert.equal(stored.source.cached, true)
  assert.notEqual(stored.fetchedAt, reopened.savedAt, 'saving a record is not a new DEM retrieval')
  assert.equal(stored.summary, undefined)
  assert.equal(stored.contours, undefined)
  assert.equal(stored.grid.slopes, undefined)
  assert.ok(stored.grid.elevations.includes(null))
  const restored = normalizeTerrainArea(stored, measureParcelReview(reopened.candidate.parcelReview).geometry)
  assert.deepEqual(restored.summary, analysis.summary)
  assert.deepEqual(restored.contours, analysis.contours)
  assert.deepEqual(restored.grid.elevations, analysis.grid.elevations)
  close(restored.summary.medianSlope, Math.atan(.1) * 180 / Math.PI)
  assert.ok(restored.summary.coveragePercent < 100)
  assert.equal(restored.source.layers[0].id, 'dem5b_png')
  assert.match(restored.source.layers[0].label, /写真測量/)
})

test('record imports reject stale terrain after boundary or exclusion edits, or after removal of the effective geometry', () => {
  const { record } = exportFixture()
  const edits = [
    value => { value.candidate.parcelReview.boundary = square(135.0001,35.0001,.0006) },
    value => { value.candidate.parcelReview.exclusions = [] },
    value => { value.candidate.parcelReview = createEmptyParcelReview() },
  ]
  for (const edit of edits) {
    const stale = structuredClone(record)
    edit(stale)
    assert.throws(() => parseReviewRecord(JSON.stringify(stale)), /範囲|対応/)
  }
})

test('a target-only terrain snapshot cannot masquerade as the clipped and excluded review geometry', () => {
  const { record, review } = exportFixture()
  const rawTarget = review.parcels.find(parcel => parcel.role === 'target').geometry
  record.results.terrainArea = terrainAreaSnapshot(analysisFixture(review, { geometry: rawTarget }))
  assert.throws(() => parseReviewRecord(JSON.stringify(record)), /範囲/)
})

test('reference-only changes retain a matching effective area and its saved result', () => {
  const { record } = exportFixture()
  record.candidate.parcelReview = setReviewParcel(record.candidate.parcelReview, feature('test-reference-2', square(135.002,35,.0002)), 'reference', source)
  const reopened = parseReviewRecord(JSON.stringify(record))
  assert.equal(reopened.candidate.parcelReview.parcels.length, 3)
  assert.equal(reopened.results.terrainArea.geometryKey, record.results.terrainArea.geometryKey)
})

test('the record import boundary rejects forged grid placements, source metadata, and coordinate identity', () => {
  const { record } = exportFixture()
  const edits = [
    value => { value.grid.xMin += 5 },
    value => { value.grid.origin.lon += .001 },
    value => { value.grid.width += 1 },
    value => { value.grid.step = 1 },
    value => { value.grid.elevations[0] = '100' },
    value => { value.grid.sourceIds[0] = 'invented_dem' },
    value => { value.geometryKey = 'another-range' },
    value => { value.source.urls = ['https://example.invalid/dem.png'] },
    value => { value.source.urls = ['https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/15/0/0.png'] },
    value => { value.fetchedAt = 'not-a-date' },
    value => { value.grid.inside = Array(value.grid.width * value.grid.height).fill(true) },
  ]
  for (const edit of edits) {
    const forged = structuredClone(record)
    edit(forged.results.terrainArea)
    assert.throws(() => parseReviewRecord(JSON.stringify(forged)), /面地形/)
  }
})

test('saved derived summaries and contours are discarded and recomputed from the preserved raw grid', () => {
  const { record, analysis } = exportFixture()
  record.results.terrainArea.summary = { heightRange: 0, medianSlope: 0, polygonAreaM2: 999999 }
  record.results.terrainArea.contours = [{ level: 999, paths: [[[0,0],[1,1]]] }]
  record.results.terrainArea.grid.slopes = Array(record.results.terrainArea.grid.elevations.length).fill(0)
  const reopened = parseReviewRecord(JSON.stringify(record))
  assert.equal(reopened.results.terrainArea.summary, undefined)
  assert.deepEqual(normalizeTerrainArea(reopened.results.terrainArea).summary, analysis.summary)
})

test('actual schema 1 and schema 2 files remain readable without fabricating terrain area results', () => {
  const legacy1 = exampleReviewRecord('1.25')
  legacy1.schemaVersion = 1
  delete legacy1.candidate.parcelReview
  delete legacy1.results.terrainArea
  const opened1 = parseReviewRecord(JSON.stringify(legacy1))
  assert.equal(opened1.schemaVersion, 3)
  assert.deepEqual(opened1.candidate.parcelReview, createEmptyParcelReview())
  assert.equal(opened1.results.terrainArea, null)
  assert.equal(opened1.candidate.name, legacy1.candidate.name)

  const legacy2 = exampleReviewRecord('1.27.2')
  legacy2.schemaVersion = 2
  legacy2.candidate.parcelReview = reviewFixture()
  delete legacy2.results.terrainArea
  const opened2 = parseReviewRecord(JSON.stringify(legacy2))
  assert.equal(opened2.schemaVersion, 3)
  assert.deepEqual(opened2.candidate.parcelReview, legacy2.candidate.parcelReview)
  assert.deepEqual(measureParcelReview(opened2.candidate.parcelReview), measureParcelReview(legacy2.candidate.parcelReview))
  assert.equal(opened2.results.terrainArea, null)
  assert.equal(opened2.savedAt, legacy2.savedAt)
})
