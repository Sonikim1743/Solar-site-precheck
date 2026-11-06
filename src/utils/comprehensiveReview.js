import { inspectionPointKey } from './regulatoryPoint.js'

const maxAngle = (samples, key) => {
  const values = (samples || []).map(sample => sample[key]).filter(Number.isFinite)
  return values.length ? `${Math.max(...values).toFixed(1)}°` : '未取得'
}

export function regulatoryReviewSummary(inspection, position) {
  if (!inspection || inspection.pointKey !== inspectionPointKey(position) || !inspection.enabled) return { value: '未照会', detail: '用途地域・農地・洪水・土砂などを確認', pending: true }
  if (inspection.status !== 'ready' || !inspection.result) return { value: ({ loading: '照合中…', error: '取得失敗・未確認', cancelled: '中止・未確認' })[inspection.status] || '未照会', detail: '区域の有無は未確認', pending: true }
  const { references = [], hazards = {} } = inspection.result
  const hazardRows = hazards.mode === 'stored' ? hazards.datasets || [] : hazards.layers || []
  const rows = [...references, ...hazardRows]
  const count = rows.reduce((total, row) => total + (row.matches?.length || 0), 0)
  const incomplete = !references.length || !hazardRows.length || rows.some(row => !['none', 'matched'].includes(row.state))
  return { value: count ? `選択地点の重なり ${count}件` : incomplete ? '未確認（資料不足等）' : '収録資料では重なり未検出', detail: incomplete ? '選択地点の参考照合・資料なし等の未確認あり' : '地点の参考照合・現行指定・敷地全体は未確認', pending: true }
}

export function comprehensiveReview({ position, terrainArea, terrainStatus, terrain, obstructionHeight, snowStation, snowStatus, inspection }) {
  const regulatory = regulatoryReviewSummary(inspection, position)
  const hasHorizon = Boolean(terrain?.samples?.some(sample => Number.isFinite(sample.angle)))
  const horizonIncomplete = hasHorizon && terrain.samples.some(sample => !Number.isFinite(sample.angle) || sample.missingCount > 0)
  return [
    { id: 'terrain-area', label: '範囲・地形', value: terrainArea ? `勾配の中央値 ${Number.isFinite(terrainArea.summary?.medianSlope) ? terrainArea.summary.medianSlope.toFixed(1) + '°' : '未取得'}` : '範囲の地形は未取得', detail: terrainArea && (terrainArea.summary.coveragePercent < 100 || terrainArea.summary.slopeCoveragePercent < 100) ? '一部欠測あり・有効範囲と出典を確認' : '有効範囲の等高線・勾配・3D', pending: !terrainArea || terrainArea.summary.coveragePercent < 100 || terrainArea.summary.slopeCoveragePercent < 100 },
    { id: 'simple-horizon', label: '地平線・日影', value: terrainStatus === 'loading' ? '分析中…' : hasHorizon ? `地形のみ 最大 ${maxAngle(terrain.samples, 'terrainAngle')}` : terrainStatus === 'error' ? '取得失敗・未確認' : '未分析', detail: hasHorizon ? `${terrainStatus === 'manual' ? '手動編集あり・入力角' : `樹高仮定 ${obstructionHeight}m込み`} 最大 ${maxAngle(terrain.samples, 'angle')}${horizonIncomplete ? '・欠測あり' : ''}` : `樹高仮定 ${obstructionHeight}m・実際の樹木は未確認`, pending: !hasHorizon || horizonIncomplete },
    { id: 'simple-snow', label: 'NEDO積雪', value: snowStation ? '同一メッシュの資料あり' : snowStatus === 'loading' ? '取得中…' : snowStatus === 'error' ? '取得失敗・未確認' : '未取得', detail: '資料の月別値と補正条件を確認', pending: !snowStation },
    { id: 'regulatory', label: '規制・ハザード（地点）', ...regulatory },
  ]
}
