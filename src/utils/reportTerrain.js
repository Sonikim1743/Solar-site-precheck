import { endpointSlope, isProfilePoint, slopeSegments, steepestSegment } from './terrainProfile.js'

export function classifyDemSource(value) {
  const source = typeof value === 'string' ? value.trim() : ''
  // One mutually exclusive family per observation. "航空レーザ" alone does not
  // distinguish 1m DEM1A from 5m DEM5A and must not imply a resolution.
  if (/DEM1A|(?:^|[^\dA-Z])1A(?:$|[^\dA-Z])|(?:^|[^\d.])1\s*m/i.test(source)) return 'dem1'
  if (/DEM5|(?:^|[^\dA-Z])5[ABC](?:$|[^\dA-Z])|(?:^|[^\d.])5\s*m/i.test(source)) return 'dem5'
  if (/DEM10|(?:^|[^\d.])10\s*m|DEM標高タイル/.test(source)) return 'dem10'
  // The JSON fallback text says PNG was unavailable, even when JSON succeeded.
  // Do not classify that acquired (but sometimes unspecified) value as missing.
  const missingLabel = source.replace(/（PNG未取得時）/g, '')
  if (!source || /標高データなし|^(?:未取得|欠測|欠損|取得失敗|取得不可)(?:$|[\s・／/:：])|^[—–-]$/.test(missingLabel)) return 'missing'
  return 'unknown'
}

export function summarizeDemSources(sources = []) {
  const counts = { dem1: 0, dem5: 0, dem10: 0, unknown: 0, missing: 0 }
  for (const source of sources) counts[classifyDemSource(source)]++
  const total = counts.dem1 + counts.dem5 + counts.dem10 + counts.unknown
  const detail = total
    ? `DEM1系 ${counts.dem1}点 / DEM5系 ${counts.dem5}点 / DEM10系 ${counts.dem10}点${counts.unknown ? ` / 出典未確認 ${counts.unknown}点` : ''}${counts.missing ? ` / 未取得 ${counts.missing}点（比率対象外）` : ''}`
    : '地平線・断面を再分析するとDEM内訳を表示できます。'
  return { ...counts, total, detail, shouldWarn: total > 0 && counts.dem10 / total >= 0.5 }
}

// Reports retain the acquired extent and the gaps used in the screen preview.
// Filtering missing points would connect observations that were never adjacent.
export function normalizeReportTerrainSection(analysis) {
  if (!analysis?.lines?.length) return null
  const rangeMeters = Number.isFinite(analysis.rangeMeters) && analysis.rangeMeters > 0 ? analysis.rangeMeters : 100
  const lines = analysis.lines.map(line => {
    const points = line.points || []
    const current = { ...line, rangeMeters, points }
    const valid = points.filter(isProfilePoint)
    const average = endpointSlope(current)
    const segments = slopeSegments(current)
    const steepest = steepestSegment(current)
    return { ...current, summary: {
      minElevation: valid.length ? Math.min(...valid.map(point => point.elevation)) : null,
      maxElevation: valid.length ? Math.max(...valid.map(point => point.elevation)) : null,
      elevationDiff: average?.elevationDelta ?? null,
      totalRise: segments.reduce((sum, segment) => sum + Math.max(0, segment.elevationDelta), 0),
      totalFall: segments.reduce((sum, segment) => sum + Math.max(0, -segment.elevationDelta), 0),
      averageSlopePercent: average?.slopePercent ?? null,
      maxSlopePercent: steepest?.slopePercent ?? null,
    } }
  })
  const elevations = lines.flatMap(line => line.points).filter(isProfilePoint).map(point => point.elevation)
  return { ...analysis, rangeMeters, lines, summary: {
    minElevation: elevations.length ? Math.min(...elevations) : null,
    maxElevation: elevations.length ? Math.max(...elevations) : null,
    sampleCount: elevations.length,
  } }
}

export function reportTerrainMapLayout(position, range = 100) {
  if (!Number.isFinite(position?.lat) || !Number.isFinite(position?.lon)) return null
  const width = 900, height = 400
  const rangeMeters = Number.isFinite(range) && range > 0 ? range : 100
  let zoom = 17
  const atZoom = z => 156543.03392804097 * Math.cos(position.lat * Math.PI / 180) / 2 ** z
  // Change the map zoom, never the metres-to-pixels conversion or scale bar.
  while (zoom > 4 && rangeMeters / atZoom(zoom) > Math.min(width / 2 - 80, height / 2 - 60)) zoom -= 1
  const metersPerPixel = atZoom(zoom)
  return { zoom, width, height, metersPerPixel, rangePx: rangeMeters / metersPerPixel, innerPx: 50 / metersPerPixel, scalePx: 100 / metersPerPixel }
}
