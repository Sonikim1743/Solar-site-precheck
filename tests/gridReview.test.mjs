import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildGridReview, gridReviewNote } from '../src/services/gridReview.js'
const source = { id: 'way/1', name: '名称未記載', ref: 'S1-1', voltageKv: 66, distanceMeters: 100 }
const record = { type: 'line', no: 'S1-1', name: '公表設備', voltageKv: 66, availableCapacityMw: 0, upstreamAvailableCapacityMw: null }
test('complete equipment numbers preserve hyphens and reject collisions', () => {
  const [row] = buildGridReview({ lines: [source] }, { lines: [record, { ...record, no: 'S11' }] })
  assert.equal(row.capacity.no, 'S1-1')
  const [wrong] = buildGridReview({ lines: [{ ...source, ref: 'S11' }] }, { lines: [record] })
  assert.equal(wrong.capacity, null)
})
test('name candidates and ambiguous complete numbers never attach capacity', () => {
  assert.equal(buildGridReview({ lines: [{ ...source, ref: '', name: record.name }] }, { lines: [record] })[0].capacity, null)
  assert.equal(buildGridReview({ lines: [source] }, { lines: [record, { ...record, areaId: 'another' }] })[0].capacity, null)
  assert.equal(buildGridReview({ lines: [{ ...source, voltageKv: 22 }] }, { lines: [record] })[0].capacity, null)
})
test('review covers more than six equipment records and keeps distances ordered', () => {
  const lines = Array.from({ length: 48 }, (_, i) => ({ ...source, id: 'way/' + i, distanceMeters: 1000 - i }))
  const rows = buildGridReview({ lines }, { lines: [record] })
  assert.equal(rows.length, 48)
  assert.equal(rows.filter(row => row.capacity).length, 48)
  assert.equal(rows[0].equipment.id, 'way/47')
})
test('export distinguishes zero capacity, missing data and unverified official selection', () => {
  const note = gridReviewNote({ position: { lat: 35, lon: 133 }, official: record, annualYield: '60,000 kWh' })
  assert.match(note, /当該設備の公表空容量: 0 MW/)
  assert.match(note, /上位系統考慮の公表空容量: 記載なし/)
  assert.match(note, /対応は未確認/)
  assert.match(note, /60,000 kWh/)
})
