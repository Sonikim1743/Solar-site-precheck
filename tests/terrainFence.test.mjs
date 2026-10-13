import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTerrainFence } from '../src/utils/terrainFence.js'

const square = (x1 = 5, y1 = 5, x2 = 35, y2 = 35) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]
function fixture(boundary = [[square(0, 0, 50, 50)]], elevation = (x, y) => 100 + x / 5 + y / 10) {
  const width = 11, height = 11, step = 5
  return { grid: { width, height, step, xMin: 0, yMin: 0, boundary,
    elevations: Array.from({ length: width * height }, (_, i) => elevation((i % width) * step, Math.floor(i / width) * step)) } }
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const rack = (footprint = square(6, 6, 34, 34)) => ({ id: 'synthetic-rack', footprint })
const fence = (analysis, options = {}) => buildTerrainFence(analysis, { racks: [rack()], ...options })
const points = result => [...result.posts.map(post => post.base), ...result.rails.flatMap(rail => rail.points)]
const bounds = result => ({ west: Math.min(...points(result).map(point => point[0])), east: Math.max(...points(result).map(point => point[0])),
  south: Math.min(...points(result).map(point => point[1])), north: Math.max(...points(result).map(point => point[1])) })
const close = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)

test('reference fence encloses active racks with a metre margin, real sloped DEM and 1.2m height', () => {
  const result = fence(fixture())
  assert.equal(result.heightM, 1.2)
  assert.equal(result.truncated, false)
  assert.equal(result.posts.length, 12)
  assert.equal(result.rails.length, 1)
  assert.deepEqual(bounds(result), { west: 5, east: 35, south: 5, north: 35 }, 'the fence follows rack extent plus 1m, not the 0–50m terrain perimeter')
  const points = result.rails[0].points
  assert.deepEqual(points[0], points.at(-1))
  for (const post of result.posts) {
    assert.equal(post.base[2], 100 + post.base[0] / 5 + post.base[1] / 10)
    assert.ok(Math.abs(post.top[2] - post.base[2] - 1.2) < 1e-10)
  }
  for (const point of points) assert.ok(Math.abs(point[2] - (101.2 + point[0] / 5 + point[1] / 10)) < 1e-10)
  for (let i = 0; i < result.posts.length; i++) assert.ok(distance(result.posts[i].base, result.posts[(i + 1) % result.posts.length].base) <= 10)
})

test('one overall rack hull is clipped to valid land, with no additional fences around internal holes', () => {
  const result = fence(fixture([[square(), square(15, 15, 25, 25)], [square(40, 5, 45, 10)]]), {
    racks: [rack(), rack(square(41, 6, 44, 9))],
  })
  assert.equal(result.rails.length, 2)
  for (const rail of result.rails) assert.deepEqual(rail.points[0], rail.points.at(-1))
  assert.ok(result.posts.every(({ base: [x, y] }) => !(x >= 15 && x <= 25 && y >= 15 && y <= 25)))
  assert.ok(points(result).every(([x, y]) => (x >= 5 && x <= 35 && y >= 5 && y <= 35) || (x >= 40 && x <= 45 && y >= 5 && y <= 10)))
})

test('missing DEM cells split rails and omit posts without bridging or replacing missing heights', () => {
  const analysis = fixture(undefined, (x, y) => x === 20 && y === 5 ? null : 0)
  const result = fence(analysis)
  assert.equal(result.truncated, false)
  assert.ok(result.posts.length < 12)
  assert.ok(result.posts.length > 0)
  assert.ok(result.rails.length >= 2)
  assert.ok(result.posts.every(post => post.base[2] === 0 && post.top[2] === 1.2))
  for (const rail of result.rails) for (let i = 1; i < rail.points.length; i++) {
    const [a, b] = [rail.points[i - 1], rail.points[i]]
    assert.ok(!(a[1] === 5 && b[1] === 5 && Math.min(a[0], b[0]) < 20 && Math.max(a[0], b[0]) > 15))
  }
  const missing = fence(fixture(undefined, () => null))
  assert.deepEqual(missing.posts, [])
  assert.deepEqual(missing.rails, [])
})

test('post spacing cannot exceed ten metres and output/work caps report truncation', () => {
  const wideSpacing = fence(fixture(), { postSpacingM: 100 })
  assert.equal(wideSpacing.posts.length, 12)
  const result = fence(fixture(), { maxPosts: 3, maxPoints: 7 })
  assert.equal(result.posts.length, 3)
  assert.ok(result.rails.reduce((sum, rail) => sum + rail.points.length, 0) <= 7)
  assert.equal(result.truncated, true)
  const tinySpacing = fence(fixture(), { postSpacingM: Number.MIN_VALUE })
  assert.equal(tinySpacing.truncated, true)
  assert.ok(tinySpacing.posts.length <= 300)
  assert.ok(tinySpacing.rails.reduce((sum, rail) => sum + rail.points.length, 0) <= 3000)
})

