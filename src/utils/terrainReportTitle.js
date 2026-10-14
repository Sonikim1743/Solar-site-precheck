const clean = value => typeof value === 'string' ? value.replace(/\s+/g,' ').trim() : ''
export function terrainReportTitle(report = {}) {
  const name = clean(report.siteName), place = clean(report.placeLabel)
  if (name) return name
  if (place) return place
  const p = report.position
  return Number.isFinite(p?.lat) && Number.isFinite(p?.lon) ? `候補地 · N${p.lat.toFixed(6)} / E${p.lon.toFixed(6)}` : '候補地'
}
export function terrainReportTitleLines(value) {
  const chars=Array.from(value), middle=Math.ceil(chars.length/2)
  return chars.length > 38 ? [chars.slice(0,middle).join(''),chars.slice(middle).join('')] : [value]
}
