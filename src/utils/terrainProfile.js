export function isProfilePoint(point) {
  return Number.isFinite(point?.distance) && Number.isFinite(point?.elevation) && point.missing !== true
}

// Keep the original sequence: a missing observation must split the profile.
export function profilePointRuns(points = []) {
  const runs = []
  let current = []
  for (const point of points) {
    if (!isProfilePoint(point)) {
      current = []
      continue
    }
    if (!current.length || point.distance <= current.at(-1).distance) {
      current = []
      runs.push(current)
    }
    current.push(point)
  }
  return runs
}

export function slopeSegments(line) {
  const points = line?.points || []
  const segments = []
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    if (!isProfilePoint(start) || !isProfilePoint(end)) continue
    const distance = end.distance - start.distance
    if (distance <= 0 || !Number.isFinite(distance)) continue
    const elevationDelta = end.elevation - start.elevation
    const slopePercent = Math.abs(elevationDelta / distance) * 100
    const angle = (Math.atan2(Math.abs(elevationDelta), distance) * 180) / Math.PI
    segments.push({ start, end, distance, elevationDelta, slopePercent, angle, direction: elevationDelta > 0 ? '上り' : elevationDelta < 0 ? '下り' : '水平' })
  }
  return segments
}

export function steepestSegment(line) {
  return slopeSegments(line).reduce((best, segment) => !best || segment.slopePercent > best.slopePercent ? segment : best, null)
}

export function endpointSlope(line) {
  const points = line?.points || []
  if (points.length < 2) return null
  const start = points[0]
  const end = points.at(-1)
  if (!isProfilePoint(start) || !isProfilePoint(end)) return null
  const range = line?.rangeMeters
  if (Number.isFinite(range) && range > 0 && (Math.abs(start.distance + range) > 1e-6 || Math.abs(end.distance - range) > 1e-6)) return null
  const distance = end.distance - start.distance
  if (distance <= 0 || !Number.isFinite(distance)) return null
  const elevationDelta = end.elevation - start.elevation
  return {
    start, end, distance, elevationDelta,
    slopePercent: Math.abs(elevationDelta / distance) * 100,
    angle: (Math.atan2(Math.abs(elevationDelta), distance) * 180) / Math.PI,
    heightPer10Meters: elevationDelta / distance * 10,
  }
}
