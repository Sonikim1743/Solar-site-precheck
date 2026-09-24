import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generationInputs, generationUrl, parseGeneration, generationAtPosition } from '../shared/generation.js'
import { handleGenerationRequest } from '../functions/api/pv-generation.js'
const inputs = { lat: 34.942233, lon: 133.523670, peakpower: 50, angle: 20, aspect: -90, loss: 14 }
const payload = { inputs: { meteo_data: { year_min: 2005, year_max: 2023 } }, outputs: { totals: { fixed: { E_y: 60000 } }, monthly: { fixed: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, E_m: 5000 })) } } }
const request = (params = inputs, options = {}) => new Request('http://localhost/api/pv-generation?' + new URLSearchParams(params), options)
test('generation parameters preserve units, east orientation and fixed Japan-only endpoint', () => {
  const url = new URL(generationUrl(inputs))
  assert.equal(url.hostname, 're.jrc.ec.europa.eu')
  assert.equal(url.searchParams.get('peakpower'), '50')
  assert.equal(url.searchParams.get('aspect'), '-90')
  assert.equal(url.searchParams.get('raddatabase'), 'PVGIS-ERA5')
  assert.equal(url.searchParams.get('usehorizon'), '1')
  assert.equal(url.searchParams.has('userhorizon'), false)
  for (const patch of [{ peakpower: '' }, { loss: -1 }, { lat: 0 }, { lon: null }, { angle: 91 }, { peakpower: Infinity }]) assert.throws(() => generationInputs({ ...inputs, ...patch }))
})

test('generation accepts 8 or 36 explicit clockwise horizon values and canonicalizes CSV', () => {
  for (const length of [8, 36]) {
    const horizon = Array.from({ length }, (_, index) => index / 2)
    const arrayInputs = generationInputs({ ...inputs, userhorizon: horizon })
    const csvInputs = generationInputs({ ...inputs, userhorizon: horizon.join(',') })
    assert.deepEqual(arrayInputs.userhorizon, horizon)
    assert.notEqual(arrayInputs.userhorizon, horizon)
    assert.deepEqual(csvInputs, arrayInputs)
    const url = new URL(generationUrl(arrayInputs))
    assert.equal(url.searchParams.get('userhorizon'), horizon.join(','))
    assert.equal(url.searchParams.get('usehorizon'), '1')
    assert.equal(generationUrl(arrayInputs), generationUrl(csvInputs))
    assert.deepEqual(parseGeneration(payload, arrayInputs).inputs.userhorizon, horizon)
  }
  assert.deepEqual(generationInputs({ ...inputs, userhorizon: Array(8).fill(0) }).userhorizon, Array(8).fill(0))
  const tiny = Array(8).fill(1e-8)
  assert.deepEqual(generationInputs({ ...inputs, userhorizon: new URL(generationUrl({ ...inputs, userhorizon: tiny })).searchParams.get('userhorizon') }).userhorizon, tiny)
})

