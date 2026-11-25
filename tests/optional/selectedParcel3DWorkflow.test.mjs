import test, { after, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { terrainReviewSynthetic } from '../fixtures/terrainReviewSynthetic.mjs'
import { createTerrainPlan, normalizeTerrainArea, terrainTilePoint } from '../../src/utils/terrainArea.js'
import { buildTerrainLayout } from '../../src/utils/terrainLayout.js'
import { createEmptyParcelReview, measureParcelReview, setReviewParcel } from '../../src/utils/parcelReview.js'
import { MAP_PARCEL_SOURCE } from '../../src/utils/mapParcelSelection.js'
import { createReviewRecord } from '../../src/utils/reviewRecord.js'

let dom, server, React, createRoot, App, root, selections, analyze
const acquisitions = [], workers = [], scrolled = []
const fixture = terrainReviewSynthetic()
const target = { type: 'Feature', id: 'synthetic-map-target', properties: { 地番: '合成' }, geometry: fixture.parcelReview.boundary }
const exclusion = { type: 'Polygon', coordinates: [[[135.0001,35.0001],[135.0002,35.0001],[135.0002,35.0002],[135.0001,35.0002],[135.0001,35.0001]]] }

class WorkerStub {
  constructor() { workers.push(this) }
  postMessage(message) { this.message = message }
  terminate() { this.terminated = true }
  complete() {
    const result = buildTerrainLayout(this.message.analysis, this.message.options)
    this.onmessage({ data: { result } })
    return result
  }
}

function flatTerrain(geometry) {
  const plan = createTerrainPlan(geometry), grid = plan.grid
  const elevations = Array(grid.width * grid.height).fill(100), urls = new Set()
  for (let index = 0; index < elevations.length; index++) {
    const [lon, lat] = plan.positionAt(index), [x,y] = terrainTilePoint(lon, lat, 15)
    for (const px of [Math.floor(x), Math.floor(x) + 1]) for (const py of [Math.floor(y), Math.floor(y) + 1]) {
      urls.add('https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/15/' + Math.floor(px/256) + '/' + Math.floor(py/256) + '.png')
    }
  }
  return normalizeTerrainArea({
    version: 1, geometryKey: plan.geometryKey, geometry: plan.geometry, fetchedAt: '2026-10-13T00:00:00Z',
    source: { urls: [...urls] }, grid: { ...grid, elevations, sourceIds: elevations.map(() => 'dem5b_png') },
  })
}

// The map supplies a deterministic draft. The real App owns selection,
// scrolling, terrain cancellation and the detailed layout worker.
const testDependencies = {
  name: 'integrated-terrain-workflow-test',
  enforce: 'pre',
  resolveId(id, importer) {
    if (id === './components/MapPanel.jsx' && importer?.endsWith('/src/App.jsx')) return '\0test-map-panel'
  },
  load(id) {
    if (id !== '\0test-map-panel') return
    return `
      import React from 'react'
      export default function TestMap({ onConfirmRegionalParcels, onReviewGeometry }) {
        const { boundary, exclusion } = globalThis.__terrainWorkflowFixture()
        return React.createElement(React.Fragment, null,
          React.createElement('button', { onClick: () => onConfirmRegionalParcels(globalThis.__terrainWorkflowFixture().targets) }, '選択完了 → 3D'),
          React.createElement('button', { onClick: () => onReviewGeometry(boundary, 'boundary') }, '合成範囲を描く'),
          React.createElement('button', { onClick: () => onReviewGeometry(exclusion, 'exclusion') }, '合成除外を描く'))
      }`
  },
  transform(code, id) {
    if (id.endsWith('/src/services/terrainArea.js')) {
      return code.replace('export async function analyzeTerrainArea(geometry, options = {}) {',
        'export async function analyzeTerrainArea(geometry, options = {}) { if (globalThis.__runTerrainWorkflowAnalysis) return globalThis.__runTerrainWorkflowAnalysis(geometry, options);')
    }
  },
}

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const { window } = dom
  window.scrollTo = () => {}
  // jsdom does not make the descendants of a closed native dialog unfocusable.
  const focus = window.HTMLElement.prototype.focus
  window.HTMLElement.prototype.focus = function (...options) {
    if (!this.closest('dialog:not([open])')) focus.apply(this, options)
  }
  window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.id) }
  window.HTMLCanvasElement.prototype.getContext = () => null
  Object.assign(globalThis, {
    window, document: window.document, MutationObserver: window.MutationObserver, Worker: WorkerStub, IS_REACT_ACT_ENVIRONMENT: true,
    __terrainWorkflowFixture: () => ({ targets: selections, boundary: target.geometry, exclusion }),
    __runTerrainWorkflowAnalysis: (geometry, request) => {
      acquisitions.push({ geometry, signal: request.signal })
      return analyze(geometry)
    },
  })
  React = await import('react')
  ;({ createRoot } = await import('react-dom/client'))
  server = await createServer({
    configFile: false, root: process.cwd(), cacheDir: '.vite/integrated-terrain-tests',
    plugins: [testDependencies, react()], server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] },
  })
  App = (await server.ssrLoadModule('/src/App.jsx')).default
}, { timeout: 30_000 })

