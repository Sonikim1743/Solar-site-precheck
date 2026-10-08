import proj4 from 'proj4'
import { validatePolygonGeometry, geometryPolygons, geometryBounds } from '../services/parcelGeometry.js'

export const TERRAIN_AREA_VERSION = 1
export const TERRAIN_AREA_LIMITS = Object.freeze({ step: 5, slopeWindow: 10, maxSpan: 1000, maxNodes: 45000, maxTiles: 64, maxBytes: 1500000, maxContourSegments: 60000 })
export const TERRAIN_DEM_LAYERS = Object.freeze([
  { id: 'dem1a_png', label: '国土地理院 DEM1A（航空レーザ・1m級）', zoom: 17, nativeResolutionMeters: 1 },
  { id: 'dem5a_png', label: '国土地理院 DEM5A（航空レーザ・5m級）', zoom: 15, nativeResolutionMeters: 5 },
  { id: 'dem5b_png', label: '国土地理院 DEM5B（写真測量・5m級）', zoom: 15, nativeResolutionMeters: 5 },
  { id: 'dem5c_png', label: '国土地理院 DEM5C（写真測量・5m級）', zoom: 15, nativeResolutionMeters: 5 },
  { id: 'dem_png', label: '国土地理院 DEM（10m級）', zoom: 14, nativeResolutionMeters: 10 },
])
const layerMap = new Map(TERRAIN_DEM_LAYERS.map(layer => [layer.id, layer]))
const fail = text => { throw new Error(`面地形：${text}`) }
const finite = value => typeof value === 'number' && Number.isFinite(value)
const eps = 1e-7

function projection(origin) {
  if (!finite(origin?.lat) || !finite(origin?.lon) || origin.lat < 20 || origin.lat > 50 || origin.lon < 120 || origin.lon > 155) fail('投影原点が不正です。')
  return proj4('EPSG:4326', `+proj=aeqd +lat_0=${origin.lat} +lon_0=${origin.lon} +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs`)
}

export function terrainPointToLocal(position, origin) {
  if (!finite(position?.lat) || !finite(position?.lon)) return null
  return projection(origin).forward([position.lon, position.lat])
}

// Exact serialized geometry identity, not a claim that reordered vertices differ
// on the ground. Conservative invalidation is preferable to stale results.
export function terrainGeometryKey(geometry) {
  const raw = JSON.stringify(geometry)
  if (!raw || raw.length > 1024 * 1024) fail('範囲の図形が大きすぎます。')
  let a = 2166136261, b = 2246822507
  for (let i = 0; i < raw.length; i++) {
    a = Math.imul(a ^ raw.charCodeAt(i), 16777619)
    b = Math.imul(b ^ raw.charCodeAt(i), 3266489909)
  }
  return `terrain-v1-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`
}

function ringArea(ring) {
  const [ox, oy] = ring[0]
  return Math.abs(ring.slice(0, -1).reduce((sum, p, i) => {
    const q = ring[i + 1]
    return sum + (p[0] - ox) * (q[1] - oy) - (q[0] - ox) * (p[1] - oy)
  }, 0)) / 2
}

function ringLocation([x, y], ring) {
  let inside = false
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[i + 1]
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
    if (Math.abs(cross) < eps && x >= Math.min(ax, bx) - eps && x <= Math.max(ax, bx) + eps && y >= Math.min(ay, by) - eps && y <= Math.max(ay, by) + eps) return 0
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) inside = !inside
  }
  return inside ? 1 : -1
}

export function pointInTerrainBoundary(point, boundary) {
  return boundary.some(polygon => ringLocation(point, polygon[0]) >= 0 && !polygon.slice(1).some(ring => ringLocation(point, ring) >= 0))
}

