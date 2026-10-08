import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gsiPlaceNameCategory, gsiPlaceNameLayerOptions, observeGsiPlaceNameStatus, GSI_PLACE_NAMES_URL } from '../src/utils/mapPlaceNames.js'

const feature = (code, text = '検証地域') => ({ props: { vt_code: code, vt_text: text } })

test('regional labels follow the documented vector-to-Leaflet zoom mapping', () => {
  assert.equal(gsiPlaceNameCategory(6, feature(140)), null)
  assert.equal(gsiPlaceNameCategory(7, feature(140)), 'prefecture')
  assert.equal(gsiPlaceNameCategory(11, feature(140)), 'prefecture')
  assert.equal(gsiPlaceNameCategory(12, feature(140)), null)
  assert.equal(gsiPlaceNameCategory(8, feature(110)), null)
  assert.equal(gsiPlaceNameCategory(9, feature(110)), 'municipality')
  assert.equal(gsiPlaceNameCategory(18, feature(110)), 'municipality')
  assert.equal(gsiPlaceNameCategory(19, feature(110)), 'municipality')
  assert.equal(gsiPlaceNameCategory(21, feature(110)), 'municipality')
  assert.equal(gsiPlaceNameCategory(13, feature(210)), null)
  assert.equal(gsiPlaceNameCategory(14, feature(210)), 'local')
  assert.equal(gsiPlaceNameCategory(19, feature(210)), 'local')
  assert.equal(gsiPlaceNameCategory(21, feature(210)), 'local')
  assert.equal(gsiPlaceNameCategory(15, feature(220)), 'local')
  assert.equal(gsiPlaceNameCategory(17, feature(800)), null)
  assert.equal(gsiPlaceNameCategory(18, feature(800)), 'localDetail')
  assert.equal(gsiPlaceNameCategory(19, feature(800)), 'localDetail')
  assert.equal(gsiPlaceNameCategory(20, feature(800)), 'localDetail')
  assert.equal(gsiPlaceNameCategory(21, feature(800)), 'localDetail')
})

test('sparse place-name overlay excludes other annotation categories and unusable labels', () => {
  for (const code of [311, 411, 422, 621, 653, 661, 681]) assert.equal(gsiPlaceNameCategory(16, feature(code)), null)
  for (const text of ['', '   ', null, 12, '長'.repeat(81)]) assert.equal(gsiPlaceNameCategory(16, feature(110, text)), null)
  for (const zoom of [4, 22, NaN, Infinity]) assert.equal(gsiPlaceNameCategory(zoom, feature(110)), null)
  assert.equal(gsiPlaceNameCategory(16, null), null)
})

test('transparent layer uses the current archive and only prioritised place labels', () => {
  class Symbolizer { constructor(options) { this.options = options } }
  class Padding { constructor(padding, symbolizer) { this.padding = padding; this.symbolizer = symbolizer } }
  const options = gsiPlaceNameLayerOptions({ CenteredTextSymbolizer: Symbolizer, Padding }, 'test-pane')
  assert.equal(options.sources.gsi.url, GSI_PLACE_NAMES_URL)
  assert.ok(GSI_PLACE_NAMES_URL.endsWith('.pmtiles'))
  assert.equal(options.sources.gsi.levelDiff, 1)
  assert.equal(options.sources.gsi.maxDataZoom, 16)
  assert.deepEqual(options.paintRules, [])
  assert.equal(options.backgroundColor, undefined)
  assert.ok(options.attribution.includes('試験公開'))
  assert.deepEqual(options.labelRules.map(rule => rule.filter(10, feature(140))), [true, false, false, false])
  assert.deepEqual(options.labelRules.map(rule => rule.filter(16, feature(210))), [false, false, true, false])
  assert.ok(options.labelRules.every(rule => rule.dataLayer === 'Anno' && rule.dataSource === 'gsi'))
})

function statusFixture(getDisplayTile) {
  const events = new Map(), states = []
  const view = { getDisplayTile, tileCache: { source: { zoomaborts: [] } } }
  const layer = { views: new Map([['gsi', view]]), _tiles: { a: { coords: { x: 1, y: 2, z: 15 } } }, on: (event, callback) => events.set(event, callback) }
  observeGsiPlaceNameStatus(layer, status => states.push(status))
  return { layer, view, states, emit: event => events.get(event)() }
}

test('network errors remain an error even when the renderer completes a blank tile', async () => {
  const fixture = statusFixture(async () => { throw new Error('Network unavailable') })
  fixture.emit('add')
  await assert.rejects(fixture.view.getDisplayTile({ x: 1, y: 2, z: 15 }))
  fixture.emit('load')
  assert.equal(fixture.states.at(-1).state, 'error')
  assert.match(fixture.states.at(-1).message, /標準地図/)
  assert.equal(fixture.states.filter(state => state.state === 'error').length, 1)
})

test('successful retry clears the notice and unloaded overlays ignore late failures', async () => {
  let fail = true
  const fixture = statusFixture(async () => { if (fail) throw new Error('Offline'); return { data: new Map() } })
  const coords = { x: 1, y: 2, z: 15 }
  fixture.emit('add')
  await assert.rejects(fixture.view.getDisplayTile(coords))
  fail = false
  fixture.emit('loading')
  await fixture.view.getDisplayTile(coords)
  fixture.emit('load')
  assert.deepEqual(fixture.states.at(-1), { state: 'ready', message: '' })
  fixture.emit('remove')
  fail = true
  await assert.rejects(fixture.view.getDisplayTile(coords))
  fixture.emit('load')
  assert.deepEqual(fixture.states.at(-1), { state: 'off', message: '' })
})

test('zoom cancellations do not create a failure notice', async () => {
  const fixture = statusFixture(async () => { const error = new Error('Cancelled'); error.name = 'AbortError'; throw error })
  fixture.emit('add')
  await assert.rejects(fixture.view.getDisplayTile({ x: 1, y: 2, z: 15 }))
  fixture.emit('load')
  assert.deepEqual(fixture.states.at(-1), { state: 'ready', message: '' })
})
