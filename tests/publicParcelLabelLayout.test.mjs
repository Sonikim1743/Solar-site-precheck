import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Index } from 'protomaps-leaflet'
import { layoutPublicParcelLabel, ParcelNumberSymbolizer, PUBLIC_PARCEL_LABEL_LIMITS } from '../src/utils/publicParcelLabelLayout.js'

const measureText = text => Array.from(text).length * 7
const box = (x, y, width, height) => [[{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }, { x, y }]]
const overlaps = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
const insert = (index, placement, id) => index.insert({ anchor: placement.anchor, bboxes: [placement.bbox], draw() {} }, 0, `synthetic:${id}`)
const layout = (geometry, index, text = '合成-1', extra = {}) => layoutPublicParcelLabel({ geometry, text, measureText, collides: bounds => index.bboxCollides(bounds, 0), ...extra })

test('an unoccupied parcel keeps its original centre and actual number without mutating inputs', () => {
  const geometry = box(300, 300, 60, 60), original = structuredClone(geometry)
  const number = '合成123-45'
  const result = layout(geometry, new Index(2 ** 24, 16), number)
  assert.deepEqual(result.sourceAnchor, { x: 330, y: 330 })
  assert.deepEqual(result.anchor, result.sourceAnchor)
  assert.equal(result.text, number)
  assert.equal(result.lines.join(''), number)
  assert.equal(result.leader, null)
  assert.deepEqual(geometry, original)
})

test('many narrow parcels gain internal placements with the installed Protomaps collision index', () => {
  const index = new Index(2 ** 24, 16), placements = []
  const centreBoxes = []
  for (let i = 0; i < 18; i++) {
    const geometry = box(400 + i * 8, 300, 6, 120)
    const centre = { minX: 403 + i * 8 - 20.5, minY: 352, maxX: 403 + i * 8 + 20.5, maxY: 368 }
    if (!centreBoxes.some(existing => overlaps(existing, centre))) centreBoxes.push(centre)
    const placed = layout(geometry, index, `100-${i}`)
    if (placed) { insert(index, placed, i); placements.push(placed) }
  }
  assert.ok(placements.length >= 15, `placed ${placements.length}/18`)
  assert.ok(placements.length > centreBoxes.length * 2)
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) assert.equal(overlaps(placements[i].bbox, placements[j].bbox), false)
  }
})

test('a small dense cluster uses short leaders rather than unlimited text overlap', () => {
  const index = new Index(2 ** 24, 16), placements = []
  for (let i = 0; i < 15; i++) {
    const placed = layout(box(500 + i % 3, 500 + Math.floor(i / 3), 2, 2), index, String(i + 1))
    if (placed) { insert(index, placed, i); placements.push(placed) }
  }
  assert.ok(placements.length >= 4)
  assert.ok(placements.some(placed => placed.leader))
  for (const placed of placements.filter(placed => placed.leader)) {
    assert.deepEqual(placed.leader.start, placed.sourceAnchor)
    assert.ok(Math.hypot(placed.leader.end.x - placed.leader.start.x, placed.leader.end.y - placed.leader.start.y) <= PUBLIC_PARCEL_LABEL_LIMITS.leaderLength + .000001)
  }
})

test('long numbers wrap intact and use their full measured rectangle in collision tests', () => {
  const number = '1234567890'.repeat(6)
  const index = new Index(2 ** 24, 16)
  const placed = layout(box(600, 600, 10, 10), index, number)
  assert.ok(placed.lines.length > 1)
  assert.ok(placed.lines.length <= PUBLIC_PARCEL_LABEL_LIMITS.lines)
  assert.equal(placed.lines.join(''), number)
  assert.ok(placed.lines.every(line => measureText(line) <= PUBLIC_PARCEL_LABEL_LIMITS.lineWidth))
  assert.ok(placed.bbox.maxX - placed.bbox.minX >= Math.max(...placed.lines.map(measureText)))
  assert.ok(placed.bbox.maxY - placed.bbox.minY >= placed.lines.length * placed.lineHeight)
  insert(index, placed, 0)
  const next = layout(box(600, 600, 10, 10), index, number)
  if (next) assert.equal(overlaps(placed.bbox, next.bbox), false)
})

test('parcel holes never become an unconnected label anchor', () => {
  const outer = box(700, 700, 120, 120)[0], hole = box(710, 710, 100, 100)[0]
  const geometry = [outer, hole], original = structuredClone(geometry)
  const placed = layout(geometry, new Index(2 ** 24, 16))
  assert.ok(placed)
  const sourceInHole = placed.sourceAnchor.x > 710 && placed.sourceAnchor.x < 810 && placed.sourceAnchor.y > 710 && placed.sourceAnchor.y < 810
  assert.equal(sourceInHole, false)
  const labelInHole = placed.anchor.x > 710 && placed.anchor.x < 810 && placed.anchor.y > 710 && placed.anchor.y < 810
  if (labelInHole) assert.ok(placed.leader)
  assert.deepEqual(geometry, original)
})

