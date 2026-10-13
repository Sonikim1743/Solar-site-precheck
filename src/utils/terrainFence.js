import polygonClipping from 'polygon-clipping'
import { sampleTerrainElevation } from './terrainParcelOverlay.js'

const EPS = 1e-7
const LIMITS = Object.freeze({ polygons: 200, vertices: 10000, posts: 300, points: 3000, samples: 60000 })

function positive(value, fallback, name) {
  const result = value === undefined ? fallback : value
  if (!Number.isFinite(result) || result <= 0) throw new RangeError(`${name} must be a positive finite number`)
  return result
}

function capacity(value, fallback, name) {
  const result = value === undefined ? fallback : value
  if (!Number.isInteger(result) || result < 0) throw new RangeError(`${name} must be a non-negative integer`)
  return Math.min(result, fallback)
}

function margin(value) {
  const result = value === undefined ? 1 : value
  if (!Number.isFinite(result) || result < 0) throw new RangeError('marginM must be a non-negative finite number')
  return result
}

function validGrid(grid) {
  return grid && Number.isInteger(grid.width) && grid.width >= 2 &&
    Number.isInteger(grid.height) && grid.height >= 2 && grid.width * grid.height <= 45000 &&
    Number.isFinite(grid.step) && grid.step > 0 && Number.isFinite(grid.xMin) && Number.isFinite(grid.yMin) &&
    Number.isFinite(grid.xMin + (grid.width - 1) * grid.step) &&
    Number.isFinite(grid.yMin + (grid.height - 1) * grid.step) &&
    grid.elevations?.length === grid.width * grid.height && Array.isArray(grid.boundary)
}

function samePoint(a, b) {
  return a && b && Math.abs(a[0] - b[0]) <= EPS && Math.abs(a[1] - b[1]) <= EPS &&
    (a.length < 3 || b.length < 3 || Math.abs(a[2] - b[2]) <= EPS)
}

function outerRing(polygon, grid) {
  const input = polygon?.[0]
  if (!Array.isArray(input) || input.length < 3) return null
  const xMax = grid.xMin + (grid.width - 1) * grid.step
  const yMax = grid.yMin + (grid.height - 1) * grid.step
  const ring = []
  for (const point of input) {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
      point[0] < grid.xMin - EPS || point[0] > xMax + EPS || point[1] < grid.yMin - EPS || point[1] > yMax + EPS) return null
    const xy = [Math.max(grid.xMin, Math.min(xMax, point[0])), Math.max(grid.yMin, Math.min(yMax, point[1]))]
    if (!samePoint(ring.at(-1), xy)) ring.push(xy)
  }
  if (ring.length < 3) return null
  if (!samePoint(ring[0], ring.at(-1))) ring.push([...ring[0]])
  if (ring.length < 4) return null
  const [ox, oy] = ring[0]
  let twiceArea = 0
  for (let i = 1; i < ring.length; i++) {
    twiceArea += (ring[i - 1][0] - ox) * (ring[i][1] - oy) - (ring[i][0] - ox) * (ring[i - 1][1] - oy)
  }
  return Number.isFinite(twiceArea) && Math.abs(twiceArea) > EPS ? ring : null
}

function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .filter((point, index, array) => !index || !samePoint(point, array[index - 1]))
  if (sorted.length < 3) return null
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const half = input => {
    const result = []
    for (const point of input) {
      while (result.length >= 2 && cross(result.at(-2), result.at(-1), point) <= EPS) result.pop()
      result.push(point)
    }
    return result.slice(0, -1)
  }
  const hull = [...half(sorted), ...half([...sorted].reverse())]
  return hull.length >= 3 ? hull : null
}

// Offset the actual counter-clockwise hull edges outward by a metre distance.
// Adjacent offset lines meet at a miter; rotated layouts retain their bearing,
// instead of acquiring a larger, unrelated north/east bounding rectangle.
function offsetHull(hull, marginM) {
  const normals = hull.map((point, index) => {
    const next = hull[(index + 1) % hull.length], dx = next[0] - point[0], dy = next[1] - point[1], length = Math.hypot(dx, dy)
    return [dy / length, -dx / length]
  })
  const result = hull.map((point, index) => {
    const before = normals[(index + hull.length - 1) % hull.length], after = normals[index]
    const denominator = 1 + before[0] * after[0] + before[1] * after[1]
    if (!(denominator > 1e-12)) return null
    return point.map((value, axis) => value + marginM * (before[axis] + after[axis]) / denominator)
  })
  if (!result.every(point => point?.every(Number.isFinite))) return null
  return [...result, [...result[0]]]
}

function rackEnclosure(grid, racks, marginM, result) {
  if (!Array.isArray(racks) || !racks.length) return []
  let vertices = 0
  const points = []
  for (const rack of racks) {
    const input = rack?.footprint
    if (!Array.isArray(input)) return []
    vertices += input.length
    if (vertices > LIMITS.vertices) { result.truncated = true; return [] }
    const ring = outerRing([input], grid)
    if (!ring) return []
    points.push(...ring.slice(0, -1))
  }
  const hull = convexHull(points), buffered = hull && offsetHull(hull, marginM)
  if (!buffered) return []
  // Validate every effective ring, including exclusions, before clipping. A
  // malformed hole must never silently become usable land.
  if (grid.boundary.length > LIMITS.polygons) { result.truncated = true; return [] }
  vertices = 0
  const boundary = []
  for (const polygon of grid.boundary) {
    if (!Array.isArray(polygon) || !polygon.length) continue
    const rings = []
    for (const input of polygon) {
      if (!Array.isArray(input)) { rings.length = 0; break }
      vertices += input.length
      if (vertices > LIMITS.vertices) { result.truncated = true; return [] }
      const ring = outerRing([input], grid)
      if (!ring) { rings.length = 0; break }
      rings.push(ring)
    }
    if (rings.length) boundary.push(rings)
  }
  if (!boundary.length) return []
  try { return polygonClipping.intersection([buffered], boundary) } catch { return [] }
}

