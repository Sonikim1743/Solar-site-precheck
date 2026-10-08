import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createEmptyParcelReview, measureParcelReview } from '../src/utils/parcelReview.js'
import { createTerrainPlan, normalizeTerrainArea, terrainTilePoint } from '../src/utils/terrainArea.js'
import { exportTerrainAreaPdf } from '../src/utils/terrainPdf.js'

// Synthetic flat DEM and polygon only; no candidate or downloaded site data.
let viteServer, TerrainAreaReport
before(async () => {
  viteServer = await createServer({ configFile: false, root: process.cwd(), plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom', logLevel: 'error', optimizeDeps: { disabled: true } })
  TerrainAreaReport = (await viteServer.ssrLoadModule('/src/components/TerrainAreaReport.jsx')).default
}, { timeout: 30_000 })
after(async () => { await viteServer?.close() })

function fixture({ missing = false } = {}) {
  const square = (x, y, size) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]
  const parcelReview = { ...createEmptyParcelReview(), boundary: { type: 'Polygon', coordinates: [square(135, 35, .0008), square(135.0003, 35.0003, .0002)] } }
  const geometry = measureParcelReview(parcelReview).geometry, plan = createTerrainPlan(geometry), grid = plan.grid
  const elevations = Array(grid.width * grid.height).fill(110), urls = new Set()
  if (missing) elevations[grid.inside.findIndex(Boolean)] = null
  for (let index = 0; index < elevations.length; index++) {
    const [lon, lat] = plan.positionAt(index), [x, y] = terrainTilePoint(lon, lat, 15)
    for (const [px, py] of [[Math.floor(x), Math.floor(y)], [Math.floor(x) + 1, Math.floor(y)], [Math.floor(x), Math.floor(y) + 1], [Math.floor(x) + 1, Math.floor(y) + 1]]) {
      urls.add(`https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/15/${Math.floor(px / 256)}/${Math.floor(py / 256)}.png`)
    }
  }
  const terrainArea = normalizeTerrainArea({ version: 1, geometryKey: plan.geometryKey, geometry: plan.geometry,
    fetchedAt: '2026-10-08T00:00:00.000Z', source: { urls: [...urls] },
    grid: { ...grid, elevations, sourceIds: elevations.map(value => value === null ? null : 'dem5b_png') } })
  return { parcelReview, terrainArea, siteName: '合成地形・面積表示検証', appVersion: 'test' }
}

const area = value => value === 0 ? '0 m²' : `約${value.toLocaleString('ja-JP', { maximumFractionDigits: 0 })} m²`
const render = report => renderToStaticMarkup(React.createElement(TerrainAreaReport, { report }))
const table = html => html.match(/<table class="terrain-report-bins">[\s\S]*?<\/table>/)?.[0]

test('the fixed A3 distribution retains both share and estimated area in the PDF-readable value cell', () => {
  const report = fixture(), original = structuredClone(report), html = render(report)
  const total = report.terrainArea.summary.polygonAreaM2
  assert.equal((html.match(/report-print-page terrain-report-sheet/g) || []).length, 2)
  assert.match(table(html), /割合 \/ 推定面積/)
  assert.ok(table(html).includes(`<td>100% / ${area(total)}</td>`))
  assert.equal((table(html).match(/<td>0% \/ 0 m²<\/td>/g) || []).length, 3)
  assert.ok(html.includes(`有効範囲（除外後）：${area(total)}`))
  assert.doesNotMatch(html, /未計算：/)
  assert.match(html, /登記面積ではありません/)
  assert.match(html, /3D高さ強調なし（1:1）/)
  assert.deepEqual(report, original)
})

test('partial DEM coverage leaves unknown area unallocated despite a 100 percent share of valid points', () => {
  const report = fixture({ missing: true }), { summary } = report.terrainArea, html = render(report)
  const classified = summary.polygonAreaM2 * summary.slopeValidCount / summary.insideCount
  const unknown = summary.polygonAreaM2 - classified
  assert.ok(summary.slopeValidCount < summary.insideCount && classified < summary.polygonAreaM2)
  assert.ok(table(html).includes(`<td>100% / ${area(classified)}</td>`))
  assert.ok(html.includes(`未計算：${area(unknown)}`))
  assert.match(html, /未計算分を配分しません/)
  assert.match(html, /範囲全体の確定値ではありません/)
})

test('PDF export refuses an older slope table that omits the estimated areas rather than losing them silently', async () => {
  const report = fixture(), s = report.terrainArea.summary
  const number = (value, digits = 1) => value.toLocaleString('ja-JP', { maximumFractionDigits: digits })
  const row = (label, value) => ({ querySelector: selector => ({ textContent: selector === 'dt,th' ? label : value }) })
  const values = [`${number(s.polygonAreaM2, 0)} m²`, `${number(s.minElevation)}–${number(s.maxElevation)} m`, `${number(s.heightRange)} m`, `${number(s.medianSlope)}°`, `${number(s.p90Slope)}°`]
  const selectors = {
    '.terrain-report-sheet': [{}, {}], '.terrain-area-figure svg': [{}, {}, {}],
    '.terrain-report-values > div': values.map((value, index) => row(String(index), value)),
    '.terrain-report-bins tbody > tr': s.slopeBins.map(bin => row(bin.max === 90 ? `${bin.min}°以上` : `${bin.min}–${bin.max}°未満`, `${number(bin.percent)}%`)),
  }
  const element = { isConnected: true, querySelectorAll: selector => selectors[selector] || [] }
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const previousSerializer = Object.getOwnPropertyDescriptor(globalThis, 'XMLSerializer')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {} })
  Object.defineProperty(globalThis, 'XMLSerializer', { configurable: true, value: class {} })
  try {
    await assert.rejects(exportTerrainAreaPdf({ report, element }), /勾配の割合・推定面積の表示が計算結果と一致しません/)
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document
    if (previousSerializer) Object.defineProperty(globalThis, 'XMLSerializer', previousSerializer); else delete globalThis.XMLSerializer
  }
})
