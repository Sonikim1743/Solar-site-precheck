import polygonClipping from 'polygon-clipping'
import proj4 from 'proj4'

// Import/storage limits, not cadastral accuracy or design acceptance criteria.
// Positions are 2-D WGS84 [longitude, latitude], within the application's
// Japan import envelope. Larger regional datasets must be split before import.
export const MAX_GEOMETRY_VERTICES = 2000
export const MAX_GEOMETRY_RINGS = 100
export const MAX_GEOMETRY_PARTS = 100
export const MAX_REVIEW_SPAN_DEGREES = 2
const MAX_DERIVED_VERTICES = 20000
const EPS = 1e-12
const fail = message => { throw new Error('筆界の図形が不正です。' + message) }
const same = (a, b) => a[0] === b[0] && a[1] === b[1]
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

function onSegment(p, a, b) {
  const tolerance = EPS * Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
  return Math.abs(cross(a, b, p)) <= tolerance &&
    p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS &&
    p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS
}

function segmentsMeet(a, b, c, d) {
  if (Math.max(a[0], b[0]) + EPS < Math.min(c[0], d[0]) ||
      Math.max(c[0], d[0]) + EPS < Math.min(a[0], b[0]) ||
      Math.max(a[1], b[1]) + EPS < Math.min(c[1], d[1]) ||
      Math.max(c[1], d[1]) + EPS < Math.min(a[1], b[1])) return false
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b)
  return (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) ||
    onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d)
}

// Translation keeps the shoelace sum stable for small parcels near 135 degrees.
function ringArea(ring) {
  const origin = ring[0]
  let sum = 0
  for (let i = 1; i < ring.length - 1; i++) sum += cross(origin, ring[i], ring[i + 1])
  return Math.abs(sum) / 2
}

// -1 outside, 0 on boundary, 1 strictly inside.
function ringLocation(point, ring) {
  let inside = false
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1]
    if (onSegment(point, a, b)) return 0
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside ? 1 : -1
}

function ringsMeet(a, b) {
  for (let i = 0; i < a.length - 1; i++)
    for (let j = 0; j < b.length - 1; j++)
      if (segmentsMeet(a[i], a[i + 1], b[j], b[j + 1])) return true
  return false
}

export function geometryPolygons(geometry) {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
}

export function geometryVertexCount(geometry) {
  return geometryPolygons(geometry).reduce((total, polygon) =>
    total + polygon.reduce((count, ring) => count + ring.length, 0), 0)
}

export function geometryBounds(geometries) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity
  for (const geometry of geometries) for (const polygon of geometryPolygons(geometry))
    for (const ring of polygon) for (const [lon, lat] of ring) {
      west = Math.min(west, lon); east = Math.max(east, lon)
      south = Math.min(south, lat); north = Math.max(north, lat)
    }
  return { west, south, east, north }
}

function validatedGeometry(geometry, maxVertices = MAX_GEOMETRY_VERTICES, maxRings = MAX_GEOMETRY_RINGS, maxParts = MAX_GEOMETRY_PARTS) {
  if (!geometry || typeof geometry !== 'object' || !['Polygon', 'MultiPolygon'].includes(geometry.type)) fail('Polygon / MultiPolygon を指定してください。')
  const polygons = geometryPolygons(geometry)
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > maxParts) fail('面の数が許容範囲外です。')
  let vertices = 0, ringCount = 0
  const normalized = Array.from(polygons, polygon => {
    if (!Array.isArray(polygon) || !polygon.length) fail('外周がありません。')
    ringCount += polygon.length
    if (ringCount > maxRings) fail('外周・中抜きの数が上限を超えています。')
    const rings = Array.from(polygon, ring => {
      if (!Array.isArray(ring) || ring.length < 4) fail('閉じた輪郭には4点以上必要です。')
      vertices += ring.length
      if (vertices > maxVertices) fail('図形の頂点は閉合点を含め' + maxVertices.toLocaleString('en-US') + '点までです。')
      const copy = Array.from(ring, position => {
        if (!Array.isArray(position) || position.length !== 2 ||
            !position.every(v => typeof v === 'number' && Number.isFinite(v)) ||
            position[0] < 120 || position[0] > 155 || position[1] < 20 || position[1] > 50) fail('日本の経緯度を有限の2数値（経度120〜155・緯度20〜50）で指定してください。')
        return [...position]
      })
      if (!same(copy[0], copy.at(-1))) fail('輪郭の始点と終点を一致させてください。')
      const unique = new Set(copy.slice(0, -1).map(p => p.join(',')))
      if (unique.size !== copy.length - 1) fail('閉合点以外の重複頂点があります。')
      if (ringArea(copy) <= 1e-16) fail('面積がない輪郭は使えません。')
      for (let i = 0; i < copy.length - 1; i++) {
        const previous = copy[(i + copy.length - 2) % (copy.length - 1)]
        const here = copy[i], next = copy[i + 1]
        if (onSegment(next, previous, here) || onSegment(previous, here, next)) fail('折り返して重なる辺があります。')
        for (let j = i + 1; j < copy.length - 1; j++) {
          if (j === i + 1 || (i === 0 && j === copy.length - 2)) continue
          if (segmentsMeet(here, next, copy[j], copy[j + 1])) fail('自己交差・自己接触する輪郭は使えません。')
        }
      }
      return copy
    })
    for (let h = 1; h < rings.length; h++) {
      if (ringLocation(rings[h][0], rings[0]) !== 1 || ringsMeet(rings[0], rings[h])) fail('中抜きは外周の内側に収め、外周に接触させないでください。')
      for (let k = 1; k < h; k++) {
        if (ringsMeet(rings[h], rings[k]) || ringLocation(rings[h][0], rings[k]) >= 0 || ringLocation(rings[k][0], rings[h]) >= 0) fail('中抜き同士の重なり・接触・入れ子は使えません。')
      }
    }
    return rings
  })
  const result = { type: geometry.type, coordinates: geometry.type === 'Polygon' ? normalized[0] : normalized }
  const bounds = geometryBounds([result])
  if (bounds.east - bounds.west > MAX_REVIEW_SPAN_DEGREES || bounds.north - bounds.south > MAX_REVIEW_SPAN_DEGREES) fail('1図形は経緯度各2度以内の地域に分割してください。')
  return result
}

