import { fetchPointElevationPng } from './terrainArea.js'
import { endpointSlope, isProfilePoint, slopeSegments } from '../utils/terrainProfile.js'

const ELEVATION_ENDPOINT =
  'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php'
const ADDRESS_ENDPOINT = 'https://msearch.gsi.go.jp/address-search/AddressSearch'
const REVERSE_GEOCODE_ENDPOINT =
  'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress'
const MUNICIPALITY_DATA_URL = 'https://maps.gsi.go.jp/js/muni.js'
let municipalityDataPromise
// v1 contained discontinued TXT tile results. Do not silently reuse them as PNG.
const ELEVATION_CACHE_KEY = 'solar-site-elevation-points-v2'
const ELEVATION_REQUEST_CONCURRENCY = 8
let pointCache
let cacheSaveTimer

async function mapWithConcurrency(items, limit, worker) {
  const source = Array.from(items || [])
  const safeLimit = Math.max(1, Math.min(source.length || 1, Math.floor(limit || 1)))
  const results = new Array(source.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < source.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await worker(source[currentIndex], currentIndex)
    }
  }

  await Promise.all(Array.from({ length: safeLimit }, runWorker))
  return results
}

function loadPointCache() {
  if (pointCache) return pointCache
  try {
    const rows = typeof window === 'undefined' ? [] : JSON.parse(window.localStorage.getItem(ELEVATION_CACHE_KEY) || '[]')
    pointCache = new Map((Array.isArray(rows) ? rows : []).slice(-2000).filter(row => Array.isArray(row) && typeof row[0] === 'string' && Number.isFinite(row[1]?.value) && row[1].value >= -500 && row[1].value <= 10000 && typeof row[1].dataSource === 'string' && /PNG|JSON API/.test(row[1].dataSource) && typeof row[1].fetchedAt === 'string' && Number.isFinite(Date.parse(row[1].fetchedAt))))
  } catch {
    pointCache = new Map()
  }
  return pointCache
}

function elevationCacheKey(lat, lon) {
  return `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`
}

function rememberElevation(lat, lon, result) {
  const cache = loadPointCache()
  const key = elevationCacheKey(lat, lon)
  cache.delete(key)
  cache.set(key, result)
  while (cache.size > 2000) cache.delete(cache.keys().next().value)
  clearTimeout(cacheSaveTimer)
  if (typeof window === 'undefined') return
  cacheSaveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(ELEVATION_CACHE_KEY, JSON.stringify([...cache.entries()]))
    } catch {
      // Storage can be unavailable in private browsing; the in-memory cache still works.
    }
  }, 150)
}

async function fetchJson(url, timeoutMs = 8000, options = {}) {
  const controller = new AbortController()
  if (options.signal?.aborted) throw options.signal.reason || new DOMException('取得を中止しました。', 'AbortError')
  const cancel = () => controller.abort(options.signal.reason || new DOMException('取得を中止しました。', 'AbortError'))
  options.signal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => controller.abort(new Error('取得時間を超えました。')), timeoutMs)
  let onAbort

  try {
    const request = (async () => {
      const response = await (options.fetchImpl || fetch)(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    })()
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(controller.signal.reason || new DOMException('取得を中止しました。', 'AbortError'))
      controller.signal.addEventListener('abort', onAbort, { once: true })
      if (controller.signal.aborted) onAbort()
    })
    return await Promise.race([request, aborted])
  } finally {
    clearTimeout(timeout)
    if (onAbort) controller.signal.removeEventListener('abort', onAbort)
    options.signal?.removeEventListener('abort', cancel)
  }
}

export async function fetchElevation(lat, lon, options = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 20 || lat > 50 || lon < 120 || lon > 155) throw new Error('標高を取得する日本の座標が不正です。')
  if (options.signal?.aborted) throw options.signal.reason || new DOMException('取得を中止しました。', 'AbortError')
  const usePointCache = options.useCache !== false && !options.fetchImpl && !options.decodePng
  const cached = usePointCache ? loadPointCache().get(elevationCacheKey(lat, lon)) : null
  if (cached) return { ...cached, cached: true }
  try {
    const result = await fetchPointElevationPng(lat, lon, options)
    if (usePointCache) rememberElevation(lat, lon, result)
    return result
  } catch (error) {
    if (options.signal?.aborted || error?.name === 'AbortError') throw options.signal?.reason || error
  }
  // No TXT fallback: those tiles stopped receiving updates in October 2024.
  const result = await fetchElevationEndpoint(lat, lon, options)
  if (usePointCache) rememberElevation(lat, lon, result)
  return result
}

