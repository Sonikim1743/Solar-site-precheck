import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { buildTerrainLayout } from '../src/utils/terrainLayout.js'

let server, figures
before(async () => {
  server = await createServer({ configFile: false, root: process.cwd(), plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { disabled: true } })
  figures = await server.ssrLoadModule('/src/components/TerrainAreaFigures.jsx')
}, { timeout: 30000 })
after(async () => { await server?.close() })

// Local-metre synthetic terrain; no actual site/parcel coordinates or DEM.
function fixture(elevation = () => 100) {
  const width = 11, height = 11, step = 5
  const elevations = Array.from({ length: width * height }, (_, i) => elevation(i % width * step, Math.floor(i / width) * step))
  return { contours: [], grid: { width, height, step, xMin: 0, yMin: 0,
    boundary: [[[[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]]]], inside: Array(width * height).fill(true), elevations, slopes: Array(width * height).fill(0) },
    summary: { minElevation: Math.min(...elevations), maxElevation: Math.max(...elevations), polygonAreaM2: 2500,
      heightRange: Math.max(...elevations) - Math.min(...elevations), coveragePercent: 100, slopeCoveragePercent: 100,
      slopeBins: [{ min: 0, max: 10, percent: 100 }, { min: 10, max: 20, percent: 0 }, { min: 20, max: 30, percent: 0 }, { min: 30, max: 90, percent: 0 }] } }
}
const controls = React.createElement('div', { 'data-test-rack-controls': 'quantity', role: 'group', 'aria-label': '架台数を調整' },
  React.createElement('button', { type: 'button' }, '− 減らす'), React.createElement('span', null, '3架台'), React.createElement('button', { type: 'button' }, '＋ 増やす'))
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, { analysis: fixture(), rackControls: controls, ...props }))

test('plan quantity controls live inside the object figure directly after its SVG', () => {
  const html = render(figures.TerrainAreaPlan)
  assert.equal((html.match(/data-test-rack-controls=/g) || []).length, 1)
  assert.ok(html.indexOf('</svg>') < html.indexOf('data-test-rack-controls='))
  assert.ok(html.indexOf('data-test-rack-controls=') < html.indexOf('<figcaption>'))
  assert.ok(html.indexOf('data-test-rack-controls=') < html.indexOf('</figure>'))
  assert.match(html, /− 減らす/); assert.match(html, /＋ 増やす/)
})

test('interactive 3D quantity controls follow camera controls and precede slope information', () => {
  const html = render(figures.TerrainArea3D, { interactive: true })
  assert.equal((html.match(/data-test-rack-controls=/g) || []).length, 1)
  assert.ok(html.indexOf('terrain-area-rotation-controls') < html.indexOf('data-test-rack-controls='))
  assert.ok(html.indexOf('data-test-rack-controls=') < html.indexOf('terrain-area-slope-distribution'))
  assert.ok(html.indexOf('data-test-rack-controls=') < html.indexOf('</figure>'))
})

test('reports and static 3D never render interactive rack quantity controls', () => {
  for (const [Component, props] of [[figures.TerrainAreaPlan, { reportMode: true }],
    [figures.TerrainArea3D, { reportMode: true, interactive: true }], [figures.TerrainArea3D, { interactive: false }]]) {
    assert.doesNotMatch(render(Component, props), /data-test-rack-controls|架台数を調整|− 減らす|＋ 増やす/)
  }
  for (const Component of [figures.TerrainAreaPlan, figures.TerrainArea3D]) {
    assert.doesNotMatch(render(Component, { rackControls: undefined, interactive: true }), /data-test-rack-controls/)
  }
})

test('a roof visible above intervening ground retains its rack control without self-occlusion', () => {
  const analysis = fixture((x, y) => y === 15 ? 103 : y === 20 ? 107 : 100)
  const pool = buildTerrainLayout(analysis, { minColumns: 4, maxColumns: 4, scanOffsetUM: 19, scanOffsetVM: 9, maxRacks: 1 })
  assert.equal(pool.rackCount, 1)
  const original = structuredClone({ analysis, pool })
  const html = render(figures.TerrainArea3D, { analysis, layout: pool, layoutCandidates: pool, onToggleRack: () => {}, interactive: true, azimuth: 0 })
  assert.match(html, /data-terrain-rack="R001"/)
  assert.match(html, /aria-label="架台 R001 を除外"/)
  assert.deepEqual({ analysis, pool }, original)
})

test('elevated rack controls never acquire support over missing DEM cells or an excluded hole', () => {
  const analysis = fixture(), pool = buildTerrainLayout(analysis, { maxRacks: 1 })
  const center = pool.racks[0].corners.reduce((sum, point) => sum.map((value, axis) => value + point[axis] / 4), [0,0,0])
  const missing = structuredClone(analysis)
  missing.grid.elevations[Math.floor(center[1] / 5) * missing.grid.width + Math.floor(center[0] / 5)] = null
  const excluded = structuredClone(analysis), [x,y] = center
  excluded.grid.boundary[0].push([[x-2,y-2],[x+2,y-2],[x+2,y+2],[x-2,y+2],[x-2,y-2]])
  for (const current of [missing, excluded]) {
    const html = render(figures.TerrainArea3D, { analysis: current, layout: pool, layoutCandidates: pool, onToggleRack: () => {}, interactive: true })
    assert.doesNotMatch(html, /data-terrain-rack=/)
  }
})
