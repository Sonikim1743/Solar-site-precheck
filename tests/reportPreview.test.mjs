import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { buildGenerationScenario } from '../shared/generationScenario.js'
import { createEmptyParcelReview, setReviewParcel, measureParcelReview } from '../src/utils/parcelReview.js'

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

test('parcel report preserves every selected row and adds sequential pages without changing generation pages', () => {
  let review=createEmptyParcelReview()
  for(let i=0;i<9;i++) review=setReviewParcel(review,{type:'Feature',id:String(i),properties:{地番:'試験-'+i},geometry:{type:'Polygon',coordinates:[[[133.5,34.9],[133.501,34.9],[133.501,34.901],[133.5,34.901],[133.5,34.9]]]}},i===0?'target':'reference',{fileName:'synthetic.geojson',importedAt:'2026-09-24T00:00:00.000Z'})
  const report={position:{lat:34.9005,lon:133.5005},obstructionHeight:20,snowBase:1,parcelReview:review,parcelMetrics:measureParcelReview(review)}
  const html=renderToStaticMarkup(React.createElement(ReportPreview,{report}))
  for(let i=0;i<9;i++) assert.match(html,new RegExp('試験-'+i))
  assert.match(html,/筆界・検討範囲/)
  assert.match(html,/一覧 2 \/ 2/)
  assert.match(html,/fill-rule="evenodd"/)
  const numbers=Array.from(html.matchAll(/class="report-page-number">(\d+)</g),x=>Number(x[1]))
  assert.deepEqual(numbers,[1,2,3,4,5,6,7])
})

test('generation report keeps monthly values, assumptions and existing Solar Pro input together', () => {
  const report = { position: { lat: 34.9, lon: 133.5 }, obstructionHeight: 20, snowBase: 1, solarProMemo: { annualYield: '57,000 kWh' }, generation: {
    inputs: { peakpower: 50, angle: 20, aspect: 0, loss: 14 }, annualKwh: 60000,
    monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, kwh: 5000 })), source: 'PVGIS 5.3 / PVGIS-ERA5', period: '2005–2023', fetchedAt: '2026-09-10T23:40:00Z',
  } }
  const html = renderToStaticMarkup(React.createElement(ReportPreview, { report }))
  assert.match(html, /60,000/)
  assert.match(html, /57,000 kWh/)
  assert.match(html, /12月/)
  assert.match(html, /DC 50 kWp/)
  assert.match(html, /系統出力制御は未反映/)
  assert.match(html, /取得 2026\/9\/11/)
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
  assert.match(html, /公表の正方向 庄原（変）→東城（変）/)
})

test('reopened records print original provenance and saved equipment notes as escaped text', () => {
  const report = { position: {lat:34.9,lon:133.5}, obstructionHeight:20, snowBase:.95, buildDate:'2026-09-11', reviewRecordInfo:{savedAt:'2026-08-01T00:00:00Z',appVersion:'1.24'}, gridNotes:[{id:'memo',title:'確認設備',recordedAt:'2026-08-01T00:00:00Z',text:'公表空容量: 0 MW\n<script>alert(1)</script>'}] }
  const html = renderToStaticMarkup(React.createElement(ReportPreview, {report}))
  assert.match(html,/保存記録から再開/);assert.match(html,/元のアプリ v1.24/)
  assert.match(html,/設備確認記録/);assert.match(html,/現在の公表資料との再照合は行っていません/)
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/)
  assert.doesNotMatch(html,/取得 2026-09-11/)
})

function scenarioReport({ snow = true, terrain = true, zero = false } = {}) {
  const generation = {
    inputs: { lat: 34.9, lon: 133.5, peakpower: 50, angle: 20, aspect: 0, loss: 14 },
    annualKwh: zero ? 0 : 60000,
    monthly: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, kwh: zero ? 0 : 5000 })),
    source: 'PVGIS 5.3 / PVGIS-ERA5', period: '2005–2023', fetchedAt: '2026-08-01T00:00:00Z',
  }
  generation.scenario = buildGenerationScenario(generation, {
    snow: snow ? { rates: [.5, ...Array(11).fill(0)], weight: 40, mesh: '52330480', source: '保存した積雪資料 <script>test</script>' } : null,
    terrain: terrain ? { ...generation, inputs: { ...generation.inputs, userhorizon: Array(8).fill(5) }, annualKwh: 72000, monthly: generation.monthly.map(row => ({ ...row, kwh: 6000 })), fetchedAt: '2026-08-02T23:30:00Z' } : null,
    calculatedAt: '2026-08-03T23:30:00Z',
  })
  return { position: { lat: 34.9, lon: 133.5 }, obstructionHeight: 20, snowBase: .95, generation,
    gridNotes: [{ id: 'saved', title: '設備メモ', recordedAt: '2026-08-01T00:00:00Z', text: '基準年間発電量 60,000 kWh' }] }
}

test('scenario report preserves baseline and prints the saved comparison, assumptions and dates', () => {
  const report = scenarioReport()
  const html = renderToStaticMarkup(React.createElement(ReportPreview, { report }))
  assert.match(html, /60,000/)
  assert.match(html, /70,800/)
  assert.match(html, /\+10,800/)
  assert.match(html, /18\.00% 増加/)
  assert.match(html, /4,800/)
  assert.match(html, /20%/)
  assert.match(html, /PVGIS標準の地形地平線を使用/)
  assert.match(html, /8 方位の地平線でPVGIS標準地形地平線を置換/)
  assert.match(html, /基準より増える場合/)
  assert.match(html, /分析範囲外の地形/)
  assert.match(html, /3次メッシュ 52330480/)
  assert.match(html, /パネル被覆率の実測ではなく/)
  assert.match(html, /システム損失を重ねて乗算していません/)
  assert.match(html, /2026\/8\/4 8:30:00/)
  assert.match(html, /取得 2026\/8\/3 8:30:00/)
  assert.match(html, /&lt;script&gt;test&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>/)
  assert.deepEqual([...html.matchAll(/class="report-page-number">(\d+)</g)].map(match => Number(match[1])), [1, 2, 3, 4, 5, 6])
  assert.match(html, /基準年間発電量 60,000 kWh/)
  const generationPage = html.match(/<article class="report-print-page report-generation-overview">[\s\S]*?<\/article>/)?.[0]
  assert.ok(generationPage)
  assert.match(generationPage, /季節ごとの発電の流れ/)
  assert.equal((generationPage.match(/class="generation-season__month"/g) || []).length, 12)
  assert.doesNotMatch(generationPage, /<button|aria-live|グラフの月を選ぶ/)
  assert.doesNotMatch(html, /積雪と周辺地形の試験比較|次ページに記録します/)
})

test('partial scenarios state their applied assumptions and zero baseline has no invented percentage', () => {
  const terrainOnly = renderToStaticMarkup(React.createElement(ReportPreview, { report: scenarioReport({ snow: false }) }))
  assert.match(terrainOnly, /72,000/)
  assert.match(terrainOnly, /積雪の仮定による損失は適用していません/)
  assert.doesNotMatch(terrainOnly, /仮の積雪損失率/)
  const snowOnly = renderToStaticMarkup(React.createElement(ReportPreview, { report: scenarioReport({ terrain: false, zero: true }) }))
  assert.match(snowOnly, /率は算出不可（基準値0）/)
  assert.match(snowOnly, /周辺地形は基準値と同じPVGIS標準地形地平線/)
})