test('displaced labels remain discoverable across the renderer 256px tile edge and 16px buffer', () => {
  const index = new Index(2 ** 24, 16)
  const geometry = box(250, 120, 4, 4)
  const extra = { bounds: { minX: 0, minY: 112, maxX: 512, maxY: 132 } }
  const first = layout(geometry, index, '1', extra); insert(index, first, 0)
  const placed = layout(geometry, index, '2', extra); assert.ok(placed?.leader)
  assert.ok(placed.leader.start.x < 256 && placed.leader.end.x > 256)
  insert(index, placed, 1)
  // Any canvas tile touched by the short connecting line must also find the
  // text bbox via the renderer's real searchBbox(bufferedTile, Infinity) API.
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, { start, end } = placed.leader
    const x = start.x + (end.x - start.x) * t, y = start.y + (end.y - start.y) * t
    const tx = Math.floor(x / 256), ty = Math.floor(y / 256)
    const found = index.searchBbox({ minX: tx * 256 - 16, minY: ty * 256 - 16, maxX: (tx + 1) * 256 + 16, maxY: (ty + 1) * 256 + 16 }, Infinity)
    assert.ok([...found].some(label => label.anchor.x === placed.anchor.x && label.anchor.y === placed.anchor.y))
  }
})

test('world-edge bounds and completely blocked layouts fail safely within a finite search', () => {
  const bounds = { minX: 0, minY: 0, maxX: 256, maxY: 256 }
  const edge = layout(box(0, 0, 5, 5), new Index(2 ** 24, 16), '123-45', { bounds })
  assert.ok(edge)
  assert.ok(edge.bbox.minX >= 0 && edge.bbox.minY >= 0)
  let calls = 0
  const none = layoutPublicParcelLabel({ geometry: box(50, 50, 200, 200), text: '123', measureText, collides: () => { calls++; return true } })
  assert.equal(none, null)
  assert.ok(calls > 1 && calls <= PUBLIC_PARCEL_LABEL_LIMITS.candidates)
  assert.equal(layoutPublicParcelLabel({ geometry: [], text: '123', measureText, collides: () => false }), null)
  assert.equal(layoutPublicParcelLabel({ geometry: [null], text: '123', measureText, collides: () => false }), null)
  assert.equal(layoutPublicParcelLabel({ geometry: box(1, 1, 5, 5), text: '123', measureText: () => Infinity, collides: () => false }), null)
})

test('the exported production symbolizer preserves frozen feature, point geometry and full drawn number', () => {
  class Point {
    constructor(x, y) { this.x = x; this.y = y }
    clone() { return new Point(this.x, this.y) }
  }
  const geometry = Object.freeze(box(500, 500, 4, 4).map(ring => Object.freeze(ring.map(point => Object.freeze(new Point(point.x, point.y))))))
  const before = JSON.stringify(geometry)
  const number = '0001-02-'.repeat(7)
  const feature = Object.freeze({ geomType: 3, props: Object.freeze({ 座標系: '公共座標6系', 地番: number }) })
  const texts = [], moves = []
  const canvas = { measureText: text => ({ width: measureText(text) }), beginPath() {}, moveTo: (...p) => moves.push(p), lineTo() {}, stroke() {}, arc() {}, fill() {}, strokeText() {}, fillText: text => texts.push(text) }
  const index = new Index(2 ** 24, 16), symbolizer = new ParcelNumberSymbolizer()
  const first = symbolizer.place({ scratch: canvas, index, order: 0, zoom: 16 }, geometry, feature)
  assert.equal(first.length, 1)
  assert.ok(first[0].anchor instanceof Point)
  first[0].draw(canvas)
  assert.equal(texts.join(''), number)
  assert.equal(first[0].number, number)
  index.insert(first[0], 0, 'synthetic:first')
  const secondFeature = Object.freeze({ geomType: 3, props: Object.freeze({ 座標系: '公共座標6系', 地番: '0002' }) })
  const second = symbolizer.place({ scratch: canvas, index, order: 0, zoom: 16 }, geometry, secondFeature)
  assert.equal(second.length, 1)
  assert.equal(index.labelCollides(second[0], Infinity), false)
  assert.deepEqual(second[0].sourceAnchor, { x: 502, y: 502 })
  second[0].draw(canvas)
  assert.ok(moves.length > 0)
  assert.equal(JSON.stringify(geometry), before)
  assert.equal(feature.props.地番, number)
  assert.equal(secondFeature.props.地番, '0002')
})

test('the same synthetic geographic parcels gain room as the real tile zoom grows', () => {
  const counts = []
  for (const zoom of [15, 19]) {
    const world = 256 * 2 ** zoom, index = new Index(world, 16)
    const project = (lon, lat) => ({ x: (lon + 180) / 360 * world, y: (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * world })
    let placed = 0, internal = 0
    for (let i = 0; i < 18; i++) {
      const west = 135.001 + i * .00002, south = 35.001
      const geographic = [[west, south], [west + .00001, south], [west + .00001, south + .0001], [west, south + .0001], [west, south]]
      const geometry = [geographic.map(([lon, lat]) => project(lon, lat))]
      const result = layout(geometry, index, `100-${i}`)
      if (result) { insert(index, result, i); placed++; if (!result.leader) internal++ }
    }
    counts.push({ placed, internal })
  }
  assert.ok(counts[1].placed >= counts[0].placed, JSON.stringify(counts))
  assert.ok(counts[1].internal > counts[0].internal, JSON.stringify(counts))
  assert.ok(counts[1].placed >= 12, JSON.stringify(counts))
})