export function createTerrainPlan(input) {
  const geometry = validatePolygonGeometry(input)
  const bounds = geometryBounds([geometry])
  const origin = { lat: (bounds.south + bounds.north) / 2, lon: (bounds.west + bounds.east) / 2 }
  const project = projection(origin)
  const boundary = geometryPolygons(geometry).map(polygon => polygon.map(ring => ring.map(p => project.forward(p))))
  const points = boundary.flat(2)
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const west = Math.min(...xs), east = Math.max(...xs), south = Math.min(...ys), north = Math.max(...ys)
  if (east - west > TERRAIN_AREA_LIMITS.maxSpan || north - south > TERRAIN_AREA_LIMITS.maxSpan) fail('範囲は東西・南北それぞれ1km以内に分けてください。')
  const step = TERRAIN_AREA_LIMITS.step
  const xMin = Math.floor(west / step) * step - step * 2, yMin = Math.floor(south / step) * step - step * 2
  const width = Math.ceil((east - xMin) / step) + 3, height = Math.ceil((north - yMin) / step) + 3
  if (width * height > TERRAIN_AREA_LIMITS.maxNodes) fail('計算格子が上限を超えています。範囲を分けてください。')
  const inside = Array.from({ length: width * height }, (_, i) => pointInTerrainBoundary([xMin + i % width * step, yMin + Math.floor(i / width) * step], boundary))
  const polygonAreaM2 = boundary.reduce((sum, polygon) => sum + ringArea(polygon[0]) - polygon.slice(1).reduce((area, ring) => area + ringArea(ring), 0), 0)
  if (!inside.some(Boolean)) fail('5m格子の内部点がありません。細い範囲や小さい範囲は現地資料で確認してください。')
  return {
    geometry, geometryKey: terrainGeometryKey(geometry), polygonAreaM2,
    grid: { origin, width, height, step, xMin, yMin, boundary, inside },
    positionAt: i => project.inverse([xMin + i % width * step, yMin + Math.floor(i / width) * step]),
  }
}

export function terrainTilePoint(lon, lat, zoom) {
  const n = 256 * 2 ** zoom, r = lat * Math.PI / 180
  // PNG pixel values represent pixel centres; half-pixel offset aligns bilinear
  // sampling with the same tile image convention as the displayed basemap.
  return [(lon + 180) / 360 * n - .5, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n - .5]
}

export function decodeDemRgba(rgba) {
  if (!rgba || rgba.length !== 256 * 256 * 4) fail('標高PNGは256×256ピクセルが必要です。')
  const out = new Float64Array(256 * 256)
  for (let i = 0; i < out.length; i++) {
    const p = i * 4, v = rgba[p] * 65536 + rgba[p + 1] * 256 + rgba[p + 2]
    out[i] = v === 8388608 || rgba[p + 3] !== 255 ? NaN : (v < 8388608 ? v : v - 16777216) * .01
  }
  return out
}

export function bilinearTerrainValue(x, y, pixel) {
  const x0 = Math.floor(x), y0 = Math.floor(y), dx = x - x0, dy = y - y0
  const terms = [[x0, y0, (1 - dx) * (1 - dy)], [x0 + 1, y0, dx * (1 - dy)], [x0, y0 + 1, (1 - dx) * dy], [x0 + 1, y0 + 1, dx * dy]]
  let sum = 0
  for (const [px, py, weight] of terms) {
    if (weight < 1e-12) continue
    const value = pixel(px, py)
    if (!finite(value)) return null // Never bridge a missing sample or mix resolutions inside a stencil.
    sum += value * weight
  }
  return sum
}

function quantile(sorted, p) {
  if (!sorted.length) return null
  const i = (sorted.length - 1) * p, low = Math.floor(i), high = Math.ceil(i)
  return sorted[low] + (sorted[high] - sorted[low]) * (i - low)
}

