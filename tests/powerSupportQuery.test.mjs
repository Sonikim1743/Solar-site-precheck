import test from 'node:test'
import assert from 'node:assert/strict'
import { createPowerSupportQuery, normalizePowerSupports, powerSupportSourceUrl, powerSupportSiteKey, MAX_POWER_SUPPORT_MARKERS, POWER_SUPPORT_TIMEOUT_MS } from '../src/utils/powerSupportQuery.js'

const site = { lat: 35, lon: 135 }
const pole = (id = 'node/101', extra = {}) => ({ id, type: 'pole', position: { lat: 35.0005, lon: 135 }, ref: 'TEST-P01', operator: '試験事業者', voltageKv: null, ...extra })
const payload = supports => ({ supports, fetchedAt: '2026-10-13T00:00:00.000Z' })

test('support lookup uses the API Japan envelope and rejects unsupported radii without a fetch', async () => {
  assert.equal(powerSupportSiteKey({ lat: 20, lon: 122 }), '20,122')
  assert.equal(powerSupportSiteKey({ lat: 46, lon: 154 }), '46,154')
  for (const position of [{ lat: 46.01, lon: 135 }, { lat: 35, lon: 121.99 }, { lat: 19.99, lon: 135 }]) assert.equal(powerSupportSiteKey(position), '')
  assert.throws(() => normalizePowerSupports(payload([]), site, 2000), /500m/)
  let calls = 0, receivedOptions
  const query = createPowerSupportQuery({ load: async (lat, lon, options) => { calls++; receivedOptions = options; return payload([]) } })
  await query.run({ lat: 47, lon: 135 }, 500)
  await query.run(site, 2000)
  assert.equal(calls, 0)
  await query.run(site, 1000)
  assert.equal(calls, 1)
  assert.equal(receivedOptions.progressive, false)
  assert.equal(receivedOptions.includeSupports, true)
  assert.equal(receivedOptions.timeoutMs, POWER_SUPPORT_TIMEOUT_MS)
  assert.equal(POWER_SUPPORT_TIMEOUT_MS, 45000)
  let resolveLate
  const lateQuery = createPowerSupportQuery({ load: () => new Promise(resolve => { resolveLate = resolve }) })
  const pending = lateQuery.run(site, 500)
  await lateQuery.run(site, 2000)
  resolveLate(payload([pole()]))
  assert.equal(await pending, null)
  assert.equal(lateQuery.state.status, 'error', 'invalid radius also invalidates an already-running response')
  assert.equal(lateQuery.state.data, null)
})

test('short support query uses same-origin API, explicit support flag and fixed 500m radius', async () => {
  const calls = []
  const query = createPowerSupportQuery({ fetchImpl: async (url, options) => {
    calls.push({ url, options })
    return { ok: true, status: 200, json: async () => ({ elements: [
      { type: 'node', id: 101, lat: 35.0005, lon: 135, tags: { power: 'pole', ref: 'TEST-P01', operator: '試験事業者' } },
      { type: 'node', id: 102, lat: 35.001, lon: 135, tags: { power: 'tower', voltage: '66000' } },
    ], fetchedAt: '2026-10-13T00:00:00.000Z' }) }
  } })
  assert.equal(calls.length, 0, 'creating a query must not fetch')
  const result = await query.run(site, 500)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/power-grid')
  const body = new URLSearchParams(calls[0].options.body)
  assert.equal(body.get('radius'), '500')
  assert.equal(body.get('supports'), '1')
  assert.equal(result.supports.length, 2)
  assert.equal(result.supports[0].voltageLabel, '電圧未記載')
  assert.equal(result.supports[1].voltageLabel, '66 kV')
  assert.equal(query.state.status, 'success')
})

test('actual HTTP request is aborted on cancel and no timeout or late result replaces cancellation', async () => {
  let requestSignal
  const query = createPowerSupportQuery({ fetchImpl: async (url, options) => {
    requestSignal = options.signal
    return await new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }))
  } })
  const running = query.run(site, 500)
  assert.equal(query.state.status, 'loading')
  query.cancel()
  assert.equal(requestSignal.aborted, true)
  assert.equal(await running, null)
  assert.equal(query.state.status, 'cancelled')
  assert.equal(query.state.data, null)
})

