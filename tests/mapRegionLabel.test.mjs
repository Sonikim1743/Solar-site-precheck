import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, MapRegionLabel, getMapRegionLabel
before(async () => {
  server = await createServer({ configFile:false, root:process.cwd(), plugins:[react()], server:{middlewareMode:true,hmr:false,ws:false,watch:null}, appType:'custom', logLevel:'error', optimizeDeps:{noDiscovery:true,include:[]} })
  const module = await server.ssrLoadModule('/src/components/MapRegionLabel.jsx')
  MapRegionLabel = module.default
  getMapRegionLabel = module.getMapRegionLabel
}, { timeout:30_000 })
after(async () => { await server?.close() })

const position = { lat:35.1234567, lon:137.7654321 }
const data = { label:'架空県 検証市 テスト地区' }
const place = (digits = 6) => ({ status:'success', data, positionKey:`${position.lat.toFixed(digits)},${position.lon.toFixed(digits)}` })
const render = (point, info) => renderToStaticMarkup(React.createElement(MapRegionLabel, { position:point, placeInfo:info }))

test('an acquired address appears for the current selected point without implying a parcel boundary', () => {
  const html = render(position, place())
  assert.match(html, /選択地点/)
  assert.match(html, /架空県 検証市 テスト地区/)
  assert.doesNotMatch(html, /筆界|地番|境界|<button|<a /)
})
test('an address from the previously selected point disappears immediately', () => {
  assert.equal(render({ ...position, lat:position.lat + .01 }, place()), '')
})
test('the seven-decimal key used by reopened records retains the same label', () => {
  assert.match(render(position, place(7)), /架空県 検証市 テスト地区/)
})
test('loading, failed, missing and placeholder addresses do not retain an overlay', () => {
  for (const info of [{...place(),status:'loading'}, {...place(),status:'error'}, {...place(),data:null}, {...place(),data:{label:'  '}}, {...place(),data:{label:'住所情報なし'}}]) assert.equal(render(position, info), '')
  assert.equal(render(null, place()), '')
})
test('display whitespace is normalized consistently with the existing selected address', () => {
  assert.match(render(position, { ...place(), data:{label:'架空県　検証市\nテスト地区'} }), /架空県 検証市 テスト地区/)
})
test('record label markup stays text and cannot create map controls or injected elements', () => {
  const html = render(position, { ...place(), data:{label:'<img src=x onerror=alert(1)>'} })
  assert.ok(html.includes('&lt;img'))
  assert.ok(!html.includes('<img'))
})
test('the popup suppression selector agrees with the overlay for current, stale and unavailable addresses', () => {
  for (const [point, info, expected] of [
    [position, place(), data.label],
    [position, place(7), data.label],
    [{ ...position, lon:position.lon + .01 }, place(), ''],
    [position, { ...place(), status:'loading' }, ''],
    [position, { ...place(), status:'error' }, ''],
    [position, { ...place(), data:{label:'住所情報なし'} }, ''],
    [position, { ...place(), data:{label:'保存記録の候補地'} }, ''],
    [null, place(), ''],
  ]) {
    assert.equal(getMapRegionLabel(point, info), expected)
    assert.equal(Boolean(render(point, info)), Boolean(expected), 'only an actually displayed region suppresses the automatic popup')
  }
})
