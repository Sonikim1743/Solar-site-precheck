import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchNearbyPowerGrid, fetchPowerGridPayload } from '../shared/powerGrid.js'

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

for (const stage of ['fetch', 'body']) {
  for (const gap of [1, 2, 3]) {
    test(`retry after cancellation during ${stage}, with ${gap} microtask gap, shares a fresh request`, async () => {
      let calls = 0
      const signals = []
      const finishRequests = []
      const fetchImpl = async (_, options) => {
        signals.push(options.signal)
        if (++calls === 1) {
          const untilAbort = () => new Promise((_, reject) => {
            options.signal.addEventListener('abort', () => {
              reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
            }, { once: true })
          })
          return stage === 'fetch' ? untilAbort() : { ok: true, status: 200, json: untilAbort }
        }
        return new Promise(resolve => {
          finishRequests.push(() => resolve({ ok: true, status: 200, json: async () => ({ elements: [] }) }))
        })
      }
      const options = { fetchImpl, totalTimeoutMs: 1000, cache: false }
      const resultOf = promise => promise.then(data => ({ data }), error => ({ error }))
      const controller = new AbortController()
      const first = resultOf(fetchPowerGridPayload(35, 133, 5000, { ...options, signal: controller.signal }))
      await new Promise(resolve => setImmediate(resolve))
      controller.abort()
      for (let index = 0; index < gap; index++) await Promise.resolve()

      const second = resultOf(fetchPowerGridPayload(35, 133, 5000, options))
      const callsAtRetry = calls
      const firstResult = await first
      // Let the cancelled entry's finally run before a third subscriber joins.
      await new Promise(resolve => setImmediate(resolve))
      const third = resultOf(fetchPowerGridPayload(35, 133, 5000, options))
      const callsAfterCleanup = calls
      for (const finish of finishRequests) finish()
      const [secondResult, thirdResult] = await Promise.all([second, third])

      assert.equal(firstResult.error?.code, 'cancelled')
      assert.equal(signals[0].aborted, true)
      assert.equal(callsAtRetry, 2, 'the retry must replace the aborted pending entry')
      assert.equal(callsAfterCleanup, 2, 'old cleanup must preserve the replacement for sharing')
      assert.equal(signals[1].aborted, false)
      assert.equal(secondResult.error, undefined)
      assert.equal(thirdResult.error, undefined)
      assert.deepEqual(secondResult.data.elements, [])
      assert.deepEqual(thirdResult.data.elements, [])
    })
  }
}
