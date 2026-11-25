import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { readFile } from 'node:fs/promises'
import { JSDOM } from 'jsdom'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import { TERRAIN_GUIDE_STEPS } from '../../src/utils/terrainGuideTour.js'

let dom, React, createRoot, server, Tour
const scrolls = []
const anchorRects = new Map()
const target = step => {
  const anchor = TERRAIN_GUIDE_STEPS[step].anchor
  return Array.isArray(anchor) ? anchor[0] : anchor
}
const animationFrame = () => new Promise(resolve => window.requestAnimationFrame(resolve))

before(async () => {
  dom = new JSDOM('<main id="root"></main>', { url: 'https://local.test/', pretendToBeVisual: true })
  const { window } = dom
  Object.assign(globalThis, {
    window, document: window.document, MutationObserver: window.MutationObserver,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  window.matchMedia = query => ({
    media: query, matches: query.includes('prefers-reduced-motion'),
    addEventListener() {}, removeEventListener() {},
  })
  const defaultRect = window.HTMLElement.prototype.getBoundingClientRect
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const tag = this.dataset.terrainTourAnchor
    const box = anchorRects.get(tag)
    if (box) return new window.DOMRect(...box)
    return defaultRect.call(this)
  }
  const defaultRects = window.HTMLElement.prototype.getClientRects
  window.HTMLElement.prototype.getClientRects = function () {
    return anchorRects.has(this.dataset.terrainTourAnchor)
      ? [this.getBoundingClientRect()] : defaultRects.call(this)
  }
  window.HTMLElement.prototype.scrollIntoView = function (options) {
    const tag = this.dataset.terrainTourAnchor
    scrolls.push({ tag, behavior: options?.behavior })
    const box = anchorRects.get(tag)
    if (box) anchorRects.set(tag, [box[0], 160, box[2], box[3]])
    window.dispatchEvent(new window.Event('scroll'))
  }

  const sheet = document.createElement('style')
  sheet.textContent = await readFile(new URL('../../src/components/terrain-guide-tour.css', import.meta.url), 'utf8')
  document.head.append(sheet)

  React = await import('react')
  ;({ createRoot } = await import('react-dom/client'))
  server = await createServer({
    configFile: false, root: process.cwd(), plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] },
  })
  Tour = (await server.ssrLoadModule('/src/components/TerrainGuideTour.jsx')).default
}, { timeout: 30_000 })

after(async () => {
  await server?.close()
  dom?.window.close()
  for (const key of ['window', 'document', 'MutationObserver', 'requestAnimationFrame',
    'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key]
})

const chooseButton = (scope, label) => {
  const button = [...scope.querySelectorAll('button')].find(element => element.textContent.trim() === label)
  assert.ok(button, `Missing ${label} button`)
  return button
}

test('tour controls respect verified conditions without trapping focus or outside actions', async () => {
  const h = React.createElement
  const endings = []
  let outsideClicks = 0, selected = false
  const first = target(0)
  const next = target(1)
  anchorRects.set(first, [40, 930, 120, 36])
  anchorRects.set(next, [40, 220, 190, 36])
  function Harness() {
    const [step, setStep] = React.useState(null)
    const [satisfied, setSatisfied] = React.useState(false)
    const applyStep = nextStep => {
      if (nextStep < TERRAIN_GUIDE_STEPS.length) { setStep(nextStep); setSatisfied(false) }
      else { endings.push('completed'); setStep(null) }
    }
    return h(React.Fragment, null,
      h('button', { onClick: () => applyStep(0) }, 'チュートリアル'),
      h('button', { onClick: () => { outsideClicks++ } }, '別の操作'),
      h('button', {
        'data-terrain-tour-anchor': first,
        onClick: () => { selected = true; setSatisfied(true) },
      }, '地番を選ぶ'),
      h('button', { 'data-terrain-tour-anchor': next }, '選択を確定'),
      h(Tour, {
        step, steps: TERRAIN_GUIDE_STEPS, satisfied,
        onNext: () => applyStep(step + 1),
        onBack: () => applyStep(step - 1),
        onEnd: () => { endings.push('ended'); setStep(null) },
      }),
    )
  }

  const root = createRoot(document.getElementById('root'))
  const click = async (label, scope = document) => React.act(async () => {
    chooseButton(scope, label).click()
  })
  const callout = () => document.querySelector('.terrain-guide-tour-callout')
  const frame = async () => React.act(async () => { await animationFrame(); await animationFrame() })

  try {
    await React.act(async () => root.render(h(Harness)))
    const start = chooseButton(document, 'チュートリアル')
    start.focus()
    await click('チュートリアル')
    await frame()

    assert.equal(document.activeElement, start)
    assert.match(callout().textContent, /1\s*\/\s*6/)
    assert.ok(scrolls.some(entry => entry.tag === first && entry.behavior !== 'smooth'))
    assert.equal(window.getComputedStyle(document.querySelector('.terrain-guide-tour-ring')).pointerEvents, 'none')
    const pointer = document.querySelector('.terrain-guide-tour-pointer')
    assert.ok(pointer?.querySelector('.terrain-guide-tour-pointer-arrow'))
    assert.equal(window.getComputedStyle(pointer).pointerEvents, 'none')

    assert.equal(chooseButton(callout(), '次へ').disabled, true)
    await click('次へ', callout())
    assert.match(callout().textContent, /1\s*\/\s*6/)
    await click('別の操作')
    assert.equal(outsideClicks, 1)
    await click('地番を選ぶ')
    assert.equal(selected, true)
    assert.match(callout().textContent, /できました/)
    assert.equal(chooseButton(callout(), '次へ').disabled, false)
    await click('次へ', callout())
    assert.match(callout().textContent, /2\s*\/\s*6/)
    await click('戻る', callout())
    assert.match(callout().textContent, /1\s*\/\s*6/)
    await click('地番を選ぶ')
    await click('次へ', callout())
    assert.match(callout().textContent, /2\s*\/\s*6/)
    anchorRects.set(next, [235, 235, 78, 46])
    window.innerWidth = 320
    window.innerHeight = 460
    await React.act(async () => window.dispatchEvent(new window.Event('resize')))
    await frame()
    assert.equal(callout().style.left, '12px')
    assert.ok(parseFloat(callout().style.top) >= 12)
    await click('終了', callout())
    assert.equal(callout(), null)

    await click('チュートリアル')
    await React.act(async () => document.activeElement.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ))
    assert.equal(callout(), null)
    assert.deepEqual(endings, ['ended', 'ended'])
  } finally {
    await React.act(async () => root.unmount())
  }
})
