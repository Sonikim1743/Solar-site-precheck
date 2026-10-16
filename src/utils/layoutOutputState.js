import { normalizeTerrainLayoutOptions } from './terrainLayout.js'
import { appliedTerrainPreview } from './terrainLayoutComparison.js'
import { selectedTerrainLayout } from './terrainLayoutSelection.js'

const appliedMode = preview => preview?.appliedMode || (preview?.layout?.stats?.autoSearch?.mode === 'optimized' ? 'optimized' : preview?.layout?.stats?.autoSearch?.mode === 'south-fixed' ? 'south' : preview?.layout ? 'manual' : 'south')
export const terrainLayoutMode = preview => preview?.layoutMode || appliedMode(preview)
export const layoutOptionsKey = options => JSON.stringify(normalizeTerrainLayoutOptions(options))
export const layoutRequestKey = preview => JSON.stringify([layoutOptionsKey(preview?.options), terrainLayoutMode(preview)])
export function latestLayoutAnalysis(geometryKey, ...analyses) {
  return analyses.filter(area => area?.geometryKey === geometryKey && Number.isFinite(Date.parse(area.fetchedAt)))
    .reduce((latest, area) => !latest || Date.parse(area.fetchedAt) > Date.parse(latest.fetchedAt) ? area : latest, null)
}

// Output uses the applied rack pool and selection only when it still represents
// the requested conditions and this exact acquisition. Screen drafts may retain
// the old pool for comparison, but it cannot silently become a new-condition PDF.
export function layoutOutputState(analysis, preview) {
  if (!analysis || !preview?.layout) return { current: false, pool: null, layout: null, blocked: Boolean(preview?.layout) }
  const pool = appliedTerrainPreview(analysis, preview)
  const unchanged = layoutOptionsKey(preview?.options || preview?.appliedOptions || pool?.options) === layoutOptionsKey(preview?.appliedOptions || pool?.options)
  const current = Boolean(pool && unchanged && terrainLayoutMode(preview) === appliedMode(preview) && !preview?.calculating && !preview?.outputBlocked)
  return { current, pool: current ? pool : null, layout: current ? selectedTerrainLayout(pool, preview) : null,
    blocked: Boolean(preview?.layout && !current) }
}
