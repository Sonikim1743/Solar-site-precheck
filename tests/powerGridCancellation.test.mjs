import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchNearbyPowerGrid } from '../shared/powerGrid.js'

test('the overall deadline bounds a fetch that never settles or respects abort', async () => {
  let signal, calls = 0
  const start = Date.now()
  await assert.rejects(fetchNearbyPowerGrid(35, 133, {
    fetchImpl: (_, options) => { signal = options.signal; calls++; return new Promise(() => {}) },
    timeoutMs: 1000, totalTimeoutMs: 20,
  }), error => error.code === 'timeout')
  assert.equal(calls, 1)
  assert.equal(signal.aborted, true)
  assert.ok(Date.now() - start < 1000)
})

test('cancelling one shared lookup leaves the other subscriber and the cache intact', async () => {
  let finish, calls = 0, upstreamSignal
  const fetchImpl = async (_, options) => {
    calls++; upstreamSignal = options.signal
    return { ok: true, status: 200, json: () => new Promise(resolve => { finish = resolve }) }
  }
  const controller = new AbortController()
  const cancelled = fetchNearbyPowerGrid(35, 133, { fetchImpl, signal: controller.signal })
  const kept = fetchNearbyPowerGrid(35, 133, { fetchImpl })
  await new Promise(resolve => setTimeout(resolve, 0))
  controller.abort()
  await assert.rejects(cancelled, error => error.code === 'cancelled')
  assert.equal(upstreamSignal.aborted, false)
  finish({ elements: [] })
  assert.equal((await kept).summary.lineCount, 0)
  assert.equal((await fetchNearbyPowerGrid(35, 133, { fetchImpl })).cached, true)
  assert.equal(calls, 1)
})

test('cancel after headers aborts the JSON body and does not try a fallback', async () => {
  let signal, calls = 0
  const controller = new AbortController()
  const promise = fetchNearbyPowerGrid(35, 133, { signal: controller.signal, fetchImpl: async (_, options) => {
    calls++; signal = options.signal
    return { ok: true, status: 200, json: () => new Promise(() => {}) }
  } })
  await new Promise(resolve => setTimeout(resolve, 0))
  controller.abort()
  await assert.rejects(promise, error => error.code === 'cancelled')
  assert.equal(signal.aborted, true)
  assert.equal(calls, 1)
})

test('deadline during progressive expansion retains only the completed radius and its age', async () => {
  const fetchedAt = '2026-10-15T00:00:00Z'
  let calls = 0
  const result = await fetchNearbyPowerGrid(35, 133, { progressive: true, totalTimeoutMs: 20, fetchImpl: async () => {
    if (++calls > 1) return new Promise(() => {})
    return { ok: true, status: 200, json: async () => ({ elements: [], fetchedAt }) }
  } })
  assert.equal(result.radiusMeters, 5000)
  assert.equal(result.fetchedAt, fetchedAt)
  assert.match(result.search.partialError, /取得時間/)
})
