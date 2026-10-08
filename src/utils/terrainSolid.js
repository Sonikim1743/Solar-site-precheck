const finite = Number.isFinite
const fail = message => { throw new Error(`Terrain solid: ${message}`) }

function planarCentroid(rings, base) {
  let area = 0, x = 0, y = 0
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]
    // Translate before the shoelace sums to avoid cancellation at large offsets.
    const [ox, oy] = ring[0]
    let crossSum = 0, cx = 0, cy = 0
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      const ax = a[0] - ox, ay = a[1] - oy, bx = b[0] - ox, by = b[1] - oy
      const cross = ax * by - bx * ay
      crossSum += cross; cx += (ax + bx) * cross; cy += (ay + by) * cross
    }
    if (!crossSum) continue
    const weight = Math.abs(crossSum) * (r === 0 ? 1 : -1)
    area += weight
    x += (ox + cx / (3 * crossSum)) * weight
    y += (oy + cy / (3 * crossSum)) * weight
  }
  if (area > 0) return [x / area, y / area, base]
  return [rings[0].reduce((sum, p) => sum + p[0], 0) / rings[0].length,
    rings[0].reduce((sum, p) => sum + p[1], 0) / rings[0].length, base]
}

const closed = ring => [...ring.map(p => [...p]), [...ring[0]]]
const edgeKey = (a, b) => a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`

/**
 * Extrude a non-overlapping clipped terrain mesh down to a display-only base.
 * The input contains one polygon per face (outer ring, then any holes).
 * XY topology is matched within epsilon metres; elevations are never rounded.
 * No faces are added over holes or cells omitted because of missing DEM values.
 * Returns closed rings in the renderer's existing face/centroid/color format.
 */
export function buildTerrainSolid(topFaces, base, { epsilon = 1e-6 } = {}) {
  if (!Array.isArray(topFaces) || topFaces.length > 100_000 || !finite(base)) fail('invalid faces or base')
  if (!finite(epsilon) || epsilon <= 0 || epsilon > .001) fail('invalid topology tolerance')
  if (!topFaces.length) return { walls: [], floorFaces: [] }

  const vertices = [], fineBuckets = new Map(), edges = new Map(), floorFaces = []
  let rawPointCount = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  // Neighbour buckets avoid a rounding-boundary crack when nearly equal points
  // happen to fall on opposite sides of a quantization bin.
  function vertex(x, y) {
    const qx = Math.floor(x / epsilon), qy = Math.floor(y / epsilon)
    if (!Number.isSafeInteger(qx) || !Number.isSafeInteger(qy)) fail('coordinates exceed topology precision')
    let match
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const point of fineBuckets.get(`${qx + dx},${qy + dy}`) || []) {
        if (Math.hypot(point.x - x, point.y - y) <= epsilon && (!match || point.id < match.id)) match = point
      }
    }
    if (match) return match
    const point = { id: vertices.length, x, y }
    vertices.push(point)
    const key = `${qx},${qy}`, bucket = fineBuckets.get(key) || []
    bucket.push(point); fineBuckets.set(key, bucket)
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    return point
  }

  for (const face of topFaces) {
    if (!face || !Array.isArray(face.rings) || !face.rings.length) fail('invalid face rings')
    const rings = []
    for (const inputRing of face.rings) {
      if (!Array.isArray(inputRing)) fail('invalid ring')
      const ring = []
      for (const p of inputRing) {
        if (++rawPointCount > 1_000_000) fail('mesh is too large')
        if (!Array.isArray(p) || p.length < 3 || !p.slice(0, 3).every(finite)) fail('non-finite vertex')
        if (p[2] < base - epsilon) fail('base must not be above the top surface')
        const v = vertex(p[0], p[1])
        if (ring.at(-1)?.v.id !== v.id) ring.push({ v, z: p[2] })
      }
      if (ring.length > 1 && ring[0].v.id === ring.at(-1).v.id) ring.pop()
      if (ring.length < 3) {
        if (!rings.length) break
        continue
      }
      const origin = ring[0].v
      const twiceArea = ring.reduce((sum, p, i) => {
        const q = ring[(i + 1) % ring.length].v
        return sum + (p.v.x - origin.x) * (q.y - origin.y) - (q.x - origin.x) * (p.v.y - origin.y)
      }, 0)
      if (Math.abs(twiceArea) <= epsilon * epsilon) {
        if (!rings.length) break
        continue
      }
      // Material lies to the left of each edge: outer CCW, holes CW.
      // Its right-hand normal therefore faces outward, including into a hole.
      if ((twiceArea > 0) !== (rings.length === 0)) ring.reverse()
      rings.push(ring)
    }
    if (!rings.length) continue
    const floorRings = rings.map(ring => ring.map(({ v }) => [v.x, v.y, base]))
    floorFaces.push({ rings: floorRings.map(ring => closed([...ring].reverse())), centroid: planarCentroid(floorRings, base), color: face.color, kind: 'floor', normal: [0, 0, -1] })
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], key = edgeKey(a.v, b.v)
      const existing = edges.get(key)
      if (existing) existing.count++
      else edges.set(key, { a: a.v, b: b.v, za: a.z, zb: b.z, color: face.color, count: 1 })
    }
  }
  if (!floorFaces.length) return { walls: [], floorFaces }

  // Exact shared edges are overwhelmingly common in a regular cell mesh.
  // Only unmatched edges need the more expensive T-junction splitting pass.
  const openEdges = [...edges.values()].filter(edge => edge.count === 1)
  const span = Math.max(maxX - minX, maxY - minY)
  const cellSize = Math.max(epsilon * 4, span / Math.max(1, Math.sqrt(vertices.length)))
  const buckets = new Map()
  const cellKey = (x, y) => `${x},${y}`
  for (const point of vertices) {
    const key = cellKey(Math.floor((point.x - minX) / cellSize), Math.floor((point.y - minY) / cellSize))
    const bucket = buckets.get(key) || []
    bucket.push(point); buckets.set(key, bucket)
  }
  const subEdges = new Map()
  for (const edge of openEdges) {
    const { a, b } = edge, dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy)
    const cuts = [{ t: 0, v: a }, { t: 1, v: b }], visited = new Set()
    // Walk cells along the line rather than searching its full bounding box.
    // A neighbour halo includes points within epsilon of bin boundaries.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / cellSize))
    for (let i = 0; i <= steps; i++) {
      const cx = Math.floor((a.x + dx * i / steps - minX) / cellSize)
      const cy = Math.floor((a.y + dy * i / steps - minY) / cellSize)
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const key = cellKey(ix, iy)
        if (visited.has(key)) continue
        visited.add(key)
        for (const v of buckets.get(key) || []) {
          if (v.id === a.id || v.id === b.id) continue
          const vx = v.x - a.x, vy = v.y - a.y
          const t = (vx * dx + vy * dy) / (length * length)
          if (t > 0 && t < 1 && Math.abs(vx * dy - vy * dx) / length <= epsilon) cuts.push({ t, v })
        }
      }
    }
    cuts.sort((p, q) => p.t - q.t)
    for (let i = 1; i < cuts.length; i++) {
      const p = cuts[i - 1], q = cuts[i]
      if (p.v.id === q.v.id || Math.hypot(q.v.x - p.v.x, q.v.y - p.v.y) <= epsilon) continue
      const key = edgeKey(p.v, q.v), existing = subEdges.get(key)
      if (existing) existing.count++
      else subEdges.set(key, { a: p.v, b: q.v, za: edge.za + (edge.zb - edge.za) * p.t,
        zb: edge.za + (edge.zb - edge.za) * q.t, color: edge.color, count: 1 })
    }
  }

  const walls = []
  for (const edge of subEdges.values()) {
    if (edge.count !== 1) continue
    const { a, b, za, zb, color } = edge, ha = Math.max(0, za - base), hb = Math.max(0, zb - base)
    if (ha + hb <= epsilon) continue
    const t = (ha + 2 * hb) / (3 * (ha + hb))
    const ring = [[b.x, b.y, zb], [a.x, a.y, za], [a.x, a.y, base], [b.x, b.y, base]]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const normal = [(b.y - a.y) / length, -(b.x - a.x) / length, 0]
    // Area centroid of a vertical trapezoid, including triangular end walls.
    const centroid = [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t,
      base + (ha * ha + ha * hb + hb * hb) / (3 * (ha + hb))]
    walls.push({ rings: [closed(ring)], centroid, color, kind: 'wall', normal })
  }
  return { walls, floorFaces }
}
