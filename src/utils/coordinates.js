export function toDegreeMinutes(value, axis, minuteDigits = 1) {
  if (!Number.isFinite(value)) return '—'
  const absolute = Math.abs(value)
  const degrees = Math.floor(absolute)
  const minutes = (absolute - degrees) * 60
  const hemisphere = axis === 'lat'
    ? (value >= 0 ? '北緯' : '南緯')
    : (value >= 0 ? '東経' : '西経')
  return `${hemisphere} ${degrees}度 ${minutes.toFixed(minuteDigits)}分`
}

export function degreeMinutesToDecimal(degrees, minutes) {
  return Number(degrees) + Number(minutes) / 60
}

export function parseCoordinateInput(input) {
  const text = String(input || '').trim()
  if (!text) return null
  const normalized = text
    .replace(/[，、]/g, ',')
    .replace(/[／]/g, '/')
    .replace(/\s+/g, ' ')

  const degreeMinute = normalized.match(/(?:北緯|緯度|lat(?:itude)?)\s*([+-]?\d+(?:\.\d+)?)\s*(?:度|°)\s*([+-]?\d+(?:\.\d+)?)?\s*(?:分|′|')?.*?(?:東経|経度|lon(?:gitude)?)\s*([+-]?\d+(?:\.\d+)?)\s*(?:度|°)\s*([+-]?\d+(?:\.\d+)?)?/i)
  if (degreeMinute) {
    return {
      lat: Number(degreeMinute[1]) + Number(degreeMinute[2] || 0) / 60,
      lon: Number(degreeMinute[3]) + Number(degreeMinute[4] || 0) / 60,
    }
  }

  const dms = normalized.match(/([+-]?\d+(?:\.\d+)?)\s*(?:度|°)\s*(\d+(?:\.\d+)?)?\s*(?:分|′|')?\s*(\d+(?:\.\d+)?)?\s*(?:秒|″|")?\s*([NS北南])?.*?([+-]?\d+(?:\.\d+)?)\s*(?:度|°)\s*(\d+(?:\.\d+)?)?\s*(?:分|′|')?\s*(\d+(?:\.\d+)?)?\s*(?:秒|″|")?\s*([EW東西])?/i)
  if (dms) {
    const latSign = /S|南/i.test(dms[4] || '') ? -1 : 1
    const lonSign = /W|西/i.test(dms[8] || '') ? -1 : 1
    return {
      lat: latSign * (Number(dms[1]) + Number(dms[2] || 0) / 60 + Number(dms[3] || 0) / 3600),
      lon: lonSign * (Number(dms[5]) + Number(dms[6] || 0) / 60 + Number(dms[7] || 0) / 3600),
    }
  }

  const atPattern = normalized.match(/@([+-]?\d+(?:\.\d+)?),\s*([+-]?\d+(?:\.\d+)?)/)
  if (atPattern) return { lat: Number(atPattern[1]), lon: Number(atPattern[2]) }

  const numbers = normalized.match(/[+-]?\d+(?:\.\d+)?/g)?.map(Number) || []
  if (numbers.length >= 2) return { lat: numbers[0], lon: numbers[1] }
  return null
}
