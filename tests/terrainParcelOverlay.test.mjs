import test from 'node:test'
import assert from 'node:assert/strict'
import proj4 from 'proj4'
import { buildTerrainParcelOverlay, sampleTerrainElevation, TERRAIN_PARCEL_OVERLAY_LIMITS } from '../src/utils/terrainParcelOverlay.js'
import { pointInTerrainBoundary } from '../src/utils/terrainArea.js'

const origin = { lat: 35, lon: 135 }
const project = proj4('EPSG:4326', '+proj=aeqd +lat_0=35 +lon_0=135 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs')
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
function fixture(boundary = [[box(-20, -20, 20, 20)]], height = (x, y) => 100 + x * .1 + y * .2) {
  const grid = { origin, width: 13, height: 13, xMin: -30, yMin: -30, step: 5, boundary }
  grid.elevations = Array.from({ length: grid.width * grid.height }, (_, i) => height(grid.xMin + i % grid.width * grid.step, grid.yMin + Math.floor(i / grid.width) * grid.step))
  return { grid }
}
function parcel(local, number = '123-4', extra = {}) {
  return { id: number || 'unnamed', geometry: { type: 'Polygon', coordinates: local.map(ring => ring.map(point => project.inverse(point))) }, info: { number }, role: 'target', source: { fileName: 'synthetic-test.xml' }, ...extra }
}
const close = (a, b, epsilon = 1e-5) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`)

test('DEM sampling follows the metre grid and rejects missing cells and out-of-grid coordinates', () => {
  const { grid } = fixture()
  close(sampleTerrainElevation(grid, 2.5, 7.5), 101.75)
  close(sampleTerrainElevation(grid, 30, 30), 109)
  assert.equal(sampleTerrainElevation(grid, 30.01, 0), null)
  grid.elevations[7 * grid.width + 7] = null
  assert.equal(sampleTerrainElevation(grid, 2.5, 2.5), null)
  assert.equal(sampleTerrainElevation(null, 0, 0), null)
})

test('actual parcel number is preserved and its boundary is clipped and draped over real DEM', () => {
  const analysis = fixture()
  const output = buildTerrainParcelOverlay(analysis, [parcel([box(-40, -10, 10, 10)], '1348-18')])
  assert.equal(output.labels.length, 1)
  assert.equal(output.labels[0].number, '1348-18')
  assert.ok(output.boundaries.length)
  for (const line of output.boundaries) for (let i = 0; i < line.points.length; i++) {
    const [x, y, z] = line.points[i]
    assert.ok(x >= -20 - 1e-6 && x <= 10 + 1e-6 && Math.abs(y) <= 10 + 1e-6)
    close(z, 100 + x * .1 + y * .2 + .15)
    if (i) assert.ok(Math.hypot(x - line.points[i - 1][0], y - line.points[i - 1][1]) <= analysis.grid.step + 1e-6)
  }
})

test('concave parcels and exclusions keep labels inside the clipped usable area', () => {
  const boundary = [[box(-20, -20, 20, 20), box(-5, -5, 5, 5)]]
  const analysis = fixture(boundary)
  const concave = [[[-18, -18], [18, -18], [18, -8], [-8, -8], [-8, 18], [-18, 18], [-18, -18]]]
  for (const shape of [[box(-25, -25, 25, 25)], concave]) {
    const output = buildTerrainParcelOverlay(analysis, [parcel(shape)])
    assert.equal(output.labels.length, 1)
    const [x, y] = output.labels[0].point
    assert.ok(pointInTerrainBoundary([x, y], boundary))
    assert.ok(pointInTerrainBoundary([x, y], [shape]), 'label remains inside the real parcel, not only the terrain range')
    for (const line of output.boundaries) for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1], b = line.points[i]
      assert.ok(!(Math.abs((a[0] + b[0]) / 2) < 5 - 1e-6 && Math.abs((a[1] + b[1]) / 2) < 5 - 1e-6))
    }
  }
})

test('missing DEM splits boundaries without bridging gaps and cannot fabricate heights or labels', () => {
  const analysis = fixture(undefined, (x, y) => Math.abs(x) < 1 ? null : 100)
  const output = buildTerrainParcelOverlay(analysis, [parcel([box(-15, -10, 15, 10)])])
  assert.ok(output.boundaries.length >= 2)
  for (const line of output.boundaries) for (let i = 1; i < line.points.length; i++) {
    const a = line.points[i - 1], b = line.points[i]
    assert.ok(a[0] * b[0] > 0, 'a path must not cross the missing strip')
  }
  const empty = buildTerrainParcelOverlay(fixture(undefined, () => null), [parcel([box(-15, -10, 15, 10)])])
  assert.deepEqual(empty, { boundaries: [], labels: [], truncated: false })
})

test('raw public features are supported and file parcels take priority over duplicate public geometry', () => {
  const local = parcel([box(-10, -10, 10, 10)], '449-222')
  const publicFeature = { type: 'Feature', id: 'public-one', geometry: local.geometry, properties: { '地番': '449-222', sourceLabel: '公開地番参考' }, role: 'public', source: { kind: 'public', year: 2024 } }
  const output = buildTerrainParcelOverlay(fixture(), [publicFeature, local])
  assert.equal(output.labels.length, 1)
  assert.equal(output.labels[0].parcelId, local.id)
  assert.equal(output.labels[0].role, 'target')
  const publicOnly = buildTerrainParcelOverlay(fixture(), [publicFeature])
  assert.equal(publicOnly.labels[0].number, '449-222')
  assert.equal(publicOnly.labels[0].role, 'public')
  const quantizedDuplicate = parcel([box(-10.1, -10.1, 10.1, 10.1)], '449-222', { role: 'public', source: { kind: 'public' } })
  assert.equal(buildTerrainParcelOverlay(fixture(), [quantizedDuplicate, local]).labels.length, 1)
})

test('unavailable or fallback parcel numbers never become invented labels', () => {
  for (const number of ['', '筆 123', '地番未記載']) {
    const output = buildTerrainParcelOverlay(fixture(), [parcel([box(-10, -10, 10, 10)], number)])
    assert.ok(output.boundaries.length)
    assert.equal(output.labels.length, 0)
    assert.ok(output.boundaries.every(line => line.number === ''))
  }
  assert.deepEqual(buildTerrainParcelOverlay(null, []), { boundaries: [], labels: [], truncated: false })
  assert.deepEqual(buildTerrainParcelOverlay(fixture(), [{ geometry: { type: 'Point', coordinates: [135, 35] } }]), { boundaries: [], labels: [], truncated: false })
})

test('label output is capped without collapsing different real parcels into a fictitious number', () => {
  const entries = Array.from({ length: 40 }, (_, i) => {
    const x = -18 + i % 8 * 4.5, y = -18 + Math.floor(i / 8) * 7
    return parcel([box(x, y, x + 3, y + 3)], `test-${i}`)
  })
  const output = buildTerrainParcelOverlay(fixture(), entries)
  assert.equal(output.labels.length, TERRAIN_PARCEL_OVERLAY_LIMITS.labels)
  assert.equal(new Set(output.labels.map(label => label.number)).size, output.labels.length)
  assert.equal(output.truncated, true)
})
