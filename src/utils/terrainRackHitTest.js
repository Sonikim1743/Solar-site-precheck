export const TERRAIN_RACK_HIT_LIMITS = Object.freeze({ racks: 200, edgeTolerancePx: 3 })

const finite = Number.isFinite
const pointOf = value => {
  const point = Array.isArray(value) ? value : [value?.x, value?.y]
  return point.length === 2 && point.every(finite) ? point : null
}
const equal = (a, b) => a[0] === b[0] && a[1] === b[1]
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const EPS = 1e-12
const sign = value => Math.abs(value) <= EPS ? 0 : Math.sign(value)
const onSegment = (p, a, b) => sign(cross(a, b, p)) === 0 &&
  p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS &&
  p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS
const intersects = (a, b, c, d) => {
  const abC = sign(cross(a, b, c)), abD = sign(cross(a, b, d))
  const cdA = sign(cross(c, d, a)), cdB = sign(cross(c, d, b))
  return abC * abD < 0 && cdA * cdB < 0 ||
    abC === 0 && onSegment(c, a, b) || abD === 0 && onSegment(d, a, b) ||
    cdA === 0 && onSegment(a, c, d) || cdB === 0 && onSegment(b, c, d)
}

function quadrilateral(value) {
  if (!Array.isArray(value) || (value.length !== 4 && value.length !== 5)) return null
  if (!value.every(point => Array.isArray(point) && pointOf(point))) return null
  if (value.length === 5 && !equal(value[0], value[4])) return null
  const points = value.slice(0, 4)
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const scale = Math.max(maxX - minX, maxY - minY)
  if (!finite(scale) || scale <= 0) return null
  // Normalization keeps orientation checks stable for either winding, a thin
  // roof and large screen offsets. No caller-owned vertex is changed.
  const unit = points.map(p => [(p[0] - minX) / scale, (p[1] - minY) / scale])
  const firstDifferent = unit.find(p => !equal(p, unit[0]))
  const collinear = unit.every(p => sign(cross(unit[0], firstDifferent, p)) === 0)
  // A real roof can collapse to a line when viewed edge-on. Retain that line
  // for the bounded edge hit; reject crossed or pinched non-degenerate roofs.
  if (!collinear && (intersects(unit[0], unit[1], unit[2], unit[3]) || intersects(unit[1], unit[2], unit[3], unit[0]))) return null
  return { points, minX, minY, maxX, maxY }
}

function distanceToSegment(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy)
  if (!length) return Math.hypot(point[0] - a[0], point[1] - a[1])
  const t = Math.max(0, Math.min(length, (point[0] - a[0]) * (dx / length) + (point[1] - a[1]) * (dy / length)))
  return Math.hypot(point[0] - a[0] - t * dx / length, point[1] - a[1] - t * dy / length)
}

function hits(point, shape, tolerance) {
  if (point[0] < shape.minX - tolerance || point[0] > shape.maxX + tolerance || point[1] < shape.minY - tolerance || point[1] > shape.maxY + tolerance) return false
  let inside = false
  for (let i = 0, j = 3; i < 4; j = i++) {
    const a = shape.points[j], b = shape.points[i]
    if (distanceToSegment(point, a, b) <= tolerance) return true
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < a[0] + (b[0] - a[0]) * ((point[1] - a[1]) / (b[1] - a[1]))) inside = !inside
  }
  return inside
}

// Coordinates and edge tolerance use the same screen units (normally CSS px).
// Inactive racks remain selectable for restoration. Terrain occlusion is the
// renderer's responsibility: pass visible:false or a visibleScreen predicate.
// A projection depth larger than another is nearer the observer. Ties retain
// input order. More than 200 racks fails closed rather than choosing from an
// incomplete pool. This function changes neither rack state nor geometry.
export function hitTestTerrainRack(screenPoint, projectedRacks, options = {}) {
  const point = pointOf(screenPoint)
  if (!point || !Array.isArray(projectedRacks) || projectedRacks.length > TERRAIN_RACK_HIT_LIMITS.racks) return null
  const tolerance = finite(options?.edgeTolerancePx) ? Math.max(0, Math.min(3, options.edgeTolerancePx)) : 3
  const visibleScreen = typeof options?.visibleScreen === 'function' ? options.visibleScreen : null
  let selected = null, nearestDepth = -Infinity
  for (const rack of projectedRacks) {
    if (!rack || rack.visible === false || !finite(rack.depth) || rack.depth <= nearestDepth) continue
    if (!(typeof rack.id === 'string' && rack.id.length > 0) && !(typeof rack.id === 'number' && finite(rack.id))) continue
    const shape = quadrilateral(rack.polygon)
    if (!shape || !hits(point, shape, tolerance)) continue
    if (visibleScreen && visibleScreen(rack, [point[0], point[1]]) !== true) continue
    selected = rack.id
    nearestDepth = rack.depth
  }
  return selected
}
