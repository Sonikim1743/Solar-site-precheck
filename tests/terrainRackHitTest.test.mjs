import test from 'node:test'
import assert from 'node:assert/strict'
import { hitTestTerrainRack, TERRAIN_RACK_HIT_LIMITS } from '../src/utils/terrainRackHitTest.js'
import { createTerrainProjection } from '../src/utils/terrainView.js'

const square = [[10, 10], [30, 10], [30, 30], [10, 30]]
const rack = (id, depth = 0, polygon = square, extra = {}) => ({ id, depth, polygon, active: true, ...extra })

test('oriented roof hits work for both windings and preserve corner and 3px edge limits', () => {
  const diamond = [[20, 0], [40, 20], [20, 40], [0, 20]]
  for (const polygon of [diamond, [...diamond].reverse(), [...diamond, diamond[0]]]) {
    assert.equal(hitTestTerrainRack([20, 20], [rack('rotated', 0, polygon)]), 'rotated')
    assert.equal(hitTestTerrainRack({ x: 20, y: 0 }, [rack('rotated', 0, polygon)]), 'rotated')
    assert.equal(hitTestTerrainRack([20, -3], [rack('rotated', 0, polygon)]), 'rotated')
    assert.equal(hitTestTerrainRack([20, -3.01], [rack('rotated', 0, polygon)]), null)
    assert.equal(hitTestTerrainRack([38, 2], [rack('rotated', 0, polygon)]), null, 'bbox alone is not a roof hit')
  }
  assert.equal(hitTestTerrainRack([8, 8], [rack('corner')]), 'corner')
  assert.equal(hitTestTerrainRack([7.8, 7.8], [rack('corner')]), null, 'corner tolerance is radial, not a square pad')
  assert.equal(hitTestTerrainRack([20, 7], [rack('edge')], { edgeTolerancePx: 0 }), null)
  assert.equal(hitTestTerrainRack([20, 6], [rack('edge')], { edgeTolerancePx: 100 }), null, 'options cannot expand beyond 3px')
})

test('overlapping racks use actual projection depth; inactive and same-id racks remain selectable', () => {
  const projection = createTerrainProjection({ bounds: { west: -20, east: 20, south: -20, north: 20 }, base: 0, maxElevation: 10, azimuth: 0, pitch: 0 })
  const projected = (id, y) => {
    const roof = [[-5, y, 5], [5, y, 5], [5, y + 2, 6], [-5, y + 2, 6]]
    return rack(id, projection.transform([0, y + 1, 5.5])[2], roof.map(projection.project))
  }
  const back = projected('back', -10), front = projected('front', 10)
  assert.deepEqual(back.polygon, front.polygon, 'this side view overlaps the two synthetic roofs')
  const point = projection.project([0, 0, 5.5])
  assert.equal(hitTestTerrainRack(point, [front, back]), 'front')
  assert.equal(hitTestTerrainRack(point, [back, { ...front, active: false }]), 'front', 'excluded outline can be restored')
  assert.equal(hitTestTerrainRack(point, [back, { ...front, visible: false }]), 'back')
  assert.equal(hitTestTerrainRack([20, 20], [rack('same', -4), rack('other', 1), rack('same', 8)]), 'same')
  assert.equal(hitTestTerrainRack([20, 20], [rack('first', 8), rack('second', 8)]), 'first')
})

test('thin and edge-on roofs retain a bounded click target without making point-only shapes selectable', () => {
  for (const polygon of [ [[10, 10], [30, 10], [30, 10.1], [10, 10.1]], [[10, 10], [30, 10], [30, 10], [10, 10]] ]) {
    assert.equal(hitTestTerrainRack([20, 8], [rack('thin', 0, polygon)]), 'thin')
    assert.equal(hitTestTerrainRack([20, 6.9], [rack('thin', 0, polygon)]), null)
  }
  assert.equal(hitTestTerrainRack([10, 10], [rack('point', 0, Array(4).fill([10, 10]))]), null)
})

test('malformed coordinates, crossed roofs, invalid depth and missing IDs cannot win a hit', () => {
  const invalid = [null, [], [[0, 0]], [[10, 10], [30, 30], [30, 10], [10, 30]], [[10, 10], [30, 10], [30, NaN], [10, 30]], [...square, [11, 11]], [[10, 10], [20, 20], [10, 10], [30, 30.1]]]
  for (const polygon of invalid) assert.equal(hitTestTerrainRack([20, 20], [rack('invalid', 99, polygon)]), null)
  assert.equal(hitTestTerrainRack([20, 20], [rack('', 99), rack(null, 99), rack('infinite', Infinity), rack('valid', -1)]), 'valid')
  for (const point of [null, [20], [20, 20, 1], ['20', 20], [Infinity, 20], { x: 20, y: NaN }]) assert.equal(hitTestTerrainRack(point, [rack('x')]), null)
  assert.equal(hitTestTerrainRack([20, 20], null), null)
  assert.equal(hitTestTerrainRack([200, 200], [rack('outside')]), null)
})

test('visibility predicates and the 200-rack limit bound work without partially choosing oversized input', () => {
  let calls = 0
  const candidates = Array.from({ length: 200 }, (_, i) => rack(`rack-${i}`, i))
  const visibleScreen = (candidate, point) => { calls++; assert.deepEqual(point, [20, 20]); return candidate.depth < 150 }
  assert.equal(hitTestTerrainRack([20, 20], candidates, { visibleScreen }), 'rack-149')
  assert.ok(calls <= TERRAIN_RACK_HIT_LIMITS.racks)
  calls = 0
  assert.equal(hitTestTerrainRack([20, 20], [...candidates, rack('overflow', 1000)], { visibleScreen }), null)
  assert.equal(calls, 0)
  assert.equal(hitTestTerrainRack([20, 20], [rack(0)], { visibleScreen: () => true }), 0)
  assert.equal(hitTestTerrainRack([20, 20], [rack('hidden')], { visibleScreen: () => false }), null)
})

test('frozen pointer, rack state and source polygon stay unchanged after selection and filtering', () => {
  const polygon = Object.freeze(square.map(point => Object.freeze([...point])))
  const candidates = Object.freeze([Object.freeze(rack('excluded', 4, polygon, { active: false }))])
  const point = Object.freeze({ x: 20, y: 20 })
  const before = JSON.stringify({ candidates, point })
  assert.equal(hitTestTerrainRack(point, candidates, { visibleScreen: (_, copiedPoint) => { copiedPoint[0] = 999; return true } }), 'excluded')
  assert.equal(JSON.stringify({ candidates, point }), before)
})