afterEach(async () => {
  if (root) await React.act(async () => root.unmount())
  root = null
})
after(async () => {
  await server?.close()
  dom?.window.close()
  for (const key of ['window', 'document', 'MutationObserver', 'Worker', 'IS_REACT_ACT_ENVIRONMENT', '__terrainWorkflowFixture', '__runTerrainWorkflowAnalysis']) delete globalThis[key]
})

async function mount() {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  selections = [target]
  acquisitions.length = 0
  workers.length = 0
  scrolled.length = 0
  analyze = async geometry => flatTerrain(geometry)
  root = createRoot(document.getElementById('root'))
  await React.act(async () => root.render(React.createElement(App)))
}

const panel = () => document.getElementById('terrain-area')
const model = () => panel().querySelector('svg[data-view-zoom]')
const moduleCount = () => Number(model()?.dataset.layoutModules)
const modelZoom = () => Number(model()?.dataset.viewZoom)

async function click(label, scope = document) {
  const button = [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === label)
  assert.ok(button && !button.disabled, label)
  await React.act(async () => button.click())
}

async function shrinkModel() {
  const button = panel().querySelector('button[aria-label="3Dを縮小"]')
  assert.ok(button && !button.disabled, '3Dを縮小')
  await React.act(async () => button.click())
}

