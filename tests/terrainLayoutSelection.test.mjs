import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTerrainLayout, estimateTerrainLayoutAc } from '../src/utils/terrainLayout.js'
import {
  normalizeTerrainRackSelection,
  selectedTerrainLayout,
  toggleTerrainRackSelection,
  adjustTerrainRackSelection,
} from '../src/utils/terrainLayoutSelection.js'

// A local-metre synthetic field. Selection uses actual rigid rack candidates,
// without any private land record, coordinate or downloaded elevation data.
function fixture(options = {}) {
  const width = 8, height = 7, step = 5
  return buildTerrainLayout({ grid: {
    width, height, step, xMin: 0, yMin: 0,
    boundary: [[[[0, 0], [35, 0], [35, 30], [0, 30], [0, 0]]]],
    elevations: Array(width * height).fill(100),
    slopes: Array(width * height).fill(0),
  } }, options)
}

const ids = racks => racks.map(rack => rack.id)
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
  return value
}

test('legacy integer and preview prefix counts remain compatible, including zero and bounds', () => {
  const pool = fixture()
  assert.ok(pool.rackCount > 2)
  for (const selection of [0, -1, { activeRackCount: 0 }]) {
    const empty = selectedTerrainLayout(pool, selection)
    assert.deepEqual([empty.rackCount, empty.moduleCount, empty.dcKw, empty.acKw], [0, 0, 0, 0])
    assert.deepEqual(ids(empty.disabledRacks), ids(pool.racks))
  }
  assert.deepEqual(selectedTerrainLayout(pool, 2).racks, pool.racks.slice(0, 2))
  assert.deepEqual(selectedTerrainLayout(pool, { activeRackCount: 2 }).racks, pool.racks.slice(0, 2))
  for (const selection of [pool.rackCount, pool.rackCount + 100, undefined, null, 1.5]) {
    assert.deepEqual(selectedTerrainLayout(pool, selection).racks, pool.racks)
  }
  assert.equal(selectedTerrainLayout(null, []), null)
})

test('excluding a specific middle rack preserves every other candidate and its world geometry', () => {
  const pool = fixture(), middle = pool.racks[2]
  const selected = selectedTerrainLayout(pool, [middle.id])
  assert.deepEqual(ids(selected.racks), ids(pool.racks).filter(id => id !== middle.id))
  assert.deepEqual(selected.disabledRacks, [middle])
  assert.equal(selected.poolRackCount, pool.rackCount)
  assert.equal(selected.rackCount, pool.rackCount - 1)
  assert.equal(selected.moduleCount, pool.moduleCount - middle.moduleCount)
  for (const rack of selected.racks) assert.strictEqual(rack, pool.racks.find(candidate => candidate.id === rack.id))
  assert.strictEqual(selected.disabledRacks[0], middle)
})

test('duplicate and unknown IDs are normalized in candidate order without excluding unrelated racks', () => {
  const pool = fixture(), first = pool.racks[0].id, third = pool.racks[2].id
  const dirty = [third, 'not-a-candidate', first, third, null, 4]
  assert.deepEqual(normalizeTerrainRackSelection(pool, dirty), [first, third])
  assert.deepEqual(selectedTerrainLayout(pool, dirty).disabledRackIds, [first, third])
  assert.deepEqual(toggleTerrainRackSelection(pool, dirty, 'not-a-candidate'), [first, third])
  assert.deepEqual(toggleTerrainRackSelection(pool, dirty, null), [first, third])
  assert.deepEqual(normalizeTerrainRackSelection(null, dirty), [])
})

test('an explicit excluded-ID array overrides an old prefix count, even when the array is empty', () => {
  const pool = fixture(), id = pool.racks[1].id
  assert.deepEqual(selectedTerrainLayout(pool, { activeRackCount: 0, disabledRackIds: [] }).racks, pool.racks)
  assert.deepEqual(selectedTerrainLayout(pool, { activeRackCount: pool.rackCount, disabledRackIds: [id] }).disabledRackIds, [id])
  assert.equal(selectedTerrainLayout(pool, { activeRackCount: 1, disabledRackIds: null }).rackCount, 1)
})

test('clicking the same candidate twice restores exact racks, counts, DC and standardized AC', () => {
  const pool = fixture(), id = pool.racks[1].id
  const off = toggleTerrainRackSelection(pool, [], id)
  const reduced = selectedTerrainLayout(pool, off)
  assert.equal(reduced.dcKw, reduced.moduleCount * .720)
  assert.equal(reduced.acKw, estimateTerrainLayoutAc(reduced.dcKw).acKw)
  assert.deepEqual(reduced.acRangeKw, estimateTerrainLayoutAc(reduced.dcKw).acRangeKw)
  const on = toggleTerrainRackSelection(pool, { disabledRackIds: off }, id)
  assert.deepEqual(on, [])
  const restored = selectedTerrainLayout(pool, on)
  assert.deepEqual(restored.racks, pool.racks)
  assert.deepEqual([restored.moduleCount, restored.dcKw, restored.acKw, restored.acRangeKw], [pool.moduleCount, pool.dcKw, pool.acKw, pool.acRangeKw])
})

