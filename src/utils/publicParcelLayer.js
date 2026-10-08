// Display-only public parcel data. Never adopted as review geometry or area.
export const PUBLIC_PARCEL_SOURCE = Object.freeze({
  url: 'https://data.source.coop/smartmaps/amx-2024-04/MojMap_amx_2024.pmtiles',
  pageUrl: 'https://source.coop/smartmaps/amx-2024-04',
  year: 2024,
  dataLayer: 'fude',
  minZoom: 14,
  maxDataZoom: 16,
})

export function isPublicParcelFeature(feature) {
  const props = feature?.props || {}
  const crs = String(props['座標系'] || '').trim()
  return feature?.geomType === 3 && /^公共座標\s*(?:[1-9]|1[0-9])\s*系$/.test(crs)
}

export function publicParcelNumber(feature) {
  if (!isPublicParcelFeature(feature)) return ''
  const text = typeof feature.props['地番'] === 'string' ? feature.props['地番'].trim() : ''
  return /^(?:別図|地区外|調査外|区域外)/.test(text) ? '' : text.slice(0, 60)
}

function pointInsideRings(point, rings) {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j]
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
    }
  }
  return inside
}

// Keep a number inside its polygon, including concave parcels and holes.
// No geodetic inference: these coordinates are the renderer's display pixels.
export function publicParcelLabelAnchor(rings) {
  if (!Array.isArray(rings) || !rings.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const ring of rings) for (const point of ring) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y)
  }
  if (!(maxX > minX && maxY > minY)) return null
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  if (pointInsideRings(center, rings)) return center
  // A bounded search avoids putting the label in a neighbouring parcel or hole.
  for (let divisions = 4; divisions <= 16; divisions *= 2) {
    for (let y = 1; y < divisions; y++) for (let x = 1; x < divisions; x++) {
      const point = { x: minX + (maxX - minX) * x / divisions, y: minY + (maxY - minY) * y / divisions }
      if (pointInsideRings(point, rings)) return point
    }
  }
  return null
}

export function publicParcelStatus(state) {
  const messages = {
    off: '',
    zoom: '地番を見るには地図を拡大してください。',
    loading: '公開地番（2024年）を読み込み中…',
    ready: '公開地番（2024年）／参考境界',
    empty: 'この表示範囲には公開地番がありません。地番ファイルも利用できます。',
    error: '公開地番の一部または全部を取得できません。通信を確認するか、地番ファイルを利用してください。',
  }
  return { state, message: messages[state] ?? messages.error }
}
