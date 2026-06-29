const ELEVATION_ENDPOINT =
  'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php'
const ADDRESS_ENDPOINT = 'https://msearch.gsi.go.jp/address-search/AddressSearch'
const REVERSE_GEOCODE_ENDPOINT =
  'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress'
const MUNICIPALITY_DATA_URL = 'https://maps.gsi.go.jp/js/muni.js'
const tileCache = new Map()
let municipalityDataPromise
const ELEVATION_CACHE_KEY = 'solar-site-elevation-points-v1'
let pointCache
let cacheSaveTimer

function loadPointCache() {
  if (pointCache) return pointCache
  try {
    pointCache = new Map(JSON.parse(window.localStorage.getItem(ELEVATION_CACHE_KEY) || '[]'))
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
  window.clearTimeout(cacheSaveTimer)
  cacheSaveTimer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(ELEVATION_CACHE_KEY, JSON.stringify([...cache.entries()]))
    } catch {
      // Storage can be unavailable in private browsing; the in-memory cache still works.
    }
  }, 150)
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    window.clearTimeout(timeout)
  }
}

function tilePosition(lat, lon, zoom) {
  const scale = 2 ** zoom
  const xFloat = ((lon + 180) / 360) * scale
  const latitudeRadians = (lat * Math.PI) / 180
  const yFloat = (
    1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI
  ) / 2 * scale

  return {
    x: Math.floor(xFloat),
    y: Math.floor(yFloat),
    pixelX: Math.min(255, Math.floor((xFloat - Math.floor(xFloat)) * 256)),
    pixelY: Math.min(255, Math.floor((yFloat - Math.floor(yFloat)) * 256)),
  }
}

async function fetchTileText(url) {
  if (!tileCache.has(url)) {
    tileCache.set(url, fetch(url).then((response) => {
      if (!response.ok) throw new Error(`標高タイル HTTP ${response.status}`)
      return response.text()
    }))
  }
  return tileCache.get(url)
}

async function fetchElevationTile(lat, lon, layer, zoom) {
  const position = tilePosition(lat, lon, zoom)
  const url = `https://cyberjapandata.gsi.go.jp/xyz/${layer}/${zoom}/${position.x}/${position.y}.txt`
  const text = await fetchTileText(url)
  const rows = text.trim().split(/\r?\n/)
  const value = rows[position.pixelY]?.split(',')[position.pixelX]
  const elevation = Number(value)
  if (!Number.isFinite(elevation)) throw new Error('標高値なし')
  return elevation
}

export async function fetchElevation(lat, lon) {
  const cached = loadPointCache().get(elevationCacheKey(lat, lon))
  if (cached) return { ...cached, cached: true }
  const layers = [
    ['dem5a', 15, '国土地理院 DEM5A標高タイル'],
    ['dem5b', 15, '国土地理院 DEM5B標高タイル'],
    ['dem5c', 15, '国土地理院 DEM5C標高タイル'],
    ['dem', 14, '国土地理院 DEM標高タイル'],
  ]

  for (const [layer, zoom, label] of layers) {
    try {
      const value = await fetchElevationTile(lat, lon, layer, zoom)
      const result = { value, dataSource: label }
      rememberElevation(lat, lon, result)
      return result
    } catch {
      // Coverage differs by DEM layer; try the next official tile layer.
    }
  }

  const result = await fetchElevationEndpoint(lat, lon)
  rememberElevation(lat, lon, result)
  return result
}

async function fetchElevationEndpoint(lat, lon) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    outtype: 'JSON',
  })
  const data = await fetchJson(`${ELEVATION_ENDPOINT}?${params}`)
  const elevation = Number(data.elevation)

  if (!Number.isFinite(elevation)) {
    throw new Error('標高値が取得できませんでした')
  }

  return {
    value: elevation,
    dataSource: data.hsrc || '国土地理院 標高データ',
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

function pointAtDistance(lat, lon, distanceMeters, bearingDegrees) {
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

const DIRECTIONS = [
  ['北', 0],
  ['北東', 45],
  ['東', 90],
  ['南東', 135],
  ['南', 180],
  ['南西', 225],
  ['西', 270],
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
  const valid = samples.filter((sample) => Number.isFinite(sample.angle))
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

export function recalculateTerrainObstruction(terrain, siteElevation, obstructionHeight = 20) {
  if (!terrain?.samples?.length || !Number.isFinite(siteElevation)) return terrain
  const samples = terrain.samples.map((sample) => {
    if (!sample.profile?.length) return { ...sample, obstructionHeight }
    const profile = sample.profile.map((point) => {
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
    const highest = profile.reduce((max, item) => item.angle > max.angle ? item : max)
    const terrainHighest = profile.reduce((max, item) => item.terrainAngle > max.terrainAngle ? item : max)
    return {
      ...sample,
      elevation: highest.elevation,
      distance: highest.distance,
      angle: highest.angle,
      terrainAngle: terrainHighest.terrainAngle,
      terrainDistance: terrainHighest.distance,
      profile,
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
  const samples = await Promise.all(
    directions.map(async ({ direction, bearing }) => {
      const profile = await Promise.all(distances.map(async (distance) => {
        const point = pointAtDistance(lat, lon, distance, bearing)
        const result = await fetchElevation(point.lat, point.lon)
        const curvatureDrop = distance ** 2 / (2 * 6371000)
        const terrainElevationDiff = result.value - siteElevation - curvatureDrop
        const terrainAngle = (Math.atan2(terrainElevationDiff, distance) * 180) / Math.PI
        const elevationDiff = result.value + obstructionHeight - siteElevation - curvatureDrop
        const angle = (Math.atan2(elevationDiff, distance) * 180) / Math.PI
        return {
          distance,
          elevation: result.value,
          obstructionHeight,
          effectiveElevation: result.value + obstructionHeight,
          terrainAngle: Math.max(0, terrainAngle),
          angle: Math.max(0, angle),
        }
      }))
      const highest = profile.reduce((max, item) => item.angle > max.angle ? item : max)
      const terrainHighest = profile.reduce((max, item) => item.terrainAngle > max.terrainAngle ? item : max)
      return {
        direction,
        bearing,
        elevation: highest.elevation,
        distance: highest.distance,
        angle: highest.angle,
        terrainAngle: terrainHighest.terrainAngle,
        terrainDistance: terrainHighest.distance,
        profile,
      }
    }),
  )

  return summarizeTerrainSamples(samples, '250m〜5km・各方位10点', obstructionHeight)
}