test('generation rejects malformed, sparse, out-of-range and excessive horizon inputs', () => {
  for (const horizon of [undefined, null, true, [], Array(7).fill(0), Array(9).fill(0), Array(37).fill(0), Array(8), Array(8).fill('0'), Array(8).fill(-1), Array(8).fill(90.1), Array(8).fill(Infinity), Array(8).fill(NaN), '', '0,0,0,0,0,0,0,', '0,0,0,0,0,0,0, 1', '0,0,0,0,0,0,0,1\n', '0,0,0,0,0,0,0,0x10', '0,0,0,0,0,0,0,NaN']) {
    assert.throws(() => generationInputs({ ...inputs, userhorizon: horizon }))
  }
})
test('generation requires annual output and all twelve valid unique months', () => {
  const result = parseGeneration(payload, inputs)
  assert.equal(result.annualKwh, 60000)
  assert.equal(result.period, '2005–2023')
  assert.equal(result.monthly.length, 12)
  assert.ok(generationAtPosition(result, inputs))
  assert.equal(generationAtPosition(result, { ...inputs, lat: 35 }), false)
  assert.throws(() => parseGeneration({}, inputs))
  const duplicate = structuredClone(payload); duplicate.outputs.monthly.fixed[0].month = 2
  assert.throws(() => parseGeneration(duplicate, inputs))
})
test('generation endpoint rejects extra parameters and foreign origins before network access', async () => {
  const options = { fetchImpl: () => { throw new Error('Must not fetch') } }
  assert.equal((await handleGenerationRequest(request({ ...inputs, url: 'https://example.com' }), options)).status, 400)
  assert.equal((await handleGenerationRequest(request(inputs, { headers: { Origin: 'https://example.com' } }), options)).status, 403)
  assert.equal((await handleGenerationRequest(request({ ...inputs, lat: '' }), options)).status, 400)
})
test('generation parses successful upstream response and reuses a bounded cache', async () => {
  let count = 0
  const options = { fetchImpl: async () => { count++; return Response.json(payload) } }
  const response = await handleGenerationRequest(request(), options)
  assert.equal(response.status, 200); assert.equal((await response.json()).annualKwh, 60000)
  await handleGenerationRequest(request(), options)
  assert.equal(count, 1)
  assert.equal((await handleGenerationRequest(request({ ...inputs, peakpower: 51 }), { fetchImpl: async () => new Response('', { status: 529 }) })).status, 502)
})

test('standard and custom terrain generation use separate canonical cache keys', async () => {
  const calls = []
  const options = { fetchImpl: async url => {
    calls.push(url)
    const annual = new URL(url).searchParams.has('userhorizon') ? 48000 : 60000
    const data = structuredClone(payload)
    data.outputs.totals.fixed.E_y = annual
    data.outputs.monthly.fixed.forEach(row => { row.E_m = annual / 12 })
    return Response.json(data)
  } }
  const standard = { ...inputs, peakpower: 52 }
  const custom = { ...standard, userhorizon: Array(8).fill(12) }
  const first = await (await handleGenerationRequest(request(standard), options)).json()
  const second = await (await handleGenerationRequest(request(custom), options)).json()
  assert.equal(first.annualKwh, 60000)
  assert.equal(second.annualKwh, 48000)
  assert.notEqual(first.sourceUrl, second.sourceUrl)
  assert.deepEqual(second.inputs.userhorizon, custom.userhorizon)
  await handleGenerationRequest(request(standard), options)
  await handleGenerationRequest(request({ ...custom, userhorizon: custom.userhorizon.join(',') }), options)
  assert.equal(calls.length, 2)
  assert.ok(calls.every(url => new URL(url).searchParams.get('usehorizon') === '1'))
})

test('generation endpoint supports full-precision 36-value horizons and bounds malformed requests', async () => {
  const horizon = Array.from({ length: 36 }, (_, index) => 10.12345678901234 + index / 100)
  const params = { ...inputs, peakpower: 53, userhorizon: horizon }
  const fullPrecision = request(params)
  assert.ok(new URL(fullPrecision.url).search.length > 512)
  assert.equal((await handleGenerationRequest(fullPrecision, { fetchImpl: async () => Response.json(payload) })).status, 200)
  const noNetwork = { fetchImpl: () => { throw new Error('Must reject before fetch') } }
  const duplicate = request({ ...inputs, peakpower: 54, userhorizon: Array(8).fill(0) })
  assert.equal((await handleGenerationRequest(new Request(duplicate.url + '&userhorizon=0,0,0,0,0,0,0,0'), noNetwork)).status, 400)
  assert.equal((await handleGenerationRequest(request({ ...inputs, userhorizon: '0,0,0,0,0,0,0, 0' }), noNetwork)).status, 400)
  assert.equal((await handleGenerationRequest(request({ ...inputs, userhorizon: Array(37).fill(0) }), noNetwork)).status, 400)
  assert.equal((await handleGenerationRequest(request({ ...inputs, userhorizon: '0.' + '0'.repeat(2100) + ',0,0,0,0,0,0,0' }), noNetwork)).status, 400)
  assert.equal((await handleGenerationRequest(request({ ...inputs, lat: '34.' + '0'.repeat(520) }), noNetwork)).status, 400)
})
