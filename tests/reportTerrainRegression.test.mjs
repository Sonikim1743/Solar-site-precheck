import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { normalizeReportTerrainSection, reportTerrainMapLayout } from '../src/utils/reportTerrain.js'

// All positions, elevations and names in this file are synthetic fixtures.
const point = (distance, elevation, extra = {}) => ({ distance, elevation, ...extra })
const section = (rangeMeters, points, summary = {}) => ({
  rangeMeters,
  intervalMeters: 10,
  lines: [{ id: 'east-west', label: '東西断面', negativeDirection: '西', positiveDirection: '東', rangeMeters, points, summary }],
})
const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Number.isFinite(actual), `expected a finite number, received ${actual}`)
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
}

test('report normalization preserves the complete ±200m observations and does not mutate the source', () => {
  const input = section(200, [point(-200, 10), point(-100, 12), point(0, 20), point(100, 27), point(200, 50)])
  const original = structuredClone(input)
  const result = normalizeReportTerrainSection(input)
  assert.equal(result.rangeMeters, 200)
  assert.equal(result.lines[0].rangeMeters, 200)
  assert.deepEqual(result.lines[0].points.map(row => row.distance), [-200, -100, 0, 100, 200])
  close(result.lines[0].summary.elevationDiff, 40)
  // Independent rise/run calculation: 40m over the complete 400m section.
  close(result.lines[0].summary.averageSlopePercent, 10)
  close(result.summary.minElevation, 10)
  close(result.summary.maxElevation, 50)
  assert.deepEqual(input, original)
})

test('a missing internal observation remains a gap and cannot fabricate the steepest slope or total rise', () => {
  for (const missing of [point(-30, null), point(-30, 999, { missing: true })]) {
    const result = normalizeReportTerrainSection(section(50, [
      point(-50, 0), point(-40, 1), missing, point(-20, 101), point(-10, 103), point(50, 106),
    ], { averageSlopePercent: 999, maxSlopePercent: 999, totalRise: 999 }))
    const line = result.lines[0]
    assert.equal(line.points.length, 6, 'the missing observation must not be filtered out and reconnected')
    // Valid adjacent rises are 1m/10m, 2m/10m, and 3m/60m. The 100m jump across the gap is not a segment.
    close(line.summary.maxSlopePercent, 20)
    close(line.summary.totalRise, 6)
    close(line.summary.totalFall, 0)
    close(line.summary.averageSlopePercent, 106)
    close(result.summary.maxElevation, 106)
  }
})

test('missing endpoints do not substitute interior observations or a saved summary for an endpoint average', () => {
  const cases = [
    [point(-50, null), point(-40, 10), point(0, 20), point(50, 30)],
    [point(-50, 10), point(0, 20), point(40, 30), point(50, null)],
    [point(-40, 10), point(0, 20), point(50, 30)],
  ]
  for (const points of cases) {
    const result = normalizeReportTerrainSection(section(50, points, { averageSlopePercent: 20, elevationDiff: 20 }))
    assert.equal(result.lines[0].summary.averageSlopePercent, null)
    assert.equal(result.lines[0].summary.elevationDiff, null)
  }
})

test('one valid observation cannot be reported as zero degree average or maximum slope', () => {
  for (const points of [[point(0, 25)], [point(-50, null), point(0, 25), point(50, null)]]) {
    const result = normalizeReportTerrainSection(section(50, points))
    assert.equal(result.lines[0].summary.averageSlopePercent, null)
    assert.equal(result.lines[0].summary.maxSlopePercent, null)
    close(result.summary.minElevation, 25)
    close(result.summary.maxElevation, 25)
  }
})

test('an irregular 39m segment uses its true horizontal length, not the nominal 10m interval', () => {
  const result = normalizeReportTerrainSection(section(50, [point(-50, 0), point(-11, 7.8), point(50, 10)]))
  close(result.lines[0].summary.maxSlopePercent, 20) // 7.8 / 39 * 100
  close(result.lines[0].summary.averageSlopePercent, 10) // 10 / 100 * 100
})

test('flat endpoints remain a true zero average while internal relief still has a nonzero maximum', () => {
  const result = normalizeReportTerrainSection(section(50, [point(-50, 25), point(0, 35), point(50, 25)]))
  close(result.lines[0].summary.averageSlopePercent, 0)
  close(result.lines[0].summary.elevationDiff, 0)
  close(result.lines[0].summary.maxSlopePercent, 20)
})