test('invalid geometry and grids produce no fabricated coordinates, while input stays unchanged', () => {
  const analysis = fixture([[square()], [[[5, 5], [Infinity, 5], [15, 15], [5, 5]]]])
  const original = structuredClone(analysis)
  const result = fence(analysis)
  assert.equal(result.rails.length, 1)
  assert.ok(result.posts.flatMap(post => [...post.base, ...post.top]).every(Number.isFinite))
  assert.deepEqual(analysis, original)
  assert.deepEqual(buildTerrainFence(null), { posts: [], rails: [], truncated: false, heightM: 1.2 })
  assert.equal(fence({ grid: { ...analysis.grid, step: 0 } }).rails.length, 0)
  const oversized = fixture([[Array.from({ length: 10001 }, () => [5, 5])]])
  assert.equal(fence(oversized).truncated, true)
  assert.equal(fence(fixture(), { racks: [rack([[5, 5], [Infinity, 5], [15, 15], [5, 5]])] }).rails.length, 0)
  assert.equal(fence(fixture(), { racks: [rack(Array.from({ length: 10001 }, () => [5, 5]))] }).truncated, true)
})

test('options reject non-finite heights, invalid spacing and invalid capacity instead of inventing values', () => {
  for (const options of [{ heightM: NaN }, { heightM: 0 }, { postSpacingM: -1 }, { maxPosts: 1.5 }, { maxPoints: Infinity }, { marginM: -1 }, { marginM: NaN }]) {
    assert.throws(() => fence(fixture(), options), RangeError)
  }
  const result = fence(fixture(), { heightM: 2 })
  assert.equal(result.heightM, 2)
  assert.ok(result.posts.every(post => post.top[2] - post.base[2] === 2))
})

test('the shared enclosure shrinks when an extreme active rack is removed and ignores disabled candidates', () => {
  const analysis = fixture(), first = rack(square(6, 6, 16, 16)), last = rack(square(30, 30, 40, 40))
  const initial = fence(analysis, { racks: [first, last] })
  assert.equal(initial.rails.length, 1, 'all active rows are enclosed together rather than fencing each rack')
  assert.deepEqual(bounds(initial), { west: 5, east: 41, south: 5, north: 41 })
  const reduced = fence(analysis, { racks: [first], disabledRacks: [last] })
  assert.deepEqual(bounds(reduced), { west: 5, east: 17, south: 5, north: 17 })
  const restored = fence(analysis, { racks: [first, last] })
  assert.deepEqual(restored, initial)
})

test('zero active racks produce no imaginary terrain-boundary fence', () => {
  const analysis = fixture()
  for (const options of [{}, { racks: [] }, { racks: [], disabledRacks: [rack()] }, { disabledRacks: [rack()] }]) {
    assert.deepEqual(buildTerrainFence(analysis, options), { posts: [], rails: [], truncated: false, heightM: 1.2 })
  }
})

test('a rotated rack receives an actual oriented metre offset, without an axis-aligned rectangle fallback', () => {
  const angle = Math.PI / 6, c = Math.cos(angle), s = Math.sin(angle)
  const footprint = square(-6, -3, 6, 3).map(([x, y]) => [25 + x * c - y * s, 25 + x * s + y * c])
  const result = fence(fixture(), { racks: [rack(footprint)], marginM: 1 })
  assert.equal(result.rails.length, 1)
  for (const [x, y] of points(result)) {
    const u = (x - 25) * c + (y - 25) * s, v = -(x - 25) * s + (y - 25) * c
    assert.ok(Math.abs(u) <= 7 + 1e-8 && Math.abs(v) <= 4 + 1e-8)
    assert.ok(Math.abs(Math.abs(u) - 7) < 1e-8 || Math.abs(Math.abs(v) - 4) < 1e-8)
  }
  const world = bounds(result)
  close(world.west, 25 - 7 * c - 4 * s)
  close(world.east, 25 + 7 * c + 4 * s)
  const zeroMargin = fence(fixture(), { racks: [rack(footprint)], marginM: 0 })
  assert.ok(bounds(zeroMargin).east < world.east)
})

test('buffering clips at valid land and excluded slots rather than crossing beyond them', () => {
  const notch = square(23, 5, 27, 15), analysis = fixture([[square(5, 5, 35, 35), notch]])
  const result = fence(analysis, { racks: [rack(square(6, 6, 34, 34))], marginM: 4 })
  assert.equal(result.rails.length, 1)
  for (const rail of result.rails) for (let i = 1; i < rail.points.length; i++) {
    const a = rail.points[i - 1], b = rail.points[i]
    const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2
    assert.ok(x >= 5 && x <= 35 && y >= 5 && y <= 35)
    assert.ok(!(x > 23 && x < 27 && y > 5 && y < 15))
  }
})

test('building the rack hull and clipping it never mutates analysis or the active selection', () => {
  const analysis = fixture(), racks = [rack(square(6, 6, 16, 16)), rack(square(30, 30, 40, 40))]
  const original = structuredClone({ analysis, racks })
  Object.freeze(racks)
  fence(analysis, { racks, marginM: 2 })
  assert.deepEqual({ analysis, racks }, original)
})
