import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pointInGeometry } from '../src/services/parcelGeometry.js'
import { PUBLIC_PARCEL_TERRAIN_LIMITS, buildPublicParcelTerrainSnapshot, createPublicParcelSnapshotGate, publicParcelTileGeometry, publicParcelTilePoint, publicParcelViewportKey } from '../src/utils/publicParcelTerrain.js'

// Synthetic coordinates only; no customer parcel, cadastral number or address.
const radians = Math.PI / 180
const world = 256 * 2 ** 16
const forward = ([lon, lat]) => ({ x: (lon + 180) / 360 * world, y: (1 - Math.log(Math.tan(Math.PI / 4 + lat * radians / 2)) / Math.PI) / 2 * world })
const center = forward([135.001, 35.001])
const raw = { z: 16, x: Math.floor(center.x / 256), y: Math.floor(center.y / 256) }
const local = coordinates => coordinates.map(([lon, lat]) => { const point = forward([lon, lat]); return { x: point.x - raw.x * 256, y: point.y - raw.y * 256 } })
const square = (west = 135.001, south = 35.001, size = .0001) => [[west, south], [west + size, south], [west + size, south + size], [west, south + size], [west, south]]
const feature = (rings = [square()], number = '合成-1') => ({ id: 1, geomType: 3, props: { '地番': number, '座標系': '公共座標6系' }, geom: rings.map(local) })
const tile = (features = [feature()], displayZoom = 16) => ({ z: displayZoom, dataTile: raw, scale: 2 ** (displayZoom - 16), origin: { x: raw.x * 256 * 2 ** (displayZoom - 16), y: raw.y * 256 * 2 ** (displayZoom - 16) }, dim: 256 * 2 ** (displayZoom - 16), data: new Map([['fude', features]]) })
const bounds = { west: 135, south: 35, east: 135.01, north: 35.01 }
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`)

test('PreparedTile CSS pixels return WGS84 in lon/lat order at native and overzoom', () => {
  for (const zoom of [16, 17, 21]) {
    const result = publicParcelTilePoint(tile([], zoom), local([[135.002, 35.003]])[0])
    near(result[0], 135.002); near(result[1], 35.003)
  }
  assert.equal(publicParcelTilePoint(tile(), { x: NaN, y: 0 }), null)
  assert.equal(publicParcelTilePoint({ ...tile(), scale: 0 }, { x: 0, y: 0 }), null)
  assert.equal(publicParcelTilePoint({ ...tile(), origin: { x: 0, y: 0 } }, { x: 0, y: 0 }), null)
})

test('holes and disjoint exterior rings remain exact polygon topology', () => {
  const outer = square(135.001, 35.001, .001)
  const hole = square(135.0012, 35.0012, .0002).reverse()
  const second = square(135.004, 35.004, .0003)
  const geometry = publicParcelTileGeometry(tile(), feature([outer, hole, second]))
  assert.equal(geometry.type, 'MultiPolygon')
  assert.equal(geometry.coordinates.length, 2)
  assert.equal(geometry.coordinates[0].length, 2)
  assert.equal(pointInGeometry([135.0011, 35.0011], geometry), true)
  assert.equal(pointInGeometry([135.0013, 35.0013], geometry), false)
  assert.equal(pointInGeometry([135.0041, 35.0041], geometry), true)
  assert.equal(pointInGeometry([135.003, 35.003], geometry), false)
})

test('malformed, open, self-intersecting and arbitrary-coordinate rings are rejected', () => {
  assert.equal(publicParcelTileGeometry(tile(), feature([square().slice(0, -1)])), null)
  assert.equal(publicParcelTileGeometry(tile(), feature([[[135.001, 35.001], [135.002, 35.002], [135.001, 35.002], [135.002, 35.001], [135.001, 35.001]]])), null)
  const arbitrary = feature(); arbitrary.props['座標系'] = '任意座標系'
  assert.equal(publicParcelTileGeometry(tile(), arbitrary), null)
  const invalid = feature(); invalid.geom[0][1].x = Infinity
  assert.equal(publicParcelTileGeometry(tile(), invalid), null)
  const detachedHole = feature([square(), square(135.003, 35.003).reverse()])
  assert.equal(publicParcelTileGeometry(tile(), detachedHole), null)
})

test('a reused raw tile and identical polygons do not duplicate public labels', () => {
  const duplicate = feature([square().reverse()])
  const snapshot = buildPublicParcelTerrainSnapshot([tile([feature(), duplicate]), tile([feature(), duplicate], 19)], { bounds })
  assert.equal(snapshot.features.length, 1)
  assert.equal(snapshot.status, 'ready')
  const item = snapshot.features[0]
  assert.equal(item.role, 'public'); assert.equal(item.source.kind, 'public')
  assert.equal(item.info.number, '合成-1'); assert.equal(item.properties['地番'], '合成-1')
  assert.equal(item.source.geometryScope, 'viewport-tile-fragments')
  assert.equal(Object.hasOwn(item.info, 'area'), false)
})

test('same parcel text in separate places is not merged; absent numbers are not invented', () => {
  const snapshot = buildPublicParcelTerrainSnapshot([tile([feature(), feature([square(135.003, 35.003)]), feature([square(135.004, 35.004)], '')])], { bounds })
  assert.equal(snapshot.features.length, 3)
  assert.equal(snapshot.features[2].info.number, '')
  assert.equal(new Set(snapshot.features.map(item => item.id)).size, 3)
})

test('snapshot only includes geometry intersecting current viewport bounds', () => {
  const snapshot = buildPublicParcelTerrainSnapshot([tile([feature(), feature([square(135.1, 35.1)])])], { bounds })
  assert.equal(snapshot.features.length, 1)
  assert.equal(buildPublicParcelTerrainSnapshot([tile()], { bounds: { ...bounds, west: 136, east: 136.01 } }).features.length, 0)
  assert.equal(buildPublicParcelTerrainSnapshot([tile()], { bounds: { ...bounds, west: NaN } }).status, 'unavailable')
})

test('capacity truncation is explicit and output count is bounded', () => {
  const items = Array.from({ length: PUBLIC_PARCEL_TERRAIN_LIMITS.features + 5 }, (_, i) => feature([square(135.001 + i * .00002, 35.001, .00001)], `合成-${i}`))
  const snapshot = buildPublicParcelTerrainSnapshot([tile(items)], { bounds })
  assert.equal(snapshot.features.length, PUBLIC_PARCEL_TERRAIN_LIMITS.features)
  assert.equal(snapshot.truncated, true)
  assert.equal(snapshot.status, 'partial')
})

test('large or malformed features and incomplete tile responses are not reported complete', () => {
  const tooLarge = feature(); tooLarge.geom = [Array.from({ length: 1001 }, () => ({ x: 1, y: 1 }))]
  assert.equal(publicParcelTileGeometry(tile(), tooLarge), null)
  const snapshot = buildPublicParcelTerrainSnapshot([tile([feature(), tooLarge])], { bounds })
  assert.equal(snapshot.features.length, 1)
  assert.equal(snapshot.skippedFeatures, 1)
  assert.equal(snapshot.status, 'partial')
  assert.equal(buildPublicParcelTerrainSnapshot([tile()], { bounds, incomplete: true }).status, 'partial')
})

test('a cumulative inspection bound prevents arbitrarily large feature scans', () => {
  const items = Array.from({ length: PUBLIC_PARCEL_TERRAIN_LIMITS.inspectedFeatures + 1 }, () => ({ geomType: 1, props: {}, geom: [] }))
  const snapshot = buildPublicParcelTerrainSnapshot([tile(items)], { bounds })
  assert.equal(snapshot.truncated, true)
  assert.equal(snapshot.status, 'partial')
  assert.equal(snapshot.features.length, 0)
})

test('tile and total geometry limits are visible partial snapshots, never silent complete data', () => {
  const tiles = Array.from({ length: 33 }, (_, i) => ({ ...tile(), dataTile: { ...raw, x: raw.x + i }, origin: { x: (raw.x + i) * 256, y: raw.y * 256 } }))
  const tileLimited = buildPublicParcelTerrainSnapshot(tiles, { bounds: { west: 134.9, south: 34.9, east: 136, north: 35.1 } })
  assert.equal(tileLimited.features.length, 32)
  assert.equal(tileLimited.truncated, true)
  const many = Array.from({ length: 80 }, (_, i) => {
    const ring = Array.from({ length: 100 }, (_, j) => [135.001 + i * .00008 + .00001 * Math.cos(j * 2 * Math.PI / 100), 35.001 + .00001 * Math.sin(j * 2 * Math.PI / 100)])
    ring.push([...ring[0]])
    return feature([ring], `合成-${i}`)
  })
  const vertexLimited = buildPublicParcelTerrainSnapshot([tile(many)], { bounds })
  const count = vertexLimited.features.reduce((sum, item) => sum + item.geometry.coordinates[0].length, 0)
  assert.ok(count <= PUBLIC_PARCEL_TERRAIN_LIMITS.vertices)
  assert.equal(vertexLimited.features.length, 79)
  assert.equal(vertexLimited.status, 'partial')
})

test('untrusted source text remains data and no property besides the actual number is adopted', () => {
  const input = feature([square()], '<script>synthetic</script>')
  input.props.owner = 'SHOULD_NOT_BE_COPIED'
  input.props.area = 12345
  const result = buildPublicParcelTerrainSnapshot([tile([input])], { bounds }).features[0]
  assert.equal(result.info.number, '<script>synthetic</script>')
  assert.equal(Object.hasOwn(result.properties, 'owner'), false)
  assert.equal(Object.hasOwn(result.properties, 'area'), false)
  assert.equal(input.props.area, 12345)
})

test('candidate or viewport changes invalidate previous asynchronous results', async () => {
  const gate = createPublicParcelSnapshotGate()
  const previous = gate.begin()
  let resolvePrevious
  const pending = new Promise(resolve => { resolvePrevious = resolve }).then(() => gate.isCurrent(previous))
  const next = gate.begin()
  resolvePrevious()
  assert.equal(await pending, false)
  assert.equal(gate.isCurrent(next), true)
  gate.invalidate() // layer removed / map starts moving
  assert.equal(gate.isCurrent(next), false)
  assert.notEqual(publicParcelViewportKey(bounds, 16, 'candidate-a'), publicParcelViewportKey(bounds, 16, 'candidate-b'))
  assert.notEqual(publicParcelViewportKey(bounds, 16), publicParcelViewportKey({ ...bounds, west: 135.0001 }, 16))
})
