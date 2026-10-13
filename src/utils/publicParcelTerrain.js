import { geometryBounds, geometryVertexCount, validatePolygonGeometry } from '../services/parcelGeometry.js'
import { PUBLIC_PARCEL_SOURCE, isPublicParcelFeature, publicParcelNumber } from './publicParcelLayer.js'

// This is a bounded, display-only snapshot of rendered MVT fragments. It is not
// a cadastral import, a complete parcel boundary, or input to area calculation.
export const PUBLIC_PARCEL_TERRAIN_LIMITS = Object.freeze({ tiles: 32, inspectedFeatures: 600, inspectedVertices: 24000, features: 80, featureVertices: 1000, vertices: 8000, rings: 64 })
export const PUBLIC_PARCEL_TERRAIN_SOURCE = Object.freeze({
  kind: 'public', label: '公開地番参考', year: PUBLIC_PARCEL_SOURCE.year,
  url: PUBLIC_PARCEL_SOURCE.url, pageUrl: PUBLIC_PARCEL_SOURCE.pageUrl,
  geometryScope: 'viewport-tile-fragments',
})

const validBounds = bounds => bounds && ['west', 'south', 'east', 'north'].every(key => Number.isFinite(bounds[key])) && bounds.west < bounds.east && bounds.south < bounds.north
const intersects = (a, b) => a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south
const tileKey = tile => `${tile?.dataTile?.z}/${tile?.dataTile?.x}/${tile?.dataTile?.y}`

// Protomaps 5.1 PreparedTile uses CSS pixels, not an assumed MVT extent:
// globalPixel = geom * scale + origin, at PreparedTile.z (view.ts transformGeom).
export function publicParcelTilePoint(tile, point) {
  if (!Number.isInteger(tile?.z) || tile.z < 0 || tile.z > 24 ||
      !Number.isFinite(tile?.scale) || tile.scale <= 0 ||
      !Number.isFinite(tile?.origin?.x) || !Number.isFinite(tile?.origin?.y) ||
      !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null
  const world = 256 * 2 ** tile.z
  const x = (point.x * tile.scale + tile.origin.x) / world
  const y = (point.y * tile.scale + tile.origin.y) / world
  const lon = x * 360 - 180
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI
  return Number.isFinite(lon) && Number.isFinite(lat) && lon >= 120 && lon <= 155 && lat >= 20 && lat <= 50 ? [lon, lat] : null
}

function signedRingArea(ring) {
  let area = 0
  for (let i = 1; i < ring.length - 1; i++) area += (ring[i].x - ring[0].x) * (ring[i + 1].y - ring[0].y) - (ring[i + 1].x - ring[0].x) * (ring[i].y - ring[0].y)
  return area
}

export function publicParcelTileGeometry(tile, feature) {
  if (!isPublicParcelFeature(feature) || !Array.isArray(feature.geom) || !feature.geom.length || feature.geom.length > PUBLIC_PARCEL_TERRAIN_LIMITS.rings) return null
  let count = 0
  let outerSign = null
  const polygons = []
  // MVT polygon rings are ordered exterior then its oppositely wound holes;
  // subsequent exterior rings begin new polygons (vector-tile classifyRings).
  for (const ring of feature.geom) {
    if (!Array.isArray(ring) || ring.length < 4) return null
    count += ring.length
    if (count > PUBLIC_PARCEL_TERRAIN_LIMITS.featureVertices) return null
    const coordinates = ring.map(point => publicParcelTilePoint(tile, point))
    if (coordinates.some(point => !point)) return null
    const sign = Math.sign(signedRingArea(ring))
    if (!sign) return null
    if (outerSign === null) outerSign = sign
    if (sign === outerSign) polygons.push([coordinates])
    else polygons.at(-1).push(coordinates)
  }
  try {
    return validatePolygonGeometry(polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons })
  } catch { return null }
}

function canonicalRing(ring) {
  const values = ring.slice(0, -1).map(point => point.map(value => value.toFixed(9)).join(','))
  const minimum = values.reduce((index, value, i) => value < values[index] ? i : index, 0)
  const forward = values.map((_, i) => values[(minimum + i) % values.length]).join(';')
  const reverse = values.map((_, i) => values[(minimum - i + values.length) % values.length]).join(';')
  return forward < reverse ? forward : reverse
}

