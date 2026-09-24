import { generationInputs, generationUrl, parseGeneration } from '../../shared/generation.js'
const cache = new Map()
let active = 0
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

export async function handleGenerationRequest(request, { fetchImpl = fetch } = {}) {
  const url = new URL(request.url)
  if (request.method !== 'GET') return json({ error: 'GET required' }, 405)
  const origin = request.headers.get('Origin')
  if (origin && origin !== url.origin) return json({ error: 'Same-origin requests only' }, 403)
  const keys = ['lat', 'lon', 'peakpower', 'loss', 'angle', 'aspect', 'userhorizon']
  // Thirty-six full-precision DEM angles can exceed the normal query limit.
  const maxQueryLength = url.searchParams.has('userhorizon') ? 2048 : 512
  if (url.search.length > maxQueryLength || [...url.searchParams.keys()].some(key => !keys.includes(key) || url.searchParams.getAll(key).length !== 1)) return json({ error: 'Invalid parameters' }, 400)
  let inputs
  try { inputs = generationInputs(Object.fromEntries(url.searchParams)) } catch (error) { return json({ error: error.message }, 400) }
  const sourceUrl = generationUrl(inputs)
  const cached = cache.get(sourceUrl)
  if (cached && Date.now() - cached.at < 86400000) return json(cached.data)
  if (active >= 2) return json({ error: '計算サーバーが混雑しています。少し待って再試行してください。' }, 429)
  active++
  try {
    const response = await fetchImpl(sourceUrl, { signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`PVGIS HTTP ${response.status}`)
    const data = parseGeneration(await response.json(), inputs)
    if (cache.size >= 100) cache.delete(cache.keys().next().value)
    cache.set(sourceUrl, { at: Date.now(), data })
    return json(data)
  } catch {
    return json({ error: 'PVGISの参考発電量を取得できませんでした。少し待って再試行してください。Solar Proの入力済み発電量はそのまま確認できます。' }, 502)
  } finally { active-- }
}
export const onRequest = ({ request }) => handleGenerationRequest(request)
