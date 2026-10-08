const finite = Number.isFinite
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
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

// Upward dragging raises the view above the model without changing its bearing.
export function elevateTerrainView(view, deltaY) {
  const camera = normalizeTerrainView(view)
  return normalizeTerrainView({ ...camera, pitch: clamp(camera.pitch - (finite(deltaY) ? deltaY : 0) * 90, 0, 75) })
}

export function zoomTerrainView(view, factor) {
  const camera = normalizeTerrainView(view)
  if (!finite(factor) || factor <= 0) return camera
  return normalizeTerrainView({ ...camera, zoom: clamp(camera.zoom * factor, .65, 2.5) })
}

// Positive camera depth points toward the observer. Keep unknown surface
// normals visible; illustrative walls and the bottom have outward normals.
export function terrainFaceVisible(normal, view = {}) {
  if (!Array.isArray(normal) || normal.length < 3 || !normal.slice(0, 3).every(finite)) return true
  const length = Math.hypot(normal[0], normal[1], normal[2])
  if (length === 0) return true
  const camera = normalizeTerrainView(view)
  const yaw = camera.azimuth * Math.PI / 180, pitch = camera.pitch * Math.PI / 180
  const facing = normal[0] * Math.sin(yaw) * Math.cos(pitch)
    + normal[1] * Math.cos(yaw) * Math.cos(pitch)
    + normal[2] * Math.sin(pitch)
  return facing > 1e-10 * length
}

export function createTerrainProjection({ bounds, base, maxElevation, azimuth, pitch, zoom }) {
  const camera = normalizeTerrainView({ azimuth, pitch, zoom })
  const yaw = camera.azimuth * Math.PI / 180, tilt = camera.pitch * Math.PI / 180
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw), cosTilt = Math.cos(tilt), sinTilt = Math.sin(tilt)
  const center = [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2]
  const transform = ([x, y, z]) => {
    const xx = x - center[0], yy = y - center[1], zz = z - base
    const horizontal = -xx * cosYaw + yy * sinYaw
    const forward = xx * sinYaw + yy * cosYaw
    // Orthogonal rotation: one metre has the same 3D length on every axis.
    return [horizontal, forward * sinTilt - zz * cosTilt, forward * cosTilt + zz * sinTilt]
  }
  const box = [bounds.west, bounds.east].flatMap(x => [bounds.south, bounds.north].flatMap(y => [base, Math.max(base + 1, maxElevation)].map(z => transform([x, y, z]))))
  const us = box.map(p => p[0]), vs = box.map(p => p[1])
  const minU = Math.min(...us), maxU = Math.max(...us), minV = Math.min(...vs), maxV = Math.max(...vs)
  const scale = Math.min(675 / Math.max(1, maxU - minU), 335 / Math.max(1, maxV - minV)) * camera.zoom
  const project = point => { const [u, v] = transform(point); return [400 + (u - (minU + maxU) / 2) * scale, 225 + (v - (minV + maxV) / 2) * scale] }
  return { ...camera, transform, project, scale }
}
