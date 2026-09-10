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
  for (const patch of [{ peakpower: '' }, { loss: -1 }, { lat: 0 }, { lon: null }, { angle: 91 }, { peakpower: Infinity }]) assert.throws(() => generationInputs({ ...inputs, ...patch }))
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
