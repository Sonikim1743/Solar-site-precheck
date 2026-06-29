import { convertCadastreSourceFile } from './cadastreXml.js'

const NUMBER_KEYS = ['地番', '地番番号', '筆番号', 'chiban', 'parcel_number', 'parcelnumber', 'lot_number']
const AREA_KEYS = ['地番区域', '所在', '大字', '町字', '小字', '所在名称', 'address', 'area_name']
const CITY_KEYS = ['市区町村名', '市町村名', '市区町村', 'municipality', 'city']
const MAP_KEYS = ['地図種類', '地図分類', '座標系', 'map_type', 'coordinate_system']
const AREA_PART_KEYS = ['大字名', '丁目名', '小字名', '予備名']
const LARGE_FILE_BYTES = 50 * 1024 * 1024
const MAX_FILE_BYTES = 300 * 1024 * 1024

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[\s_\-・]/g, '')
}

function findProperty(properties, aliases) {
  const entries = Object.entries(properties || {})
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias)
    const exact = entries.find(([key]) => normalizeKey(key) === normalizedAlias)
    if (exact && exact[1] !== null && exact[1] !== '') return String(exact[1])
  }
  return ''
}

function visitCoordinates(coordinates, callback) {
  if (!Array.isArray(coordinates)) return
  if (coordinates.length >= 2 && coordinates.every(Number.isFinite)) {
    callback(coordinates)
    return
  }
  coordinates.forEach((item) => visitCoordinates(item, callback))
}

export function featureCenter(feature) {
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity
  visitCoordinates(feature.geometry?.coordinates, ([lon, lat]) => {
    minLon = Math.min(minLon, lon)
    minLat = Math.min(minLat, lat)
    maxLon = Math.max(maxLon, lon)
    maxLat = Math.max(maxLat, lat)
  })
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return null
  return { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 }
}

export function parcelInfo(feature) {
  const properties = feature.properties || {}
  const id = String(properties.__parcelId ?? feature.id ?? '')
  const number = findProperty(properties, NUMBER_KEYS) || `筆 ${id}`
  const area = findProperty(properties, AREA_KEYS) || AREA_PART_KEYS
    .map((key) => findProperty(properties, [key]))
    .filter(Boolean)
    .join('')
  const municipality = findProperty(properties, CITY_KEYS)
  const mapType = findProperty(properties, MAP_KEYS)
  return {
    id,
    number,
    area,
    municipality,
    mapType,
    label: [municipality, area, number].filter(Boolean).join(' '),
  }
}

function isNearFocus(center, focus, radiusKm) {
  const latRange = radiusKm / 111
  const lonRange = radiusKm / (111 * Math.max(0.2, Math.cos(focus.lat * Math.PI / 180)))
  return Math.abs(center.lat - focus.lat) <= latRange && Math.abs(center.lon - focus.lon) <= lonRange
}

export async function readCadastreGeoJson(file, sourceData = null, options = {}) {
  const { focus = null, radiusKm = 10, onProgress = () => {} } = options
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('300MBを超える地番データには未対応です。市区町村・座標系別の小さいファイルを選んでください。')
  }
  if (!sourceData && file.size > LARGE_FILE_BYTES && !focus) {
    throw new Error('大容量の地番データです。先に住所検索または地図クリックで候補地点を選んでから、もう一度読み込んでください。')
  }
  let data = sourceData
  if (!data) {
    try {
      onProgress(`GeoJSONを読み込んでいます… ${(file.size / 1024 / 1024).toFixed(1)}MB`)
      data = JSON.parse(await file.text())
    } catch {
      throw new Error('GeoJSONを読み取れませんでした。法務省のXML・ZIPまたはGeoJSONを指定してください。')
    }
  }

  const sourceFeatures = data.type === 'FeatureCollection'
    ? data.features
    : data.type === 'Feature'
      ? [data]
      : []
  const polygonFeatures = sourceFeatures.filter((feature) =>
    ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type),
  )
  if (!polygonFeatures.length) {
    const geometryTypes = [...new Set(sourceFeatures.map((feature) => feature.geometry?.type).filter(Boolean))]
    throw new Error(`このファイルは地番ポリゴンではありません。検出した形状: ${geometryTypes.join(', ') || 'なし'}`)
  }

  const filterAroundFocus = Boolean(focus) && (file.size > LARGE_FILE_BYTES || polygonFeatures.length > 50000)
  const features = []
  let outsideJapan = 0
  let outsideFocus = 0
  if (filterAroundFocus) onProgress(`候補地点から${radiusKm}km以内の地番を抽出しています…`)
  polygonFeatures.forEach((feature, index) => {
    const center = featureCenter(feature)
    if (!center || center.lat < 20 || center.lat > 50 || center.lon < 120 || center.lon > 155) {
      outsideJapan += 1
      return
    }
    if (filterAroundFocus && !isNearFocus(center, focus, radiusKm)) {
      outsideFocus += 1
      return
    }
    features.push({
      ...feature,
      id: feature.id ?? index,
      properties: { ...feature.properties, __parcelId: String(feature.id ?? index) },
    })
  })

  if (!features.length) {
    if (filterAroundFocus) {
      throw new Error(`選択地点から${radiusKm}km以内に地番がありません。対象市区町村のファイルか確認してください。`)
    }
    throw new Error('日本の経緯度を持つ筆がありません。任意座標系の公図は航空写真に重ねられません。')
  }

  return {
    type: 'FeatureCollection',
    features,
    summary: {
      total: sourceFeatures.length,
      displayable: features.length,
      skipped: outsideJapan,
      filteredOut: outsideFocus,
      focusRadiusKm: filterAroundFocus ? radiusKm : null,
      conversionSkipped: data.conversionSkipped?.length || 0,
      fileName: file.name,
    },
  }
}

export async function readCadastreFile(file, onProgress = () => {}, options = {}) {
  const converted = await convertCadastreSourceFile(file, onProgress)
  return readCadastreGeoJson(file, converted, { ...options, onProgress })
}

export function searchParcels(data, query, limit = 30) {
  const normalized = String(query).trim().toLowerCase()
  if (!data || !normalized) return []
  const results = []
  for (const feature of data.features) {
    const info = parcelInfo(feature)
    const haystack = `${info.number} ${info.area} ${info.municipality}`.toLowerCase()
    if (haystack.includes(normalized)) results.push({ feature, info, center: featureCenter(feature) })
    if (results.length >= limit) break
  }
  return results
}
