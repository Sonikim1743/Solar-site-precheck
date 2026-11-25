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
const slopeGuideKey = 'solar-site-precheck-ui-slope-coachmark-v1'

function nextSelection() {
  return {
    ...target, id: 'synthetic-map-target-other',
    geometry: {
      type: 'Polygon',
      coordinates: target.geometry.coordinates.map(ring => ring.map(([lon, lat]) => [lon + .002, lat])),
    },
  }
}

class WorkerStub {
  constructor() { workers.push(this) }
  postMessage(message) { this.message = message }
  terminate() { this.terminated = true }
  complete(analysis = this.message.analysis) {
    const result = buildTerrainLayout(analysis, this.message.options)
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
      export default function TestMap({ onConfirmRegionalParcels, onReviewGeometry, onTutorialDraftChange }) {
        const { boundary, exclusion } = globalThis.__terrainWorkflowFixture()
        return React.createElement(React.Fragment, null,
          React.createElement('button', { onClick: () => onTutorialDraftChange?.(true) }, '合成地番を選ぶ'),
          React.createElement('button', { onClick: () => {
            if (onConfirmRegionalParcels(globalThis.__terrainWorkflowFixture().targets)) onTutorialDraftChange?.(false)
          } }, '選択完了 → 3D'),
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
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true })
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

async function mount({ preserveStorage = false } = {}) {
  if (preserveStorage) window.localStorage.removeItem('solar-site-precheck-draft-v1')
  else window.localStorage.clear()
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
const slopeGuide = () => panel().querySelector('.terrain-layout-slope-guide')
const slopeControl = () => panel().querySelector('select[aria-label="参考配置の勾配条件"]')

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
  const control = slopeControl()
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

  assert.ok(slopeGuide())
  await React.act(async () => slopeControl().dispatchEvent(new window.Event('pointerdown', { bubbles: true })))
  assert.equal(slopeGuide(), null)
  assert.equal(workers.length, 1)

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

  selections = [nextSelection()]
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

test('first automatic layout shows a non-modal slope guide once and retains dismissal', async () => {
  await mount()
  await click('選択完了 → 3D')
  await React.act(async () => new Promise(resolve => setTimeout(resolve, 0)))
  assert.equal(slopeGuide(), null)
  assert.equal(window.localStorage.getItem(slopeGuideKey), null)

  const zoomButton = panel().querySelector('button[aria-label="3Dを縮小"]')
  zoomButton.focus()
  let layout
  await React.act(async () => { layout = workers[0].complete() })
  assert.ok(layout.moduleCount > 0)
  const guide = slopeGuide()
  assert.ok(guide)
  assert.ok(guide.textContent.includes('ここで勾配条件を変更できます。15°・20°も選べます。'))
  const control = slopeControl()
  assert.ok(control.closest('.terrain-layout-slope-highlight'))
  assert.ok(guide.contains(document.getElementById(control.getAttribute('aria-describedby'))))
  assert.ok(document.activeElement === zoomButton, 'showing the guide keeps focus on the active control')
  assert.equal(window.localStorage.getItem(slopeGuideKey), 'seen')
  await shrinkModel()
  assert.ok(modelZoom() < 1)
  assert.ok(slopeGuide())

  const close = guide.querySelector('button[aria-label="勾配条件の案内を閉じる"]')
  assert.ok(close && !close.disabled)
  await React.act(async () => close.click())
  assert.equal(slopeGuide(), null)
  assert.equal(control.hasAttribute('aria-describedby'), false)
  selections = [nextSelection()]
  await click('選択完了 → 3D')
  await React.act(async () => workers[1].complete())
  assert.equal(slopeGuide(), null)

  await React.act(async () => root.unmount())
  root = null
  await mount({ preserveStorage: true })
  await click('選択完了 → 3D')
  await React.act(async () => workers[0].complete())
  assert.equal(slopeGuide(), null)
})

test('an automatic layout with zero modules still explains and accepts slope changes', async () => {
  await mount()
  await click('選択完了 → 3D')
  const { analysis } = workers[0].message
  const steepArea = { ...analysis, grid: { ...analysis.grid, slopes: analysis.grid.slopes.map(() => 17) } }
  let layout
  await React.act(async () => { layout = workers[0].complete(steepArea) })
  assert.equal(layout.moduleCount, 0)
  assert.ok(slopeGuide())
  const control = slopeControl()
  control.focus()
  assert.ok(slopeGuide(), 'moving keyboard focus to the control still allows reading the guide')
  await changeSlope(20)
  assert.equal(slopeGuide(), null)
  assert.equal(workers[1].message.options.slopeLimitDeg, 20)
  assert.equal(window.localStorage.getItem(slopeGuideKey), 'seen')
  await React.act(async () => workers[1].complete())
  assert.equal(slopeGuide(), null)
})

test('an unsuccessful automatic layout and a successful manual retry leave the slope guide unused', async () => {
  await mount()
  await click('選択完了 → 3D')
  await React.act(async () => workers[0].onmessage({ data: { error: '合成計算エラー' } }))
  assert.equal(slopeGuide(), null)
  assert.equal(window.localStorage.getItem(slopeGuideKey), null)

  await click('参考配置を計算', panel())
  await React.act(async () => workers[1].complete())
  assert.equal(slopeGuide(), null)
  assert.equal(window.localStorage.getItem(slopeGuideKey), null)

  selections = [nextSelection()]
  await click('選択完了 → 3D')
  await React.act(async () => workers[2].complete())
  assert.ok(slopeGuide(), 'the first successful automatic layout is still eligible')
  await React.act(async () => slopeControl().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
  assert.equal(slopeGuide(), null)
  assert.equal(workers.length, 3)
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


test('the app tour follows real layout actions and keeps the slope hint separate', async () => {
  await mount()
  const tourKey = 'solar-site-precheck-ui-terrain-tour-v1'
  const guide = () => document.querySelector('.terrain-guide-tour-callout')
  const step = expected => assert.match(guide()?.textContent ?? '', new RegExp(expected + ' *[/] *6'))

  await click('チュートリアル')
  step(1)
  await click('合成地番を選ぶ')
  step(2)

  let completeTerrain
  analyze = geometry => new Promise(resolve => {
    completeTerrain = () => resolve(flatTerrain(geometry))
  })
  await click('選択完了 → 3D')
  step(3)
  assert.equal(acquisitions.length, 1)
  assert.equal(workers.length, 0)
  await React.act(async () => completeTerrain())
  step(4)
  assert.equal(workers.length, 1)
  await React.act(async () => { workers[0].complete() })
  assert.ok(slopeGuide(), 'The one-time prompt can appear independently of the tour')

  await click('モジュール配置を3Dで表示', panel())
  step(5)
  assert.equal(slopeGuide(), null)
  await click('次へ', guide())
  step(6)
  assert.ok(slopeGuide(), 'The prompt returns outside step five if it was never dismissed')
  await click('戻る', guide())
  step(5)
  assert.equal(slopeGuide(), null)
  await changeSlope(15)
  step(6)
  assert.equal(slopeGuide(), null, 'Direct slope interaction dismisses the prompt')
  assert.equal(workers.length, 2)
  await React.act(async () => { workers[1].complete() })

  await click('レポート', panel())
  assert.equal(guide(), null)
  assert.equal(window.localStorage.getItem(tourKey), 'completed')
  assert.equal(window.localStorage.getItem(slopeGuideKey), 'seen')

  await click('チュートリアル')
  step(5)
  await click('終了', guide())
  assert.equal(guide(), null)
  assert.equal(window.localStorage.getItem(tourKey), 'ended')
})
