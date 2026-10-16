import test from 'node:test'
import assert from 'node:assert/strict'
import { currentPlaceLabel, recoverTerrainEvidence, restoreDraftEvidence, LEGACY_DEM_DRAFT_BACKUP } from '../src/utils/siteEvidence.js'
import { findChugokuGridAreaByAddress } from '../src/services/chugokuGridSources.js'

test('fresh addresses and reopened records both supply the current prefecture, never an old candidate', () => {
  const position = { lat: 35.0001234, lon: 133.0004321 }
  for (const digits of [6, 7]) {
    const place = { status: 'success', positionKey: `${position.lat.toFixed(digits)},${position.lon.toFixed(digits)}`, data: { label: '岡山県　検証市' } }
    assert.equal(findChugokuGridAreaByAddress(currentPlaceLabel(position, place)).id, 'okayama')
    assert.equal(currentPlaceLabel({ ...position, lat: position.lat + .01 }, place), '')
    assert.equal(currentPlaceLabel(position, { ...place, status: 'error' }), '')
  }
  assert.equal(currentPlaceLabel(null, { status: 'success' }), '')
})

test('NEDO-contaminated elevation cannot restore a terrain horizon or a dependent generation comparison', () => {
  const record = { elevation: { value: 147, source: 'NEDO MONSOLA-11 Web' }, terrain: { samples: ['old'] }, generation: { annualKwh: 1200, scenario: { terrain: { annualKwh: 1100 }, snow: { weight: 25 } } } }
  const original = structuredClone(record)
  const restored = recoverTerrainEvidence(record)
  assert.equal(restored.elevation.value, null)
  assert.match(restored.elevation.message, /147m.*DEM/)
  assert.equal(restored.terrain, null)
  assert.deepEqual(restored.generation, { annualKwh: 1200 })
  assert.deepEqual(record, original, 'the original record must remain untouched')
})

test('valid DEM zero and independent snow-only generation comparisons are preserved', () => {
  const record = { elevation: { value: 0, source: 'DEM1A PNG' }, terrain: { samples: ['valid'] }, generation: { annualKwh: 0 } }
  assert.deepEqual(recoverTerrainEvidence(record), record)
  const snowOnly = { annualKwh: 1200, scenario: { snow: { weight: 25 } } }
  assert.equal(recoverTerrainEvidence({ elevation: { value: 0, source: 'NEDO MONSOLA-11 PDF' }, generation: snowOnly }).generation, snowOnly)
})

test('legacy browser drafts are backed up before invalidating the active terrain evidence', () => {
  const raw = JSON.stringify({ position: { lat: 35, lon: 133 }, elevation: { value: 147, source: 'NEDO MONSOLA-11 Web' }, terrain: { samples: ['original'] } })
  const values = new Map()
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }
  const recovered = restoreDraftEvidence(raw, storage)
  assert.equal(values.get(LEGACY_DEM_DRAFT_BACKUP), raw)
  assert.equal(recovered.elevation.value, null)
  assert.equal(recovered.recoverySavePaused, false)
  assert.deepEqual(recovered.position, { lat: 35, lon: 133 })
  values.set(LEGACY_DEM_DRAFT_BACKUP, 'another preserved draft')
  assert.equal(restoreDraftEvidence(raw, storage).recoverySavePaused, true)
  assert.equal(values.get(LEGACY_DEM_DRAFT_BACKUP), 'another preserved draft')
})

test('a backup storage failure pauses autosave instead of replacing the original legacy draft', () => {
  const recovered = restoreDraftEvidence(JSON.stringify({ elevation: { value: 147, source: 'NEDO PDF' } }), { getItem: () => null, setItem: () => { throw new Error('quota') } })
  assert.equal(recovered.recoverySavePaused, true)
  assert.match(recovered.elevation.message, /JSON/)
})
