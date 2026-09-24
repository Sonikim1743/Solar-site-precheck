import test from 'node:test'
import assert from 'node:assert/strict'
import { endpointSlope, profilePointRuns, slopeSegments, steepestSegment } from '../src/utils/terrainProfile.js'

const point = (distance, elevation) => ({ distance, elevation })
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)

test('endpoint average expresses degrees, percent and signed height per horizontal 10m', () => {
  const rising = endpointSlope({ rangeMeters: 50, points: [point(-50, 100), point(0, 120), point(50, 110)] })
  close(rising.slopePercent, 10)
  close(rising.angle, Math.atan(.1) * 180 / Math.PI)
  close(rising.heightPer10Meters, 1)
  assert.equal(rising.distance, 100)
  const falling = endpointSlope({ rangeMeters: 50, points: [point(-50, 110), point(50, 100)] })
  close(falling.slopePercent, 10)
  close(falling.heightPer10Meters, -1)
})

test('missing observations break both slope segments and plotted runs', () => {
  const points = [point(-20, 0), point(-10, 1), point(0, null), point(10, 100), point(20, 102)]
  const line = { rangeMeters: 20, points }
  assert.deepEqual(slopeSegments(line).map(segment => [segment.start.distance, segment.end.distance]), [[-20, -10], [10, 20]])
  assert.deepEqual(profilePointRuns(points).map(run => run.map(row => row.distance)), [[-20, -10], [10, 20]])
  assert.equal(steepestSegment(line).slopePercent, 20)
  assert.equal(steepestSegment(line).distance, 10)
  assert.equal(endpointSlope(line).elevationDelta, 102)
})

test('missing range endpoints cannot be replaced by internal observations or cached summary', () => {
  const summary = { averageSlopePercent: 10, elevationDiff: 20 }
  assert.equal(endpointSlope({ rangeMeters: 20, points: [point(-20, null), point(-10, 1), point(20, 4)], summary }), null)
  assert.equal(endpointSlope({ rangeMeters: 20, points: [point(-20, 1), point(10, 4), point(20, null)], summary }), null)
  assert.equal(endpointSlope({ rangeMeters: 20, points: [point(-10, 1), point(20, 4)], summary }), null)
  assert.equal(endpointSlope({ points: [point(0, 10)] }), null)
})

test('irregularly spaced adjacent observations retain their actual horizontal distance', () => {
  const segment = steepestSegment({ intervalMeters: 10, points: [point(-15, 0), point(5, 4), point(40, 5)] })
  assert.equal(segment.distance, 20)
  assert.equal(segment.slopePercent, 20)
  assert.equal(segment.elevationDelta, 4)
})

test('invalid, duplicate or reversed points are not connected into steepness measurements', () => {
  assert.deepEqual(slopeSegments({ points: [point(0, 1), point(0, 5), point(-10, 6)] }), [])
  assert.deepEqual(slopeSegments({ points: [point(-10, 1), point(NaN, 100), point(10, 2)] }), [])
  assert.deepEqual(slopeSegments({ points: [point(-10, 1), { ...point(0, 100), missing: true }, point(10, 2)] }), [])
  assert.equal(steepestSegment({ points: [point(-10, null), point(0, 1), point(10, null)] }), null)
})

test('equal endpoints are zero average despite intermediate terrain relief', () => {
  const line = { rangeMeters: 10, points: [point(-10, 5), point(0, 15), point(10, 5)] }
  assert.equal(endpointSlope(line).elevationDelta, 0)
  assert.equal(endpointSlope(line).slopePercent, 0)
  assert.equal(endpointSlope(line).heightPer10Meters, 0)
  assert.equal(steepestSegment(line).slopePercent, 100)
})
