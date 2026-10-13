import polygonClipping from 'polygon-clipping'
import { geometryPolygons, validatePolygonGeometry } from '../services/parcelGeometry.js'
import { pointInTerrainBoundary, terrainPointToLocal } from './terrainArea.js'

export const TERRAIN_PARCEL_OVERLAY_LIMITS = Object.freeze({
  inputs: 1000, parcels: 200, vertices: 20000, paths: 800, points: 30000, labels: 30,
})
const finite = Number.isFinite
const EPS = 1e-7
const LINE_LIFT = .15
const LABEL_LIFT = .3

function validGrid(grid) {
  return grid && Number.isInteger(grid.width) && grid.width >= 2 &&
    Number.isInteger(grid.height) && grid.height >= 2 && grid.width * grid.height <= 45000 &&
    finite(grid.step) && grid.step > 0 && finite(grid.xMin) && finite(grid.yMin) &&
    grid.elevations?.length === grid.width * grid.height
}

// Use the same four-corner validity rule as the rendered DEM surface. An
// isolated valid node must not produce a label over a missing surface cell.
export function sampleTerrainElevation(grid, x, y) {
  if (!validGrid(grid) || !finite(x) || !finite(y)) return null
  const col = (x - grid.xMin) / grid.step, row = (y - grid.yMin) / grid.step
  if (col < 0 || row < 0 || col > grid.width - 1 || row > grid.height - 1) return null
  const left = Math.min(Math.floor(col), grid.width - 2)
  const bottom = Math.min(Math.floor(row), grid.height - 2)
  const i = bottom * grid.width + left
  const values = [grid.elevations[i], grid.elevations[i + 1], grid.elevations[i + grid.width], grid.elevations[i + grid.width + 1]]
  if (!values.every(finite)) return null
  const u = col - left, v = row - bottom
  return values[0] * (1 - u) * (1 - v) + values[1] * u * (1 - v) + values[2] * (1 - u) * v + values[3] * u * v
}

function actualNumber(entry) {
  for (const raw of [entry?.info?.number, entry?.properties?.number, entry?.properties?.['地番']]) {
    const number = typeof raw === 'string' ? raw.trim() : finite(raw) ? String(raw) : ''
    if (number && number.length <= 100 && !/[\u0000-\u001f]/.test(number) &&
      !/^(?:筆(?:\s|$)|地番未記載|地番なし|別図|地区外|調査外|区域外)/.test(number)) return number
  }
  return ''
}

function isPublic(entry) {
  return entry?.source?.kind === 'public' || entry?.role === 'public' || entry?.properties?.sourceLabel === '公開地番参考'
}

function polygonArea(polygon) {
  const ringArea = ring => {
    const [ox, oy] = ring[0]
    let sum = 0
    for (let i = 1; i < ring.length; i++) sum += (ring[i - 1][0] - ox) * (ring[i][1] - oy) - (ring[i][0] - ox) * (ring[i - 1][1] - oy)
    return Math.abs(sum) / 2
  }
  return Math.max(0, ringArea(polygon[0]) - polygon.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0))
}
const area = polygons => polygons.reduce((sum, polygon) => sum + polygonArea(polygon), 0)

function rawVertexCount(geometry, remaining) {
  if (!['Polygon', 'MultiPolygon'].includes(geometry?.type) || !Array.isArray(geometry.coordinates)) return 0
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  let count = 0
  for (const polygon of polygons) {
    if (!Array.isArray(polygon)) return 0
    for (const ring of polygon) {
      if (!Array.isArray(ring)) return 0
      count += ring.length
      if (count > remaining) return count
    }
  }
  return count
}

function duplicateParcel(clipped, number, publicData, fingerprint, previous) {
  if (previous.fingerprint === fingerprint) return true
  if (!number || number !== previous.number || !publicData || previous.publicData) return false
  try {
    return area(polygonClipping.intersection(clipped, previous.clipped)) / Math.max(area(clipped), previous.area) > .9
  } catch { return false }
}

// featureInteriorPoint validates Japan WGS84 coordinates, so it cannot accept
// these metre coordinates. Scanline midpoints retain its hole/concavity rule.
function anchorCandidates(polygons) {
  const candidates = []
  for (const polygon of [...polygons].sort((a, b) => polygonArea(b) - polygonArea(a))) {
    const levels = [...new Set(polygon.flatMap(ring => ring.map(p => p[1])))].sort((a, b) => a - b)
    for (let row = 1; row < levels.length; row++) {
      const y = (levels[row - 1] + levels[row]) / 2, cuts = []
      for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i]
        if ((a[1] > y) !== (b[1] > y)) cuts.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
      }
      cuts.sort((a, b) => a - b)
      for (let i = 1; i < cuts.length; i += 2) {
        if (cuts[i] - cuts[i - 1] > EPS) candidates.push({ point: [(cuts[i - 1] + cuts[i]) / 2, y], width: cuts[i] - cuts[i - 1] })
      }
    }
  }
  return candidates.sort((a, b) => b.width - a.width).slice(0, 64).map(candidate => candidate.point)
}

