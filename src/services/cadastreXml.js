import proj4 from 'proj4'
import { strFromU8, unzipSync } from 'fflate'

const ZONE_ORIGINS = [
  [33, 129.5], [33, 131], [36, 132 + 10 / 60], [33, 133.5],
  [36, 134 + 20 / 60], [36, 136], [36, 137 + 10 / 60], [36, 138.5],
  [36, 139 + 50 / 60], [40, 140 + 50 / 60], [44, 140.25], [44, 142.25],
  [44, 144.25], [26, 142], [26, 127.5], [26, 124], [26, 131],
  [20, 136], [26, 154],
]

ZONE_ORIGINS.forEach(([lat0, lon0], index) => {
  const epsg = 2443 + index
  proj4.defs(
    `EPSG:${epsg}`,
    `+proj=tmerc +lat_0=${lat0} +lon_0=${lon0} +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`,
  )
})

function elements(root, localName) {
  return Array.from(root.getElementsByTagName('*')).filter((element) =>
    element.localName === localName || element.tagName.split(':').at(-1) === localName,
  )
}

function first(root, localName) {
  return elements(root, localName)[0] || null
}

function childText(root, localName) {
  const child = Array.from(root.children || []).find((element) =>
    element.localName === localName || element.tagName.split(':').at(-1) === localName,
  )
  return child?.textContent?.trim() || ''
}

function refId(element) {
  return element?.getAttribute('idref') ||
    Array.from(element?.attributes || []).find((attribute) => attribute.localName === 'idref')?.value || ''
}

function elementId(element) {
  return element?.getAttribute('id') ||
    Array.from(element?.attributes || []).find((attribute) => attribute.localName === 'id')?.value || ''
}

function directCoordinate(element) {
  const x = Number(first(element, 'X')?.textContent)
  const y = Number(first(element, 'Y')?.textContent)
  // 法務省XMLは X=北方向、Y=東方向。proj4 は [東距, 北距] を受け取る。
  return Number.isFinite(x) && Number.isFinite(y) ? [y, x] : null
}

function closeRing(ring) {
  const cleaned = ring.filter((point, index) =>
    index === 0 || point[0] !== ring[index - 1][0] || point[1] !== ring[index - 1][1],
  )
  if (cleaned.length && (
    cleaned[0][0] !== cleaned.at(-1)[0] || cleaned[0][1] !== cleaned.at(-1)[1]
  )) cleaned.push([...cleaned[0]])
  return cleaned
}

function coordinateSystem(root) {
  const value = childText(root, '座標系')
  if (value === '任意座標系') return { value, epsg: null }
  const match = value.match(/公共座標\s*(\d+)\s*系/)
  if (!match) throw new Error(`未対応の座標系です: ${value || '記載なし'}`)
  const zone = Number(match[1])
  if (zone < 1 || zone > 19) throw new Error(`公共座標系の番号が範囲外です: ${zone}`)
  return { value, epsg: 2442 + zone }
}

function transformRing(ring, epsg) {
  return closeRing(ring).map(([x, y]) => {
    const [lon, lat] = proj4(`EPSG:${epsg}`, 'EPSG:4326', [x, y])
    return [Number(lon.toFixed(9)), Number(lat.toFixed(9))]
  })
}