function geometryIdentity(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.map(polygon => `${canonicalRing(polygon[0])}|${polygon.slice(1).map(canonicalRing).sort().join('|')}`).sort().join('||')
}

export function publicParcelViewportKey(bounds, zoom, contextKey = '') {
  if (!validBounds(bounds) || !Number.isFinite(zoom)) return ''
  return `${contextKey}|${zoom}|${['west', 'south', 'east', 'north'].map(key => bounds[key].toFixed(8)).join(',')}`
}

export function buildPublicParcelTerrainSnapshot(tiles, { bounds, viewportKey = '', incomplete = false, fetchedAt = new Date().toISOString() } = {}) {
  const snapshot = { features: [], status: 'empty', truncated: false, source: PUBLIC_PARCEL_TERRAIN_SOURCE, viewportKey, fetchedAt, skippedFeatures: 0 }
  if (!validBounds(bounds) || !Array.isArray(tiles)) return { ...snapshot, status: 'unavailable' }
  const rawTiles = new Set(), duplicates = new Set()
  let inspected = 0, inspectedVertices = 0, vertices = 0
  for (const tile of tiles) {
    const coords = tile?.dataTile
    if (!coords || !['x', 'y', 'z'].every(key => Number.isInteger(coords[key]) && coords[key] >= 0) || coords.z > 24 || coords.x >= 2 ** coords.z || coords.y >= 2 ** coords.z || !(tile.data instanceof Map)) { snapshot.skippedFeatures++; continue }
    const key = tileKey(tile)
    if (rawTiles.has(key)) continue // overzoom can reuse one raw tile many times
    if (rawTiles.size >= PUBLIC_PARCEL_TERRAIN_LIMITS.tiles) { snapshot.truncated = true; break }
    rawTiles.add(key)
    const features = tile.data.get(PUBLIC_PARCEL_SOURCE.dataLayer)
    if (!Array.isArray(features)) continue
    for (let index = 0; index < features.length; index++) {
      if (++inspected > PUBLIC_PARCEL_TERRAIN_LIMITS.inspectedFeatures) { snapshot.truncated = true; break }
      const feature = features[index]
      if (!isPublicParcelFeature(feature)) continue
      inspectedVertices += Array.isArray(feature.geom) ? feature.geom.reduce((count, ring) => count + (Array.isArray(ring) ? ring.length : 0), 0) : 0
      if (inspectedVertices > PUBLIC_PARCEL_TERRAIN_LIMITS.inspectedVertices) { snapshot.truncated = true; break }
      const geometry = publicParcelTileGeometry(tile, feature)
      if (!geometry) { snapshot.skippedFeatures++; continue }
      if (!intersects(bounds, geometryBounds([geometry]))) continue
      const number = publicParcelNumber(feature)
      const identity = `${number}|${geometryIdentity(geometry)}`
      if (duplicates.has(identity)) continue
      duplicates.add(identity)
      const count = geometryVertexCount(geometry)
      if (snapshot.features.length >= PUBLIC_PARCEL_TERRAIN_LIMITS.features || vertices + count > PUBLIC_PARCEL_TERRAIN_LIMITS.vertices) { snapshot.truncated = true; continue }
      vertices += count
      snapshot.features.push({
        type: 'Feature', id: `public:2024:${key}:${index}`, geometry,
        properties: { '地番': number, number, sourceLabel: PUBLIC_PARCEL_TERRAIN_SOURCE.label },
        info: { number }, role: 'public', source: PUBLIC_PARCEL_TERRAIN_SOURCE,
      })
    }
    if (inspected > PUBLIC_PARCEL_TERRAIN_LIMITS.inspectedFeatures || inspectedVertices > PUBLIC_PARCEL_TERRAIN_LIMITS.inspectedVertices) break
  }
  snapshot.status = incomplete || snapshot.truncated || snapshot.skippedFeatures ? 'partial' : snapshot.features.length ? 'ready' : 'empty'
  return snapshot
}

// Each async viewport request carries a ticket. Movement, candidate changes and
// unmount invalidate it; cached source geometry may still serve a fresh ticket.
export function createPublicParcelSnapshotGate() {
  let revision = 0
  return {
    begin: () => ++revision,
    invalidate: () => { revision++ },
    isCurrent: ticket => ticket === revision,
  }
}
