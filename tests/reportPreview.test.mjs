import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let viteServer
let ReportPreview

before(async () => {
  viteServer = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: { disabled: true },
  })
  const module = await viteServer.ssrLoadModule('/src/components/ReportPreview.jsx')
  ReportPreview = module.default
})

after(async () => {
  await viteServer?.close()
})

test('66/77 report uses the preferred line, not unrelated capacity, and fits a far substation', () => {
  const reference = { id: 'ref', name: '参考500kV線', voltageKv: 500, voltageLabel: '500kV', distanceMeters: 500, nearestPoint: { lat: 35, lon: 139.005 } }
  const target = { id: 'target', name: '対象66kV線', voltageKv: 66, voltageLabel: '66kV', distanceMeters: 39000, direction: '北', bearing: 0, nearestPoint: { lat: 35.35, lon: 139 }, geometry: [{ lat: 35.35, lon: 138.98 }, { lat: 35.35, lon: 139.02 }] }
  const substation = { id: 'sub', name: '遠方参考変電所', distanceMeters: 44000, bearing: 180, position: { lat: 34.604, lon: 139 } }
  const report = {
    appVersion: '1.23', buildDate: '2026-08-31', siteName: '試験', position: { lat: 35, lon: 139 }, obstructionHeight: 20, snowBase: 1,
    powerGrid: {
      position: { lat: 35, lon: 139 }, radiusMeters: 50000, lines: [reference, target], substations: [substation],
      summary: { nearestLine: reference, nearestPreferredLine: target, nearestSubstation: substation },
      search: { targetVoltagesKv: [66, 77], foundPreferredLine: true, attemptedRadiiMeters: [5000, 10000, 20000, 50000] },
    },
    capacityMatches: { lineMatches: [{ source: reference, capacity: { name: '別系統', availableCapacityMw: 123 }, match: { label: '名称一致', matchedBy: ['名称'] } }], substationMatches: [] },
  }
  const html = renderToStaticMarkup(React.createElement(ReportPreview, { report }))
  const map = html.match(/class="report-power-grid-map"[\s\S]*?<\/svg>/)?.[0]
  assert.ok(map)
  assert.match(map, /66・77kV 最寄り候補：対象66kV線/)
  assert.doesNotMatch(map, /最寄り系統線：参考500/)
  // 44km south must lie inside the 440px-high map and not be compressed to 5km.
  const marker = map.match(/<rect x="([\d.]+)" y="([\d.]+)" width="14"/)
  assert.ok(marker)
  assert.ok(Number(marker[2]) > 280 && Number(marker[2]) < 410)
  assert.match(html, /取得した50km圏/)
  const mapWithExplanation = html.match(/class="report-power-grid-map"[\s\S]*?<div class="report-power-grid-summary/)?.[0]
  assert.doesNotMatch(mapWithExplanation, /公開空容量:.*123/)
})

test('power-grid report does not render a stray zero and explains official DB candidates', () => {
  const capacity = {
    type: 'line',
    no: '広④L101',
    name: '庄原東城線',
    voltageKv: 66,
    availableCapacityMw: 0,
    upstreamAvailableCapacityMw: 0,
    nMinusOne: '不可',
    flowDirection: '庄原（変）→東城（変）',
  }
  const report = {
    appVersion: '1.23',
    buildDate: '2026-08-25',
    siteName: '試験候補地',
    placeLabel: '広島県庄原市',
    position: { lat: 34.9, lng: 133.3 },
    obstructionHeight: 20,
    snowBase: 1,
    powerGrid: {
      position: { lat: 34.9, lng: 133.3 },
      fetchedAt: '2026-08-25T00:00:00.000Z',
      radiusMeters: 5000,
      search: { attemptedRadiiMeters: [5000, 10000, 20000] },
      summary: {
        nearestLine: { id: 'line-1', name: '送電線（名称未記載）', distanceMeters: 4600, direction: '南', voltageLabel: '電圧未記載' },
        nearestSubstation: { id: 'sub-1', name: '変電所（名称未記載）', distanceMeters: 16000, direction: '北東' },
      },
      lines: [{ id: 'line-1', name: '送電線（名称未記載）', distanceMeters: 4600, direction: '南', voltageLabel: '電圧未記載', voltageBand: '電圧未記載' }],
      substations: [{ id: 'sub-1', name: '変電所（名称未記載）', distanceMeters: 16000, direction: '北東', voltageLabel: '電圧未記載' }],
    },
    gridCapacity: { areaLabel: '中国電力NW' },
    capacityMatches: { lineMatches: [], substationMatches: [] },
    placeCapacityCandidates: { lineCandidates: [{ capacity }], substationCandidates: [] },
  }

  const html = renderToStaticMarkup(React.createElement(ReportPreview, { report }))

  assert.doesNotMatch(html, /<\/div>0<div class="report-power-grid-capacity"/)
  assert.match(html, /公式DB地名候補/)
  assert.match(html, /66 kV/)
  assert.match(html, /0 MW（空容量なし）/)
  assert.match(html, /N-1 不可/)
  assert.match(html, /公開予想潮流 庄原（変）→東城（変）/)
})
