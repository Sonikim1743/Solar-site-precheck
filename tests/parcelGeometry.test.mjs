import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validatePolygonGeometry, featureInteriorPoint, pointInGeometry, MAX_GEOMETRY_VERTICES } from '../src/services/parcelGeometry.js'

const ring = (x = 135, y = 35, w = .002, h = .002) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]
const polygon = (...rings) => ({ type: 'Polygon', coordinates: rings })
const feature = geometry => ({ type: 'Feature', properties: {}, geometry })

test('closed polygons and either winding survive without mutating input', () => {
  const input = polygon(ring())
  const result = validatePolygonGeometry(input)
  assert.deepEqual(result, input)
  result.coordinates[0][0][0] = 1
  assert.equal(input.coordinates[0][0][0], 135)
  assert.doesNotThrow(() => validatePolygonGeometry(polygon(ring().reverse())))
})

test('courtyard is excluded and the generated point is strictly inside usable land', () => {
  const geometry = polygon(ring(), ring(135.0005, 35.0005, .001, .001))
  assert.equal(pointInGeometry({ lon: 135.001, lat: 35.001 }, geometry), false)
  assert.equal(pointInGeometry([135.0002, 35.001], geometry), true)
  assert.equal(pointInGeometry([135, 35], geometry), true)
  assert.equal(pointInGeometry([135.0005, 35.001], geometry), true)
  const point = featureInteriorPoint(feature(geometry))
  assert.ok(point)
  assert.equal(pointInGeometry(point, geometry), true)
  assert.equal(pointInGeometry(point, polygon(geometry.coordinates[1])), false)
})

test('concave U parcel gets an interior point instead of its empty bounds centre', () => {
  const geometry = polygon([[135, 35], [135.003, 35], [135.003, 35.003], [135.002, 35.003], [135.002, 35.001], [135.001, 35.001], [135.001, 35.003], [135, 35.003], [135, 35]])
  assert.equal(pointInGeometry([135.0015, 35.0015], geometry), false)
  const point = featureInteriorPoint(feature(geometry))
  assert.ok(pointInGeometry(point, geometry))
})

test('multipart interior point lies in a real component, never in the gap', () => {
  const geometry = { type: 'MultiPolygon', coordinates: [[ring(135, 35)], [ring(135.01, 35)]] }
  assert.equal(pointInGeometry([135.006, 35.001], geometry), false)
  assert.ok(pointInGeometry(featureInteriorPoint(feature(geometry)), geometry))
})

test('malformed coordinates, nonfinite/3-D values and excessive span fail closed', () => {
  const invalid = [
    null, {}, { type: 'Point', coordinates: [135, 35] }, polygon(),
    polygon([]), polygon([[135, 35], [136, 35], [136, 36]]),
    polygon([[135, 35], ['136', 35], [136, 36], [135, 35]]),
    polygon([[135, 35], [Infinity, 35], [136, 36], [135, 35]]),
    polygon([[135, 35, 0], [136, 35], [136, 36], [135, 35, 0]]),
    polygon(ring(179, 35, 3, .01)), polygon(ring(135, 86)), polygon(ring(0, 0)),
    polygon(ring(119.99, 35)), polygon(ring(135, 19.99)),
    polygon(ring(135, 35, 2.01, .01)),
  ]
  for (const geometry of invalid) {
    assert.throws(() => validatePolygonGeometry(geometry))
    assert.equal(featureInteriorPoint(feature(geometry)), null)
    assert.equal(pointInGeometry([135, 35], geometry), false)
  }
  assert.equal(pointInGeometry({ lon: NaN, lat: 35 }, polygon(ring())), false)
})

test('unclosed, degenerate, crossing and retraced rings are rejected', () => {
  const invalid = [
    [...ring().slice(0, -1), [135.0001, 35]],
    [[135, 35], [135.001, 35], [135.002, 35], [135, 35]],
    [[135, 35], [135.002, 35.002], [135, 35.002], [135.002, 35], [135, 35]],
    [[135, 35], [135.002, 35], [135.001, 35], [135.002, 35.002], [135, 35]],
    [[135, 35], [135.002, 35], [135.002, 35.002], [135.002, 35], [135, 35]],
  ]
  for (const badRing of invalid) assert.throws(() => validatePolygonGeometry(polygon(badRing)))
})

test('holes must be inside and cannot touch, overlap or nest', () => {
  const outer = ring()
  for (const holes of [
    [ring(135.003, 35.003, .0002, .0002)],
    [ring(135, 35.0005, .0005, .0005)],
    [ring(135.0003, 35.0003, .001, .001), ring(135.001, 35.001, .0005, .0005)],
    [ring(135.0003, 35.0003, .001, .001), ring(135.0005, 35.0005, .0002, .0002)],
  ]) assert.throws(() => validatePolygonGeometry(polygon(outer, ...holes)))
})

test('vertices and sparse rings are bounded before use', () => {
  const points = Array.from({ length: MAX_GEOMETRY_VERTICES }, (_, i) => [135 + .001 * Math.cos(i * Math.PI * 2 / MAX_GEOMETRY_VERTICES), 35 + .001 * Math.sin(i * Math.PI * 2 / MAX_GEOMETRY_VERTICES)])
  assert.throws(() => validatePolygonGeometry(polygon([...points, points[0]])), /2,000/)
  assert.throws(() => validatePolygonGeometry(polygon(new Array(4))))
})
