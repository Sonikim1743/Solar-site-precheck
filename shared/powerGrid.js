// The individual server is a failure-only fallback, as documented by Overpass.
// Do not rotate servers to evade a 429 rate limit.
export const POWER_GRID_ENDPOINTS = Object.freeze([
  'https://overpass-api.de/api/interpreter',
  'https://lambert.openstreetmap.de/api/interpreter',
])
const DEFAULT_RADIUS_METERS = 5000
// Allow the server's 25s execution budget plus its queue and network overhead.
const DEFAULT_TIMEOUT_MS = 45000
const CACHE_TTL_MS = 10 * 60 * 1000
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000
const transportStates = new WeakMap()
export const DEFAULT_SEARCH_RADII_METERS = Object.freeze([5000, 10000, 20000, 50000])

export function parseVoltageValuesKv(value) {
  if (value == null) return []
  const text = String(value).replace(/,/g, '').trim()
  if (!text) return []

  const values = []
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(k?v)?/gi)) {
    const number = Number(match[1])
    if (!Number.isFinite(number) || number <= 0) continue
    const unit = (match[2] || '').toLowerCase()
    if (unit === 'kv') values.push(number)
    else values.push(number >= 1000 ? number / 1000 : number)
  }

  return [...new Set(values)]
}

export function parseVoltageKv(value) {
  const values = parseVoltageValuesKv(value)
  return values.length ? Math.max(...values) : null
}

// Keep geometric proximity separate from the requested voltage class.
export function powerGridDisplayLine(data) {
  return data?.summary?.nearestPreferredLine || data?.summary?.nearestLine || null
}

export function powerGridDisplayLineLabel(data) {
  if (data?.search?.targetVoltagesKv?.length) {
    return data.summary?.nearestPreferredLine ? '66・77kV 最寄り候補' : '参考系統線（対象電圧未確認）'
  }
  return '最寄り系統線'
}

export function powerGridSearchSummary(data) {
  if (!data?.search?.targetVoltagesKv?.length) return ''
  const radius = data.radiusMeters / 1000
  if (data.search.foundPreferredLine) return `取得した${radius}km圏の公開地図で66・77kVの最寄り候補を確認しました。`
  return `${radius}km圏の取得データでは66・77kVを確認できませんでした。${data.search.partialError ? '追加範囲の取得は未完了です。' : ''}電圧未登録の設備は判定に含めていません。`
}

export function voltageBand(voltageKv) {
  if (!Number.isFinite(voltageKv)) return '電圧未記載'
  if (voltageKv >= 110) return '110kV以上'
  if (voltageKv >= 77) return '77〜110kV'
  if (voltageKv >= 66) return '66〜77kV'
  if (voltageKv >= 33) return '33〜66kV'
  return '33kV未満'
}

export function buildPowerGridOverpassQuery(lat, lon, radiusMeters = DEFAULT_RADIUS_METERS, options = {}) {
  const radius = Math.max(500, Math.min(50000, Math.round(radiusMeters)))
  const includeSupports = options.includeSupports !== false
  const queryLat = Number(lat).toFixed(7)
  const queryLon = Number(lon).toFixed(7)
  return `[out:json][timeout:25];
(
  way(around:${radius},${queryLat},${queryLon})["power"="line"];
  way(around:${radius},${queryLat},${queryLon})["power"="minor_line"];
  node(around:${radius},${queryLat},${queryLon})["power"="substation"];
  way(around:${radius},${queryLat},${queryLon})["power"="substation"];
  relation(around:${radius},${queryLat},${queryLon})["power"="substation"];
${includeSupports ? `  node(around:${radius},${queryLat},${queryLon})["power"="tower"];
  node(around:${radius},${queryLat},${queryLon})["power"="pole"];` : ''}
);
(._; rel(bw)["route"="power"]; rel(bw)["power"="circuit"];);
out body geom;`
}