// Clip each contour segment against all polygon rings. Concave outlines,
// disjoint parts and holes split the line instead of connecting across gaps.
function clipSegment(a, b, boundary, edges) {
  const dx = b[0] - a[0], dy = b[1] - a[1], ts = [0, 1]
  if (Math.hypot(dx, dy) < eps) return []
  for (const [c, d] of edges) {
    if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.min(a[0], b[0]) > Math.max(c[0], d[0]) || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.min(a[1], b[1]) > Math.max(c[1], d[1])) continue
    const ex = d[0] - c[0], ey = d[1] - c[1], den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-12) continue
    const cx = c[0] - a[0], cy = c[1] - a[1], t = (cx * ey - cy * ex) / den, u = (cx * dy - cy * dx) / den
    if (t > eps && t < 1 - eps && u >= -eps && u <= 1 + eps) ts.push(t)
  }
  ts.sort((a, b) => a - b)
  const paths = []
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - ts[i - 1] < eps) continue
    const mid = (ts[i] + ts[i - 1]) / 2
    if (pointInTerrainBoundary([a[0] + dx * mid, a[1] + dy * mid], boundary)) paths.push([ts[i - 1], ts[i]].map(t => [a[0] + t * dx, a[1] + t * dy]))
  }
  return paths
}

export function terrainContours(grid) {
  const { width, height, step, xMin, yMin, elevations, boundary } = grid
  const edges = boundary.flatMap(polygon => polygon.flatMap(ring => ring.slice(0, -1).map((p, i) => [p, ring[i + 1]])))
  const levels = new Map()
  let segmentCount = 0
  for (let row = 0; row < height - 1; row++) for (let col = 0; col < width - 1; col++) {
    const i = row * width + col
    const zs = [elevations[i], elevations[i + 1], elevations[i + width + 1], elevations[i + width]]
    if (!zs.every(finite)) continue
    const x = xMin + col * step, y = yMin + row * step
    const corners = [[x, y], [x + step, y], [x + step, y + step], [x, y + step]]
    for (let level = Math.ceil(Math.min(...zs) / 2) * 2; level <= Math.max(...zs); level += 2) {
      if (levels.size > 512) fail('等高線の高低差が大きすぎます。範囲を分けてください。')
      const cuts = []
      for (let e = 0; e < 4; e++) {
        const j = (e + 1) % 4
        if ((zs[e] >= level) === (zs[j] >= level)) continue
        const t = (level - zs[e]) / (zs[j] - zs[e])
        cuts[e] = [corners[e][0] + t * (corners[j][0] - corners[e][0]), corners[e][1] + t * (corners[j][1] - corners[e][1])]
      }
      const found = [0, 1, 2, 3].filter(e => cuts[e])
      let pairs = found.length === 2 ? [[found[0], found[1]]] : []
      if (found.length === 4) {
        // Bilinear asymptotic decider avoids choosing an arbitrary diagonal in saddles.
        const q = (zs[0] - level) * (zs[2] - level) - (zs[1] - level) * (zs[3] - level)
        pairs = q >= 0 ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]]
      }
      for (const [a, b] of pairs) {
        const paths = clipSegment(cuts[a], cuts[b], boundary, edges)
        if (paths.length) {
          if (!levels.has(level)) levels.set(level, [])
          levels.get(level).push(...paths)
          segmentCount += paths.length
          if (segmentCount > TERRAIN_AREA_LIMITS.maxContourSegments) fail('等高線が多すぎます。範囲を分けてください。')
        }
      }
    }
  }
  return [...levels].sort(([a], [b]) => a - b).map(([level, paths]) => ({ level, paths }))
}

