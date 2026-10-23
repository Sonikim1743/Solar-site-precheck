import { REGULATORY_REFERENCE_SOURCES } from './regulatoryRegistry.js'

export const POINT_REFERENCE_MEANINGS = Object.freeze({
  culture: { label: '埋蔵文化財', colorName: '紫', meaning: '埋蔵文化財に関する手掛かりです。', check: '造成・掘削前に、自治体の文化財担当へ現行範囲と必要な確認を相談してください。' },
  'agriculture-region': { label: '農業地域', colorName: '茶', meaning: '土地利用基本計画の農業地域の参考範囲です。', check: '農用地区域・地目とは区別し、自治体で現在の指定や農地利用の手続を確認してください。' },
  'agricultural-use': { label: '農用地区域（古い資料）', colorName: '茶・破線', meaning: '古い原資料に記載された農用地区域の手掛かりです。', check: '現在の指定・変更履歴を自治体へ確認してください。ファイル版年は境界の原資料年ではありません。' },
})

export function isInspectionPoint(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lon) && point.lat >= 20 && point.lat <= 50 && point.lon >= 120 && point.lon <= 155
}

export function inspectionPointKey(point) {
  return isInspectionPoint(point) ? `${point.lat},${point.lon}` : ''
}

export function activeReferenceSources(includeHistorical = false, sources = REGULATORY_REFERENCE_SOURCES) {
  return sources.filter(source => source.category !== 'agricultural-use' || !source.historic || includeHistorical)
}

export function pointInBounds(point, bounds) {
  return Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isFinite) &&
    bounds[0] <= point.lon && point.lon <= bounds[2] && bounds[1] <= point.lat && point.lat <= bounds[3]
}

function ringLocation(point, ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 'invalid'
  if (!ring.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))) return 'invalid'
  if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return 'invalid'
  const x = point.lon, y = point.lat
  let inside = false, boundary = false, area = 0
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], dx = b[0] - a[0], dy = b[1] - a[1]
    const length = Math.hypot(dx, dy)
    area += (a[0] - ring[0][0]) * (b[1] - ring[0][1]) - (b[0] - ring[0][0]) * (a[1] - ring[0][1])
    if (length > 0 && Math.abs((x - a[0]) * dy - (y - a[1]) * dx) <= length * 1e-10 &&
      x >= Math.min(a[0], b[0]) - 1e-10 && x <= Math.max(a[0], b[0]) + 1e-10 &&
      y >= Math.min(a[1], b[1]) - 1e-10 && y <= Math.max(a[1], b[1]) + 1e-10) boundary = true
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return Math.abs(area) < 1e-20 ? 'invalid' : boundary ? 'boundary' : inside ? 'inside' : 'outside'
}

function polygonLocation(point, polygon) {
  if (!Array.isArray(polygon) || !polygon.length) return 'invalid'
  const locations = polygon.map(ring => ringLocation(point, ring))
  if (locations.includes('invalid')) return 'invalid'
  if (locations[0] === 'outside' || locations.slice(1).includes('inside')) return 'outside'
  return locations.includes('boundary') ? 'boundary' : 'inside'
}

// Actual Polygon/MultiPolygon containment, including holes and boundary state.
// Invalid geometry must stay unknown, never become a successful "no overlap".
export function locateReferencePoint(point, geometry) {
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return 'invalid'
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : null
  if (!Array.isArray(polygons) || !polygons.length) return 'invalid'
  const locations = polygons.map(polygon => polygonLocation(point, polygon))
  if (locations.includes('invalid')) return 'invalid'
  return locations.includes('inside') ? 'inside' : locations.includes('boundary') ? 'boundary' : 'outside'
}

export function hazardPointTile(point, z = 17) {
  if (!isInspectionPoint(point) || !Number.isInteger(z) || z < 2 || z > 17) throw Error('確認地点・配信倍率が不正です。')
  const count = 2 ** z
  const x = (point.lon + 180) / 360 * count
  const y = (1 - Math.asinh(Math.tan(point.lat * Math.PI / 180)) / Math.PI) / 2 * count
  return { coords: { x: Math.floor(x), y: Math.floor(y), z }, pixel: { x: Math.floor((x - Math.floor(x)) * 256), y: Math.floor((y - Math.floor(y)) * 256) } }
}

export function classifyHazardPixel(rgba) {
  if (!Array.isArray(rgba) || rgba.length !== 4 || !rgba.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) throw Error('地点画素を読み取れません。')
  const color = '#' + rgba.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('')
  if (rgba[3] === 0) return { state: 'nodata', rgba, color, message: '透明画素・NoData。未収録や安全の有無は未確認。', rankKnown: false }
  if (rgba.slice(0, 3).every(v => v === 255)) return { state: 'unreadable', rgba, color, message: '白色画素・意味未確認。凡例と自治体資料で確認。', rankKnown: false }
  return { state: 'painted', rgba, color, message: '表示画素あり・種別要確認。PNGから指定名・ランクは取得できません。', rankKnown: false }
}

export function pointStatusLabel(state) {
  return ({ matched: '収録図形と重なり', none: 'この収録図形との重なりなし', outside: '収録範囲外・未対応', error: '取得・判読失敗／未確認', partial: '一部未確認', painted: '表示あり・種別要確認', nodata: '透明画素・NoData', unavailable: '404・資料未提供等', unsupported: '対象地域の条件未確認', unconfirmed: '対象県未確認', unreadable: '画像取得・地点判読未確認', off: 'OFF・未照会' })[state] || '未確認'
}