function distanceMeters(aLat, aLon, bLat, bLon) {
  const radius = 6371008.8
  const toRad = (value) => (value * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearingDegrees(aLat, aLon, bLat, bLon) {
  const toRad = (value) => (value * Math.PI) / 180
  const toDeg = (value) => (value * 180) / Math.PI
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const dLon = toRad(bLon - aLon)
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function compassDirection(bearing) {
  if (!Number.isFinite(bearing)) return ''
  const labels = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']
  return labels[Math.round(bearing / 45) % labels.length]
}

function directionFromSite(siteLat, siteLon, point) {
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return ''
  return compassDirection(bearingDegrees(siteLat, siteLon, point.lat, point.lon))
}

function bearingFromSite(siteLat, siteLon, point) {
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return null
  return bearingDegrees(siteLat, siteLon, point.lat, point.lon)
}

function geometryCenter(geometry) {
  const points = (geometry || []).filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon))
  if (!points.length) return null
  const sum = points.reduce((acc, point) => ({ lat: acc.lat + point.lat, lon: acc.lon + point.lon }), { lat: 0, lon: 0 })
  return { lat: sum.lat / points.length, lon: sum.lon / points.length }
}

function nearestDistanceToGeometry(lat, lon, geometry) {
  const points = (geometry || []).filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon))
  if (!points.length) return null
  return Math.min(...points.map((point) => distanceMeters(lat, lon, point.lat, point.lon)))
}

function nearestPointToGeometry(lat, lon, geometry) {
  const points = (geometry || []).filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon))
  if (!points.length) return null
  let best = null
  for (const point of points) {
    const distance = distanceMeters(lat, lon, point.lat, point.lon)
    if (!best || distance < best.distanceMeters) {
      best = {
        point: { lat: point.lat, lon: point.lon },
        distanceMeters: distance,
      }
    }
  }
  // Local tangent-plane projection gives the closest point on each line segment,
  // not just its towers/vertices. Distances are then measured geodesically.
  const lonScale = Math.cos(lat * Math.PI / 180)
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]
    const b = points[index]
    const ax = (a.lon - lon) * lonScale
    const ay = a.lat - lat
    const dx = (b.lon - a.lon) * lonScale
    const dy = b.lat - a.lat
    const lengthSquared = dx * dx + dy * dy
    if (!lengthSquared) continue
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared))
    const point = { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) }
    const distance = distanceMeters(lat, lon, point.lat, point.lon)
    if (distance < best.distanceMeters) best = { point, distanceMeters: distance }
  }
  return best
}

function displayName(tags, fallback) {
  return tags?.['name:ja'] || tags?.name || tags?.official_name || tags?.ref || fallback
}

export function equipmentPositionConfidence(equipment) {
  const hasName = Boolean(equipment?.name && !equipment.name.includes('名称未記載'))
  const hasRef = Boolean(equipment?.ref)
  const hasVoltage = Number.isFinite(equipment?.voltageKv)
  const hasOperator = Boolean(equipment?.operator)
  if ((hasName || hasRef) && hasVoltage && hasOperator) {
    return { level: 'high', label: '位置確認度 高', reason: '名称または設備番号・電圧・事業者の記載あり' }
  }
  if ((hasName || hasRef) && hasVoltage) {
    return { level: 'medium', label: '位置確認度 中', reason: '名称または設備番号と電圧の記載あり' }
  }
  return { level: 'reference', label: '位置参考', reason: '公開地図上の位置候補。名称・電圧は公式資料で要確認' }
}

function formatVoltage(voltageKv) {
  if (!Number.isFinite(voltageKv)) return '電圧未記載'
  return `${Number.isInteger(voltageKv) ? voltageKv.toFixed(0) : voltageKv.toFixed(1)}kV`
}

function normalizePowerLine(element, siteLat, siteLon) {
  const powerType = element.tags?.power || 'line'
  const geometry = (element.geometry || [])
    .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon))
    .map((point) => ({ lat: point.lat, lon: point.lon }))
  if (geometry.length < 2) return null
  const voltageKv = parseVoltageKv(element.tags?.voltage)
  const voltageValuesKv = parseVoltageValuesKv(element.tags?.voltage)
  const nearest = nearestPointToGeometry(siteLat, siteLon, geometry)
  const result = {
    id: `${element.type}/${element.id}`,
    type: element.type,
    powerType,
    name: displayName(element.tags, powerType === 'minor_line' ? '配電線（名称未記載）' : '送電線（名称未記載）'),
    ref: element.tags?.ref || '',
    operator: element.tags?.operator || '',
    voltageKv,
    voltageValuesKv,
    voltageLabel: voltageValuesKv.length ? voltageValuesKv.map(formatVoltage).join(' / ') : formatVoltage(null),
    voltageBand: voltageBand(voltageKv),
    distanceMeters: nearest?.distanceMeters ?? nearestDistanceToGeometry(siteLat, siteLon, geometry),
    bearing: bearingFromSite(siteLat, siteLon, nearest?.point),
    direction: directionFromSite(siteLat, siteLon, nearest?.point),
    nearestPoint: nearest?.point || null,
    geometry,
  }
  result.positionConfidence = equipmentPositionConfidence(result)
  return result
}