export function validatePolygonGeometry(geometry) {
  return validatedGeometry(geometry)
}

function polygonContains(point, polygon, strict = false) {
  const outer = ringLocation(point, polygon[0])
  return (strict ? outer > 0 : outer >= 0) &&
    !polygon.slice(1).some(ring => strict ? ringLocation(point, ring) >= 0 : ringLocation(point, ring) > 0)
}

export function pointInGeometry(point, geometry) {
  const p = Array.isArray(point) ? point : [point?.lon, point?.lat]
  if (p.length !== 2 || !p.every(Number.isFinite)) return false
  try {
    // Union/difference output can exceed an individual imported parcel's cap.
    return geometryPolygons(validatedGeometry(geometry, MAX_DERIVED_VERTICES, 5000, 5000)).some(polygon => polygonContains(p, polygon))
  } catch { return false }
}

// A bounds midpoint can lie in a courtyard, between separate parts, or outside
// a concave parcel. Scan between distinct vertex latitudes and test the result.
export function featureInteriorPoint(feature) {
  let geometry
  try { geometry = validatePolygonGeometry(feature?.geometry) } catch { return null }
  const polygons = geometryPolygons(geometry).toSorted((a, b) =>
    (ringArea(b[0]) - b.slice(1).reduce((s, r) => s + ringArea(r), 0)) -
    (ringArea(a[0]) - a.slice(1).reduce((s, r) => s + ringArea(r), 0)))
  for (const polygon of polygons) {
    const levels = [...new Set(polygon.flatMap(ring => ring.map(p => p[1])))].sort((a, b) => a - b)
    let best = null, bestWidth = 0
    for (let y = 1; y < levels.length; y++) {
      const lat = (levels[y - 1] + levels[y]) / 2
      const cuts = []
      for (const ring of polygon) for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i], b = ring[i + 1]
        if ((a[1] > lat) !== (b[1] > lat)) cuts.push(a[0] + (lat - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
      }
      cuts.sort((a, b) => a - b)
      for (let x = 1; x < cuts.length; x += 2) {
        const lon = (cuts[x - 1] + cuts[x]) / 2, width = cuts[x] - cuts[x - 1]
        if (width > bestWidth && polygonContains([lon, lat], polygon, true)) { best = { lat, lon }; bestWidth = width }
      }
    }
    if (best) return best
  }
  return null
}

function planarArea(polygons) {
  return polygons.reduce((total, polygon) =>
    total + Math.max(0, ringArea(polygon[0]) - polygon.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0)), 0)
}

function normalizedOutput(polygons, inverse) {
  if (!polygons.length) return null
  let count = 0
  const coordinates = polygons.map(polygon => polygon.map(ring => ring.map(point => {
    if (++count > MAX_DERIVED_VERTICES) fail('計算後の頂点が20,000点を超えています。範囲を分けてください。')
    const result = inverse(point)
    if (!result.every(Number.isFinite)) fail('計算後の座標を復元できません。')
    return result
  })))
  return coordinates.length === 1 ? { type: 'Polygon', coordinates: coordinates[0] } : { type: 'MultiPolygon', coordinates }
}

// WGS84 ellipsoidal Lambert azimuthal equal-area, metres. This avoids treating
// longitude/latitude or Web Mercator square units as cadastral square metres.
// Straight segments are interpreted in this local projection. Results remain
// map-based reference areas, not survey/legal/design-confirmed land areas.
export function measureGeometryReview(targets, boundary, exclusions) {
  const geometries = [...targets, ...(boundary ? [boundary] : []), ...exclusions]
  if (!geometries.length) return { targetAreaM2: 0, reviewAreaM2: 0, excludedAreaM2: 0, usableAreaM2: 0, geometry: null }
  const b = geometryBounds(geometries)
  if (b.east - b.west > MAX_REVIEW_SPAN_DEGREES || b.north - b.south > MAX_REVIEW_SPAN_DEGREES) fail('検討全体を経緯度各2度以内に収めてください。')
  const projection = proj4('EPSG:4326', '+proj=laea +lat_0=' + ((b.north + b.south) / 2) + ' +lon_0=' + ((b.east + b.west) / 2) + ' +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs')
  const project = geometry => geometryPolygons(geometry).map(polygon => polygon.map(ring => ring.map(point => projection.forward(point))))
  const union = list => list.length ? polygonClipping.union(...list) : []
  try {
    const target = union(targets.map(project))
    const review = boundary ? (targets.length ? polygonClipping.intersection(target, project(boundary)) : union([project(boundary)])) : target
    const excluded = review.length && exclusions.length ? polygonClipping.intersection(review, union(exclusions.map(project))) : []
    const usable = excluded.length ? polygonClipping.difference(review, excluded) : review
    const values = { targetAreaM2: planarArea(target), reviewAreaM2: planarArea(review), excludedAreaM2: planarArea(excluded), usableAreaM2: planarArea(usable) }
    if (!Object.values(values).every(v => Number.isFinite(v) && v >= 0)) fail('面積を算出できません。')
    return { ...values, geometry: normalizedOutput(usable, point => projection.inverse(point)) }
  } catch (error) {
    throw new Error('筆界の重なりを計算できません。図形を確認してください。' + (error?.message || ''))
  }
}
