const finite = Number.isFinite
export const TERRAIN_INITIAL_VIEW = Object.freeze({ azimuth: 35, pitch: 32 })

export function normalizeTerrainView(view = {}) {
  const azimuth = finite(view.azimuth) ? view.azimuth : TERRAIN_INITIAL_VIEW.azimuth
  return {
    azimuth: ((azimuth % 360) + 360) % 360,
    pitch: Math.max(15, Math.min(75, finite(view.pitch) ? view.pitch : TERRAIN_INITIAL_VIEW.pitch)),
  }
}

// Deltas are fractions of the model viewport, so touch, mouse and different
// screen widths turn the same amount. This changes the camera, never elevations.
export function dragTerrainView(view, deltaX, deltaY) {
  return normalizeTerrainView({ azimuth: view.azimuth - deltaX * 180, pitch: view.pitch + deltaY * 90 })
}

export function createTerrainProjection({ bounds, base, maxElevation, azimuth, pitch }) {
  const camera = normalizeTerrainView({ azimuth, pitch })
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
  const scale = Math.min(675 / Math.max(1, maxU - minU), 335 / Math.max(1, maxV - minV))
  const project = point => { const [u, v] = transform(point); return [400 + (u - (minU + maxU) / 2) * scale, 225 + (v - (minV + maxV) / 2) * scale] }
  return { ...camera, transform, project, scale }
}
