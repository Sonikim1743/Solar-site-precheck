import { fetchNearbyPowerGrid } from '../services/powerGrid.js'

export const POWER_SUPPORT_RADII = Object.freeze([500, 1000])
export const MAX_POWER_SUPPORT_MARKERS = 250
export const POWER_SUPPORT_TIMEOUT_MS = 45000
const finite = Number.isFinite
const text = value => typeof value === 'string' ? value.slice(0, 200) : ''
export function powerSupportSiteKey(position) {
  return finite(position?.lat) && finite(position?.lon) && position.lat >= 20 && position.lat <= 46 && position.lon >= 122 && position.lon <= 154
    ? `${position.lat},${position.lon}` : ''
}

function distance(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)))
}

export function powerSupportSourceUrl(id) {
  return /^node\/\d+$/.test(String(id)) ? `https://www.openstreetmap.org/${id}` : ''
}

// Do not infer a pole's voltage, ownership or connection from a nearby line.
export function normalizePowerSupports(payload, position, radiusMeters) {
  if (!POWER_SUPPORT_RADII.includes(radiusMeters)) throw new Error('電柱・鉄塔の範囲は500mまたは1kmを選択してください。')
  const radius = radiusMeters
  if (!powerSupportSiteKey(position) || !Array.isArray(payload?.supports)) throw new Error('電柱・鉄塔の登録情報を取得できませんでした。')
  const byId = new Map()
  for (const item of payload.supports.slice(0, 10000)) {
    if (!['pole', 'tower'].includes(item?.type) || !powerSupportSourceUrl(item.id) || !powerSupportSiteKey(item.position)) continue
    const distanceMeters = distance(position, item.position)
    if (distanceMeters > radius || byId.has(item.id)) continue
    const voltageKv = finite(item.voltageKv) && item.voltageKv > 0 ? item.voltageKv : null
    byId.set(item.id, {
      id: item.id, type: item.type, position: { lat: item.position.lat, lon: item.position.lon },
      name: text(item.name), ref: text(item.ref), operator: text(item.operator), voltageKv,
      voltageLabel: voltageKv === null ? '電圧未記載' : `${Number(voltageKv.toFixed(3))} kV`,
      distanceMeters, sourceUrl: powerSupportSourceUrl(item.id),
    })
  }
  const supports = [...byId.values()].sort((a, b) => a.distanceMeters - b.distanceMeters)
  return {
    supports: supports.slice(0, MAX_POWER_SUPPORT_MARKERS), totalCount: supports.length,
    truncated: supports.length > MAX_POWER_SUPPORT_MARKERS || payload.supports.length > 10000,
    radiusMeters: radius, siteKey: powerSupportSiteKey(position),
    fetchedAt: typeof payload.fetchedAt === 'string' && finite(Date.parse(payload.fetchedAt)) ? payload.fetchedAt : null,
  }
}

function combinedSignal(signals) {
  const controller = new AbortController(), handlers = []
  for (const signal of signals.filter(Boolean)) {
    if (signal.aborted) controller.abort()
    const handler = () => controller.abort()
    signal.addEventListener('abort', handler, { once: true })
    handlers.push([signal, handler])
  }
  return { signal: controller.signal, dispose: () => handlers.forEach(([signal, handler]) => signal.removeEventListener('abort', handler)) }
}

// Leave shared timeout, same-origin API and wide-area callers unchanged.
export function createPowerSupportQuery({ onChange = () => {}, load = fetchNearbyPowerGrid, fetchImpl = (...args) => fetch(...args), now = Date.now } = {}) {
  let generation = 0, active = null, disposed = false, blockedUntil = 0
  let state = { siteKey: '', status: 'idle', data: null, message: '', retryAt: 0 }
  const publish = next => { state = next; if (!disposed) onChange(state) }
  const invalidate = () => { generation++; active?.abort(); active = null }
  return {
    get state() { return state },
    setPosition(position) {
      const siteKey = powerSupportSiteKey(position)
      if (siteKey === state.siteKey) return
      invalidate()
      publish({ siteKey, status: 'idle', data: null, message: '', retryAt: blockedUntil })
    },
    cancel() {
      if (state.status !== 'loading') return
      invalidate()
      publish({ ...state, status: 'cancelled', message: state.data ? '取得を中止しました。前回の結果を表示しています。' : '取得を中止しました。' })
    },
    dispose() { disposed = true; invalidate() },
    async run(position, radiusMeters) {
      if (disposed) return null
      this.setPosition(position)
      if (!state.siteKey || !POWER_SUPPORT_RADII.includes(radiusMeters)) {
        invalidate()
        publish({ ...state, status: 'error', message: '候補地と500mまたは1kmの範囲を選択してください。' })
        return null
      }
      if (now() < blockedUntil) {
        publish({ ...state, status: 'error', message: '公開地図サーバーの利用制限中です。時間をおいて再試行してください。', retryAt: blockedUntil })
        return null
      }
      invalidate()
      const token = generation, controller = new AbortController(), siteKey = state.siteKey
      const disposers = []
      active = controller
      publish({ ...state, status: 'loading', requestedRadiusMeters: radiusMeters, message: `周辺${radiusMeters === 1000 ? '1km' : '500m'}の電柱・鉄塔を取得中…`, retryAt: 0 })
      const current = () => !disposed && generation === token && state.siteKey === siteKey && !controller.signal.aborted
      const abortableFetch = (url, options = {}) => {
        if (url !== '/api/power-grid') throw new Error('Unexpected support lookup origin')
        const merged = combinedSignal([options.signal, controller.signal])
        // Keep listeners until response.json() finishes, so cancel also stops
        // a response body that has started after headers were received.
        disposers.push(merged.dispose)
        return fetchImpl(url, { ...options, signal: merged.signal })
      }
      try {
        const payload = await load(position.lat, position.lon, { radiusMeters, includeSupports: true, progressive: false, timeoutMs: POWER_SUPPORT_TIMEOUT_MS, fetchImpl: abortableFetch })
        if (!current()) return null
        const data = normalizePowerSupports(payload, position, radiusMeters)
        publish({ siteKey, status: data.totalCount ? 'success' : 'empty', data, retryAt: 0,
          message: data.totalCount ? '' : 'この範囲のOSM登録情報では電柱・鉄塔を確認できません。未登録の設備は表示されません。' })
        return data
      } catch (error) {
        if (!current()) return null
        if (error?.code === 'rate-limit') blockedUntil = Math.max(now() + 60000, finite(error.retryAt) ? error.retryAt : 0)
        publish({ ...state, status: 'error', retryAt: blockedUntil,
          message: error?.code === 'rate-limit' ? '公開地図サーバーの利用制限中です。時間をおいて再試行してください。' : error?.code === 'timeout' ? '取得に時間がかかるため停止しました。時間をおいて再試行してください。' : '電柱・鉄塔を取得できませんでした。通信を確認して再試行してください。' })
        return null
      } finally { disposers.forEach(dispose => dispose()); if (generation === token) active = null }
    },
  }
}
