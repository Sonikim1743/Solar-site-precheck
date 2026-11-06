import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyParcelReview, setReviewParcel, measureParcelReview } from '../src/utils/parcelReview.js'
import { MAP_PARCEL_SOURCE } from '../src/utils/mapParcelSelection.js'
import { validatePolygonGeometry, pointInGeometry, featureInteriorPoint, measureGeometryReview } from '../src/services/parcelGeometry.js'
import { createTerrainPlan, terrainGeometryKey } from '../src/utils/terrainArea.js'

// Anonymous renderer-grid fixture, not a candidate's coordinates or records.
const ll = ([x, y]) => {
  const world = 256 * 2 ** 16
  return [(57344 * 256 + x) / world * 360 - 180,
    Math.atan(Math.sinh(Math.PI * (1 - 2 * (25900 * 256 + y) / world))) * 180 / Math.PI]
}
const shape = (outer, ...holes) => ({ type: 'Polygon', coordinates: [outer, ...holes].map(r => r.map(ll)) })
const ring = (x, y, w, h = w) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]
const a = shape([[10, 10], [100, 10], [100, 80], [10, 100], [10, 10]])
// Buffered tile fragments introduce an additional vertex on one shared edge.
// Projecting the parcels separately bends that shared edge differently and
// creates a near-zero-width hole touching the exterior at its endpoint.
const b = shape([[10, 100], [55, 90], [55, 89.9], [100, 80], [100, 180], [10, 180], [10, 100]])
const reviewOf = (geometries, source = MAP_PARCEL_SOURCE) => geometries.reduce((review, geometry, i) =>
  setReviewParcel(review, { type: 'Feature', id: String(i), properties: { 地番: `合成-${i}` }, geometry }, 'target',
    { fileName: source, importedAt: '2026-11-06T00:00:00.000Z' }), createEmptyParcelReview())

test('map targets with a split shared edge apply as one valid terrain scope in either order', () => {
  const review = reviewOf([a, b]), before = structuredClone(review)
  const result = measureParcelReview(review)
  validatePolygonGeometry(result.geometry)
  assert.equal(result.geometry.type, 'Polygon')
  assert.equal(result.geometry.coordinates.length, 1, 'no artificial hole at the shared edge')
  assert.equal(result.targetCount, 2)
  assert.ok(result.usableAreaM2 > 0)
  const plan = createTerrainPlan(result.geometry)
  assert.equal(plan.geometryKey, terrainGeometryKey(result.geometry))
  assert.ok(plan.grid.inside.some(Boolean))
  assert.ok(featureInteriorPoint({ geometry: result.geometry }))
  assert.equal(terrainGeometryKey(measureParcelReview(reviewOf([b, a])).geometry), plan.geometryKey)
  assert.deepEqual(review, before, 'source parcels and stored review are not rewritten')
})

test('real holes, detached parts and gaps survive map union and terrain planning', () => {
  const left = { ...a, coordinates: [...a.coordinates, ring(20, 30, 20).map(ll)] }
  const detached = shape(ring(170, 30, 20, 50))
  const geometries = [left, b, detached]
  assert.throws(() => validatePolygonGeometry(measureGeometryReview(geometries, null, []).geometry),
    { code: 'HOLE_OUTSIDE_OR_TOUCHING' }, 'exercise the retry with both a real hole and a projection sliver')
  const result = measureParcelReview(reviewOf(geometries))
  validatePolygonGeometry(result.geometry)
  assert.equal(result.geometry.type, 'MultiPolygon')
  assert.equal(result.geometry.coordinates.length, 2)
  assert.equal(result.geometry.coordinates.filter(p => p.length === 2).length, 1)
  for (const [p, expected] of [[[30, 40], false], [[60, 40], true], [[80, 120], true], [[150, 40], false], [[180, 40], true]]) {
    assert.equal(pointInGeometry(ll(p), result.geometry), expected)
  }
  assert.ok(createTerrainPlan(result.geometry).grid.inside.some(Boolean))
})

test('map union still applies detailed boundaries and exclusions, preserving original data', () => {
  const review = reviewOf([a, b])
  review.boundary = shape(ring(0, 0, 120, 140))
  review.exclusions = [shape(ring(30, 30, 20))]
  const before = structuredClone(review), result = measureParcelReview(review)
  validatePolygonGeometry(result.geometry)
  assert.equal(pointInGeometry(ll([40, 40]), result.geometry), false)
  assert.equal(pointInGeometry(ll([50, 160]), result.geometry), false)
  assert.equal(pointInGeometry(ll([70, 60]), result.geometry), true)
  assert.ok(Math.abs(result.reviewAreaM2 - result.excludedAreaM2 - result.usableAreaM2) < 1e-6)
  assert.deepEqual(review, before)
})

test('invalid input holes still fail validation; map union does not repair them', () => {
  assert.throws(() => reviewOf([shape(ring(10, 10, 100), ring(10, 30, 20))]), /中抜き/)
})

test('previously valid map output keeps the exact geometry, area and terrain identity', () => {
  const geometries = [shape(ring(10, 10, 80)), shape(ring(60, 20, 80))]
  const previous = measureGeometryReview(geometries, null, [])
  validatePolygonGeometry(previous.geometry)
  const next = measureParcelReview(reviewOf(geometries))
  assert.deepEqual(next, { ...previous, targetCount: 2, referenceCount: 0 })
  assert.equal(terrainGeometryKey(next.geometry), terrainGeometryKey(previous.geometry))
  const imported = measureParcelReview(reviewOf(geometries, '合成原本.geojson'))
  assert.deepEqual(imported, next)
})
