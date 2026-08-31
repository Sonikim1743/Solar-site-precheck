import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchNearbyPowerGrid, POWER_GRID_ENDPOINTS, parsePowerGridElements, powerGridDisplayLine, powerGridDisplayLineLabel, powerGridSearchSummary } from '../shared/powerGrid.js'

const line = { type: 'way', id: 1, tags: { power: 'line', name: '試験線', voltage: '66000' }, geometry: [{ lat: 35, lon: 139.01 }, { lat: 35.01, lon: 139.01 }] }
const ok = (elements = [line]) => ({ ok: true, status: 200, json: async () => ({ elements }) })

test('66/77 search passes nearer 500kV and substations, stops on 66kV without requiring a substation', async () => {
  const calls = []
  const highVoltage = { ...line, id: 2, tags: { ...line.tags, voltage: '500000' } }
  const fetchImpl = async (_url, { body }) => {
    const radius = Number(new URLSearchParams(body).get('data').match(/around:(\d+)/)[1])
    calls.push(radius)
    return radius === 5000
      ? ok([highVoltage, { type: 'node', id: 3, tags: { power: 'substation' }, lat: 35, lon: 139 }])
      : ok([highVoltage, { ...line, geometry: [{ lat: 35, lon: 139.07 }, { lat: 35.01, lon: 139.07 }] }])
  }
  const result = await fetchNearbyPowerGrid(35, 139, { fetchImpl, progressive: true, prefer66Or77: true })
  assert.deepEqual(calls, [5000, 10000])
  assert.equal(result.summary.nearestLine.id, 'way/2', 'absolute nearest remains a separate reference')
  assert.equal(powerGridDisplayLine(result).id, 'way/1')
  assert.equal(result.search.foundPreferredLine, true)
  assert.equal(result.search.foundSubstation, false)
  assert.equal(powerGridDisplayLineLabel(result), '66・77kV 最寄り候補')
})

test('77kV and multi-voltage 66/154kV lines both satisfy the exact voltage search', async () => {
  for (const voltage of ['77000', '66000;154000']) {
    const result = await fetchNearbyPowerGrid(35, 139, {
      fetchImpl: async () => ok([{ ...line, tags: { ...line.tags, voltage } }]),
      progressive: true, prefer66Or77: true,
    })
    assert.deepEqual(result.search.attemptedRadiiMeters, [5000])
    assert.equal(result.search.foundPreferredLine, true)
    assert.match(result.summary.nearestPreferredLine.voltageLabel, /66kV|77kV/)
  }
})

test('unknown and other voltages expand to 50km without claiming there is no grid', async () => {
  for (const voltage of [undefined, '33000', '69000', '110000']) {
    const result = await fetchNearbyPowerGrid(35, 139, {
      fetchImpl: async () => ok([{ ...line, tags: { ...line.tags, voltage } }]),
      progressive: true, prefer66Or77: true,
    })
    assert.deepEqual(result.search.attemptedRadiiMeters, [5000, 10000, 20000, 50000])
    assert.equal(result.search.reachedMaxRadius, true)
    assert.equal(result.search.foundPreferredLine, false)
    assert.equal(powerGridDisplayLine(result).id, 'way/1')
    assert.match(powerGridDisplayLineLabel(result), /参考/)
    assert.match(powerGridSearchSummary(result), /50km.*確認できませんでした/)
  }
})

test('66/77 progressive search retains references when rate limited during expansion', async () => {
  let calls = 0
  const result = await fetchNearbyPowerGrid(35, 139, {
    fetchImpl: async () => ++calls === 1 ? ok([{ ...line, tags: { power: 'line' } }]) : { ok: false, status: 429, headers: new Headers() },
    progressive: true, prefer66Or77: true,
  })
  assert.equal(calls, 2)
  assert.equal(result.radiusMeters, 5000)
  assert.equal(result.search.foundPreferredLine, false)
  assert.equal(result.search.reachedMaxRadius, false)
  assert.match(powerGridSearchSummary(result), /未完了/)
})

test('nearest line is measured to its segment, not just the nearest tower vertex', () => {
  const result = parsePowerGridElements([{ ...line, geometry: [{ lat: 34.98, lon: 139 }, { lat: 35.02, lon: 139 }] }], 35, 139.001)
  assert.ok(result.summary.nearestLine.distanceMeters < 100)
  assert.equal(result.summary.nearestLine.nearestPoint.lat, 35)
})

