import test from 'node:test'
import assert from 'node:assert/strict'
import { comprehensiveReview, regulatoryReviewSummary } from '../src/utils/comprehensiveReview.js'
import { inspectionPointKey } from '../src/utils/regulatoryPoint.js'

const position = { lat: 35, lon: 135 }
const inspection = result => ({ pointKey: inspectionPointKey(position), enabled: true, status: 'ready', result })
const row = (state, count = 0) => ({ state, matches: Array.from({ length: count }, () => ({})) })

test('missing and failed sources cannot become an overlap-free regulatory check', () => {
  for (const state of ['error', 'unavailable', 'partial', 'nodata', 'unsupported', 'painted']) {
    const summary = regulatoryReviewSummary(inspection({ references: [row('none')], hazards: { mode: 'stored', datasets: [row(state)] } }), position)
    assert.match(summary.value, /未確認/)
    assert.doesNotMatch(summary.value, /未検出/)
    assert.equal(summary.pending, true)
  }
})

test('known matches coexist with unknown sources and never approve the whole site', () => {
  const summary = regulatoryReviewSummary(inspection({ references: [row('matched', 2), row('unavailable')], hazards: { mode: 'stored', datasets: [row('matched', 1)] } }), position)
  assert.match(summary.value, /選択地点の重なり 3件/)
  assert.match(summary.detail, /未確認/)
  assert.equal(summary.pending, true)
})

test('no-match in every queried source remains a point observation with open follow-up', () => {
  const summary = regulatoryReviewSummary(inspection({ references: [row('none')], hazards: { mode: 'stored', datasets: [row('none')] } }), position)
  assert.match(summary.value, /収録資料では重なり未検出/)
  assert.match(summary.detail, /敷地全体は未確認/)
  assert.equal(summary.pending, true)
})

test('another point or disabled layers cannot reuse a regulatory result', () => {
  const previous = inspection({ references: [row('matched', 1)] })
  assert.equal(regulatoryReviewSummary(previous, { lat: 36, lon: 135 }).value, '未照会')
  assert.equal(regulatoryReviewSummary({ ...previous, enabled: false }, position).value, '未照会')
})

test('the comprehensive summary does not promote existing generation estimates while their purpose is under review', () => {
  const generation = { inputs: { ...position }, annualKwh: 0 }
  const result = comprehensiveReview({ position, generation })
  assert.ok(result.every(item => item.id !== 'solar-generation'))
  assert.ok(result.every(item => item.id !== 'power'))
  assert.doesNotMatch(JSON.stringify(result), /kWh/)
  assert.equal(generation.annualKwh, 0)
})

test('terrain-only horizon and assumed or edited angles stay distinguishable, including missing samples', () => {
  const terrain = { samples: [{ angle: 4.6, terrainAngle: 0, missingCount: 1 }] }
  const get = status => comprehensiveReview({ position, terrain, terrainStatus: status, obstructionHeight: 20 }).find(item => item.id === 'simple-horizon')
  assert.equal(get('success').value, '地形のみ 最大 0.0°')
  assert.match(get('success').detail, /樹高仮定 20m込み 最大 4.6°・欠測あり/)
  assert.equal(get('success').pending, true)
  assert.match(get('manual').detail, /手動編集あり/)
  assert.doesNotMatch(get('manual').detail, /樹高仮定/)
})

test('partial area DEM is still a remaining check even with a valid slope median', () => {
  const terrainArea = { summary: { medianSlope: 0, coveragePercent: 99, slopeCoveragePercent: 98 } }
  const result = comprehensiveReview({ position, terrainArea }).find(item => item.id === 'terrain-area')
  assert.equal(result.value, '勾配の中央値 0.0°')
  assert.match(result.detail, /一部欠測/)
  assert.equal(result.pending, true)
})