function validatedSource(source, sourceIds, plan) {
  if (!source || typeof source !== 'object' || !Array.isArray(source.urls) || source.urls.length > TERRAIN_AREA_LIMITS.maxTiles) fail('標高の取得元が不正です。')
  const corners = [0, plan.grid.width - 1, (plan.grid.height - 1) * plan.grid.width, plan.grid.width * plan.grid.height - 1].map(plan.positionAt)
  const urls = [...new Set(source.urls)].map(url => {
    if (typeof url !== 'string' || url.length > 180) fail('標高URLが不正です。')
    const m = /^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/(dem1a_png|dem5a_png|dem5b_png|dem5c_png|dem_png)\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url)
    if (!m || Number(m[2]) !== layerMap.get(m[1]).zoom) fail('標高URLは公式PNGタイルのみ対応しています。')
    const z = Number(m[2]), x = Number(m[3]), y = Number(m[4]), tiles = corners.map(([lon, lat]) => terrainTilePoint(lon, lat, z).map(v => Math.floor(v / 256)))
    if (x < Math.min(...tiles.map(t => t[0])) - 1 || x > Math.max(...tiles.map(t => t[0])) + 1 || y < Math.min(...tiles.map(t => t[1])) - 1 || y > Math.max(...tiles.map(t => t[1])) + 1) fail('標高タイルが対象範囲と一致しません。')
    return url
  })
  const counts = new Map()
  for (const id of sourceIds) if (id != null) {
    if (!layerMap.has(id)) fail('標高レイヤーが不正です。')
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  if (source.layers != null) {
    if (!Array.isArray(source.layers) || source.layers.length > 5) fail('標高レイヤー一覧が不正です。')
    for (const layer of source.layers) if (!layerMap.has(layer?.id) || (layer.nodeCount != null && layer.nodeCount !== (counts.get(layer.id) || 0))) fail('標高レイヤー件数が格子と一致しません。')
  }
  const layers = TERRAIN_DEM_LAYERS.filter(layer => counts.has(layer.id)).map(layer => ({ ...layer, nodeCount: counts.get(layer.id) }))
  if (layers.some(layer => !urls.some(url => url.includes(`/xyz/${layer.id}/`)))) fail('使用した標高レイヤーの取得URLがありません。')
  const urlSet = new Set(urls)
  for (let i = 0; i < sourceIds.length; i++) if (sourceIds[i] != null) {
    const layer = layerMap.get(sourceIds[i]), [lon, lat] = plan.positionAt(i), [x, y] = terrainTilePoint(lon, lat, layer.zoom)
    const x0 = Math.floor(x), y0 = Math.floor(y)
    for (const [px, py] of [[x0, y0], [x0 + 1, y0], [x0, y0 + 1], [x0 + 1, y0 + 1]]) {
      if (!urlSet.has(`https://cyberjapandata.gsi.go.jp/xyz/${layer.id}/${layer.zoom}/${Math.floor(px / 256)}/${Math.floor(py / 256)}.png`)) fail('標高格子を覆う出典タイルが不足しています。')
    }
  }
  return { name: '国土地理院 標高タイル', docsUrl: 'https://maps.gsi.go.jp/development/ichiran.html#dem', layers, mixed: layers.length > 1, urls, cached: source.cached === true, nodeCountScope: 'including outside-boundary padding', displayGridMeters: 5, slopeWindowMeters: 10, note: '5m格子へ補間。原資料の解像度・測量精度が5mに向上するものではありません。' }
}

