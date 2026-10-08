const finite = Number.isFinite
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
// Display-only exaggeration. Unsupported values retain the true 1:1 scale.
const normalizeHeightScale = value => value === 2 ? 2 : 1
export const TERRAIN_INITIAL_VIEW = Object.freeze({ azimuth: 35, pitch: 32, zoom: 1 })

export function normalizeTerrainView(view = {}) {
  const azimuth = finite(view?.azimuth) ? view.azimuth : TERRAIN_INITIAL_VIEW.azimuth
  return {
    azimuth: ((azimuth % 360) + 360) % 360,
    pitch: clamp(finite(view?.pitch) ? view.pitch : TERRAIN_INITIAL_VIEW.pitch, 0, 75),
    zoom: clamp(finite(view?.zoom) ? view.zoom : TERRAIN_INITIAL_VIEW.zoom, .65, 2.5),
  }
}

// Deltas are fractions of the model viewport, so touch, mouse and different
// screen widths turn the same amount. This changes the camera, never elevations.
export function dragTerrainView(view, deltaX, deltaY) {
  const camera = normalizeTerrainView(view)
  return normalizeTerrainView({ ...camera, azimuth: camera.azimuth - (finite(deltaX) ? deltaX : 0) * 180, pitch: camera.pitch + (finite(deltaY) ? deltaY : 0) * 90 })
}

// Orbit around the fixed terrain centre. Horizontal dragging changes the side
// the observer sees; upward dragging raises the observer to look down farther.
export function orbitTerrainView(view, deltaX, deltaY) {
  const camera = normalizeTerrainView(view)
  return normalizeTerrainView({ ...camera, azimuth: camera.azimuth - (finite(deltaX) ? deltaX : 0) * 180, pitch: clamp(camera.pitch - (finite(deltaY) ? deltaY : 0) * 90, 0, 75) })
}

// Compatibility for an elevation-only interaction at the same object centre.
export function elevateTerrainView(view, deltaY) {
  return orbitTerrainView(view, 0, deltaY)
}

export function zoomTerrainView(view, factor) {
  const camera = normalizeTerrainView(view)
  if (!finite(factor) || factor <= 0) return camera
  return normalizeTerrainView({ ...camera, zoom: clamp(camera.zoom * factor, .65, 2.5) })
}

// Positive camera depth points toward the observer. Keep unknown surface
// normals visible; illustrative walls and the bottom have outward normals.
export function terrainFaceVisible(normal, view = {}, heightScale = 1) {
  if (!Array.isArray(normal) || normal.length < 3 || !normal.slice(0, 3).every(finite)) return true
  // A non-uniform display transform uses its inverse transpose for normals.
  // Do not scale an acquired surface normal as though it were a position.
  const nz = normal[2] / normalizeHeightScale(heightScale)
  const length = Math.hypot(normal[0], normal[1], nz)
  if (length === 0) return true
  const camera = normalizeTerrainView(view)
  const yaw = camera.azimuth * Math.PI / 180, pitch = camera.pitch * Math.PI / 180
  const facing = normal[0] * Math.sin(yaw) * Math.cos(pitch)
    + normal[1] * Math.cos(yaw) * Math.cos(pitch)
    + nz * Math.sin(pitch)
  return facing > 1e-10 * length
}

export function createTerrainProjection({ bounds, base, maxElevation, azimuth, pitch, zoom, heightScale = 1 }) {
  const camera = normalizeTerrainView({ azimuth, pitch, zoom })
  const displayHeightScale = normalizeHeightScale(heightScale)
  const yaw = camera.azimuth * Math.PI / 180, tilt = camera.pitch * Math.PI / 180
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw), cosTilt = Math.cos(tilt), sinTilt = Math.sin(tilt)
  const center = [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2]
  const transform = ([x, y, z]) => {
    const xx = x - center[0], yy = y - center[1], zz = (z - base) * displayHeightScale
    const horizontal = -xx * cosYaw + yy * sinYaw
    const forward = xx * sinYaw + yy * cosYaw
    // Rotation stays orthogonal; only explicit display exaggeration scales z.
    // At the default factor 1, one metre has the same length on every axis.
    return [horizontal, forward * sinTilt - zz * cosTilt, forward * cosTilt + zz * sinTilt]
  }
  const box = [bounds.west, bounds.east].flatMap(x => [bounds.south, bounds.north].flatMap(y => [base, Math.max(base + 1, maxElevation)].map(z => transform([x, y, z]))))
  const us = box.map(p => p[0]), vs = box.map(p => p[1])
  const minU = Math.min(...us), maxU = Math.max(...us), minV = Math.min(...vs), maxV = Math.max(...vs)
  const scale = Math.min(675 / Math.max(1, maxU - minU), 335 / Math.max(1, maxV - minV)) * camera.zoom
  const project = point => { const [u, v] = transform(point); return [400 + (u - (minU + maxU) / 2) * scale, 225 + (v - (minV + maxV) / 2) * scale] }
  return { ...camera, heightScale: displayHeightScale, transform, project, scale }
}