async function changeSlope(value) {
  const control = panel().querySelector('select[aria-label="参考配置の勾配条件"]')
  assert.ok(control && !control.disabled)
  await React.act(async () => {
    control.value = String(value)
    control.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
}

test('selection completion calculates once, then the first module reveal fits the model', async () => {
  await mount()
  await click('選択完了 → 3D')
  await React.act(async () => new Promise(resolve => setTimeout(resolve, 0)))
  assert.equal(panel().open, true)
  assert.ok(scrolled.includes('terrain-area'))
  assert.equal(document.activeElement?.id, 'terrain-area')
  assert.equal(acquisitions.length, 1)
  assert.equal(workers.length, 1)
  assert.equal(workers[0].message.options.slopeLimitDeg, 10)
  assert.equal(workers[0].message.options.tiltDeg, 15)
  assert.match(panel().textContent, /参考配置を計算しています/)
  let layout
  await React.act(async () => { layout = workers[0].complete() })
  const feedback = panel().querySelector('.terrain-area-feedback').textContent
  const count = layout.moduleCount.toLocaleString('ja-JP')
  const capacity = layout.dcKw.toLocaleString('ja-JP', { maximumFractionDigits: 1 })
  assert.ok(feedback.includes('モジュール ' + count + '枚・DC 約' + capacity + ' kW（参考）。'))
  assert.match(feedback, /3Dは地形のみ表示中です。/)
  assert.equal(document.querySelector('.selected-parcel-3d'), null)
  assert.equal(moduleCount(), 0)
  assert.equal(modelZoom(), 1)
  await shrinkModel()
  const terrainOnlyZoom = modelZoom()
  assert.ok(terrainOnlyZoom < 1)
  await click('モジュール配置を3Dで表示', panel())
  assert.equal(moduleCount(), layout.moduleCount)
  const fittedZoom = modelZoom()
  assert.ok(fittedZoom > terrainOnlyZoom)
  assert.match(panel().querySelector('.terrain-area-feedback').textContent, /3Dはモジュール配置を表示中です。/)
  await shrinkModel()
  const customZoom = modelZoom()
  assert.ok(customZoom < fittedZoom)
  await click('モジュールを隠す', panel())
  assert.equal(moduleCount(), 0)
  assert.equal(modelZoom(), customZoom)
  await click('モジュール配置を3Dで表示', panel())
  assert.equal(moduleCount(), layout.moduleCount)
  assert.equal(modelZoom(), customZoom)
  await click('選択完了 → 3D')
  assert.equal(acquisitions.length, 1)
  assert.equal(workers.length, 1)
  assert.equal(moduleCount(), layout.moduleCount)
  assert.equal(modelZoom(), customZoom)
})

test('recalculation preserves module visibility while a new selected area hides modules', async () => {
  await mount()
  await click('選択完了 → 3D')
  await React.act(async () => workers[0].complete())
  assert.equal(moduleCount(), 0)

  await changeSlope(15)
  assert.equal(workers.length, 2)
  assert.equal(moduleCount(), 0)
  await React.act(async () => workers[1].complete())
  assert.equal(moduleCount(), 0)

  await click('モジュール配置を3Dで表示', panel())
  assert.ok(moduleCount() > 0)
  await shrinkModel()
  const customZoom = modelZoom()
  await changeSlope(20)
  assert.equal(workers.length, 3)
  assert.ok(moduleCount() > 0)
  await React.act(async () => workers[2].complete())
  assert.ok(moduleCount() > 0)
  assert.equal(modelZoom(), customZoom)

  selections = [{
    ...target, id: 'synthetic-map-target-other',
    geometry: {
      type: 'Polygon',
      coordinates: target.geometry.coordinates.map(ring => ring.map(([lon, lat]) => [lon + .002, lat])),
    },
  }]
  await click('選択完了 → 3D')
  assert.equal(acquisitions.length, 2)
  assert.equal(workers.length, 4)
  await React.act(async () => workers[3].complete())
  assert.equal(moduleCount(), 0)
  assert.match(panel().querySelector('.terrain-area-feedback').textContent, /3Dは地形のみ表示中です。/)
  await click('モジュール配置を3Dで表示', panel())
  assert.ok(moduleCount() > 0)
})

test('cancelling area analysis ignores its late result and does not rearm the same selection', async () => {
  await mount()
  let finish
  analyze = geometry => new Promise(resolve => { finish = () => resolve(flatTerrain(geometry)) })
  await click('選択完了 → 3D')
  await click('中止', panel())
  assert.equal(acquisitions[0].signal.aborted, true)
  await React.act(async () => finish())
  await click('選択完了 → 3D')
  assert.match(panel().textContent, /取得を中止しました/)
  assert.equal(acquisitions.length, 1)
  assert.equal(workers.length, 0)
})

test('drawing and exclusions retain manual terrain acquisition, then apply automatic layout', async () => {
  await mount()
  await click('合成範囲を描く')
  await click('合成除外を描く')
  assert.equal(acquisitions.length, 0)
  await click('地形を確認', panel())
  assert.equal(acquisitions.length, 1)
  assert.equal(workers.length, 1)
  assert.ok(workers[0].message.analysis.grid.boundary.some(polygon => polygon.length >= 2))
  await React.act(async () => workers[0].complete())
  assert.match(panel().textContent, /地形と参考配置を確認しました/)
})

test('reopening a review JSON restores terrain and waits for manual layout', async () => {
  await mount()
  await click('選択完了 → 3D')
  await React.act(async () => workers[0].complete())
  await click('モジュール配置を3Dで表示', panel())
  assert.ok(moduleCount() > 0)

  const parcelReview = setReviewParcel(createEmptyParcelReview(), target, 'target', {
    fileName: MAP_PARCEL_SOURCE, importedAt: '2026-10-13T00:00:00.000Z',
  })
  const terrainArea = flatTerrain(measureParcelReview(parcelReview).geometry)
  const record = createReviewRecord({
    report: { appVersion: '1.28-test', position: fixture.position, siteName: fixture.siteName,
      parcelReview, terrainArea, elevation: 100, elevationSource: '合成標高', obstructionHeight: 20, snowBase: .95 },
    generationDraft: { peakpower: 50, angle: 20, aspect: 0, loss: 14 },
  })
  const json = JSON.stringify(record)
  assert.deepEqual(Object.keys(record.results).includes('terrainPreview'), false)
  const file = new window.File([json], 'synthetic-review.json', { type: 'application/json' })
  // File.text is implemented by browsers but absent in this jsdom version.
  Object.defineProperty(file, 'text', { value: async () => json })
  const input = document.querySelector('input[aria-label="検討記録ファイルを選ぶ"]')
  assert.ok(input)
  Object.defineProperty(input, 'files', { value: [file] })
  await React.act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true })))
  await click('この記録を開く')
  assert.match(document.querySelector('.review-toolbar__feedback').textContent, /記録を開きました/)
  assert.equal(panel().querySelector('svg[data-view-zoom]')?.dataset.layoutModules, '0')
  await click('選択完了 → 3D')
  assert.equal(acquisitions.length, 1)
  assert.equal(workers.length, 1)
  await click('参考配置を計算', panel())
  assert.equal(workers.length, 2)
})
