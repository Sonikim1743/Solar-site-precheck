import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { MAP_PARCEL_NOTICE, MAP_PARCEL_JOIN_NOTICE } from '../src/utils/mapParcelSelection.js'

let server, MapParcelNotice, isMapParcelJoinNotice
before(async () => {
  server = await createServer({ configFile: false, root: process.cwd(), cacheDir: '.vite/map-parcel-notice-tests', plugins: [react()], server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
  const module = await server.ssrLoadModule('/src/components/MapParcelNotice.jsx')
  MapParcelNotice = module.default; isMapParcelJoinNotice = module.isMapParcelJoinNotice
}, { timeout: 30000 })
after(async () => { await server?.close() })

test('map selection notice keeps the full boundary warning in a closed accessible dialog after its instruction', () => {
  const html = renderToStaticMarkup(React.createElement(MapParcelNotice))
  const [outside, dialog] = html.split('<dialog')
  assert.match(outside, /地図を拡大し、表示された地番の内側を押して選択してください（ズーム16以上）。/)
  assert.match(outside, /aria-label="地図境界の注意を開く"/)
  assert.match(outside, /aria-haspopup="dialog"/); assert.match(outside, /aria-expanded="false"/)
  assert.ok(!outside.includes(MAP_PARCEL_NOTICE)); assert.ok(dialog.includes(MAP_PARCEL_NOTICE))
  assert.ok(dialog.includes('選択境界を地図上の黄色線で確認してから適用してください。'))
  assert.doesNotMatch(dialog.split('>')[0], /\bopen=/)
})

test('only the existing successful fragment-join message enters the conditional disclosure', () => {
  for (const message of ['', '未適用の選択変更を中止しました。', '共通IDがないため、クリックした表示断片のみです。']) {
    assert.equal(isMapParcelJoinNotice(message), false)
    assert.ok(!renderToStaticMarkup(React.createElement(MapParcelNotice, { message })).includes(MAP_PARCEL_JOIN_NOTICE))
  }
  assert.equal(isMapParcelJoinNotice(MAP_PARCEL_JOIN_NOTICE), true)
  const html = renderToStaticMarkup(React.createElement(MapParcelNotice, { message: MAP_PARCEL_JOIN_NOTICE }))
  assert.equal(html.split(MAP_PARCEL_JOIN_NOTICE).length - 1, 1)
  assert.ok(html.indexOf(MAP_PARCEL_JOIN_NOTICE) > html.indexOf('<dialog'))
})

test('drawing mode retains its instruction and the same warning entry point', () => {
  const html = renderToStaticMarkup(React.createElement(MapParcelNotice, { drawing: true }))
  assert.match(html, /作図中です。範囲を「確定」または「取消」した後、地番を選択してください。/)
  assert.doesNotMatch(html, /ズーム16以上/)
  assert.match(html, /地図境界の注意を開く/)
})