async function fetchElevationEndpoint(lat, lon, options) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    outtype: 'JSON',
  })
  const data = await fetchJson(`${ELEVATION_ENDPOINT}?${params}`, 8000, options)
  const raw = data.elevation
  const elevation = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '') ? Number(raw) : NaN

  if (!Number.isFinite(elevation) || elevation < -500 || elevation > 10000) {
    throw new Error('標高値が取得できませんでした')
  }

  return {
    value: elevation,
    dataSource: `国土地理院 標高JSON API（PNG未取得時）${typeof data.hsrc === 'string' ? ` / ${data.hsrc}` : ''}`,
    fetchedAt: new Date().toISOString(),
  }
}

export async function searchAddress(query) {
  const params = new URLSearchParams({ q: query })
  const data = await fetchJson(`${ADDRESS_ENDPOINT}?${params}`)

  if (!Array.isArray(data)) return []

  return data.slice(0, 6).map((item) => ({
    title: item.properties?.title || query,
    lon: Number(item.geometry?.coordinates?.[0]),
    lat: Number(item.geometry?.coordinates?.[1]),
  })).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
}

async function fetchMunicipalityData() {
  if (!municipalityDataPromise) {
    municipalityDataPromise = fetch(MUNICIPALITY_DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`市区町村データ HTTP ${response.status}`)
        return response.text()
      })
      .then((text) => {
        const municipalities = new Map()
        const pattern = /GSI\.MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']+)'/g
        let match
        while ((match = pattern.exec(text))) {
          const [, code, value] = match
          const parts = value.split(',')
          municipalities.set(code, {
            code,
            prefecture: parts[1] || '',
            city: parts[3] || parts[2] || '',
          })
        }
        return municipalities
      })
  }
  return municipalityDataPromise
}

export async function reverseGeocode(lat, lon) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  })
  const data = await fetchJson(`${REVERSE_GEOCODE_ENDPOINT}?${params}`)
  const result = data?.results
  if (!result) throw new Error('住所情報が取得できませんでした')

  let municipality = null
  try {
    municipality = (await fetchMunicipalityData()).get(String(result.muniCd || ''))
  } catch {
    // Municipality names are helpful but not essential; keep the GSI reverse result.
  }

  const area = result.lv01Nm || ''
  const label = [municipality?.prefecture, municipality?.city, area].filter(Boolean).join(' ')

  return {
    label: label || area || '住所情報なし',
    prefecture: municipality?.prefecture || '',
    city: municipality?.city || '',
    area,
    muniCd: result.muniCd || '',
    source: '国土地理院 逆ジオコーダー',
  }
}

export function pointAtDistance(lat, lon, distanceMeters, bearingDegrees) {
  const earthRadius = 6371000
  const bearing = (bearingDegrees * Math.PI) / 180
  const lat1 = (lat * Math.PI) / 180
  const lon1 = (lon * Math.PI) / 180
  const angularDistance = distanceMeters / earthRadius

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  )
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  )

  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI }
}

function summarizeProfile(line) {
  const valid = line.points.filter(isProfilePoint)
  const average = endpointSlope(line)
  const segments = slopeSegments(line)
  return {
    minElevation: valid.length ? Math.min(...valid.map(point => point.elevation)) : null,
    maxElevation: valid.length ? Math.max(...valid.map(point => point.elevation)) : null,
    elevationDiff: average?.elevationDelta ?? null,
    totalRise: segments.reduce((sum, segment) => sum + Math.max(0, segment.elevationDelta), 0),
    totalFall: segments.reduce((sum, segment) => sum + Math.max(0, -segment.elevationDelta), 0),
    averageSlopePercent: average?.slopePercent ?? null,
    maxSlopePercent: segments.length ? Math.max(...segments.map(segment => segment.slopePercent)) : null,
  }
}

