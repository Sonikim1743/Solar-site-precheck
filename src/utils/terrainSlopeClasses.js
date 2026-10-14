// JSON-safe open upper bound. Exact limits belong to the next class.
export const TERRAIN_SLOPE_BOUNDS = Object.freeze([[0,5],[5,10],[10,15],[15,20],[20,null]].map(Object.freeze))
export const TERRAIN_SLOPE_COLORS = Object.freeze(['#cfe3cd','#dae6b6','#efe8ad','#eabd8d','#df9d9b'])
export const terrainSlopeLabel = ({min,max}) => max === null ? `${min}°以上` : `${min}–${max}°未満`
export const TERRAIN_SLOPE_LABELS = Object.freeze(TERRAIN_SLOPE_BOUNDS.map(([min,max])=>terrainSlopeLabel({min,max})))
export function terrainSlopeIndex(slope) {
  if (!Number.isFinite(slope) || slope < 0) return -1
  return TERRAIN_SLOPE_BOUNDS.findIndex(([min,max])=>slope>=min&&(max===null||slope<max))
}