// Include every crossed grid line: even a short visit to a missing cell splits
// the path. Uniform sampling alone could jump across a cell corner.
function segmentFractions(a, b, grid) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const divisions = Math.max(1, Math.ceil(length / grid.step))
  const values = Array.from({ length: divisions + 1 }, (_, i) => i / divisions)
  for (let axis = 0; axis < 2; axis++) {
    const delta = b[axis] - a[axis], origin = axis ? grid.yMin : grid.xMin
    if (Math.abs(delta) < EPS) continue
    const low = Math.floor((Math.min(a[axis], b[axis]) - origin) / grid.step) + 1
    const high = Math.ceil((Math.max(a[axis], b[axis]) - origin) / grid.step) - 1
    for (let index = low; index <= high; index++) {
      const t = (origin + index * grid.step - a[axis]) / delta
      if (t > EPS && t < 1 - EPS) values.push(t)
    }
  }
  return [...new Set(values)].sort((a, b) => a - b)
}

export function buildTerrainParcelOverlay(analysis, parcels) {
  const result = { boundaries: [], labels: [], truncated: false }
  const grid = analysis?.grid
  if (!validGrid(grid) || !grid.origin || !Array.isArray(grid.boundary) || !grid.boundary.length || !Array.isArray(parcels)) return result
  const limits = TERRAIN_PARCEL_OVERLAY_LIMITS
  const entries = parcels.slice(0, limits.inputs).map((entry, index) => ({ entry, index }))
    .sort((a, b) => Number(isPublic(a.entry)) - Number(isPublic(b.entry)))
  result.truncated = parcels.length > limits.inputs
  let vertexCount = 0, pointCount = 0
  const accepted = []
  for (const { entry, index } of entries) {
    if (accepted.length >= limits.parcels) { result.truncated = true; break }
    const count = rawVertexCount(entry?.geometry, limits.vertices - vertexCount)
    if (vertexCount + count > limits.vertices) { result.truncated = true; break }
    if (!count) continue
    vertexCount += count
    let clipped
    try {
      const geometry = validatePolygonGeometry(entry?.geometry)
      const polygons = geometryPolygons(geometry)
      const local = polygons.map(polygon => polygon.map(ring => ring.map(([lon, lat]) => terrainPointToLocal({ lon, lat }, grid.origin))))
      clipped = polygonClipping.intersection(local, grid.boundary)
      if (!clipped.length || area(clipped) < EPS) continue
    } catch { continue }
    const number = actualNumber(entry), publicData = isPublic(entry)
    const fingerprint = JSON.stringify(clipped)
    if (accepted.some(item => duplicateParcel(clipped, number, publicData, fingerprint, item))) continue
    const parcelId = typeof entry.id === 'string' || finite(entry.id) ? String(entry.id) : `parcel-${index}`
    const metadata = { parcelId, number, role: entry.role || (publicData ? 'public' : 'reference'), source: entry.source || null }
    accepted.push({ number, publicData, fingerprint, clipped, area: area(clipped) })
    let pathIndex = 0
    for (const polygon of clipped) for (const ring of polygon) {
      let current = []
      const flush = () => {
        if (current.length >= 2 && result.boundaries.length < limits.paths) result.boundaries.push({ ...metadata, id: `${parcelId}:${index}:boundary-${pathIndex++}`, points: current })
        else if (current.length >= 2) result.truncated = true
        current = []
      }
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i], ts = segmentFractions(a, b, grid)
        for (let j = 1; j < ts.length; j++) {
          const p = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
          const start = p(ts[j - 1]), end = p(ts[j]), mid = p((ts[j - 1] + ts[j]) / 2)
          const z1 = sampleTerrainElevation(grid, ...start), z2 = sampleTerrainElevation(grid, ...end)
          if (![z1, z2, sampleTerrainElevation(grid, ...mid)].every(finite)) { flush(); continue }
          if (pointCount + 2 > limits.points) { result.truncated = true; flush(); break }
          if (!current.length) { current.push([...start, z1 + LINE_LIFT]); pointCount++ }
          current.push([...end, z2 + LINE_LIFT]); pointCount++
        }
        if (pointCount >= limits.points - 1) break
      }
      flush()
    }
    if (number) {
      const anchor = anchorCandidates(clipped).find(point => pointInTerrainBoundary(point, clipped) && finite(sampleTerrainElevation(grid, ...point)))
      if (anchor) {
        if (result.labels.length < limits.labels) result.labels.push({ ...metadata, id: `${parcelId}:${index}:label`, point: [...anchor, sampleTerrainElevation(grid, ...anchor) + LABEL_LIFT] })
        else result.truncated = true
      }
    }
    if (pointCount >= limits.points - 1 || result.boundaries.length >= limits.paths) { result.truncated = true; break }
  }
  return result
}
