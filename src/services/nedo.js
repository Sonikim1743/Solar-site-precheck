const DATA_URL = '/data/monsola11-snow.json'
let datasetPromise

function loadDataset() {
  if (!datasetPromise) {
    datasetPromise = fetch(DATA_URL).then((response) => {
      if (!response.ok) throw new Error('MONSOLA-11データを読み込めませんでした')
      return response.json()
    })
  }
  return datasetPromise
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const radius = 6371
  const toRad = (value) => (value * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function findNearestMonsolaStation(lat, lon) {
  const dataset = await loadDataset()
  let nearest = null
  let nearestDistance = Infinity

  for (const station of dataset.stations) {
    const distance = distanceKm(lat, lon, station.lat, station.lon)
    if (distance < nearestDistance) {
      nearest = station
      nearestDistance = distance
    }
  }

  return {
    ...nearest,
    distanceKm: nearestDistance,
    source: dataset.source,
    mode: 'nearest-station',
  }
}

export function thirdMeshCode(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 20 || lat > 50 || lon < 120 || lon > 155) return ''
  const firstLat = Math.floor(lat * 1.5)
  const firstLon = Math.floor(lon) - 100
  const remainingLatMinutes = lat * 60 - firstLat * 40
  const remainingLonMinutes = (lon - Math.floor(lon)) * 60
  const secondLat = Math.floor(remainingLatMinutes / 5)
  const secondLon = Math.floor(remainingLonMinutes / 7.5)
  const thirdLat = Math.floor((remainingLatMinutes - secondLat * 5) / 0.5)
  const thirdLon = Math.floor((remainingLonMinutes - secondLon * 7.5) / 0.75)
  return `${firstLat}${String(firstLon).padStart(2, '0')}${secondLat}${secondLon}${thirdLat}${thirdLon}`
}

export function thirdMeshCenter(meshCode) {
  const digits = String(meshCode).replace(/\D/g, '')
  if (!/^\d{8}$/.test(digits)) return null
  const firstLat = Number(digits.slice(0, 2))
  const firstLon = Number(digits.slice(2, 4)) + 100
  const secondLat = Number(digits[4])
  const secondLon = Number(digits[5])
  const thirdLat = Number(digits[6])
  const thirdLon = Number(digits[7])
  const lat = firstLat / 1.5 + secondLat * 5 / 60 + thirdLat * .5 / 60 + .25 / 60
  const lon = firstLon + secondLon * 7.5 / 60 + thirdLon * .75 / 60 + .375 / 60
  const latDeg = Math.floor(lat)
  const lonDeg = Math.floor(lon)
  return {
    lat,
    lon,
    latDeg,
    latMin: (lat - latDeg) * 60,
    lonDeg,
    lonMin: (lon - lonDeg) * 60,
  }
}

export function adjacentThirdMeshes(meshCode) {
  const center = thirdMeshCenter(meshCode)
  if (!center) return []
  const latStep = 0.5 / 60
  const lonStep = 0.75 / 60
  const neighbors = [
    ['北', latStep, 0],
    ['南', -latStep, 0],
    ['東', 0, lonStep],
    ['西', 0, -lonStep],
    ['北東', latStep, lonStep],
    ['北西', latStep, -lonStep],
    ['南東', -latStep, lonStep],
    ['南西', -latStep, -lonStep],
  ]
  const seen = new Set([String(meshCode)])
  return neighbors.flatMap(([direction, latOffset, lonOffset]) => {
    const mesh = thirdMeshCode(center.lat + latOffset, center.lon + lonOffset)
    if (!mesh || seen.has(mesh)) return []
    seen.add(mesh)
    return [{ direction, mesh }]
  })
}

export function thirdMeshBoundaryDistance(lat, lon, thresholdMeters = 100) {
  if (!thirdMeshCode(lat, lon)) return null

  const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor
  const latCellMinutes = 0.5
  const lonCellMinutes = 0.75
  const latOffsetMinutes = positiveModulo(lat * 60, latCellMinutes)
  const lonOffsetMinutes = positiveModulo(lon * 60, lonCellMinutes)
  const latBoundaryMinutes = Math.min(latOffsetMinutes, latCellMinutes - latOffsetMinutes)
  const lonBoundaryMinutes = Math.min(lonOffsetMinutes, lonCellMinutes - lonOffsetMinutes)
  const metersPerMinuteLat = 1852
  const metersPerMinuteLon = metersPerMinuteLat * Math.cos((lat * Math.PI) / 180)
  const latDistanceMeters = latBoundaryMinutes * metersPerMinuteLat
  const lonDistanceMeters = lonBoundaryMinutes * metersPerMinuteLon
  const minDistanceMeters = Math.min(latDistanceMeters, lonDistanceMeters)

  return {
    minDistanceMeters,
    latDistanceMeters,
    lonDistanceMeters,
    thresholdMeters,
    isNearBoundary: minDistanceMeters <= thresholdMeters,
  }
}

export function isConfirmedSnowStation(station) {
  return Boolean(
    station &&
    ['nedo-pdf', 'nedo-web', 'manual-corrected'].includes(station.mode) &&
    station.verified !== false &&
    station.validationVersion >= 2,
  )
}

export function productionFactor(baseFactor, occurrenceRate) {
  if (!Number.isFinite(baseFactor) || !Number.isFinite(occurrenceRate)) return null
  return baseFactor - occurrenceRate
}
