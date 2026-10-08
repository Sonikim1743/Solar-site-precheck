import test from 'node:test'
import assert from 'node:assert/strict'
import { createTerrainProjection, dragTerrainView, normalizeTerrainView } from '../src/utils/terrainView.js'

const settings = { bounds: { west: -50, south: -40, east: 50, north: 40 }, base: 300, maxElevation: 360 }
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]))

test('terrain view wraps bearings and clamps only the camera pitch', () => {
  assert.deepEqual(normalizeTerrainView({ azimuth: -725, pitch: -100 }), { azimuth: 355, pitch: 15 })
  assert.deepEqual(normalizeTerrainView({ azimuth: 725, pitch: 200 }), { azimuth: 5, pitch: 75 })
  assert.deepEqual(normalizeTerrainView({ azimuth: NaN, pitch: Infinity }), { azimuth: 35, pitch: 32 })
})

test('drag changes direction and pitch without an unbounded vertical orbit', () => {
  assert.deepEqual(dragTerrainView({ azimuth: 35, pitch: 32 }, .25, .25), { azimuth: 350, pitch: 54.5 })
  assert.equal(dragTerrainView({ azimuth: 35, pitch: 32 }, 0, -10).pitch, 15)
  assert.equal(dragTerrainView({ azimuth: 35, pitch: 32 }, 0, 10).pitch, 75)
})

test('rotation preserves physical metres and uses one uniform display scale', () => {
  for (const azimuth of [0, 35, 145, 270, 359]) for (const pitch of [15, 32, 75]) {
    const projection = createTerrainProjection({ ...settings, azimuth, pitch })
    const a = [10, 20, 320], b = [-20, 30, 350]
    assert.ok(Math.abs(distance(projection.transform(a), projection.transform(b)) - distance(a, b)) < 1e-10)
    for (const end of [[20,20,320], [10,30,320], [10,20,330]]) {
      assert.ok(Math.abs(distance(projection.transform(a), projection.transform(end)) - 10) < 1e-10)
    }
    assert.ok(projection.scale > 0)
    assert.ok(projection.project(a).every(Number.isFinite))
  }
})

test('north and east camera bearings project cardinal axes consistently', () => {
  const north = createTerrainProjection({ ...settings, azimuth: 0, pitch: 32 })
  assert.ok(north.project([10,0,300])[0] < north.project([0,0,300])[0], 'east is to the left when viewed from north')
  assert.ok(north.transform([0,10,300])[2] > north.transform([0,0,300])[2], 'north is nearer the north camera')
  const east = createTerrainProjection({ ...settings, azimuth: 90, pitch: 32 })
  assert.ok(east.project([0,10,300])[0] > east.project([0,0,300])[0], 'north is to the right when viewed from east')
  assert.ok(east.transform([10,0,300])[2] > east.transform([0,0,300])[2], 'east is nearer the east camera')
})
