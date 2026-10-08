import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PUBLIC_PARCEL_SOURCE, isPublicParcelFeature, publicParcelNumber, publicParcelLabelAnchor, publicParcelStatus } from '../src/utils/publicParcelLayer.js'

const feature = { geomType: 3, props: { 座標系: '公共座標6系', 地番: '123-4' } }
const ring = coordinates => coordinates.map(([x, y]) => ({ x, y }))
test('only a public-coordinate polygon supplies a display number', () => {
  assert.equal(publicParcelNumber(feature), '123-4')
  for (const crs of ['任意座標系', '公共座標0系', '公共座標20系', '', '公共座標6系<script>']) assert.equal(isPublicParcelFeature({ ...feature, props: { ...feature.props, 座標系: crs } }), false)
  assert.equal(publicParcelNumber({ ...feature, geomType: 1 }), '')
  assert.equal(publicParcelNumber({ ...feature, props: { ...feature.props, 地番: '地区外-1' } }), '')
})
test('the public source pins an explicit 2024 snapshot and data zoom limits', () => {
  assert.equal(PUBLIC_PARCEL_SOURCE.year, 2024)
  assert.equal(PUBLIC_PARCEL_SOURCE.minZoom, 14)
  assert.equal(PUBLIC_PARCEL_SOURCE.maxDataZoom, 16)
  assert.equal(new URL(PUBLIC_PARCEL_SOURCE.url).host, 'data.source.coop')
})
test('a label remains inside a convex or concave parcel rather than a neighbouring lot', () => {
  assert.deepEqual(publicParcelLabelAnchor([ring([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]])]), { x: 5, y: 5 })
  const anchor = publicParcelLabelAnchor([ring([[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10], [0, 0]])])
  assert.ok(anchor.x < 2 || anchor.y < 2)
})
test('parcel holes, malformed coordinates and empty outlines do not gain misleading centre labels', () => {
  const anchor = publicParcelLabelAnchor([ring([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]), ring([[3, 3], [3, 7], [7, 7], [7, 3], [3, 3]])])
  assert.ok(anchor.x < 3 || anchor.x > 7 || anchor.y < 3 || anchor.y > 7)
  assert.equal(publicParcelLabelAnchor([]), null)
  assert.equal(publicParcelLabelAnchor([[{ x: NaN, y: 1 }]]), null)
})
test('missing coverage, communication failure, zoom advice and reference boundaries remain distinct', () => {
  assert.match(publicParcelStatus('empty').message, /公開地番がありません/)
  assert.match(publicParcelStatus('error').message, /取得できません/)
  assert.match(publicParcelStatus('zoom').message, /拡大/)
  assert.match(publicParcelStatus('ready').message, /2024年.*参考境界/)
  assert.equal(publicParcelStatus('off').message, '')
})
