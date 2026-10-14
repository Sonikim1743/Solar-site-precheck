// Summary extrema already use only finite DEM nodes inside the effective area.
// The difference is derived from those endpoints, never from a display scale.
export function terrainElevationLabel(summary) {
  const low=summary?.minElevation,high=summary?.maxElevation
  if(!Number.isFinite(low)||!Number.isFinite(high))return '敷地標高 最低点 確認不可 / 最高点 確認不可 / 高低差 確認不可'
  return `敷地標高 最低点 ${low.toFixed(1)}m / 最高点 ${high.toFixed(1)}m / 高低差 ${(high-low).toFixed(1)}m`
}
