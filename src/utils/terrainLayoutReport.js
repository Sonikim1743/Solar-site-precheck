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
  return [ ['地形勾配', `${layout.options.slopeLimitDeg}°未満`], ['使用架台 / 個別除外', `${layout.rackCount} / ${layout.disabledRacks?.length || 0} 架台`], ['モジュール', `${n(layout.moduleCount, 0)} 枚`], ['DC容量', `${n(layout.dcKw, 2)} kW`], ['AC参考容量', `約 ${n(layout.acRangeKw?.[0], 0)}〜${n(layout.acRangeKw?.[1], 0)} kW`] ]
}
export function terrainLayoutReportConditions(layout) {
  const o = layout.options
  return `${layout.stats?.autoSearch?.mode==='south-fixed'?'真南180°固定・探索候補内最多 / ':''}4段 × ${o.minColumns === o.maxColumns ? o.minColumns : `${o.minColumns}〜${o.maxColumns}`}列 / JKM720N-66HL5-BDV 2.384 × 1.303m・720W / パネル傾斜 ${n(o.tiltDeg)}°（地形勾配とは別） / 方位 ${n(o.azimuthDeg)}°（北0°・時計回り） / 左右 ${n(o.rackGapM)}m・前後 ${n(o.rowGapM)}m・端 ${n(o.setbackM)}m / モジュール間 ${n(o.moduleGapM, 3)}m / 最低地上高 ${n(o.minClearanceM)}m / 開始位置 ${n(o.scanOffsetUM, 2)}, ${n(o.scanOffsetVM, 2)}m。`
}
export const TERRAIN_LAYOUT_LIMIT = '参考設計。境界・地盤・基礎・接道・搬入・排水・樹木建物・日影・連系・施工可否は未確認。欠測・除外を配置対象にしません。最大枚数は保証しません。ACは機器選定値ではなく、DC÷1.5を100kW以下10kW刻み／超過50kW刻み、下限10kWで丸めた目安です。'
export const TERRAIN_LAYOUT_SAVE = '地形レポートPDFは適用済みの配置・数量・条件と計算済み比較を含みます。チェック時は使用架台を囲む仮フェンスも出力します。未適用入力はPDFに含みません。単独配置図の右図には選択資料の実地番を表示します（未記載・重なりは注記）。別の「配置図PDF」は現在の適用配置をA3横1枚の図面として出力します。JSON検討記録には配置条件・結果・個別除外・仮フェンスを保存しません。再読込・他PCでは再計算が必要です。'
