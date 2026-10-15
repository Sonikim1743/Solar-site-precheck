import { terrainAzimuthLabel } from './terrainAzimuthLabel.js'
import { buildTerrainFence } from './terrainFence.js'
import { appliedTerrainPreview, terrainLayoutAnalysisKey } from './terrainLayoutComparison.js'
import { selectedTerrainLayout } from './terrainLayoutSelection.js'

const n = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString('ja-JP', { maximumFractionDigits: digits }) : '—'
export function terrainReportLayouts(analysis, preview) {
  const pool = appliedTerrainPreview(analysis, preview)
  const current = pool ? selectedTerrainLayout(pool, preview) : null
  const comparison = preview?.comparison?.analysisReference === analysis && preview.comparison.analysisKey === terrainLayoutAnalysisKey(analysis) ? preview.comparison : null
  const fenceFor = layout => preview?.fence && layout?.rackCount ? buildTerrainFence(analysis, { racks: layout.racks, marginM: layout.options.setbackM }) : null
  const fence = fenceFor(current), comparisonFences = comparison ? comparison.layouts.map(fenceFor) : []
  return { current, comparison, fence, comparisonFences, totalPages: 3 + Number(Boolean(comparison)) + Number(Boolean(preview?.simpleReview)) }
}
export function terrainLayoutReportRows(layout) {
  return [ ['地形の傾斜', `${layout.options.slopeLimitDeg}°未満`], ['使用架台 / 個別除外', `${layout.rackCount} / ${layout.disabledRacks?.length || 0} 架台`], ['モジュール', `${n(layout.moduleCount, 0)} 枚`], ['DC容量', `${n(layout.dcKw, 2)} kW`], ['AC参考容量', `約 ${n(layout.acRangeKw?.[0], 0)}〜${n(layout.acRangeKw?.[1], 0)} kW`] ]
}
export function terrainLayoutReportConditions(layout) {
  const o = layout.options
  return `${layout.stats?.autoSearch?.mode==='south-fixed'?'真南180°固定・探索候補内最多 / ':''}4段 × ${o.minColumns === o.maxColumns ? o.minColumns : `${o.minColumns}〜${o.maxColumns}`}列 / JKM720N-66HL5-BDV 2.384 × 1.303m・720W / パネル傾斜 ${n(o.tiltDeg)}°（地形勾配とは別） / 方位 ${terrainAzimuthLabel(o.azimuthDeg)}（北0°・時計回り） / 左右 ${n(o.rackGapM)}m・前後 ${n(o.rowGapM)}m・端 ${n(o.setbackM)}m / モジュール間 ${n(o.moduleGapM, 3)}m / 最低地上高 ${n(o.minClearanceM)}m / 開始位置 ${n(o.scanOffsetUM, 2)}, ${n(o.scanOffsetVM, 2)}m。`
}
export const TERRAIN_LAYOUT_LIMIT = '参考配置。境界・地盤・基礎・接道・搬入・排水・樹木建物・日影・連系・施工可否は未確認。欠測・除外は使わず、最多枚数は未保証。ACはDC÷1.5を標準刻みで丸めた目安（下限10kW）で、機器選定値ではありません。'
export const TERRAIN_LAYOUT_SAVE = '地形PDFは適用済み配置・数量・条件・計算済み比較を保存。仮フェンスはON時のみ。配置図PDFはA3横1枚で、縮尺を選べます。実資料の地番を表示し、未記載・重なりは注記。未適用入力とJSONへの配置保存は対象外。再読込・他PCでは再計算が必要です。'
