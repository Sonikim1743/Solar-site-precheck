import { fetchPowerGridPayload } from '../../shared/powerGrid.js'

export const POWER_GRID_USER_AGENT = 'SolarSitePrecheck/1.23 (https://github.com/Sonikim1743/Solar-site-precheck)'
const allowedFields = new Set(['lat', 'lon', 'radius', 'supports'])
let activeRequests = 0

function json(payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
  })
}

export async function handlePowerGridRequest(request, options = {}) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405, { Allow: 'POST' })
  const origin = request.headers.get('Origin')
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Same-origin requests only' }, 403)
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return json({ error: 'Invalid content type' }, 415)
  // Accept only bounded Japan-coordinate queries, never arbitrary URLs or QL.
  let body = ''
  const reader = request.body?.getReader()
  if (reader) {
    const decoder = new TextDecoder()
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 512) { await reader.cancel(); return json({ error: 'Request too large' }, 413) }
      body += decoder.decode(value, { stream: true })
    }
  }
  const params = new URLSearchParams(body)
  if ([...params.keys()].some((key) => !allowedFields.has(key) || params.getAll(key).length !== 1)) return json({ error: 'Invalid parameters' }, 400)
  const values = ['lat', 'lon', 'radius'].map((key) => params.get(key)?.trim())
  const [lat, lon, radiusMeters] = values.map(Number)
  if (values.some((value) => !value) || ![lat, lon, radiusMeters].every(Number.isFinite)
    || lat < 20 || lat > 46 || lon < 122 || lon > 154
    || !Number.isInteger(radiusMeters) || radiusMeters < 500 || radiusMeters > 50000
    || !['0', '1'].includes(params.get('supports'))) return json({ error: 'Invalid Japan coordinates or radius' }, 400)
  if (activeRequests >= 4) return json({ error: 'Busy; retry later' }, 429, { 'Retry-After': '60' })
  activeRequests++
  try {
    const data = await fetchPowerGridPayload(lat, lon, radiusMeters, {
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
      includeSupports: params.get('supports') === '1',
      userAgent: POWER_GRID_USER_AGENT,
    })
    return json(data)
  } catch (error) {
    return json({ error: error.message || '公開地図データを取得できませんでした。' }, error.code === 'rate-limit' ? 429 : 502,
      error.code === 'rate-limit' ? { 'Retry-After': String(Math.max(60, Math.ceil(((error.retryAt || Date.now() + 60000) - Date.now()) / 1000))) } : {})
  } finally { activeRequests-- }
}

export const onRequest = ({ request }) => handlePowerGridRequest(request)
