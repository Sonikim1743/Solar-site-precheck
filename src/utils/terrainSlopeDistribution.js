import polygonClipping from 'polygon-clipping'
import { getTerrainCellSlope } from './terrainLayout.js'

const finite = Number.isFinite
import { TERRAIN_SLOPE_BOUNDS as bounds, terrainSlopeIndex } from './terrainSlopeClasses.js'
export { TERRAIN_SLOPE_COLORS } from './terrainSlopeClasses.js'
const cache = new WeakMap()
const ringArea = r => Math.abs(r.slice(1).reduce((a,p,i)=>a+(r[i][0]-r[0][0])*(p[1]-r[0][1])-(p[0]-r[0][0])*(r[i][1]-r[0][1]),0))/2
export const terrainPolygonArea = ps => ps.reduce((a,p)=>a+ringArea(p[0])-p.slice(1).reduce((h,r)=>h+ringArea(r),0),0)

// Integrate the exact intersection of each projected metre cell and the
// effective boundary. Holes/exclusions and NoData never enter a known bin.
function cellDistribution(analysis) {
  if(cache.has(analysis))return cache.get(analysis)
  const g=analysis.grid, totalAreaM2=terrainPolygonArea(g.boundary), areas=bounds.map(()=>0)
  const parts=g.boundary.map(p=>{const points=p.flat();return {p,west:Math.min(...points.map(p=>p[0])),east:Math.max(...points.map(p=>p[0])),south:Math.min(...points.map(p=>p[1])),north:Math.max(...points.map(p=>p[1]))}})
  // Consecutive cells of the same bin are an exact rectangle union. Group
  // disjoint row runs, retaining exact hole intersections while avoiding a
  // repeated full-boundary clipping operation for every individual cell.
  for(let row=0;row<g.height-1;row++){
    let start=0,previous=-1
    for(let col=0;col<=g.width-1;col++){
      const slope=col<g.width-1?getTerrainCellSlope(g,row,col):null,bin=terrainSlopeIndex(slope)
      if(bin===previous)continue
      if(previous>=0){
        const x=g.xMin+start*g.step,east=g.xMin+col*g.step,y=g.yMin+row*g.step,north=y+g.step
        const candidates=parts.filter(p=>p.east>x&&p.west<east&&p.north>y&&p.south<north).map(p=>p.p)
        if(candidates.length)areas[previous]+=terrainPolygonArea(polygonClipping.intersection(candidates,[[[[x,y],[east,y],[east,north],[x,north],[x,y]]]]))
      }
      previous=bin;start=col
    }
  }
  const classifiedAreaM2=areas.reduce((a,b)=>a+b,0)
  // Only tiny floating-point overshoot is corrected, never real missing area.
  if(classifiedAreaM2>totalAreaM2+Math.max(1e-6,totalAreaM2*1e-8))throw Error('勾配セルの面積集計が範囲と一致しません。')
  const complete=classifiedAreaM2>0&&Math.abs(classifiedAreaM2-totalAreaM2)<=Math.max(1e-6,totalAreaM2*1e-8)
  const known=complete?totalAreaM2:classifiedAreaM2, factor=complete?totalAreaM2/classifiedAreaM2:1, unknownAreaM2=Math.max(0,totalAreaM2-known)
  const result={method:'projected-cell-intersection',totalAreaM2,classifiedAreaM2:known,unknownAreaM2,
    coveragePercent:totalAreaM2>0?known/totalAreaM2*100:0,unknownPercent:totalAreaM2>0?unknownAreaM2/totalAreaM2*100:100,
    bins:bounds.map(([min,max],i)=>({min,max,areaM2:areas[i]*factor,percent:totalAreaM2>0?areas[i]*factor/totalAreaM2*100:0}))}
  cache.set(analysis,result);return result
}

// Slope shares describe valid grid points, not measured slope polygons. Keep
// unclassified coverage separate instead of extrapolating it into known bins.
export function terrainSlopeDistribution(summary) {
  if(summary?.grid?.boundary?.length)return cellDistribution(summary)
  const totalAreaM2 = finite(summary?.polygonAreaM2) && summary.polygonAreaM2 >= 0 ? summary.polygonAreaM2 : null
  const exactBins = bounds.map(([min,max]) => summary?.slopeBins?.find(b=>b.min===min&&b.max===max))
  if(totalAreaM2 !== null && exactBins.every(b=>finite(b?.areaM2)&&b.areaM2>=0)) {
    const sum=exactBins.reduce((n,b)=>n+b.areaM2,0),tolerance=Math.max(1e-6,totalAreaM2*1e-8)
    if(sum>totalAreaM2+tolerance)throw Error('勾配セルの面積集計が範囲と一致しません。')
    const complete=Math.abs(sum-totalAreaM2)<=tolerance,factor=complete&&sum>0?totalAreaM2/sum:1
    const classifiedAreaM2=complete?totalAreaM2:sum,unknownAreaM2=Math.max(0,totalAreaM2-classifiedAreaM2)
    return {method:'projected-cell-intersection',totalAreaM2,classifiedAreaM2,unknownAreaM2,
      coveragePercent:totalAreaM2>0?classifiedAreaM2/totalAreaM2*100:0,unknownPercent:totalAreaM2>0?unknownAreaM2/totalAreaM2*100:100,
      bins:exactBins.map(b=>({...b,areaM2:b.areaM2*factor,percent:totalAreaM2>0?b.areaM2*factor/totalAreaM2*100:0}))}
  }
  const { insideCount, slopeValidCount } = summary || {}
  const countCoverage = Number.isInteger(insideCount) && insideCount > 0 && Number.isInteger(slopeValidCount) && slopeValidCount >= 0 && slopeValidCount <= insideCount
    ? slopeValidCount / insideCount * 100 : null
  const coverage = countCoverage ?? summary?.slopeCoveragePercent
  const coveragePercent = finite(coverage) && coverage >= 0 && coverage <= 100 ? coverage : null
  const classifiedAreaM2 = totalAreaM2 !== null && coveragePercent !== null ? totalAreaM2 * coveragePercent / 100 : null
  return {
    totalAreaM2, classifiedAreaM2, coveragePercent, unknownPercent: coveragePercent === null ? null : 100 - coveragePercent,
    unknownAreaM2: classifiedAreaM2 !== null ? Math.max(0, totalAreaM2 - classifiedAreaM2) : null,
    bins: bounds.map(([min, max]) => {
      const value = summary?.slopeBins?.find(bin => bin.min === min && bin.max === max)?.percent
      const percent = finite(value) && value >= 0 && value <= 100 && coveragePercent !== null ? value * coveragePercent / 100 : null
      return { min, max, percent, areaM2: totalAreaM2 !== null && percent !== null ? totalAreaM2 * percent / 100 : null }
    }),
  }
}

export function formatTerrainSlopeArea(areaM2) {
  if (!finite(areaM2) || areaM2 < 0) return '未計算'
  if (areaM2 === 0) return '0 m²'
  if (areaM2 < 1) return '1 m²未満'
  return `約${areaM2.toLocaleString('ja-JP', { maximumFractionDigits: 0 })} m²`
}
