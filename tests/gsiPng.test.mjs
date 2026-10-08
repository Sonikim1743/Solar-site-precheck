import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchElevation } from '../src/services/gsi.js'
import { fetchPointElevationPng, analyzeTerrainArea } from '../src/services/terrainArea.js'
import { terrainTilePoint } from '../src/utils/terrainArea.js'

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`)
const shape = { type: 'Polygon', coordinates: [[[134.9997, 34.9997], [135.0003, 34.9997], [135.0003, 35.0003], [134.9997, 35.0003], [134.9997, 34.9997]]] }

test('point sampling has the same signed/bilinear tile seam convention as area sampling', async () => {
  const [ox, oy] = terrainTilePoint(135, 35, 17)
  const result = await fetchPointElevationPng(35, 135, {
    useCache: false,
    fetchImpl: async url => { const m = /\/(\d+)\/(\d+)\.png$/.exec(url); return { ok: true, blob: async () => ({ size: 1, x: +m[1], y: +m[2] }) } },
    decodePng: async ({ x, y }) => Float64Array.from({ length: 65536 }, (_, i) => -5 + .01 * (x * 256 + i % 256 - ox) + .02 * (y * 256 + Math.floor(i / 256) - oy)),
  })
  close(result.value, -5)
  assert.match(result.dataSource, /DEM1A.*PNG/)
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)))
})

test('a missing fine pixel falls back to a complete coarse stencil, preserving valid zero', async () => {
  const requested = []
  const result = await fetchPointElevationPng(35, 135, {
    useCache: false,
    fetchImpl: async url => { requested.push(url); return { ok: true, blob: async () => ({ size: 1, fine: url.includes('dem1a_png') }) } },
    decodePng: async blob => new Float64Array(65536).fill(blob.fine ? NaN : 0),
  })
  assert.equal(result.value, 0); assert.equal(result.sourceLayer, 'dem5a_png')
  assert.ok(requested.every(url => url.includes('dem1a_png') || url.includes('dem5a_png')))
})

test('twenty simultaneous point calls deduplicate identical tiles and obey the global limit', async () => {
  const counts = new Map(); let active = 0, peak = 0
  const fetchImpl = async url => {
    counts.set(url, (counts.get(url) || 0) + 1); active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 5)); active--
    return { ok: true, blob: async () => ({ size: 1 }) }
  }
  const decodePng = async () => new Float64Array(65536).fill(123)
  const results = await Promise.all(Array.from({ length: 20 }, () => fetchPointElevationPng(35, 135, { useCache: false, fetchImpl, decodePng })))
  assert.ok(results.every(r => Math.abs(r.value - 123) < 1e-9))
  assert.ok(peak <= 4)
  assert.ok([...counts.values()].every(n => n === 1))
})

test('area and scattered point queries together use no more than four network slots', async () => {
  let active = 0, peak = 0
  const fetchImpl = async () => {
    active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 3)); active--
    return { ok: true, blob: async () => ({ size: 1 }) }
  }
  const decodePng = async () => new Float64Array(65536).fill(100)
  const options = { useCache: false, fetchImpl, decodePng }
  await Promise.all([analyzeTerrainArea(shape, options), ...Array.from({ length: 12 }, (_, i) => fetchPointElevationPng(35 + i * .003, 135 + i * .003, options))])
  assert.equal(peak, 4)
})

test('aborting one subscriber does not cancel a tile still needed by another subscriber', async () => {
  let underlyingAborts = 0, requests = 0
  const fetchImpl = async (url, { signal }) => {
    requests++; signal.addEventListener('abort', () => underlyingAborts++, { once: true })
    await new Promise(resolve => setTimeout(resolve, 15))
    return { ok: true, blob: async () => ({ size: 1 }) }
  }
  const decodePng = async () => new Float64Array(65536).fill(100), controller = new AbortController()
  const cancelled = fetchPointElevationPng(35, 135, { useCache: false, fetchImpl, decodePng, signal: controller.signal })
  const kept = fetchPointElevationPng(35, 135, { useCache: false, fetchImpl, decodePng })
  controller.abort()
  await assert.rejects(cancelled, { name: 'AbortError' })
  close((await kept).value, 100)
  assert.equal(underlyingAborts, 0); assert.ok(requests <= 4)
})

test('all cancelled queued work releases slots and a subsequent point query can proceed', async () => {
  const controller = new AbortController()
  const fetchImpl = () => new Promise(() => {})
  const decodePng = async () => new Float64Array(65536).fill(5)
  const requests = Array.from({ length: 8 }, (_, i) => fetchPointElevationPng(35 + i * .005, 135 + i * .005, { signal: controller.signal, useCache: false, fetchImpl, decodePng }))
  controller.abort()
  assert.ok((await Promise.allSettled(requests)).every(r => r.status === 'rejected' && r.reason.name === 'AbortError'))
  const retry = await fetchPointElevationPng(35, 135, { useCache: false, fetchImpl: async () => ({ ok: true, blob: async () => ({ size: 1 }) }), decodePng })
  close(retry.value, 5)
})

test('gsi API uses PNG first and fresh JSON only after PNG failure; TXT is never requested', async () => {
  const requested = []
  const result = await fetchElevation(35, 135, {
    useCache: false,
    fetchImpl: async url => {
      requested.push(url)
      return url.includes('getelevation.php') ? { ok: true, json: async () => ({ elevation: '0', hsrc: 'DEM5A' }) } : { ok: false, status: 404 }
    },
    decodePng: async () => { throw new Error('not called') },
  })
  assert.equal(result.value, 0); assert.match(result.dataSource, /JSON API/)
  assert.ok(requested.slice(0, -1).every(url => url.endsWith('.png')))
  assert.match(requested.at(-1), /getelevation.php/)
  assert.ok(!requested.some(url => url.includes('.txt')))
  for (const invalid of [null, '', false, 'e']) {
    await assert.rejects(fetchElevation(35, 135, { useCache: false, fetchImpl: async url => url.includes('getelevation.php') ? { ok: true, json: async () => ({ elevation: invalid }) } : { ok: false, status: 404 }, decodePng: async () => [] }), /標高値/)
  }
})

test('explicit cancellation never falls through to the JSON endpoint', async () => {
  const controller = new AbortController(), requested = []
  const pending = fetchElevation(35, 135, { signal: controller.signal, useCache: false, fetchImpl: async url => { requested.push(url); return new Promise(() => {}) }, decodePng: async () => [] })
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.ok(!requested.some(url => url.includes('getelevation.php')))
})

test('legacy TXT cache is ignored and new PNG values survive in the v2 point cache', async () => {
  const saved = new Map(), readKeys = [], writes = []
  const original = { window: globalThis.window, fetch: globalThis.fetch, createImageBitmap: globalThis.createImageBitmap, OffscreenCanvas: globalThis.OffscreenCanvas }
  let network = 0
  try {
    saved.set('solar-site-elevation-points-v1', JSON.stringify([['35.300000,135.300000', { value: 999, dataSource: '国土地理院 DEM5A標高タイル' }]]))
    globalThis.window = { localStorage: { getItem: key => { readKeys.push(key); return saved.get(key) || null }, setItem: (key, value) => { writes.push(key); saved.set(key, value) } } }
    globalThis.fetch = async () => { network++; return { ok: true, blob: async () => ({ size: 1 }) } }
    globalThis.createImageBitmap = async () => ({ width: 256, height: 256, close() {} })
    const rgba = new Uint8ClampedArray(65536 * 4)
    for (let i = 0; i < 65536; i++) rgba.set([0, 22, 68, 255], i * 4) // 5700 cm
    globalThis.OffscreenCanvas = class { getContext() { return { drawImage() {}, getImageData() { return { data: rgba } } } } }
    const first = await fetchElevation(35.3, 135.3)
    close(first.value, 57); assert.match(first.dataSource, /PNG/)
    const count = network, second = await fetchElevation(35.3, 135.3)
    assert.equal(second.cached, true); assert.equal(network, count)
    await new Promise(resolve => setTimeout(resolve, 170))
    assert.deepEqual(readKeys, ['solar-site-elevation-points-v2'])
    assert.ok(writes.includes('solar-site-elevation-points-v2'))
  } finally {
    for (const [key, value] of Object.entries(original)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value
  }
})
