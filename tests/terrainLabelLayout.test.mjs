import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutTerrainLabels, terrainLabelBounds, TERRAIN_LABEL_LAYOUT_LIMITS } from '../src/utils/terrainLabelLayout.js'

const viewport = { left: 25, top: 35, right: 775, bottom: 430 }
const item = (id, screen = [400, 230]) => ({ id: `parcel-${id}`, number: String(id), screen, point: [id, 10, 123.4], role: 'target' })
function assertReadable(labels) {
  const boxes = labels.map(label => terrainLabelBounds(label.number, label.screen))
  for (const box of boxes) {
    assert.ok(box.left >= viewport.left && box.right <= viewport.right && box.top >= viewport.top && box.bottom <= viewport.bottom, 'glyph box stays in viewport')
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j], margin = TERRAIN_LABEL_LAYOUT_LIMITS.margin
    assert.ok(!(a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin), 'labels and their halos must not collide')
  }
}

test('dense equal anchors retain fifteen real numbers without overlapping and remain deterministic', () => {
  const input = Array.from({ length: 15 }, (_, i) => ({ ...item(i), number: `123-${i}` }))
  const output = layoutTerrainLabels(input)
  assert.equal(output.labels.length, 15)
  assert.equal(output.unplaced.length, 0)
  assertReadable(output.labels)
  assert.deepEqual(layoutTerrainLabels(input), output)
  assert.ok(output.labels.every(label => Math.hypot(label.screen[0] - label.anchorScreen[0], label.screen[1] - label.anchorScreen[1]) <= 140 + 1e-7))
})

test('thirty coincident ordinary numbers fit the bounded search and overflow is retained for a list', () => {
  const input = Array.from({ length: 35 }, (_, i) => item(i + 1))
  const output = layoutTerrainLabels(input)
  assert.equal(output.labels.length, 30)
  assert.equal(output.unplaced.length, 5)
  assert.deepEqual(output.unplaced.map(label => label.number), ['31', '32', '33', '34', '35'])
  assertReadable(output.labels)
})

test('edge labels move inward while preserving actual anchor and source XYZ for leader lines', () => {
  const input = [item(1, [25, 35]), item(2, [775, 430]), item(3, [26, 425])]
  const before = structuredClone(input)
  const output = layoutTerrainLabels(input)
  assert.equal(output.labels.length, 3)
  assertReadable(output.labels)
  for (let i = 0; i < output.labels.length; i++) {
    assert.equal(output.labels[i].displaced, true)
    assert.deepEqual(output.labels[i].anchorScreen, before[i].screen)
    assert.deepEqual(output.labels[i].point, before[i].point)
  }
  assert.deepEqual(input, before)
})

test('a clear first label stays at its actual position and duplicate ids do not erase other numbers', () => {
  const input = [{ ...item(1), id: 'same' }, { ...item(2), id: 'same' }]
  const output = layoutTerrainLabels(input)
  assert.equal(output.labels.length, 2)
  assert.deepEqual(output.labels[0].screen, input[0].screen)
  assert.equal(output.labels[0].displaced, false)
  assert.deepEqual(output.labels.map(label => label.number), ['1', '2'])
  assertReadable(output.labels)
})

test('overwide or distant labels remain unplaced with complete actual numbers', () => {
  const long = { ...item(1), number: '実際の長い地番'.repeat(100) }, distant = item(2, [10000, 10000])
  const output = layoutTerrainLabels([long, distant])
  assert.deepEqual(output.labels, [])
  assert.deepEqual(output.unplaced, [long, distant])
  assert.equal(output.unplaced[0].number, long.number)
})

test('missing numbers are not fabricated and invalid coordinates or viewport are not drawn', () => {
  const invalid = { ...item(5), screen: [NaN, 100] }
  const output = layoutTerrainLabels([{ id: 'missing', screen: [100, 100] }, { number: ' ', screen: [200, 200] }, invalid])
  assert.deepEqual(output.labels, [])
  assert.deepEqual(output.unplaced, [invalid])
  assert.deepEqual(layoutTerrainLabels([item(1)], { ...viewport, right: 0 }).unplaced, [item(1)])
  assert.deepEqual(layoutTerrainLabels(null), { labels: [], unplaced: [] })
})
