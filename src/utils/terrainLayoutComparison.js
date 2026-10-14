import { buildTerrainLayout, normalizeTerrainLayoutOptions } from './terrainLayout.js'

// A controlled comparison: only the strict terrain slope cutoff changes.
// No orientation search and no manual exclusions from another candidate.
export function buildTerrainSlopeComparison(analysis, input) {
  const options = normalizeTerrainLayoutOptions(input)
  const layouts = [15, 20].map(slopeLimitDeg => buildTerrainLayout(analysis, { ...options, slopeLimitDeg, __deadlineAtMs: (globalThis.performance?.now?.() ?? Date.now()) + 5000 }))
  return { options, layouts, policy: 'same-placement-no-manual-exclusions' }
}

export function terrainLayoutAnalysisKey(analysis) {
  return `4rows-v2:${analysis?.geometryKey || ''}:${analysis?.fetchedAt || ''}`
}

export function appliedTerrainPreview(analysis, preview) {
  const pool = preview?.layout
  return pool?.analysisReference === analysis && pool.analysisKey === terrainLayoutAnalysisKey(analysis) ? pool : null
}
