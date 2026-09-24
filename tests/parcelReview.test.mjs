import assert from 'node:assert/strict'
import { test } from 'node:test'
import proj4 from 'proj4'
import { createEmptyParcelReview, normalizeParcelReview, setReviewParcel, removeReviewParcel, getParcelKey, measureParcelReview, MAX_REVIEW_VERTICES, MAX_PARCEL_REVIEW_BYTES } from '../src/utils/parcelReview.js'
import { pointInGeometry } from '../src/services/parcelGeometry.js'

const projection = proj4('EPSG:4326', '+proj=laea +lat_0=35 +lon_0=135 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs')
const ring = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]].map(p => projection.inverse(p))
const polygon = (x = 0, y = 0, w = 100, h = 100) => ({ type: 'Polygon', coordinates: [ring(x, y, w, h)] })
const feature = (id = '1', geometry = polygon()) => ({ type: 'Feature', id, properties: { 地番: '741', 市町村名: '庄原市', owner: 'not retained' }, geometry })
const source = fileName => ({ fileName, importedAt: '2026-09-24T01:00:00.000Z' })
const add = (review, id, geometry = polygon(), role = 'target', file = 'A.geojson') => setReviewParcel(review, feature(id, geometry), role, source(file))
// proj4's ellipsoidal inverse used to construct fixtures has sub-millimetre
// round-trip error; 0.1 m² on a hectare is tighter than map input accuracy.
const close = (actual, expected, tolerance = .1) => assert.ok(Math.abs(actual - expected) < tolerance, actual + ' versus ' + expected)

test('empty/reference-only reviews have no implicit land area', () => {
  assert.deepEqual(normalizeParcelReview(null), createEmptyParcelReview())
  let review = createEmptyParcelReview()
  assert.deepEqual(measureParcelReview(review), { targetAreaM2: 0, reviewAreaM2: 0, excludedAreaM2: 0, usableAreaM2: 0, geometry: null, targetCount: 0, referenceCount: 0 })
  review = add(review, 'reference', polygon(), 'reference')
  const result = measureParcelReview(review)
  assert.equal(result.usableAreaM2, 0)
  assert.equal(result.referenceCount, 1)
  assert.equal(result.geometry, null)
})

test('WGS84 equal-area projected 100m square measures 10000 m²', () => {
  const result = measureParcelReview(add(null, '1'))
  close(result.targetAreaM2, 10000)
  close(result.reviewAreaM2, 10000)
  close(result.usableAreaM2, 10000)
})

test('target union avoids duplicate and overlapping parcel area; references do not count', () => {
  let review = add(null, '1')
  review = add(review, '2', polygon(50, 0))
  review = add(review, '3', polygon(0, 0))
  review = add(review, 'reference', polygon(0, 0, 200, 200), 'reference')
  const result = measureParcelReview(review)
  close(result.targetAreaM2, 15000)
  close(result.usableAreaM2, 15000)
  assert.equal(result.targetCount, 3)
  assert.equal(result.referenceCount, 1)
})

test('boundary intersects targets and overlapping exclusions are counted only once', () => {
  let review = add(add(null, '1'), '2', polygon(50, 0))
  review = { ...review, boundary: polygon(25, -50, 100, 200), exclusions: [polygon(0, 0, 50, 100), polygon(0, 0, 50, 100), polygon(250, 250)] }
  const result = measureParcelReview(review)
  close(result.targetAreaM2, 15000)
  close(result.reviewAreaM2, 10000)
  close(result.excludedAreaM2, 2500)
  close(result.usableAreaM2, 7500)
  close(result.reviewAreaM2, result.excludedAreaM2 + result.usableAreaM2, .0001)
  const point = projection.inverse([40, 50])
  assert.equal(pointInGeometry(point, result.geometry), false)
})

test('a boundary alone defines the review; out-of-bounds exclusions do not subtract', () => {
  const review = { ...createEmptyParcelReview(), boundary: polygon(), exclusions: [polygon(250, 250)] }
  const result = measureParcelReview(review)
  assert.equal(result.targetAreaM2, 0)
  close(result.reviewAreaM2, 10000)
  assert.equal(result.excludedAreaM2, 0)
  close(result.usableAreaM2, 10000)
})

test('disjoint boundary or fully excluded review produces null final geometry', () => {
  const review = add(null, '1')
  const disjoint = measureParcelReview({ ...review, boundary: polygon(300, 300) })
  assert.equal(disjoint.reviewAreaM2, 0)
  assert.equal(disjoint.geometry, null)
  const excluded = measureParcelReview({ ...review, exclusions: [polygon(-10, -10, 120, 120)] })
  close(excluded.excludedAreaM2, 10000)
  assert.equal(excluded.usableAreaM2, 0)
  assert.equal(excluded.geometry, null)
})

test('courtyards and multipart parcels retain gaps and subtract holes', () => {
  const courtyard = { type: 'Polygon', coordinates: [ring(0, 0, 200, 200), ring(50, 50, 100, 100)] }
  const result = measureParcelReview(add(null, '1', courtyard))
  close(result.targetAreaM2, 30000)
  assert.equal(pointInGeometry(projection.inverse([100, 100]), result.geometry), false)
  const multi = { type: 'MultiPolygon', coordinates: [polygon().coordinates, polygon(300, 0).coordinates] }
  const parts = measureParcelReview(add(null, '1', multi))
  close(parts.targetAreaM2, 20000)
  assert.equal(parts.geometry.type, 'MultiPolygon')
  assert.equal(pointInGeometry(projection.inverse([200, 50]), parts.geometry), false)
})