function normalizeSubstation(element, siteLat, siteLon) {
  const center = element.type === 'node'
    ? { lat: element.lat, lon: element.lon }
    : geometryCenter(element.geometry || (element.members || []).filter((member) => member.role !== 'inner').flatMap((member) => member.geometry || []))
  if (!Number.isFinite(center?.lat) || !Number.isFinite(center?.lon)) return null
  const voltageKv = parseVoltageKv(element.tags?.voltage)
  const result = {
    id: `${element.type}/${element.id}`,
    type: element.type,
    name: displayName(element.tags, '変電所（名称未記載）'),
    ref: element.tags?.ref || '',
    operator: element.tags?.operator || '',
    voltageKv,
    voltageLabel: formatVoltage(voltageKv),
    voltageBand: voltageBand(voltageKv),
    distanceMeters: distanceMeters(siteLat, siteLon, center.lat, center.lon),
    bearing: bearingFromSite(siteLat, siteLon, center),
    direction: directionFromSite(siteLat, siteLon, center),
    position: center,
  }
  result.positionConfidence = equipmentPositionConfidence(result)
  return result
}

function normalizeSupport(element, siteLat, siteLon) {
  if (!Number.isFinite(element.lat) || !Number.isFinite(element.lon)) return null
  const voltageKv = parseVoltageKv(element.tags?.voltage)
  const position = { lat: element.lat, lon: element.lon }
  const isPole = element.tags?.power === 'pole'
  return {
    id: `${element.type}/${element.id}`,
    type: isPole ? 'pole' : 'tower',
    name: displayName(element.tags, isPole ? '電柱候補（名称未記載）' : '支持物候補（名称未記載）'),
    operator: element.tags?.operator || '',
    ref: element.tags?.ref || '',
    voltageKv,
    voltageLabel: formatVoltage(voltageKv),
    voltageBand: voltageBand(voltageKv),
    distanceMeters: distanceMeters(siteLat, siteLon, element.lat, element.lon),
    bearing: bearingFromSite(siteLat, siteLon, position),
    direction: directionFromSite(siteLat, siteLon, position),
    position,
  }
}

export function parsePowerGridElements(elements, siteLat, siteLon, radiusMeters = DEFAULT_RADIUS_METERS) {
  const lines = []
  const substations = []
  const supports = []
  const parents = new Map()
  for (const relation of elements || []) {
    if (relation.type !== 'relation' || !(relation.tags?.route === 'power' || relation.tags?.power === 'circuit')) continue
    for (const member of relation.members || []) {
      if (member.type !== 'way') continue
      const list = parents.get(member.ref) || []
      list.push(relation.tags)
      parents.set(member.ref, list)
    }
  }
  for (const original of elements || []) {
    let element = original
    const relations = original.type === 'way' ? parents.get(original.id) : null
    // Accept only unanimous metadata across parent circuits, never an arbitrary one.
    if (relations?.length && ['line', 'minor_line'].includes(original.tags?.power)) {
      const tags = { ...original.tags }
      for (const key of ['name', 'name:ja', 'official_name', 'ref', 'voltage', 'operator']) {
        const values = relations.map(parent => parent[key]?.trim()).filter(Boolean)
        if (!tags[key] && values.length === relations.length && new Set(values).size === 1) tags[key] = values[0]
      }
      element = { ...original, tags }
    }
    if (element?.tags?.power === 'line' || element?.tags?.power === 'minor_line') {
      const line = normalizePowerLine(element, siteLat, siteLon)
      if (line) lines.push(line)
    }
    if (element?.tags?.power === 'substation') {
      const substation = normalizeSubstation(element, siteLat, siteLon)
      if (substation) substations.push(substation)
    }
    if (element?.tags?.power === 'tower' || element?.tags?.power === 'pole') {
      const support = normalizeSupport(element, siteLat, siteLon)
      if (support) supports.push(support)
    }
  }

  lines.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
  substations.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
  supports.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))

  const targetLines = lines.filter((line) => Number.isFinite(line.voltageKv) && line.voltageKv >= 11 && line.voltageKv <= 110)
  const namedTargetLines = targetLines.filter((line) => line.name && !line.name.includes('名称未記載'))
  const targetSubstations = substations.filter((substation) => Number.isFinite(substation.voltageKv)
    ? substation.voltageKv >= 11 && substation.voltageKv <= 110
    : true)

  return {
    position: { lat: siteLat, lon: siteLon },
    radiusMeters,
    fetchedAt: new Date().toISOString(),
    lines,
    substations,
    supports,
    summary: {
      lineCount: lines.length,
      substationCount: substations.length,
      supportCount: supports.length,
      targetLineCount: targetLines.length,
      namedTargetLineCount: namedTargetLines.length,
      targetSubstationCount: targetSubstations.length,
      nearestLine: lines[0] || null,
      nearestTargetLine: targetLines[0] || null,
      nearestSubstation: substations[0] || null,
      nearestTargetSubstation: targetSubstations[0] || null,
      nearestSupport: supports[0] || null,
    },
  }
}

