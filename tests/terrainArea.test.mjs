import test from 'node:test'
import assert from 'node:assert/strict'
import proj4 from 'proj4'
import { analyzeTerrainArea } from '../src/services/terrainArea.js'
import { createTerrainPlan, terrainGeometryKey, normalizeTerrainArea, terrainAreaSnapshot, terrainContours, pointInTerrainBoundary, terrainPointToLocal, terrainTilePoint, decodeDemRgba, bilinearTerrainValue, TERRAIN_AREA_LIMITS } from '../src/utils/terrainArea.js'

const project = proj4('EPSG:4326', '+proj=aeqd +lat_0=35 +lon_0=135 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs')
const ring = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(p => project.inverse(p))
const geometry = () => ({ type: 'Polygon', coordinates: [ring(-40, -40, 40, 40)] })
const close = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`)
function fixture(shape = geometry(), height = (x, y) => 100 + .1 * x + .2 * y) {
  const plan = createTerrainPlan(shape), g = plan.grid
  const elevations = Array.from({ length: g.width * g.height }, (_, i) => height(g.xMin + i % g.width * g.step, g.yMin + Math.floor(i / g.width) * g.step))
  const urls = new Set()
  for (let i = 0; i < elevations.length; i++) {
    const [lon, lat] = plan.positionAt(i), [x, y] = terrainTilePoint(lon, lat, 15)
    for (const [px, py] of [[Math.floor(x), Math.floor(y)], [Math.floor(x) + 1, Math.floor(y)], [Math.floor(x), Math.floor(y) + 1], [Math.floor(x) + 1, Math.floor(y) + 1]]) urls.add(`https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/15/${Math.floor(px / 256)}/${Math.floor(py / 256)}.png`)
  }
  return { version: 1, geometryKey: plan.geometryKey, geometry: shape, fetchedAt: '2026-10-07T00:00:00.000Z', grid: { ...g, elevations, sourceIds: elevations.map(v => v === null ? null : 'dem5a_png') }, source: { urls: [...urls] } }
}

test('plane gradient is two-axis 10m central difference; metre axes and coverage agree', () => {
  const a = normalizeTerrainArea(fixture())
  close(a.summary.medianSlope, Math.atan(Math.hypot(.1, .2)) * 180 / Math.PI)
  close(a.summary.maxSlope, a.summary.medianSlope)
  assert.equal(a.summary.coveragePercent, 100)
  assert.equal(a.summary.slopeCoveragePercent, 100)
  close(a.summary.slopeBins.reduce((s, b) => s + b.percent, 0), 100)
  const origin = terrainPointToLocal(a.grid.origin, a.grid.origin)
  close(origin[0], 0); close(origin[1], 0)
  assert.ok(a.summary.polygonAreaM2 > 6399 && a.summary.polygonAreaM2 < 6401)
})

test('courtyard and disjoint parts never count as terrain; contours are clipped to same boundary', () => {
  const shape = { type: 'MultiPolygon', coordinates: [[ring(-50, -50, 20, 50), ring(-30, -20, -10, 20)], [ring(35, -10, 55, 10)]] }
  const a = normalizeTerrainArea(fixture(shape))
  const hole = terrainPointToLocal({ lon: 135, lat: 35 }, a.grid.origin)
  // Inspect a known hole point via the original projection.
  const [lon, lat] = project.inverse([-20, 0])
  assert.equal(pointInTerrainBoundary(terrainPointToLocal({ lon, lat }, a.grid.origin), a.grid.boundary), false)
  assert.ok(Array.isArray(hole))
  for (const line of a.contours) for (const path of line.paths) for (let i = 1; i < path.length; i++) {
    const p = [(path[i - 1][0] + path[i][0]) / 2, (path[i - 1][1] + path[i][1]) / 2]
    assert.equal(pointInTerrainBoundary(p, a.grid.boundary), true)
  }
  assert.ok(Math.abs(a.summary.polygonAreaM2 - 6600) < 1)
})

test('null stencil values break slopes/contours; zero metres is valid and denominator is explicit', () => {
  const f = fixture(geometry(), () => 0), g = f.grid
  const center = Math.floor(g.height / 2) * g.width + Math.floor(g.width / 2)
  g.elevations[center] = null; g.sourceIds[center] = null
  const a = normalizeTerrainArea(f)
  assert.equal(a.summary.minElevation, 0)
  assert.ok(a.summary.coveragePercent < 100)
  assert.ok(a.summary.slopeCoveragePercent < a.summary.coveragePercent)
  assert.equal(a.grid.slopes[center + 1], null)
  assert.equal(a.grid.slopes[center], null)
  assert.equal(a.contours.length, 0)
  assert.throws(() => normalizeTerrainArea(fixture(geometry(), () => null)), /標高データ/)
})

test('PNG signed 24-bit decoding handles zero, negative, no-data, and alpha without zero filling', () => {
  const rgba = new Uint8ClampedArray(65536 * 4)
  for (let i = 0; i < 65536; i++) rgba[i * 4 + 3] = 255
  rgba.set([255, 255, 156, 255], 4) // -1.00 m
  rgba.set([128, 0, 0, 255], 8)
  rgba.set([0, 39, 16, 255], 12) // 100 m
  rgba.set([0, 39, 16, 0], 16)
  const data = decodeDemRgba(rgba)
  assert.equal(data[0], 0); assert.equal(data[1], -1); assert.ok(Number.isNaN(data[2])); assert.equal(data[3], 100); assert.ok(Number.isNaN(data[4]))
  close(bilinearTerrainValue(.5, .5, (x, y) => 2 * x + 4 * y), 3)
  assert.equal(bilinearTerrainValue(.5, .5, (x, y) => x === y ? null : 1), null)
  assert.equal(bilinearTerrainValue(0, 0, (x, y) => x === 0 && y === 0 ? 0 : null), 0)
})

test('saddle contour uses stable bilinear topology and does not draw a crossing', () => {
  const b = [[[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]]]
  const c = terrainContours({ width: 2, height: 2, step: 5, xMin: 0, yMin: 0, elevations: [3, -1, -1, 3], boundary: b })
  const zero = c.find(l => l.level === 0)
  assert.equal(zero.paths.length, 2)
  assert.deepEqual(zero.paths[0], [[3.75, 0], [5, 1.25]])
  assert.deepEqual(zero.paths[1], [[1.25, 5], [0, 3.75]])
})

test('snapshot omits derived payload and restores/recomputes values without fetching', () => {
  const a = normalizeTerrainArea(fixture()), snapshot = terrainAreaSnapshot(a)
  assert.equal(snapshot.contours, undefined); assert.equal(snapshot.grid.slopes, undefined); assert.equal(snapshot.grid.inside, undefined)
  assert.deepEqual(normalizeTerrainArea(snapshot).summary, a.summary)
  const changed = { ...snapshot, summary: { minElevation: -999 }, contours: [{ level: -999, paths: [] }] }
  assert.deepEqual(normalizeTerrainArea(changed).summary, a.summary)
  assert.throws(() => normalizeTerrainArea(snapshot, { type: 'Polygon', coordinates: [ring(-20, -20, 20, 20)] }), /範囲/)
})

test('forged layout/mask/source URLs and metadata are rejected; keys track changed shape', () => {
  const f = fixture()
  for (const mutate of [v => v.grid.xMin++, v => v.grid.origin.lat += .01, v => v.grid.step = 1, v => v.grid.width++, v => v.grid.elevations[0] = Infinity, v => v.grid.sourceIds[0] = 'https://evil.invalid', v => v.source.urls = ['https://evil.invalid/1.png'], v => v.source.layers = [{ id: 'dem5a_png', nodeCount: 1 }], v => v.grid.inside[0] = !v.grid.inside[0]]) {
    const copy = structuredClone(f); mutate(copy); assert.throws(() => normalizeTerrainArea(copy))
  }
  assert.equal(terrainGeometryKey(f.geometry), terrainGeometryKey(structuredClone(f.geometry)))
  const changed = structuredClone(f.geometry); changed.coordinates[0][1][0] += .00001
  assert.notEqual(terrainGeometryKey(changed), f.geometryKey)
  assert.throws(() => createTerrainPlan({ type: 'Polygon', coordinates: [ring(-600, -20, 600, 20)] }), /1km/)
  assert.throws(() => normalizeTerrainArea({ version: 1, grid: { width: 100000000, height: 100000000 } }), /寸法/)
})

test('service requests only official tile URLs with at most four simultaneous fetches', async () => {
  let active = 0, peak = 0, count = 0
  const a = await analyzeTerrainArea(geometry(), {
    useCache: false,
    fetchImpl: async (url, init) => {
      assert.match(url, /^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/(dem1a_png|dem5a_png)\//)
      assert.ok(init.signal); assert.equal(init.credentials, 'omit')
      active++; count++; peak = Math.max(peak, active)
      await new Promise(r => setTimeout(r, 2)); active--
      return { ok: !url.includes('dem1a'), status: url.includes('dem1a') ? 404 : 200, blob: async () => ({ size: 20 }) }
    },
    decodePng: async () => new Float64Array(65536).fill(100),
  })
  assert.ok(peak <= 4); assert.ok(count <= TERRAIN_AREA_LIMITS.maxTiles)
  assert.equal(a.source.layers[0].id, 'dem5a_png'); assert.equal(a.summary.coveragePercent, 100)
  close(a.summary.maxSlope, 0)
})

test('per-pixel fallback preserves the higher-resolution values and exposes mixed source counts', async () => {
  const a = await analyzeTerrainArea(geometry(), {
    useCache: false,
    fetchImpl: async url => ({ ok: true, blob: async () => ({ size: 1, fine: url.includes('dem1a_png') }) }),
    decodePng: async blob => Float64Array.from({ length: 65536 }, (_, i) => blob.fine && i % 256 > 128 ? NaN : blob.fine ? 110 : 100),
  })
  assert.ok(a.source.layers.some(l => l.id === 'dem1a_png'))
  assert.ok(a.source.layers.some(l => l.id === 'dem5a_png'))
  assert.equal(a.source.mixed, true)
  assert.equal(a.source.layers.reduce((sum, l) => sum + l.nodeCount, 0), a.grid.elevations.filter(v => v !== null).length)
  for (let i = 0; i < a.grid.elevations.length; i++) if (a.grid.sourceIds[i] === 'dem1a_png') close(a.grid.elevations[i], 110)
})

test('abort and total timeout terminate a non-cooperating fetch; failed attempt is retriable', async () => {
  const controller = new AbortController()
  const pending = analyzeTerrainArea(geometry(), { signal: controller.signal, useCache: false, fetchImpl: () => new Promise(() => {}), decodePng: async () => [] })
  controller.abort()
  await assert.rejects(pending, /abort|中止/i)
  await assert.rejects(analyzeTerrainArea(geometry(), { useCache: false, timeoutMs: 25, fetchImpl: () => new Promise(() => {}), decodePng: async () => [] }), /30秒/)
  let calls = 0
  const fetchImpl = async () => { calls++; throw new Error('temporary') }
  for (let retry = 0; retry < 2; retry++) await assert.rejects(analyzeTerrainArea(geometry(), { useCache: false, fetchImpl, decodePng: async () => [] }), /標高データ/)
  assert.ok(calls >= 10)
})

test('bilinear samples across PNG tile boundaries remain continuous in both axes', async () => {
  const origin = terrainTilePoint(135, 35, 17)
  const a = await analyzeTerrainArea(geometry(), {
    useCache: false,
    fetchImpl: async url => {
      const m = /\/(\d+)\/(\d+)\.png$/.exec(url)
      return { ok: true, blob: async () => ({ size: 1, x: Number(m[1]), y: Number(m[2]) }) }
    },
    decodePng: async ({ x, y }) => Float64Array.from({ length: 65536 }, (_, i) => 100 + (x * 256 + i % 256 - origin[0]) * .01 + (y * 256 + Math.floor(i / 256) - origin[1]) * .02),
  })
  const plan = createTerrainPlan(a.geometry)
  assert.ok(a.source.urls.length >= 2)
  for (let i = 0; i < a.grid.elevations.length; i++) {
    const [lon, lat] = plan.positionAt(i), [x, y] = terrainTilePoint(lon, lat, 17)
    close(a.grid.elevations[i], 100 + (x - origin[0]) * .01 + (y - origin[1]) * .02, 1e-9)
  }
})

test('tile count stays bounded and user abort remains distinct from no-data', async () => {
  const p = proj4('EPSG:4326', '+proj=aeqd +lat_0=49.8 +lon_0=145 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs')
  const polygon = { type: 'Polygon', coordinates: [[[-490, -490], [490, -490], [490, 490], [-490, 490], [-490, -490]].map(x => p.inverse(x))] }
  let calls = 0
  await assert.rejects(analyzeTerrainArea(polygon, { useCache: false, fetchImpl: async () => { calls++; return { ok: false, status: 404 } }, decodePng: async () => [] }), /上限64|標高データ/)
  assert.ok(calls <= 64)
  const c = new AbortController(); c.abort()
  await assert.rejects(analyzeTerrainArea(geometry(), { signal: c.signal, fetchImpl: async () => { throw new Error('must not request') } }), { name: 'AbortError' })
})