test('same feature id in different source files stays separate; role edits are immutable', () => {
  const first = add(null, '1', polygon(), 'target', 'A.geojson')
  const original = JSON.stringify(first)
  let changed = add(first, '1', polygon(200, 0), 'reference', 'B.geojson')
  assert.equal(changed.parcels.length, 2)
  assert.notEqual(changed.parcels[0].id, changed.parcels[1].id)
  changed = add(changed, '1', polygon(), 'reference', 'A.geojson')
  assert.equal(changed.parcels.length, 2)
  assert.equal(changed.parcels[0].role, 'reference')
  assert.equal(JSON.stringify(first), original)
  assert.equal(removeReviewParcel(changed, changed.parcels[0].id).parcels.length, 1)
  assert.notEqual(getParcelKey(feature('a|b'), 'c'), getParcelKey(feature('b'), 'c|a'))
})

test('missing source ids use stable geometry identities', () => {
  const one = feature(undefined)
  delete one.id
  const two = feature(undefined, polygon(200, 0))
  delete two.id
  assert.equal(getParcelKey(one, 'A'), getParcelKey(structuredClone(one), 'A'))
  assert.notEqual(getParcelKey(one, 'A'), getParcelKey(two, 'A'))
  assert.notEqual(getParcelKey(one, 'A'), getParcelKey(one, 'B'))
})

test('saved data reopens as a detached snapshot and drops unused private properties', () => {
  const original = add(null, '1')
  const restored = normalizeParcelReview(JSON.parse(JSON.stringify(original)))
  assert.deepEqual(restored, original)
  assert.equal('owner' in restored.parcels[0].info, false)
  restored.parcels[0].geometry.coordinates[0][0][0] = 1
  assert.notEqual(original.parcels[0].geometry.coordinates[0][0][0], 1)
})

test('final multipart output above the per-parcel vertex cap can still verify its calculation point', () => {
  let review = createEmptyParcelReview()
  for (let p = 0; p < 15; p++) {
    const points = Array.from({ length: 150 }, (_, i) => projection.inverse([p * 250 + 100 * Math.cos(i * 2 * Math.PI / 150), 100 * Math.sin(i * 2 * Math.PI / 150)]))
    points.push(points[0])
    review = add(review, String(p), { type: 'Polygon', coordinates: [points] })
  }
  const result = measureParcelReview(review)
  assert.ok(result.geometry.coordinates.flat(2).length > 2000)
  assert.equal(pointInGeometry(projection.inverse([0, 0]), result.geometry), true)
  assert.equal(pointInGeometry(projection.inverse([125, 0]), result.geometry), false)
})

test('invalid roles, dates, forged keys, duplicate ids and unsupported shapes reject', () => {
  const original = add(null, '1')
  for (const mutate of [
    r => { r.version = 2 },
    r => { r.parcels[0].role = 'unknown' },
    r => { r.parcels[0].source.importedAt = '2026-02-31T00:00:00.000Z' },
    r => { r.parcels[0].source.fileName = 'forged' },
    r => { r.parcels.push(structuredClone(r.parcels[0])) },
    r => { r.boundary = { type: 'MultiPolygon', coordinates: [polygon().coordinates] } },
    r => { r.exclusions = [{ type: 'MultiPolygon', coordinates: [polygon().coordinates] }] },
    r => { r.parcels[0].geometry.coordinates[0][1][0] = NaN },
  ]) {
    const invalid = structuredClone(original); mutate(invalid)
    assert.throws(() => normalizeParcelReview(invalid))
  }
})

test('selection, global vertices, extent and saved-size limits reject instead of truncating', () => {
  const original = add(null, '1')
  const parcel = original.parcels[0]
  const count = { ...original, parcels: Array.from({ length: 101 }, (_, i) => ({ ...parcel, id: JSON.stringify(['A.geojson', 'id', String(i)]), info: { ...parcel.info, id: String(i) } })) }
  assert.throws(() => normalizeParcelReview(count), /100/)
  const n = 101
  const circle = Array.from({ length: n - 1 }, (_, i) => projection.inverse([100 * Math.cos(i * 2 * Math.PI / (n - 1)), 100 * Math.sin(i * 2 * Math.PI / (n - 1))]))
  circle.push(circle[0])
  const many = { ...original, parcels: Array.from({ length: 100 }, (_, i) => ({ ...parcel, id: JSON.stringify(['A.geojson', 'id', String(i)]), info: { ...parcel.info, id: String(i) }, geometry: { type: 'Polygon', coordinates: [circle] } })) }
  assert.ok(n * many.parcels.length > MAX_REVIEW_VERTICES)
  assert.throws(() => normalizeParcelReview(many), /10,000/)
  assert.throws(() => normalizeParcelReview({ ...original, payload: 'x'.repeat(MAX_PARCEL_REVIEW_BYTES) }), /1MiB/)
  const far = polygon(); far.coordinates = far.coordinates.map(r => r.map(([x, y]) => [x + 3, y]))
  assert.throws(() => add(original, '2', far), /2度/)
  assert.throws(() => normalizeParcelReview({ ...original, exclusions: Array(51).fill(polygon()) }), /50/)
})
