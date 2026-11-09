import assert from 'node:assert/strict'
import test from 'node:test'
import { focusVisiblePageHeading } from '../src/utils/pageFocus.js'
const heading = (hidden = false) => ({ closest: () => hidden, getClientRects: () => [1], focus() { this.focused = true } })
test('navigation skips the retained hidden solar workspace', () => {
  const hidden = heading(true), pdf = heading()
  focusVisiblePageHeading({ querySelectorAll: () => [hidden, pdf] }, class {})()
  assert.equal(hidden.focused, undefined)
  assert.equal(pdf.focused, true)
  assert.equal(pdf.tabIndex, -1)
})
test('lazy page focus waits for its heading and disconnects after focus', () => {
  let callback, disconnected = false, nodes = [heading(true)]
  class Observer { constructor(fn) { callback = fn } observe() {} disconnect() { disconnected = true } }
  const stop = focusVisiblePageHeading({ querySelectorAll: () => nodes, querySelector: () => ({}) }, Observer)
  const pdf = heading(); nodes.push(pdf); callback()
  assert.equal(pdf.focused, true); assert.equal(disconnected, true); stop()
})
test('cancelled page navigation removes the delayed focus observer', () => {
  let disconnected = false
  class Observer { observe() {} disconnect() { disconnected = true } }
  focusVisiblePageHeading({ querySelectorAll: () => [], querySelector: () => ({}) }, Observer)()
  assert.equal(disconnected, true)
})