test('cancel remains effective after response headers while the JSON body is pending', async () => {
  let requestSignal, resolveBody
  const query = createPowerSupportQuery({ fetchImpl: async (url, options) => {
    requestSignal = options.signal
    return { ok: true, status: 200, json: () => new Promise(resolve => { resolveBody = resolve }) }
  } })
  const running = query.run(site, 500)
  await new Promise(resolve => setTimeout(resolve, 0))
  query.cancel()
  assert.equal(requestSignal.aborted, true)
  resolveBody({ elements: [] })
  assert.equal(await running, null)
  assert.equal(query.state.status, 'cancelled')
})

test('candidate change invalidates delayed results and disposal does not publish into an unmounted page', async () => {
  const resolvers = [], changes = []
  const query = createPowerSupportQuery({ onChange: state => changes.push(state), load: () => new Promise(resolve => resolvers.push(resolve)) })
  const first = query.run(site, 500)
  const nextSite = { lat: 35.01, lon: 135 }
  query.setPosition(nextSite)
  assert.equal(query.state.data, null)
  const second = query.run(nextSite, 1000)
  resolvers[1](payload([pole('node/202', { position: { lat: 35.0105, lon: 135 } })]))
  await second
  resolvers[0](payload([pole()]))
  assert.equal(await first, null)
  assert.equal(query.state.data.supports[0].id, 'node/202')
  const third = query.run(nextSite, 500), countBeforeDispose = changes.length
  query.dispose()
  resolvers[2](payload([]))
  await third
  assert.equal(changes.length, countBeforeDispose)
})

test('429 cooldown survives candidate changes and does not issue another request until retry time', async () => {
  let time = 100, calls = 0
  const query = createPowerSupportQuery({ now: () => time, load: async () => {
    calls++
    if (calls === 1) throw Object.assign(new Error('rate limited'), { code: 'rate-limit', retryAt: 90100 })
    return payload([])
  } })
  await query.run(site, 500)
  assert.equal(query.state.retryAt, 90100)
  query.setPosition({ lat: 35.02, lon: 135 })
  await query.run({ lat: 35.02, lon: 135 }, 1000)
  assert.equal(calls, 1)
  assert.equal(query.state.status, 'error')
  time = 90101
  await query.run(site, 500)
  assert.equal(calls, 2)
  assert.equal(query.state.status, 'empty')
})

test('node-only attributes do not infer voltage or ownership and unsafe/missing positions are omitted', () => {
  const data = normalizePowerSupports(payload([
    pole('node/1', { voltageLabel: '77kV', owner: 'unverified', ref: '' }),
    pole('node/2', { position: { lat: 35.02, lon: 135 } }),
    pole('javascript:alert(1)'), pole('node/3', { type: 'substation' }), pole('node/4', { position: { lat: NaN, lon: 135 } }),
  ]), site, 500)
  assert.equal(data.supports.length, 1)
  assert.equal(data.supports[0].voltageLabel, '電圧未記載')
  assert.equal(data.supports[0].ref, '')
  assert.equal('owner' in data.supports[0], false)
  assert.equal(powerSupportSourceUrl('node/1'), 'https://www.openstreetmap.org/node/1')
  assert.equal(powerSupportSourceUrl('node/1?token=secret'), '')
})

test('marker caps are explicit and failed re-query preserves only the same-candidate previous data', async () => {
  const many = Array.from({ length: 300 }, (_, i) => pole(`node/${i + 1}`))
  const data = normalizePowerSupports(payload(many), site, 500)
  assert.equal(data.supports.length, MAX_POWER_SUPPORT_MARKERS)
  assert.equal(data.totalCount, 300)
  assert.equal(data.truncated, true)
  let first = true
  const query = createPowerSupportQuery({ load: async () => { if (first) { first = false; return payload([pole()]) }; throw new Error('network failed') } })
  await query.run(site, 500)
  await query.run(site, 1000)
  assert.equal(query.state.status, 'error')
  assert.equal(query.state.data.radiusMeters, 500)
  query.setPosition({ lat: 35.01, lon: 135 })
  assert.equal(query.state.data, null)
})