test('minus removes the last active rack and plus restores the first excluded rack after arbitrary clicks', () => {
  const pool = fixture(), first = pool.racks[0].id, middle = pool.racks[2].id, last = pool.racks.at(-1).id
  let disabled = toggleTerrainRackSelection(pool, [], middle)
  disabled = adjustTerrainRackSelection(pool, disabled, -1)
  assert.deepEqual(disabled, [middle, last])
  disabled = toggleTerrainRackSelection(pool, disabled, first)
  disabled = adjustTerrainRackSelection(pool, disabled, 1)
  assert.deepEqual(disabled, [middle, last], 'plus restores the first candidate in pool order')
  disabled = adjustTerrainRackSelection(pool, { disabledRackIds: disabled }, 1)
  assert.deepEqual(disabled, [last])
  assert.deepEqual(adjustTerrainRackSelection(pool, [], 1), [])
  assert.deepEqual(adjustTerrainRackSelection(pool, ids(pool.racks), -1), ids(pool.racks))
  assert.deepEqual(adjustTerrainRackSelection(pool, disabled, 0), disabled)
})

test('zero selection has zero capacity, and restoring a small rack recomputes its minimum-AC warning', () => {
  const pool = fixture({ minColumns: 4, maxColumns: 4 }), all = ids(pool.racks)
  const empty = selectedTerrainLayout(pool, all)
  assert.deepEqual([empty.rackCount, empty.moduleCount, empty.dcKw, empty.acKw, empty.acRangeKw], [0, 0, 0, 0, [0, 0]])
  assert.ok(!empty.warnings.some(warning => typeof warning === 'string' && warning.startsWith('AC換算が10kW未満')))
  const one = selectedTerrainLayout(pool, adjustTerrainRackSelection(pool, all, 1))
  assert.equal(one.rackCount, 1)
  assert.equal(one.moduleCount, 16)
  assert.equal(one.dcKw, 11.52)
  assert.equal(one.acKw, 10)
  assert.equal(one.warnings.filter(warning => typeof warning === 'string' && warning.startsWith('AC換算が10kW未満')).length, 1)
  const emptyAgain = selectedTerrainLayout(pool, toggleTerrainRackSelection(pool, one.disabledRackIds, one.racks[0].id))
  assert.equal(emptyAgain.dcKw, 0)
  assert.ok(!emptyAgain.warnings.some(warning => typeof warning === 'string' && warning.startsWith('AC換算が10kW未満')))
})

test('active footprint statistics change while eligible terrain area and candidate-search evidence stay fixed', () => {
  const pool = fixture(), disabled = [pool.racks[1].id, pool.racks.at(-1).id]
  pool.stats.autoSearch = { trials: 3, selectedAzimuthDeg: 180 }
  const selected = selectedTerrainLayout(pool, disabled)
  assert.equal(selected.stats.placedFootprintAreaM2, selected.racks.reduce((sum, rack) => sum + rack.widthM * rack.depthM, 0))
  assert.equal(selected.stats.selectedRackCount, selected.rackCount)
  assert.equal(selected.stats.disabledRackCount, disabled.length)
  assert.equal(selected.eligibleAreaM2, pool.eligibleAreaM2)
  assert.equal(selected.stats.eligibleAreaCalculated, pool.stats.eligibleAreaCalculated)
  assert.deepEqual(selected.stats.autoSearch, pool.stats.autoSearch)
  assert.ok(selected.stats.placedFootprintAreaM2 < pool.stats.placedFootprintAreaM2)
})

test('selection, restoration and legacy conversion never mutate the candidate pool or preview inputs', () => {
  const pool = fixture(), snapshot = structuredClone(pool)
  const preview = { disabledRackIds: [pool.racks[2].id], activeRackCount: 0, enabled: true, options: { rows: 4 }, labels: true }
  const original = structuredClone(preview)
  freeze(pool); freeze(preview)
  selectedTerrainLayout(pool, preview)
  toggleTerrainRackSelection(pool, preview, pool.racks[1].id)
  adjustTerrainRackSelection(pool, preview, -1)
  adjustTerrainRackSelection(pool, preview, 1)
  normalizeTerrainRackSelection(pool, 1)
  assert.deepEqual(pool, snapshot)
  assert.deepEqual(preview, original)
})
