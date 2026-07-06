const SAMPLE_HEADER_DESCRIPTION = '"The average elevation for the session is the average elevation of all of the skylines. The maximum elevation for the session is the maximum elevation of all of the skylines.  The elevation given for each skyline represents the highest point a shade causing obstruction occurs at the given azimuth."'

export const OBSTRUCTION_ELEVATIONS_HEADER = '"Compass Heading (0-360; North=0; East=90)","Southerly Oriented Azimuth (-180 to +180; south=0; East=-90)","Average Elevation (0-90) Session","Maximum Elevation (0-90) Session","Elevation (0-90) Sky01"'

function normalizeBearing360(value) {
  if (!Number.isFinite(value)) return null
  const normalized = value % 360
  return normalized < 0 ? normalized + 360 : normalized
}

function formatNumber(value, digits = 6) {
  if (!Number.isFinite(value)) return ''
  const rounded = Number(value.toFixed(digits))
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function formatElevation(value) {
  if (!Number.isFinite(value)) return ''
  const clamped = Math.min(90, Math.max(0, value))
  const rounded = Number(clamped.toFixed(1))
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function southerlyOrientedAzimuth(compassHeading) {
  return compassHeading - 180
}

export function prepareHorizonControlPoints(samples) {
  const byBearing = new Map()
  for (const sample of samples || []) {
    const bearing = normalizeBearing360(Number(sample?.bearing))
    if (sample?.angle === null || sample?.angle === undefined || sample?.angle === '') continue
    const angle = Number(sample?.angle)
    if (bearing === null || !Number.isFinite(angle)) continue
    byBearing.set(bearing, Math.min(90, Math.max(0, angle)))
  }
  return [...byBearing.entries()]
    .map(([bearing, angle]) => ({ bearing, angle }))
    .sort((a, b) => a.bearing - b.bearing)
}

export function interpolateHorizonElevations(samples) {
  const points = prepareHorizonControlPoints(samples)
  if (!points.length) return null
  if (points.length === 1) {
    const rows = Array.from({ length: 361 }, (_, compassHeading) => ({
      compassHeading,
      southerlyAzimuth: southerlyOrientedAzimuth(compassHeading),
      elevation: points[0].angle,
    }))
    rows[360].elevation = rows[0].elevation
    return rows
  }

  const rows = []
  for (let compassHeading = 0; compassHeading <= 360; compassHeading += 1) {
    const normalizedHeading = compassHeading === 360 ? 0 : compassHeading
    let previous = points[points.length - 1]
    let next = points[0]

    for (let index = 0; index < points.length; index += 1) {
      const current = points[index]
      const following = points[(index + 1) % points.length]
      const start = current.bearing
      const end = following.bearing > start ? following.bearing : following.bearing + 360
      const heading = normalizedHeading >= start ? normalizedHeading : normalizedHeading + 360
      if (heading >= start && heading <= end) {
        previous = current
        next = following
        break
      }
    }

    const start = previous.bearing
    const end = next.bearing > start ? next.bearing : next.bearing + 360
    const heading = normalizedHeading >= start ? normalizedHeading : normalizedHeading + 360
    const span = Math.max(1, end - start)
    const ratio = (heading - start) / span
    const elevation = previous.angle + (next.angle - previous.angle) * ratio

    rows.push({
      compassHeading,
      southerlyAzimuth: southerlyOrientedAzimuth(compassHeading),
      elevation,
    })
  }
  rows[360].elevation = rows[0].elevation
  return rows
}

export function buildObstructionElevationsCsv({ samples, position, sessionName = 'Solar Site Precheck DEM Horizon' } = {}) {
  const rows = interpolateHorizonElevations(samples)
  if (!rows) return null

  const latitude = position && Number.isFinite(position.lat) ? position.lat : ''
  const longitude = position && Number.isFinite(position.lon) ? position.lon : ''

  const lines = [
    'Session Obstruction Elevations 1.0',
    `Session Name:,"${String(sessionName || 'Solar Site Precheck DEM Horizon').replaceAll('"', '""')}"`,
    `Latitude:,${formatNumber(latitude)}`,
    `Longitude:,${formatNumber(longitude)}`,
    'Mag Dec:,0',
    'Time Zone:,GMT+09:00',
    '',
    SAMPLE_HEADER_DESCRIPTION,
    '',
    'begin data',
    OBSTRUCTION_ELEVATIONS_HEADER,
    ...rows.map((row) => {
      const elevation = formatElevation(row.elevation)
      return [
        row.compassHeading,
        row.southerlyAzimuth,
        elevation,
        elevation,
        elevation,
      ].join(',')
    }),
  ]

  return `${lines.join('\r\n')}\r\n`
}
