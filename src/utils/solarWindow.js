const WINTER_SOLSTICE_DECLINATION = -23.44
const PEAK_HOURS = [10, 11, 12, 13, 14]

export function toRad(value) {
  return (value * Math.PI) / 180
}

export function toDeg(value) {
  return (value * 180) / Math.PI
}

export function normalizeBearing(value) {
  return ((value % 360) + 360) % 360
}

export function solarPositionAtHour(lat, hour, declination = WINTER_SOLSTICE_DECLINATION) {
  const latitude = toRad(lat)
  const decl = toRad(declination)
  const hourAngle = toRad(15 * (hour - 12))
  const sinAltitude = Math.sin(latitude) * Math.sin(decl) +
    Math.cos(latitude) * Math.cos(decl) * Math.cos(hourAngle)
  const altitude = toDeg(Math.asin(Math.max(-1, Math.min(1, sinAltitude))))
  const azimuth = normalizeBearing(
    toDeg(Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(decl) * Math.cos(latitude),
    )) + 180,
  )
  return { hour, altitude: Math.max(0, altitude), azimuth }
}

export function interpolateHorizonAngle(samples, bearing) {
  const valid = samples
    ?.filter((sample) => Number.isFinite(sample.angle) && Number.isFinite(sample.bearing))
    .slice()
    .sort((a, b) => a.bearing - b.bearing)
  if (!valid?.length) return null
  if (valid.length === 1) return valid[0].angle

  const target = normalizeBearing(bearing)
  for (let index = 0; index < valid.length; index += 1) {
    const current = valid[index]
    const next = valid[(index + 1) % valid.length]
    const start = current.bearing
    const end = next.bearing <= start ? next.bearing + 360 : next.bearing
    const adjustedTarget = target < start ? target + 360 : target
    if (adjustedTarget >= start && adjustedTarget <= end) {
      const ratio = end === start ? 0 : (adjustedTarget - start) / (end - start)
      return current.angle + (next.angle - current.angle) * ratio
    }
  }

  return valid.reduce((nearest, sample) => {
    const distance = Math.abs(normalizeBearing(sample.bearing - target))
    const wrapped = Math.min(distance, 360 - distance)
    return wrapped < nearest.distance ? { distance: wrapped, angle: sample.angle } : nearest
  }, { distance: Infinity, angle: null }).angle
}

export function peakSolarWindowReference(position, terrain, hours = PEAK_HOURS) {
  if (!position || !terrain?.samples?.length) return null
  const points = hours.map((hour) => {
    const solar = solarPositionAtHour(position.lat, hour)
    const horizonAngle = interpolateHorizonAngle(terrain.samples, solar.azimuth)
    const margin = Number.isFinite(horizonAngle) ? solar.altitude - horizonAngle : null
    return { ...solar, horizonAngle, margin }
  })
  const valid = points.filter((point) => Number.isFinite(point.margin))
  if (!valid.length) return null
  const tightest = valid.reduce((min, point) => point.margin < min.margin ? point : min)
  const status = tightest.margin <= 0 ? 'danger' : tightest.margin <= 3 ? 'watch' : 'ok'
  const label = status === 'danger' ? '干渉可能性あり' : status === 'watch' ? '接近' : '余裕あり'
  const message = status === 'danger'
    ? `冬至10〜14時のうち${tightest.hour}時頃、太陽の高さ 約${tightest.altitude.toFixed(1)}°に対して、その方向の山・木の見かけ高さが約${tightest.horizonAngle.toFixed(1)}°です。発電量の多い時間帯でも影の影響確認が必要です。`
    : status === 'watch'
      ? `冬至10〜14時で一番厳しいのは${tightest.hour}時頃です。太陽と山・木の高さ差は約${tightest.margin.toFixed(1)}°なので、周辺樹木・建物を現地確認してください。`
      : `冬至10〜14時で一番厳しい${tightest.hour}時頃でも、太陽は山・木より約${tightest.margin.toFixed(1)}°高く見えます。`
  return { status, label, message, points, tightest }
}

export function solarAltitudeReference(position, terrain) {
  if (!position) return null
  const winterSolsticeNoon = Math.max(0, 90 - Math.abs(position.lat + Math.abs(WINTER_SOLSTICE_DECLINATION)))
  const peakWindow = peakSolarWindowReference(position, terrain)
  if (!terrain || !Number.isFinite(terrain.maxAngle)) {
    return {
      winterSolsticeNoon,
      peakWindow,
      status: 'idle',
      label: '未分析',
      message: `冬至の南中太陽高度は約${winterSolsticeNoon.toFixed(1)}°です。地平線分析後に比較します。`,
    }
  }

  if (terrain.maxAngle >= winterSolsticeNoon) {
    return {
      winterSolsticeNoon,
      peakWindow,
      status: 'danger',
      label: '要注意',
      message: `最大地平線仰角 ${terrain.maxAngle.toFixed(1)}° が冬至の南中太陽高度 約${winterSolsticeNoon.toFixed(1)}°を超えています。影響を重点確認してください。`,
    }
  }

  if (terrain.maxAngle >= winterSolsticeNoon - 5) {
    return {
      winterSolsticeNoon,
      peakWindow,
      status: peakWindow?.status === 'danger' ? 'danger' : 'watch',
      label: '接近',
      message: `最大地平線仰角 ${terrain.maxAngle.toFixed(1)}° が冬至の南中太陽高度 約${winterSolsticeNoon.toFixed(1)}°に近いです。冬季影響を確認してください。`,
    }
  }

  return {
    winterSolsticeNoon,
    peakWindow,
    status: peakWindow?.status === 'danger' ? 'danger' : peakWindow?.status === 'watch' ? 'watch' : 'ok',
    label: peakWindow?.status === 'danger' ? '要注意' : peakWindow?.status === 'watch' ? '接近' : '通常',
    message: `最大地平線仰角 ${terrain.maxAngle.toFixed(1)}° は冬至の南中太陽高度 約${winterSolsticeNoon.toFixed(1)}°を下回っています。`,
  }
}