export function convertMojXmlText(xmlText, fileName = 'map.xml') {
  const document = new DOMParser().parseFromString(xmlText, 'application/xml')
  const parseError = document.querySelector('parsererror')
  if (parseError) throw new Error(`${fileName}: XMLを解析できませんでした。`)
  const root = document.documentElement
  if (!root || !elements(document, '筆').length) {
    throw new Error(`${fileName}: 法務省地図XMLの「筆」が見つかりません。`)
  }

  const crs = coordinateSystem(root)
  if (!crs.epsg) {
    throw new Error(`${fileName}: 任意座標系の公図は航空写真上の位置を持たないため表示できません。`)
  }

  const cityCode = childText(root, '市区町村コード')
  const cityName = childText(root, '市区町村名')
  const mapName = childText(root, '地図名')
  const points = new Map()
  elements(root, 'GM_Point').forEach((element) => {
    const coordinate = directCoordinate(element)
    if (coordinate) points.set(elementId(element), coordinate)
  })

  const curves = new Map()
  elements(root, 'GM_Curve').forEach((element) => {
    const coordinates = []
    elements(element, 'GM_PointArray.column').forEach((column) => {
      const pointReference = first(column, 'GM_PointRef.point')
      const referenced = pointReference ? points.get(refId(pointReference)) : null
      const coordinate = referenced || directCoordinate(first(column, 'GM_Position.direct') || column)
      if (coordinate) coordinates.push(coordinate)
    })
    curves.set(elementId(element), coordinates)
  })

  const surfaces = new Map()
  elements(root, 'GM_Surface').forEach((element) => {
    const boundary = first(element, 'GM_SurfaceBoundary')
    const exteriorElement = first(boundary, 'GM_SurfaceBoundary.exterior')
    const exterior = []
    elements(exteriorElement, 'GM_CompositeCurve.generator').forEach((reference) => {
      exterior.push(...(curves.get(refId(reference)) || []))
    })
    const interiors = elements(boundary, 'GM_SurfaceBoundary.interior').map((interiorElement) => {
      const ring = []
      elements(interiorElement, 'GM_CompositeCurve.generator').forEach((reference) => {
        ring.push(...(curves.get(refId(reference)) || []))
      })
      return ring
    })
    surfaces.set(elementId(element), { exterior, interiors })
  })

  const propertyNames = [
    '地図番号', '縮尺分母', '大字コード', '丁目コード', '小字コード', '予備コード',
    '大字名', '丁目名', '小字名', '予備名', '地番', '精度区分', '座標値種別', '筆界未定構成筆',
  ]
  const features = []
  elements(root, '筆').forEach((parcel, index) => {
    const number = childText(parcel, '地番')
    if (number.includes('地区外') || number.includes('別図')) return
    const shape = Array.from(parcel.children || []).find((element) =>
      element.localName === '形状' || element.tagName.split(':').at(-1) === '形状',
    )
    const surface = surfaces.get(refId(shape))
    if (!surface || surface.exterior.length < 3) return
    const rings = [
      transformRing(surface.exterior, crs.epsg),
      ...surface.interiors.filter((ring) => ring.length >= 3).map((ring) => transformRing(ring, crs.epsg)),
    ]
    const properties = {
      筆ID: elementId(parcel) || `${fileName}-${index}`,
      市区町村コード: cityCode,
      市区町村名: cityName,
      地図名: mapName,
      座標系: crs.value,
      変換元ファイル: fileName,
    }
    propertyNames.forEach((name) => { properties[name] = childText(parcel, name) || null })
    features.push({
      type: 'Feature',
      id: properties.筆ID,
      properties,
      geometry: { type: 'MultiPolygon', coordinates: [[...rings]] },
    })
  })

  if (!features.length) throw new Error(`${fileName}: 表示可能な筆ポリゴンがありません。`)
  return { type: 'FeatureCollection', features }
}

export async function convertCadastreSourceFile(file, onProgress = () => {}) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xml')) {
    onProgress('地図XMLを変換しています…')
    return convertMojXmlText(await file.text(), file.name)
  }
  if (!name.endsWith('.zip')) return null

  onProgress('ZIPを展開しています…')
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const xmlEntries = Object.entries(archive).filter(([entryName]) => entryName.toLowerCase().endsWith('.xml'))
  if (!xmlEntries.length) throw new Error('ZIP内に地図XMLが見つかりませんでした。')
  const features = []
  const skipped = []
  for (let index = 0; index < xmlEntries.length; index += 1) {
    const [entryName, bytes] = xmlEntries[index]
    onProgress(`地図XMLを変換しています… ${index + 1}/${xmlEntries.length}`)
    try {
      const converted = convertMojXmlText(strFromU8(bytes), entryName)
      features.push(...converted.features)
    } catch (error) {
      skipped.push(error.message)
    }
  }
  if (!features.length) {
    throw new Error(skipped[0] || '表示可能な公共座標系の筆がありませんでした。')
  }
  return { type: 'FeatureCollection', features, conversionSkipped: skipped }
}