function normalizeSearchRadii(values) {
  const radii = (values || DEFAULT_SEARCH_RADII_METERS)
    .map((value) => Math.max(500, Math.min(50000, Math.round(Number(value)))))
    .filter(Number.isFinite)
  return [...new Set(radii)].sort((a, b) => a - b)
}

function gridError(code, message, retryable = false) {
  return Object.assign(new Error(message), { code, retryable })
}

function transportState(fetchImpl) {
  if (!transportStates.has(fetchImpl)) {
    transportStates.set(fetchImpl, { cache: new Map(), pending: new Map(), unavailable: new Map(), rateLimitedUntil: 0 })
  }
  return transportStates.get(fetchImpl)
}

async function requestPowerGrid(endpoint, body, fetchImpl, timeoutMs, userAgent) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', ...(userAgent ? { 'User-Agent': userAgent } : {}) },
      body,
      signal: controller.signal,
      credentials: 'omit',
    })
    if (response.status === 429) {
      const retryAfter = response.headers?.get('Retry-After')
      const seconds = retryAfter ? Number(retryAfter) : NaN
      const retryAt = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter)
      throw Object.assign(gridError('rate-limit', '公開地図サーバーの利用制限中です。しばらく待ってから再試行してください。'), {
        retryAt: Math.max(Date.now() + 60000, Number.isFinite(retryAt) ? retryAt : 0),
      })
    }
    if (!response.ok) {
      throw gridError('http', `公開地図サーバーが応答できませんでした（HTTP ${response.status}）。`, response.status >= 500 || response.status === 408)
    }
    const payload = await response.json()
    // Overpass can return HTTP 200 with a timeout/overload remark and partial data.
    // Never misrepresent an error response as an empty area or complete search.
    if (payload?.remark || !Array.isArray(payload?.elements)) {
      throw gridError('invalid-response', '公開地図サーバーから完全な検索結果を取得できませんでした。', true)
    }
    return { elements: payload.elements, sourceEndpoint: payload.sourceEndpoint || endpoint, fetchedAt: payload.fetchedAt || new Date().toISOString() }
  } catch (error) {
    if (error?.code && typeof error.code === 'string') throw error
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw gridError('timeout', '公開地図データの取得がタイムアウトしました。', true)
    }
    throw gridError('network', '公開地図サーバーに接続できませんでした。', true)
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchPowerGridPayload(lat, lon, radiusMeters, options = {}) {
  const fetchImpl = options.fetchImpl || fetch
  const state = transportState(fetchImpl)
  const endpoints = options.proxy ? ['/api/power-grid'] : options.endpoint ? [options.endpoint] : POWER_GRID_ENDPOINTS
  const query = buildPowerGridOverpassQuery(lat, lon, radiusMeters, options)
  const body = options.proxy
    ? new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radiusMeters), supports: options.includeSupports === false ? '0' : '1' }).toString()
    : new URLSearchParams({ data: query }).toString()
  const key = JSON.stringify([endpoints, query, options.userAgent || ''])
  const cached = state.cache.get(key)
  if (options.cache !== false && cached?.expiresAt > Date.now()) {
    options.onProgress?.({ type: 'cache', radiusMeters })
    return { ...cached.data, cached: true }
  }
  if (cached) state.cache.delete(key)

  if (!state.pending.has(key)) {
    const pending = (async () => {
      if (state.rateLimitedUntil > Date.now()) {
        throw gridError('rate-limit', '公開地図サーバーの利用制限中です。しばらく待ってから再試行してください。')
      }
      let lastError
      for (const [index, endpoint] of endpoints.entries()) {
        const unavailable = state.unavailable.get(endpoint)
        if (unavailable?.until > Date.now()) {
          lastError = unavailable.error
          continue
        }
        options.onProgress?.({ type: index ? 'fallback' : 'request', radiusMeters })
        try {
          const data = await requestPowerGrid(endpoint, body, fetchImpl, options.timeoutMs || (options.proxy ? 100000 : DEFAULT_TIMEOUT_MS), options.userAgent)
          state.unavailable.delete(endpoint)
          if (options.cache !== false) {
            // Bounded, memory-only cache: no new persistent location storage.
            for (const [cacheKey, entry] of state.cache) {
              if (entry.expiresAt <= Date.now()) state.cache.delete(cacheKey)
            }
            if (state.cache.size >= 8) state.cache.delete(state.cache.keys().next().value)
            state.cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
          }
          return data
        } catch (error) {
          if (error.code === 'rate-limit') state.rateLimitedUntil = error.retryAt
          if (!error.retryable) throw error
          lastError = error
          state.unavailable.set(endpoint, { until: Date.now() + FAILURE_COOLDOWN_MS, error })
        }
      }
      throw gridError(lastError?.code || 'network', `${lastError?.message || '公開地図サーバーに接続できませんでした。'} 時間をおいて再試行してください。読込済みの公開空容量DBは引き続き確認できます。`)
    })()
    state.pending.set(key, pending)
  }
  const pending = state.pending.get(key)
  try {
    const data = await pending
    return { ...data, cached: false }
  } finally {
    if (state.pending.get(key) === pending) state.pending.delete(key)
  }
}

