const EPS = 1e-7
function insideRing([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i]
    const cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0])
    if (Math.abs(cross) < EPS && x >= Math.min(a[0], b[0]) - EPS && x <= Math.max(a[0], b[0]) + EPS && y >= Math.min(a[1], b[1]) - EPS && y <= Math.max(a[1], b[1]) + EPS) return true
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}
const insidePolygon = (point, rings) => insideRing(point, rings[0]) && !rings.slice(1).some(ring => insideRing(point, ring))

// Screen-space bins bound the per-label/per-line search. This is a display
// occlusion approximation for the existing orthographic polygon renderer,
// never a change to the DEM or parcel geometry.
export function createTerrainOverlayVisibility(faces, projection, { requireSurface = true } = {}) {
  const bins = new Map(), size = 40
  for (const face of faces) {
    if (!face.visible || !face.rings?.[0]?.length) continue
    const rings = face.rings.map(ring => ring.map(projection.project))
    const points = rings.flat()
    const xs = points.map(p => p[0]), ys = points.map(p => p[1])
    const left = Math.max(0, Math.floor(Math.min(...xs) / size)), right = Math.min(20, Math.floor(Math.max(...xs) / size))
    const top = Math.max(0, Math.floor(Math.min(...ys) / size)), bottom = Math.min(13, Math.floor(Math.max(...ys) / size))
    const transformed = face.rings[0].map(projection.transform)
    let plane = null
    const a = transformed[0]
    for (let i = 1; i + 1 < transformed.length; i++) {
      const b = transformed[i], c = transformed[i + 1]
      const denominator = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])
      if (Math.abs(denominator) < EPS) continue
      const du = ((b[2] - a[2]) * (c[1] - a[1]) - (c[2] - a[2]) * (b[1] - a[1])) / denominator
      const dv = ((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / denominator
      plane = { a, du, dv }; break
    }
    if (!plane) continue
    const entry = { face, rings, plane }
    for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) {
      const key = `${x}:${y}`
      if (!bins.has(key)) bins.set(key, [])
      bins.get(key).push(entry)
    }
  }
  return point => {
    const screen = projection.project(point)
    if (screen[0] < 25 || screen[0] > 775 || screen[1] < 35 || screen[1] > 430) return false
    const transformed = projection.transform(point)
    const nearby = bins.get(`${Math.floor(screen[0] / size)}:${Math.floor(screen[1] / size)}`) || []
    let ownSurface = false
    for (const { face, rings, plane } of nearby) {
      // Bilinear DEM points need not lie exactly on a polygon's display plane.
      // Do not let their own surface falsely cover its label or boundary line.
      if (face.kind === 'surface' && insidePolygon(point, face.rings)) { ownSurface = true; continue }
      if (!insidePolygon(screen, rings)) continue
      const depth = plane.a[2] + plane.du * (transformed[0] - plane.a[0]) + plane.dv * (transformed[1] - plane.a[1])
      if (depth > transformed[2] + .15) return false
    }
    // Elevated rigid objects can project into a different screen bin from
    // their supporting ground. Their caller separately verifies DEM/boundary
    // support, while this mask still rejects any intervening terrain or wall.
    return !requireSurface || ownSurface
  }
}

export function visibleTerrainLineParts(points, visible) {
  const parts = []; let current = []
  for (const point of points) {
    if (visible(point)) current.push(point)
    else { if (current.length > 1) parts.push(current); current = [] }
  }
  if (current.length > 1) parts.push(current)
  return parts
}
