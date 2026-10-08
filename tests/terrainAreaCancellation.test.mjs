import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeTerrainArea } from '../src/services/terrainArea.js'

// Synthetic location and synthetic tile values. Fetches are injected and never use the network.
const geometry = { type: 'Polygon', coordinates: [[[135,35],[135.0006,35],[135.0006,35.0006],[135,35.0006],[135,35]]] }
const tick = () => new Promise(resolve => setImmediate(resolve))
const decodePng = async blob => new Float64Array(65536).fill(blob.height)
const response = height => ({ ok: true, blob: async () => ({ size: 1, height }) })
const close = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)

test('cancelling one subscriber leaves another area analysis on the shared requests alive', { timeout: 10000 }, async () => {
  const controllerA = new AbortController(), controllerB = new AbortController()
  const calls = [], gates = []
  let release = false
  const fetchImpl = (url, { signal }) => {
    calls.push({ url, signal })
    return release ? Promise.resolve(response(120)) : new Promise(resolve => gates.push(() => resolve(response(120))))
  }
  const options = { useCache: false, fetchImpl, decodePng }
  const first = analyzeTerrainArea(geometry, { ...options, signal: controllerA.signal })
  const rejected = assert.rejects(first, { name: 'AbortError' })
  const second = analyzeTerrainArea(geometry, { ...options, signal: controllerB.signal })
  try {
    await tick()
    assert.ok(calls.length > 0, 'the fetch must have started before cancellation')
    controllerA.abort()
    await rejected
    assert.ok(calls.every(call => !call.signal.aborted), 'a shared request still has its second consumer')
    release = true
    gates.forEach(open => open())
    const result = await second
    close(result.summary.minElevation, 120)
    close(result.summary.maxElevation, 120)
    assert.equal(result.summary.coveragePercent, 100)
    assert.equal(new Set(calls.map(call => call.url)).size, calls.length, 'concurrent consumers share each tile request')
  } finally {
    controllerA.abort(); controllerB.abort(); release = true; gates.forEach(open => open())
    await Promise.allSettled([first, second])
  }
})

test('late responses from an abandoned attempt cannot replace the values of a fresh retry', { timeout: 10000 }, async () => {
  const controller = new AbortController(), gates = [], calls = []
  let attempt = 1
  const fetchImpl = (url, { signal }) => {
    calls.push({ attempt, url, signal })
    return attempt === 1 ? new Promise(resolve => gates.push(() => resolve(response(10)))) : Promise.resolve(response(220))
  }
  const options = { useCache: false, fetchImpl, decodePng }
  const first = analyzeTerrainArea(geometry, { ...options, signal: controller.signal })
  const rejected = assert.rejects(first, { name: 'AbortError' })
  try {
    await tick()
    assert.ok(calls.some(call => call.attempt === 1))
    controller.abort()
    await rejected
    assert.ok(calls.filter(call => call.attempt === 1).every(call => call.signal.aborted))
    attempt = 2
    const retry = analyzeTerrainArea(geometry, options)
    gates.forEach(open => open()) // The network ignores abort and returns old values after the retry starts.
    const result = await retry
    assert.ok(calls.some(call => call.attempt === 2), 'the retry starts fresh requests')
    close(result.summary.minElevation, 220)
    close(result.summary.maxElevation, 220)
    result.grid.elevations.forEach(value => close(value, 220))
    assert.equal(result.source.cached, false)
  } finally { controller.abort(); gates.forEach(open => open()); await Promise.allSettled([first]) }
})

test('cancelling after tile acquisition but before calculation returns no derived result', { timeout: 10000 }, async () => {
  const controller = new AbortController()
  let calculationAnnounced = false
  await assert.rejects(analyzeTerrainArea(geometry, {
    signal: controller.signal, useCache: false,
    fetchImpl: async () => response(50), decodePng,
    onProgress: event => { if (event.phase === 'calculating') { calculationAnnounced = true; controller.abort() } },
  }), { name: 'AbortError' })
  assert.equal(calculationAnnounced, true)
})