test('terrain map geometry retains exact 50m and 100m distances at several latitudes and requested ranges', () => {
  for (const lat of [31, 35, 45]) {
    for (const range of [25, 50, 100, 200]) {
      const layout = reportTerrainMapLayout({ lat, lon: 139 }, range)
      assert.equal(layout.width, 900)
      assert.equal(layout.height, 400)
      assert.ok(Number.isInteger(layout.zoom), 'GSI tile zoom is an integer')
      // Independent Web Mercator tile resolution using the WGS84 equatorial radius.
      const resolution = (2 * Math.PI * 6378137 * Math.cos(lat * Math.PI / 180)) / (256 * 2 ** layout.zoom)
      close(layout.metersPerPixel, resolution)
      close(layout.rangePx * resolution, range, 1e-7)
      close(layout.innerPx * resolution, 50, 1e-7)
      close(layout.scalePx * resolution, 100, 1e-7)
      close(layout.scalePx / layout.innerPx, 2)
      assert.ok(layout.rangePx <= layout.height / 2, 'select an appropriate zoom instead of clipping the requested range')
      if (range === 50) close(layout.rangePx, layout.innerPx)
      if (range < 50) assert.ok(layout.innerPx > layout.rangePx, 'an omitted 50m line must still describe true 50m geometry')
    }
  }
})

test('a larger report range selects the same or a wider map zoom without shortening its geometry', () => {
  const position = { lat: 35, lon: 139 }
  const small = reportTerrainMapLayout(position, 50)
  const large = reportTerrainMapLayout(position, 200)
  assert.ok(large.zoom <= small.zoom)
  close(small.rangePx * small.metersPerPixel, 50)
  close(large.rangePx * large.metersPerPixel, 200)
})

describe('printed terrain report regression', () => {
let viteServer
let ReportPreview

before(async () => {
  viteServer = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: { disabled: true },
  })
  ReportPreview = (await viteServer.ssrLoadModule('/src/components/ReportPreview.jsx')).default
})

after(async () => { await viteServer?.close() })

const renderReport = (extra = {}) => renderToStaticMarkup(React.createElement(ReportPreview, {
  report: { position: { lat: 35, lon: 139 }, siteName: '合成データ・回帰確認', obstructionHeight: 20, snowBase: 1, ...extra },
}))

test('the printed report labels the actual ±200m terrain range rather than a truncated 100m range', () => {
  const html = renderReport({ terrainSection: section(200, [point(-200, 10), point(0, 30), point(200, 50)]) })
  const map = html.match(/class="report-map-preview"[\s\S]*?<\/svg>/)?.[0]
  assert.ok(map, 'report aerial map must be rendered')
  assert.match(map, /周辺200m確認範囲/)
  assert.doesNotMatch(map, /周辺100m確認範囲/)
})

test('printed map section lines and the 100m scale bar use the actual aerial tile zoom without pixel clamps', () => {
  for (const range of [50, 100, 200]) {
    const html = renderReport({ terrainSection: section(range, [point(-range, 10), point(0, 20), point(range, 30)]) })
    const map = html.match(/class="report-map-preview"[\s\S]*?<\/svg>/)?.[0]
    assert.ok(map)
    const zoom = Number(map.match(/\/seamlessphoto\/(\d+)\//)?.[1])
    assert.ok(Number.isInteger(zoom))
    const metersPerPixel = 2 * Math.PI * 6378137 * Math.cos(35 * Math.PI / 180) / (256 * 2 ** zoom)
    const lines = Array.from(map.matchAll(/<line\b[^>]*>/g), match => match[0])
    const attr = (line, name) => Number(line.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1])
    const sectionLine = lines.find(line => line.includes('stroke="#d84c3c"') && attr(line, 'y1') === attr(line, 'y2'))
    const scaleLine = lines.find(line => line.includes('stroke="#0d5f4f"'))
    assert.ok(sectionLine)
    assert.ok(scaleLine)
    close((attr(sectionLine, 'x2') - attr(sectionLine, 'x1')) * metersPerPixel, range * 2, 1e-7)
    close((attr(scaleLine, 'x2') - attr(scaleLine, 'x1')) * metersPerPixel, 100, 1e-7)
  }
})

for (const sourceCode of ['DEM5B', 'DEM5C']) {
  test(`the printed report retains ${sourceCode} provenance without labelling it laser measurement`, () => {
    const source = `国土地理院 ${sourceCode}標高タイル`
    const html = renderReport({ elevation: 25, elevationSource: source, terrainSection: section(50, [
      point(-50, 20, { source }), point(0, 25, { source }), point(50, 30, { source }),
    ]) })
    assert.ok(html.includes(source), 'the actual elevation source must remain visible')
    const qualityLabels = Array.from(html.matchAll(/<span class="dem-quality[^\"]*">([\s\S]*?)<\/span>/g), match => match[1])
    assert.ok(qualityLabels.length > 0, 'the source explanation must be rendered')
    for (const label of qualityLabels) assert.doesNotMatch(label, /レーザ|レーザー/)
  })
}
})
