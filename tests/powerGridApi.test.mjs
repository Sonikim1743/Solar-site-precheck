import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handlePowerGridRequest, onRequest, POWER_GRID_USER_AGENT } from '../functions/api/power-grid.js'
import { fetchNearbyPowerGrid } from '../src/services/powerGrid.js'

const body = 'lat=34.9&lon=133.3&radius=5000&supports=0'
const request = (value = body, overrides = {}) => new Request('https://example.test/api/power-grid', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://example.test' }, body: value, ...overrides,
})

test('browser lookup uses same-origin API and server sends truthful app identity', async () => {
  let upstreamCalls = 0
  const upstreamFetch = async (url, options) => {
    upstreamCalls++
    assert.equal(url, 'https://overpass-api.de/api/interpreter')
    assert.equal(options.headers['User-Agent'], POWER_GRID_USER_AGENT)
    assert.match(decodeURIComponent(options.body), /around:5000,34\.9000000,133\.3000000/)
    return { ok: true, status: 200, json: async () => ({ elements: [{ type: 'node', id: 1, lat: 34.91, lon: 133.3, tags: { power: 'substation', name: '試験変電所' } }] }) }
  }
  const fetchImpl = (url, options) => {
    assert.equal(url, '/api/power-grid')
    assert.ok(!options.body.includes('data='), 'client must not supply arbitrary Overpass QL')
    return handlePowerGridRequest(request(options.body), { fetchImpl: upstreamFetch })
  }
  const result = await fetchNearbyPowerGrid(34.9, 133.3, { fetchImpl, includeSupports: false })
  assert.equal(result.summary.substationCount, 1)
  assert.equal(result.sourceEndpoint, 'https://overpass-api.de/api/interpreter')
  await fetchNearbyPowerGrid(34.9, 133.3, { fetchImpl, includeSupports: false, cache: false })
  assert.equal(upstreamCalls, 1, 'server cache also protects repeated requests')
})

test('API rejects unrestricted URLs, QL, duplicate fields and invalid bounds before fetch', async () => {
  const fetchImpl = () => { throw new Error('must not fetch') }
  for (const invalid of [body + '&url=https://example.test', body + '&data=node(1);out;', body + '&lat=35', body.replace('34.9', '0'), body.replace('5000', '50001'), body.replace('lat=34.9', 'lat='), body.replace('supports=0', 'supports=unknown')]) {
    assert.equal((await handlePowerGridRequest(request(invalid), { fetchImpl })).status, 400)
  }
  assert.equal((await handlePowerGridRequest(request('x'.repeat(513)), { fetchImpl })).status, 413)
  assert.equal((await handlePowerGridRequest(request(body, { headers: { Origin: 'https://other.test', 'Content-Type': 'application/x-www-form-urlencoded' } }), { fetchImpl })).status, 403)
  assert.equal((await handlePowerGridRequest(request(body, { headers: { 'Content-Type': 'application/json' } }), { fetchImpl })).status, 415)
  assert.equal((await onRequest({ request: new Request('https://example.test/api/power-grid') })).status, 405)
})

test('API returns structured failure and propagates the rate-limit cooldown', async () => {
  const failed = await handlePowerGridRequest(request(), { fetchImpl: async () => { throw new TypeError('Failed to fetch') } })
  assert.equal(failed.status, 502)
  assert.match((await failed.json()).error, /公開地図サーバー/)
  const limited = await handlePowerGridRequest(request(), { fetchImpl: async () => ({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '180' }) }) })
  assert.equal(limited.status, 429)
  assert.ok(Number(limited.headers.get('Retry-After')) >= 179)
  assert.equal(limited.headers.get('Cache-Control'), 'no-store')
})