async function buildCrossSectionLine(lat, lon, label, negativeBearing, positiveBearing, rangeMeters, intervalMeters, negativeDirection, positiveDirection, options) {
  const distances = []
  for (let distance = -rangeMeters; distance <= rangeMeters; distance += intervalMeters) {
    distances.push(distance)
  }

  const points = await mapWithConcurrency(distances, ELEVATION_REQUEST_CONCURRENCY, async (distance) => {
    if (options.signal?.aborted) throw options.signal.reason || new DOMException('断面の取得を中止しました。', 'AbortError')
    const bearing = distance < 0 ? negativeBearing : positiveBearing
    const point = distance === 0
      ? { lat, lon }
      : pointAtDistance(lat, lon, Math.abs(distance), bearing)
    try {
      const result = await (options.fetchElevationImpl || fetchElevation)(point.lat, point.lon, { signal: options.signal })
      if (options.signal?.aborted) throw options.signal.reason || new DOMException('断面の取得を中止しました。', 'AbortError')
      if (!Number.isFinite(result?.value) || result.missing === true) throw new Error('標高データなし')
      return { distance, ...point, elevation: result.value, source: result.dataSource }
    } catch (error) {
      if (options.signal?.aborted || error?.name === 'AbortError') throw options.signal?.reason || error
      // Keep the original position in the sequence. Joining the neighbours over
      // this gap would invent an unobserved rise/fall or steepest segment.
      return { distance, ...point, elevation: null, source: '標高データなし', missing: true }
    }
  })

  const line = {
    label,
    negativeDirection,
    positiveDirection,
    rangeMeters,
    intervalMeters,
    points,
  }
  return { ...line, summary: summarizeProfile(line) }
}

export async function analyzeTerrainCrossSection(lat, lon, options = {}) {
  const rangeMeters = options.rangeMeters ?? 100
  const intervalMeters = options.intervalMeters ?? 10
  if (!Number.isFinite(rangeMeters) || rangeMeters < 1 || rangeMeters > 1000 || !Number.isFinite(intervalMeters) || intervalMeters < 1 || intervalMeters > 1000 || Math.floor(2 * rangeMeters / intervalMeters) + 1 > 501) throw new Error('断面の範囲・間隔が不正です。')
  const [eastWest, northSouth] = await mapWithConcurrency([
    ['東西断面', 270, 90, '西', '東'],
    ['南北断面', 180, 0, '南', '北'],
  ], 1, ([label, negativeBearing, positiveBearing, negativeDirection, positiveDirection]) =>
    buildCrossSectionLine(lat, lon, label, negativeBearing, positiveBearing, rangeMeters, intervalMeters, negativeDirection, positiveDirection, options))

  const allElevations = [...eastWest.points, ...northSouth.points]
    .filter(isProfilePoint)
    .map((point) => point.elevation)
  if (!allElevations.length) throw new Error('断面範囲の標高データを取得できませんでした。通信状態や範囲を確認して再試行してください。')

  return {
    rangeMeters,
    intervalMeters,
    lines: [eastWest, northSouth],
    summary: {
      minElevation: allElevations.length ? Math.min(...allElevations) : null,
      maxElevation: allElevations.length ? Math.max(...allElevations) : null,
      sampleCount: allElevations.length,
    },
  }
}

const DIRECTIONS = [
  ['北', 0],
  ['北東', 45],
  ['東', 90],
  ['南東', 135],
  ['南', 180],
  ['南西', 225],
  ['西', 270],
  ['北西', 315],
]

export const HORIZON_DIRECTIONS = DIRECTIONS.map(([direction, bearing]) => ({
  direction,
  bearing,
}))

const DIRECTION_LABELS = new Map([
  [0, '北'],
  [45, '北東'],
  [90, '東'],
  [135, '南東'],
  [180, '南'],
  [225, '南西'],
  [270, '西'],
  [315, '北西'],
])

export function createHorizonDirections(step = 10) {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 10
  const count = Math.floor(360 / safeStep)
  return Array.from({ length: count }, (_, index) => {
    const bearing = Math.round(index * safeStep)
    return {
      bearing,
      direction: DIRECTION_LABELS.get(bearing) || '',
    }
  })
}

export const DETAILED_HORIZON_DIRECTIONS = createHorizonDirections(10)

function summarizeTerrainSamples(samples, radius, obstructionHeight) {
  const valid = samples.filter((sample) => Number.isFinite(sample.angle) && !sample.missing)
  if (!valid.length) {
    return {
      risk: '低',
      maxAngle: null,
      direction: '',
      radius,
      obstructionHeight,
      samples,
    }
  }
  const highest = valid.reduce((max, sample) => sample.angle > max.angle ? sample : max)
  return {
    risk: highest.angle >= 5 ? '高' : highest.angle >= 2 ? '中' : '低',
    maxAngle: highest.angle,
    direction: highest.direction,
    radius,
    obstructionHeight,
    samples,
  }
}