async function fetchPowerGridRadius(lat, lon, radiusMeters, options) {
  const data = await fetchPowerGridPayload(lat, lon, radiusMeters, options)
  return { ...parsePowerGridElements(data.elements, lat, lon, radiusMeters), fetchedAt: data.fetchedAt, sourceEndpoint: data.sourceEndpoint, cached: data.cached }
}

export async function fetchNearbyPowerGrid(lat, lon, options = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('候補地点の座標がありません。')
  }
  const progressive = options.progressive === true
  const targetVoltagesKv = options.prefer66Or77 === true ? [66, 77] : []
  const radii = progressive
    ? normalizeSearchRadii(options.radiiMeters)
    : [options.radiusMeters || DEFAULT_RADIUS_METERS]
  const attemptedRadiiMeters = []
  let lastResult = null
  let lastError = null
  try {
    for (const radiusMeters of radii) {
      attemptedRadiiMeters.push(radiusMeters)
      try {
        lastResult = await fetchPowerGridRadius(lat, lon, radiusMeters, {
          ...options,
          includeSupports: progressive ? false : options.includeSupports,
        })
      } catch (error) {
        lastError = error
        if (!lastResult) throw error
        break
      }
      const foundLine = Boolean(lastResult.summary?.nearestLine)
      const foundSubstation = Boolean(lastResult.summary?.nearestSubstation)
      const preferredLine = targetVoltagesKv.length ? lastResult.lines.find((line) => (
        line.distanceMeters <= radiusMeters && line.voltageValuesKv.some((voltage) => targetVoltagesKv.includes(voltage))
      )) : null
      lastResult.summary.nearestPreferredLine = preferredLine || null
      if (!progressive || (targetVoltagesKv.length ? Boolean(preferredLine) : (foundLine && foundSubstation))) break
    }
    if (!lastResult) throw lastError || new Error('公開電力データを取得できませんでした。')
    return {
      ...lastResult,
      search: {
        mode: progressive ? 'progressive' : 'fixed',
        attemptedRadiiMeters,
        selectedRadiusMeters: lastResult.radiusMeters,
        foundLine: Boolean(lastResult.summary?.nearestLine),
        foundSubstation: Boolean(lastResult.summary?.nearestSubstation),
        targetVoltagesKv,
        foundPreferredLine: Boolean(lastResult.summary?.nearestPreferredLine),
        reachedMaxRadius: progressive && lastResult.radiusMeters === radii.at(-1),
        partialError: lastError?.message || '',
      },
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('公開電力データの取得がタイムアウトしました。時間をおいて再試行してください。')
    }
    throw error
  }
}
