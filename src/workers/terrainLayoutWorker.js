import { buildAutomaticTerrainLayout, buildOptimizedTerrainLayout } from '../utils/terrainLayout.js'

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: data.optimized ? buildOptimizedTerrainLayout(data.analysis, data.options, data.baseline) : buildAutomaticTerrainLayout(data.analysis, data.options) })
  } catch (error) {
    self.postMessage({ error: error?.message || '参考配置を計算できませんでした。' })
  }
}