function emptyTerrainProfilePoint(distance, reason = '標高データなし') {
  return {
    distance,
    elevation: null,
    source: reason,
    obstructionHeight: null,
    effectiveElevation: null,
    terrainAngle: null,
    angle: null,
    missing: true,
    missingReason: reason,
  }
}

function buildTerrainSampleFromProfile(direction, bearing, profile, obstructionHeight) {
  const validProfile = profile.filter((item) => Number.isFinite(item.angle))
  const validTerrainProfile = profile.filter((item) => Number.isFinite(item.terrainAngle))

  if (!validProfile.length) {
    return {
      direction,
      bearing,
      elevation: null,
      distance: null,
      angle: 0,
      terrainAngle: 0,
      terrainDistance: null,
      missing: true,
      missingReason: '標高データなし',
      profile,
    }
  }

  const highest = validProfile.reduce((max, item) => item.angle > max.angle ? item : max)
  const terrainHighest = validTerrainProfile.length
    ? validTerrainProfile.reduce((max, item) => item.terrainAngle > max.terrainAngle ? item : max)
    : null

  return {
    direction,
    bearing,
    elevation: highest.elevation,
    distance: highest.distance,
    angle: highest.angle,
    terrainAngle: terrainHighest?.terrainAngle ?? 0,
    terrainDistance: terrainHighest?.distance ?? null,
    missingCount: profile.length - validProfile.length,
    profile,
  }
}

export function recalculateTerrainObstruction(terrain, siteElevation, obstructionHeight = 20) {
  if (!terrain?.samples?.length || !Number.isFinite(siteElevation)) return terrain
  const samples = terrain.samples.map((sample) => {
    if (!sample.profile?.length) return { ...sample, obstructionHeight }
    const profile = sample.profile.map((point) => {
      if (!Number.isFinite(point.elevation) || !Number.isFinite(point.distance)) {
        return {
          ...point,
          obstructionHeight: null,
          effectiveElevation: null,
          terrainAngle: null,
          angle: null,
          missing: true,
        }
      }
      const curvatureDrop = point.distance ** 2 / (2 * 6371000)
      const terrainElevationDiff = point.elevation - siteElevation - curvatureDrop
      const terrainAngle = (Math.atan2(terrainElevationDiff, point.distance) * 180) / Math.PI
      const elevationDiff = point.elevation + obstructionHeight - siteElevation - curvatureDrop
      const angle = (Math.atan2(elevationDiff, point.distance) * 180) / Math.PI
      return {
        ...point,
        obstructionHeight,
        effectiveElevation: point.elevation + obstructionHeight,
        terrainAngle: Math.max(0, terrainAngle),
        angle: Math.max(0, angle),
      }
    })
    return {
      ...sample,
      ...buildTerrainSampleFromProfile(sample.direction, sample.bearing, profile, obstructionHeight),
    }
  })
  return summarizeTerrainSamples(samples, terrain.radius || '250m〜5km・各方位10点', obstructionHeight)
}

export async function analyzeSurroundingTerrain(
  lat,
  lon,
  siteElevation,
  obstructionHeight = 20,
  directions = HORIZON_DIRECTIONS,
) {
  const distances = [250, 375, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000]
  const samples = await mapWithConcurrency(
    directions,
    2,
    async ({ direction, bearing }) => {
      const profile = await mapWithConcurrency(distances, 4, async (distance) => {
        const point = pointAtDistance(lat, lon, distance, bearing)
        try {
          const result = await fetchElevation(point.lat, point.lon)
          const curvatureDrop = distance ** 2 / (2 * 6371000)
          const terrainElevationDiff = result.value - siteElevation - curvatureDrop
          const terrainAngle = (Math.atan2(terrainElevationDiff, distance) * 180) / Math.PI
          const elevationDiff = result.value + obstructionHeight - siteElevation - curvatureDrop
          const angle = (Math.atan2(elevationDiff, distance) * 180) / Math.PI
          return {
            distance,
            elevation: result.value,
            source: result.dataSource,
            obstructionHeight,
            effectiveElevation: result.value + obstructionHeight,
            terrainAngle: Math.max(0, terrainAngle),
            angle: Math.max(0, angle),
          }
        } catch {
          return emptyTerrainProfilePoint(distance)
        }
      })
      return buildTerrainSampleFromProfile(direction, bearing, profile, obstructionHeight)
    },
  )

  return summarizeTerrainSamples(samples, '250m〜5km・各方位10点', obstructionHeight)
}
