import { createTerrainProjection, normalizeTerrainView, terrainFaceVisible } from './terrainView.js'

export const TERRAIN_DIRECTIONS = Object.freeze([
  { id: 'north', label: '北', azimuth: 0, normal: [0, 1, 0], corners: [[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]] },
  { id: 'east', label: '東', azimuth: 90, normal: [1, 0, 0], corners: [[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]] },
  { id: 'south', label: '南', azimuth: 180, normal: [0, -1, 0], corners: [[1,-1,-1],[-1,-1,-1],[-1,-1,1],[1,-1,1]] },
  { id: 'west', label: '西', azimuth: 270, normal: [-1, 0, 0], corners: [[-1,1,-1],[-1,-1,-1],[-1,-1,1],[-1,1,1]] },
  { id: 'top', label: '上', normal: [0, 0, 1], corners: [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]] },
])

export function terrainNavigationTarget(id, view, initialView) {
  const current = normalizeTerrainView(view)
  if (id === 'home') return normalizeTerrainView(initialView)
  // Overhead uses north-up/east-right, whereas a named wall is the observer's
  // side of the terrain, matching the existing projection and face culling.
  if (id === 'top') return { ...current, azimuth: 180, pitch: 90 }
  const direction = TERRAIN_DIRECTIONS.find(item => item.id === id)
  return direction ? { ...current, azimuth: direction.azimuth, pitch: 0 } : current
}

export function interpolateTerrainNavigation(from, to, progress) {
  const a = normalizeTerrainView(from), b = normalizeTerrainView(to)
  const t = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
  if (t === 1) return b
  const eased = t * t * (3 - 2 * t)
  const delta = ((b.azimuth - a.azimuth + 540) % 360) - 180
  return normalizeTerrainView({ azimuth: a.azimuth + delta * eased, pitch: a.pitch + (b.pitch - a.pitch) * eased, zoom: a.zoom + (b.zoom - a.zoom) * eased })
}

export function terrainNavigationCube(view) {
  const camera = normalizeTerrainView(view)
  const projection = createTerrainProjection({ bounds: { west: -1, south: -1, east: 1, north: 1 }, base: -1, maxElevation: 1, ...camera, zoom: 1 })
  const origin = projection.transform([0,0,0])
  const screen = point => { const p = projection.transform(point); return [80 + (p[0] - origin[0]) * 40, 80 + (p[1] - origin[1]) * 40] }
  return TERRAIN_DIRECTIONS.filter(face => terrainFaceVisible(face.normal, camera)).map(face => {
    const points = face.corners.map(screen)
    const center = face.corners.reduce((s,p) => s.map((v,i) => v + p[i] / face.corners.length), [0,0,0])
    return { ...face, points, center: screen(center), depth: projection.transform(center)[2] }
  }).sort((a,b) => a.depth - b.depth)
}

export const terrainCompassRotation = view => (180 - normalizeTerrainView(view).azimuth + 360) % 360