test('connection reset falls back to the documented server and remembers its failure', async () => {
  const calls = []
  const progress = []
  const fetchImpl = async (url, options) => {
    calls.push(url)
    assert.equal(options.credentials, 'omit')
    if (url === POWER_GRID_ENDPOINTS[0]) throw new TypeError('Failed to fetch')
    return ok()
  }
  const result = await fetchNearbyPowerGrid(35, 139, { fetchImpl, onProgress: (event) => progress.push(event.type) })
  assert.equal(result.summary.lineCount, 1)
  assert.equal(result.sourceEndpoint, POWER_GRID_ENDPOINTS[1])
  assert.deepEqual(calls, POWER_GRID_ENDPOINTS)
  assert.deepEqual(progress, ['request', 'fallback'])
  await fetchNearbyPowerGrid(35, 139, { fetchImpl, radiusMeters: 10000 })
  assert.deepEqual(calls, [...POWER_GRID_ENDPOINTS, POWER_GRID_ENDPOINTS[1]])
})

test('concurrent and repeated identical lookups share successful results', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return ok() }
  const [first, second] = await Promise.all([
    fetchNearbyPowerGrid(35, 139, { fetchImpl }), fetchNearbyPowerGrid(35, 139, { fetchImpl }),
  ])
  first.lines[0].name = 'changed by consumer'
  assert.equal(second.lines[0].name, '試験線')
  const cached = await fetchNearbyPowerGrid(35, 139, { fetchImpl })
  assert.equal(cached.cached, true)
  assert.equal(cached.fetchedAt, first.fetchedAt)
  assert.equal(cached.lines[0].name, '試験線')
  assert.equal(calls, 1)
  await fetchNearbyPowerGrid(35.1, 139, { fetchImpl })
  assert.equal(calls, 2, 'different sites must not reuse distances')
})

test('429 pauses the whole transport rather than evading quotas on another server', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return { ok: false, status: 429, headers: new Headers({ 'Retry-After': '120' }) } }
  await assert.rejects(fetchNearbyPowerGrid(35, 139, { fetchImpl }), /利用制限中/)
  await assert.rejects(fetchNearbyPowerGrid(35.1, 139, { fetchImpl }), /利用制限中/)
  assert.equal(calls, 1)
})

test('timeout uses the fallback and clears request timers', async () => {
  const fetchImpl = (url, { signal }) => url === POWER_GRID_ENDPOINTS[0]
    ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')), { once: true }))
    : Promise.resolve(ok())
  const result = await fetchNearbyPowerGrid(35, 139, { fetchImpl, timeoutMs: 5 })
  assert.equal(result.sourceEndpoint, POWER_GRID_ENDPOINTS[1])
})

for (const [name, response] of [
  ['503', { ok: false, status: 503 }],
  ['HTTP 200 runtime remark', { ok: true, status: 200, json: async () => ({ remark: 'runtime error: timeout', elements: [line] }) }],
  ['wrong schema', { ok: true, status: 200, json: async () => ({ error: 'unavailable' }) }],
  ['HTML instead of JSON', { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } }],
]) {
  test(`${name} does not become a successful empty area`, async () => {
    let calls = 0
    const fetchImpl = async () => { calls++; return calls === 1 ? response : ok() }
    assert.equal((await fetchNearbyPowerGrid(35, 139, { fetchImpl })).summary.lineCount, 1)
    assert.equal(calls, 2)
  })
}

test('all servers failing gives an actionable Japanese error, not Failed to fetch', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; throw new TypeError('Failed to fetch') }
  const check = (error) => /公開地図サーバー/.test(error.message) && /公開空容量DB/.test(error.message) && !/Failed to fetch/.test(error.message)
  await assert.rejects(fetchNearbyPowerGrid(35, 139, { fetchImpl }), check)
  await assert.rejects(fetchNearbyPowerGrid(35, 139, { fetchImpl }), check)
  assert.equal(calls, 2, 'failed servers are not hammered on immediate retry')
})

test('progressive expansion failure preserves the successful smaller radius', async () => {
  const fetchImpl = async (_url, { body }) => {
    if (decodeURIComponent(body).includes('around:5000,')) return ok()
    throw new TypeError('Failed to fetch')
  }
  const result = await fetchNearbyPowerGrid(35, 139, { fetchImpl, progressive: true, radiiMeters: [5000, 10000] })
  assert.equal(result.radiusMeters, 5000)
  assert.equal(result.summary.lineCount, 1)
  assert.match(result.search.partialError, /公開地図サーバー/)
  assert.equal(result.search.reachedMaxRadius, false)
  assert.deepEqual(result.search.attemptedRadiiMeters, [5000, 10000])
})

test('invalid coordinates and permanent request errors never trigger fallback', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return { ok: false, status: 400 } }
  await assert.rejects(fetchNearbyPowerGrid(100, 139, { fetchImpl }), /座標/)
  assert.equal(calls, 0)
  await assert.rejects(fetchNearbyPowerGrid(35, 139, { fetchImpl }), /HTTP 400/)
  assert.equal(calls, 1)
})

test('a genuine empty elements list is a valid result and is cached', async () => {
  const fetchImpl = async () => ok([])
  assert.equal((await fetchNearbyPowerGrid(35, 139, { fetchImpl })).summary.lineCount, 0)
  assert.equal((await fetchNearbyPowerGrid(35, 139, { fetchImpl })).cached, true)
})
