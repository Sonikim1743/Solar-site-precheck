import assert from 'node:assert/strict'
import test from 'node:test'
import { copyDecimalCoordinates, decimalCoordinateText, googleMapsLinks, mapionMapcodeUrl } from '../src/utils/locationLinks.js'
import { parseCoordinateLink } from '../src/utils/coordinateLink.js'

test('official Google URLs encode the precise selected coordinates and no other site data', () => {
  const position = Object.freeze({ lat: 34.408912345678, lon: 133.204912345678, name: 'private name is never forwarded' })
  const links = googleMapsLinks(position), map = new URL(links.mapUrl), street = new URL(links.streetViewUrl)
  for (const url of [map, street]) {
    assert.equal(url.origin, 'https://www.google.com')
    assert.equal(url.searchParams.get('api'), '1')
    assert.ok(url.href.includes('%2C'))
    assert.ok(!url.href.includes('private'))
  }
  assert.equal(map.pathname, '/maps/search/')
  assert.equal(map.searchParams.get('query'), '34.408912345678,133.204912345678')
  assert.deepEqual([...map.searchParams.keys()], ['api', 'query'])
  assert.equal(street.pathname, '/maps/@')
  assert.equal(street.searchParams.get('map_action'), 'pano')
  assert.equal(street.searchParams.get('viewpoint'), map.searchParams.get('query'))
  assert.deepEqual([...street.searchParams.keys()], ['api', 'map_action', 'viewpoint'])
})

test('invalid or coercible coordinates have no external destination or copy text', () => {
  for (const position of [null, undefined, {}, { lat: 34 }, { lat: '', lon: 133 }, { lat: '34', lon: 133 }, { lat: null, lon: 133 }, { lat: false, lon: 133 }, { lat: NaN, lon: 133 }, { lat: Infinity, lon: 133 }, { lat: 34, lon: Infinity }, { lat: 90.01, lon: 133 }, { lat: -90.01, lon: 133 }, { lat: 34, lon: 180.01 }, { lat: 34, lon: -180.01 }, { lat: '34&query=other', lon: 133 }]) {
    assert.deepEqual(googleMapsLinks(position), { mapUrl: '', streetViewUrl: '' })
    assert.equal(decimalCoordinateText(position), '')
    assert.equal(mapionMapcodeUrl(position), '')
  }
  for (const position of [{ lat: 0, lon: 0 }, { lat: 90, lon: 180 }, { lat: -90, lon: -180 }]) assert.ok(googleMapsLinks(position).mapUrl)
})

test('MAPCODE action is a fixed-zoom manual Mapion link within Japan coverage, never a generated code', () => {
  assert.equal(mapionMapcodeUrl({ lat: 34.408912345678, lon: 133.204912345678 }), 'https://www.mapion.co.jp/m2/34.408912345678,133.204912345678,19')
  for (const position of [{ lat: 0, lon: 0 }, { lat: 19.99, lon: 133 }, { lat: 50.01, lon: 133 }, { lat: 34, lon: 119.99 }, { lat: 34, lon: 155.01 }]) assert.equal(mapionMapcodeUrl(position), '')
})

test('decimal copy uses latitude then longitude without rounding or degree-minute labels', async () => {
  const position = Object.freeze({ lat: 34.408912345678, lon: 133.204912345678 }), writes = []
  const result = await copyDecimalCoordinates(position, { async writeText(text) { writes.push(text) } })
  assert.deepEqual(writes, ['34.408912345678, 133.204912345678'])
  assert.equal(result.status, 'success')
  assert.match(result.message, /コピーしました/)
  assert.equal(decimalCoordinateText({ lat: -34.5, lon: 133 }), '-34.5, 133')
})

test('clipboard rejection or absence reports failure and exposes text for manual copying', async () => {
  for (const clipboard of [undefined, {}, { async writeText() { throw new Error('Permission denied') } }]) {
    const result = await copyDecimalCoordinates({ lat: 34.4089, lon: 133.2049 }, clipboard)
    assert.equal(result.status, 'error')
    assert.match(result.message, /コピーできませんでした/)
    assert.match(result.message, /34\.4089, 133\.2049/)
    assert.doesNotMatch(result.message, /コピーしました/)
  }
  let writes = 0
  assert.equal((await copyDecimalCoordinates(null, { async writeText() { writes++ } })).status, 'error')
  assert.equal(writes, 0)
})

test('Excel coordinate entry feeds the same precise position to all destinations and copy', async () => {
  const entry = parseCoordinateLink('?lat=34.485912345&lon=133.362212345&design=simple')
  assert.equal(entry.status, 'valid')
  const before = JSON.stringify(entry), links = googleMapsLinks(entry.position)
  assert.equal(new URL(links.mapUrl).searchParams.get('query'), '34.485912345,133.362212345')
  assert.equal(new URL(links.streetViewUrl).searchParams.get('viewpoint'), '34.485912345,133.362212345')
  assert.equal(mapionMapcodeUrl(entry.position), 'https://www.mapion.co.jp/m2/34.485912345,133.362212345,19')
  assert.equal(decimalCoordinateText(entry.position), '34.485912345, 133.362212345')
  assert.equal(JSON.stringify(entry), before)
})
