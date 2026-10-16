import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMapReset } from '../src/utils/mapReset.js'

test('rapid reset clicks clear selection once, then reset only the viewport', () => {
  const reset = createMapReset()
  assert.equal(reset.stage, 'selection')
  assert.equal(reset.next(), 'selection')
  assert.equal(reset.stage, 'view')
  assert.equal(reset.next(), 'view')
  assert.equal(reset.next(), 'view')
})

test('a new candidate or geometry selection rearms selection clearing immediately', () => {
  const reset = createMapReset()
  reset.next()
  reset.selected()
  assert.equal(reset.stage, 'selection')
  assert.equal(reset.next(), 'selection')
  assert.equal(reset.next(), 'view')
  reset.selected()
  reset.selected()
  assert.equal(reset.next(), 'selection')
})