export function normalizeTerrainArea(value, expectedGeometry) {
  if (!value || value.version !== TERRAIN_AREA_VERSION) fail('保存形式に対応していません。')
  // Inspect dimensions/arrays before expensive geometry and derived work. Do not
  // stringify large ignored derived payloads, and never allocate from input sizes.
  const raw = value.grid
  if (!raw || !Number.isInteger(raw.width) || !Number.isInteger(raw.height) || raw.width < 5 || raw.height < 5 || raw.width * raw.height > TERRAIN_AREA_LIMITS.maxNodes) fail('格子の寸法が不正です。')
  const n = raw.width * raw.height
  if (!Array.isArray(raw.elevations) || raw.elevations.length !== n || !Array.isArray(raw.sourceIds) || raw.sourceIds.length !== n) fail('格子の値・出典数が寸法と一致しません。')
  const plan = createTerrainPlan(value.geometry)
  if (value.geometryKey !== plan.geometryKey || (expectedGeometry && terrainGeometryKey(expectedGeometry) !== plan.geometryKey)) fail('保存結果と現在の範囲が一致しません。再計算してください。')
  for (const key of ['width', 'height', 'step', 'xMin', 'yMin']) if (raw[key] !== plan.grid[key]) fail('格子の配置が対象範囲と一致しません。')
  if (raw.origin?.lat !== plan.grid.origin.lat || raw.origin?.lon !== plan.grid.origin.lon) fail('投影原点が対象範囲と一致しません。')
  if (raw.inside != null && (!Array.isArray(raw.inside) || raw.inside.length !== n || Array.from(raw.inside).some((v, i) => v !== plan.grid.inside[i]))) fail('範囲内マスクが図形と一致しません。')
  if (typeof value.fetchedAt !== 'string' || value.fetchedAt.length > 40 || !Number.isFinite(Date.parse(value.fetchedAt))) fail('取得日時が不正です。')
  const elevations = Array.from(raw.elevations, (v, i) => {
    if (v === null) { if (raw.sourceIds[i] !== null) fail('欠測値の出典が不正です。'); return null }
    if (!finite(v) || v < -500 || v > 10000 || !layerMap.has(raw.sourceIds[i])) fail('標高値または出典が不正です。')
    return v
  })
  const grid = { ...plan.grid, elevations, sourceIds: [...raw.sourceIds] }
  const source = validatedSource(value.source, grid.sourceIds, plan)
  const slopes = Array(n).fill(null), valid = [], validSlopes = []
  let insideCount = 0, mixedSlopeCount = 0
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / grid.width), col = i % grid.width
    if (row > 0 && row < grid.height - 1 && col > 0 && col < grid.width - 1 && [elevations[i], elevations[i - 1], elevations[i + 1], elevations[i - grid.width], elevations[i + grid.width]].every(finite)) {
      slopes[i] = Math.atan(Math.hypot((elevations[i + 1] - elevations[i - 1]) / 10, (elevations[i + grid.width] - elevations[i - grid.width]) / 10)) * 180 / Math.PI
    }
    if (grid.inside[i]) {
      insideCount++
      if (finite(elevations[i])) valid.push(elevations[i])
      if (finite(slopes[i])) {
        validSlopes.push(slopes[i])
        if (new Set([i, i - 1, i + 1, i - grid.width, i + grid.width].map(j => grid.sourceIds[j])).size > 1) mixedSlopeCount++
      }
    }
  }
  if (!valid.length) fail('範囲内の標高データを取得できませんでした。保存した範囲は変更していません。')
  grid.slopes = slopes
  validSlopes.sort((a, b) => a - b)
  const minElevation = Math.min(...valid), maxElevation = Math.max(...valid)
  const summary = {
    polygonAreaM2: plan.polygonAreaM2, sampledAreaM2: insideCount * 25, validAreaM2: valid.length * 25,
    insideCount, validCount: valid.length, slopeValidCount: validSlopes.length, mixedSlopeCount,
    coveragePercent: valid.length / insideCount * 100, slopeCoveragePercent: validSlopes.length / insideCount * 100,
    minElevation, maxElevation, heightRange: maxElevation - minElevation,
    medianSlope: quantile(validSlopes, .5), p90Slope: quantile(validSlopes, .9), maxSlope: validSlopes.at(-1) ?? null,
    slopeBins: [[0, 10], [10, 20], [20, 30], [30, 90]].map(([min, max]) => ({ min, max, percent: validSlopes.length ? validSlopes.filter(v => v >= min && v < max).length / validSlopes.length * 100 : null })),
  }
  return { version: TERRAIN_AREA_VERSION, geometryKey: plan.geometryKey, geometry: plan.geometry, fetchedAt: new Date(value.fetchedAt).toISOString(), source, grid, summary, contours: terrainContours(grid) }
}

export function terrainAreaSnapshot(value) {
  if (value == null) return null
  const normalized = normalizeTerrainArea(value)
  const { width, height, step, xMin, yMin, origin, elevations, sourceIds } = normalized.grid
  const snapshot = { version: normalized.version, geometryKey: normalized.geometryKey, geometry: normalized.geometry, fetchedAt: normalized.fetchedAt, source: { urls: normalized.source.urls, cached: normalized.source.cached }, grid: { width, height, step, xMin, yMin, origin, elevations, sourceIds } }
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > TERRAIN_AREA_LIMITS.maxBytes) fail('面地形の保存容量が大きすぎます。範囲を小さくしてください。')
  return snapshot
}
