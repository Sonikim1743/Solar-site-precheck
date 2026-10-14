import { buildTerrainSlopeComparison } from '../utils/terrainLayoutComparison.js'
import { buildAutomaticTerrainLayout, buildOptimizedTerrainLayout, buildSouthTerrainLayout } from '../utils/terrainLayout.js'

self.onmessage = ({ data }) => {
  try {
    if (data.compareSlopes) { self.postMessage({ comparison: buildTerrainSlopeComparison(data.analysis, data.options) }); return }
    self.postMessage({ result: data.fixedSouth ? buildSouthTerrainLayout(data.analysis, data.options, data.baseline) : data.optimized ? buildOptimizedTerrainLayout(data.analysis, data.options, data.baseline) : buildAutomaticTerrainLayout(data.analysis, data.options) })
  } catch (error) {
    self.postMessage({ error: error?.message || '参考配置を計算できませんでした。' })
  }
}