// Crossing every grid line prevents a rail from jumping over a missing cell,
// including a short corner crossing that uniform samples alone could miss.
function segmentFractions(a, b, grid, spacing, budget) {
  const divisions = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / spacing))
  if (!Number.isFinite(divisions) || divisions + 1 > budget) return null
  const values = Array.from({ length: divisions + 1 }, (_, i) => i / divisions)
  for (let axis = 0; axis < 2; axis++) {
    const delta = b[axis] - a[axis], origin = axis ? grid.yMin : grid.xMin
    if (Math.abs(delta) < EPS) continue
    const first = Math.floor((Math.min(a[axis], b[axis]) - origin) / grid.step) + 1
    const last = Math.ceil((Math.max(a[axis], b[axis]) - origin) / grid.step) - 1
    for (let index = first; index <= last; index++) {
      if (values.length >= budget) return null
      const t = (origin + index * grid.step - a[axis]) / delta
      if (t > EPS && t < 1 - EPS) values.push(t)
    }
  }
  return [...new Set(values)].sort((a, b) => a - b)
}

/** One reference enclosure around all ACTIVE rack footprints, in local metres.
 * The buffered convex hull is clipped to effective land; internal holes do not
 * receive extra fences. No active racks means no fence. DEM heights stay real.
 */
export function buildTerrainFence(analysis, options = {}) {
  const heightM = positive(options.heightM, 1.2, 'heightM')
  const marginM = margin(options.marginM)
  const spacing = Math.min(positive(options.postSpacingM, 10, 'postSpacingM'), 10)
  const maxPosts = capacity(options.maxPosts, LIMITS.posts, 'maxPosts')
  const maxPoints = capacity(options.maxPoints, LIMITS.points, 'maxPoints')
  const result = { posts: [], rails: [], truncated: false, heightM }
  const grid = analysis?.grid
  if (!validGrid(grid)) return result
  const enclosure = rackEnclosure(grid, options.racks, marginM, result)
  let vertexCount = 0, pointCount = 0, samples = 0, stopRails = false, stopPosts = false
  result.truncated ||= enclosure.length > LIMITS.polygons
  for (let polygonIndex = 0; polygonIndex < Math.min(enclosure.length, LIMITS.polygons); polygonIndex++) {
    const polygon = enclosure[polygonIndex], rawRing = polygon?.[0]
    if (!Array.isArray(rawRing)) continue
    vertexCount += rawRing.length
    if (vertexCount > LIMITS.vertices) { result.truncated = true; break }
    const ring = outerRing(polygon, grid)
    if (!ring) continue
    for (let edge = 1; edge < ring.length && !stopPosts; edge++) {
      const a = ring[edge - 1], b = ring[edge]
      const divisions = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / spacing))
      if (!Number.isFinite(divisions) || divisions > LIMITS.samples - samples) {
        result.truncated = true; stopPosts = true; break
      }
      // The next edge owns its start vertex, so the closing point is not a
      // duplicate post. Every intervening interval remains at most 10 metres.
      for (let j = 0; j < divisions; j++) {
        if (result.posts.length >= maxPosts) { result.truncated = true; stopPosts = true; break }
        samples++
        const t = j / divisions, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t
        const z = sampleTerrainElevation(grid, x, y)
        if (!Number.isFinite(z) || !Number.isFinite(z + heightM)) continue
        result.posts.push({ id: `fence-${polygonIndex}:post-${edge}-${j}`, base: [x, y, z], top: [x, y, z + heightM] })
      }
    }
    if (stopRails) continue
    let current = [], railIndex = 0
    const flush = () => {
      if (current.length >= 2) result.rails.push({ id: `fence-${polygonIndex}:rail-${railIndex++}`, points: current })
      current = []
    }
    for (let edge = 1; edge < ring.length && !stopRails; edge++) {
      const a = ring[edge - 1], b = ring[edge]
      const ts = segmentFractions(a, b, grid, Math.min(grid.step, spacing), Math.floor((LIMITS.samples - samples) / 3))
      if (!ts) { result.truncated = true; stopRails = true; break }
      const point = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      for (let j = 1; j < ts.length; j++) {
        const start = point(ts[j - 1]), end = point(ts[j]), mid = point((ts[j - 1] + ts[j]) / 2)
        samples += 3
        const z1 = sampleTerrainElevation(grid, ...start), z2 = sampleTerrainElevation(grid, ...end)
        const zm = sampleTerrainElevation(grid, ...mid)
        if (![z1, z2, zm, z1 + heightM, z2 + heightM].every(Number.isFinite)) { flush(); continue }
        const topStart = [...start, z1 + heightM], topEnd = [...end, z2 + heightM]
        if (current.length && !samePoint(current.at(-1), topStart)) flush()
        const needed = current.length ? 1 : 2
        if (pointCount + needed > maxPoints) { result.truncated = true; stopRails = true; break }
        if (!current.length) current.push(topStart)
        current.push(topEnd)
        pointCount += needed
      }
    }
    flush()
  }
  return result
}
