const finite = Number.isFinite
const bounds = [[0, 10], [10, 20], [20, 30], [30, 90]]

// Slope shares describe valid grid points, not measured slope polygons. Keep
// unclassified coverage separate instead of extrapolating it into known bins.
export function terrainSlopeDistribution(summary) {
  const totalAreaM2 = finite(summary?.polygonAreaM2) && summary.polygonAreaM2 >= 0 ? summary.polygonAreaM2 : null
  const { insideCount, slopeValidCount } = summary || {}
  const countCoverage = Number.isInteger(insideCount) && insideCount > 0 && Number.isInteger(slopeValidCount) && slopeValidCount >= 0 && slopeValidCount <= insideCount
    ? slopeValidCount / insideCount * 100 : null
  const coverage = countCoverage ?? summary?.slopeCoveragePercent
  const coveragePercent = finite(coverage) && coverage >= 0 && coverage <= 100 ? coverage : null
  const classifiedAreaM2 = totalAreaM2 !== null && coveragePercent !== null ? totalAreaM2 * coveragePercent / 100 : null
  return {
    totalAreaM2, classifiedAreaM2, coveragePercent,
    unknownAreaM2: classifiedAreaM2 !== null ? Math.max(0, totalAreaM2 - classifiedAreaM2) : null,
    bins: bounds.map(([min, max]) => {
      const value = summary?.slopeBins?.find(bin => bin.min === min && bin.max === max)?.percent
      const percent = finite(value) && value >= 0 && value <= 100 ? value : null
      return { min, max, percent, areaM2: classifiedAreaM2 !== null && percent !== null ? classifiedAreaM2 * percent / 100 : null }
    }),
  }
}

export function formatTerrainSlopeArea(areaM2) {
  if (!finite(areaM2) || areaM2 < 0) return '未計算'
  if (areaM2 === 0) return '0 m²'
  if (areaM2 < 1) return '1 m²未満'
  return `約${areaM2.toLocaleString('ja-JP', { maximumFractionDigits: 0 })} m²`
}
