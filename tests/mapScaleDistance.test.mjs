import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roundMapScaleDistance } from '../src/utils/mapScaleDistance.js'

test('15 metre tick appears only when its full distance fits', () => {
  assert.equal(roundMapScaleDistance(14.999999), 10)
  assert.equal(roundMapScaleDistance(15), 15)
  assert.equal(roundMapScaleDistance(19.999999), 15)
  assert.equal(roundMapScaleDistance(20), 20)
})

test('the largest available tick is chosen across the whole step family', () => {
  for (const [maximum, expected] of [[1.1, 1], [1.5, 1.5], [2.9, 2], [4.9, 3], [9.9, 5], [10, 10], [29.9, 20], [30, 30], [49.9, 30], [50, 50]]) {
    const distance = roundMapScaleDistance(maximum)
    assert.equal(distance, expected)
    assert.ok(distance <= maximum)
  }
})

test('small distances stay positive and never exceed the available width', () => {
  for (const [maximum, expected] of [[0.015, 0.015], [0.0000017, 0.0000015], [Number.MIN_VALUE, Number.MIN_VALUE]]) {
    const distance = roundMapScaleDistance(maximum)
    assert.equal(distance, expected)
    assert.ok(distance > 0 && distance <= maximum)
  }
})

test('kilometre and very large distances preserve the same metre-valued steps', () => {
  for (const [maximum, expected] of [[1499, 1000], [1500, 1500], [5800, 5000], [1500000, 1500000], [1e308, 1e308], [Number.MAX_VALUE, 1.5e308]]) {
    const distance = roundMapScaleDistance(maximum)
    assert.equal(distance, expected)
    assert.ok(Number.isFinite(distance) && distance <= maximum)
  }
})

test('invalid and non-positive distances do not produce a misleading scale', () => {
  for (const value of [0, -1, NaN, Infinity, -Infinity, '15', null, undefined]) assert.equal(roundMapScaleDistance(value), 0)
})
