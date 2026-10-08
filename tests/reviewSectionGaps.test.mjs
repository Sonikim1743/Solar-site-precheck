import test from 'node:test'
import assert from 'node:assert/strict'
import { exampleReviewRecord, validateReviewRecord } from '../src/utils/reviewRecord.js'

function fixture(values) {
  const record = exampleReviewRecord('1.28.0')
  const position = record.candidate.position
  record.results.terrainSection = { rangeMeters: 20, intervalMeters: 10, lines: ['東西断面', '南北断面'].map(label => ({ label, points: values.map((elevation, i) => ({ ...position, distance: i * 10 - 20, elevation, source: '合成例' })), summary: { averageSlopePercent: 999, maxSlopePercent: 999 } })) }
  return record
}

test('reopened sections recompute observed segments without a synthetic connection over missing data', () => {
  const record = validateReviewRecord(fixture([0, 1, null, 100, 102]))
  for (const line of record.results.terrainSection.lines) {
    assert.equal(line.summary.totalRise, 3)
    assert.equal(line.summary.maxSlopePercent, 20)
    assert.ok(Math.abs(line.summary.averageSlopePercent - 255) < 1e-10)
  }
})

test('a missing endpoint or isolated observation cannot become a fabricated zero or shortened average', () => {
  for (const values of [[null, 1, 2, 3, 4], [null, null, 0, null, null]]) {
    const line = validateReviewRecord(fixture(values)).results.terrainSection.lines[0]
    assert.equal(line.summary.averageSlopePercent, null)
    assert.equal(line.summary.elevationDiff, null)
  }
  assert.equal(validateReviewRecord(fixture([null, null, 0, null, null])).results.terrainSection.lines[0].summary.maxSlopePercent, null)
})

test('explicit missing marks are preserved semantically and duplicate distances are rejected', () => {
  const record = fixture([0, 1, 900, 100, 102])
  record.results.terrainSection.lines[0].points[2].missing = true
  assert.equal(validateReviewRecord(record).results.terrainSection.lines[0].summary.totalRise, 3)
  record.results.terrainSection.lines[1].points[1].distance = -20
  assert.throws(() => validateReviewRecord(record), /距離重複/)
})
