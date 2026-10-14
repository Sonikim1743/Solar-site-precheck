import { toDegreeMinutes } from './coordinates.js'
import { thirdMeshCode } from '../services/nedo.js'
const n = (v, digits = 1) => Number.isFinite(v) ? v.toLocaleString('ja-JP', { maximumFractionDigits: digits }) : '未取得'
export function simpleReviewReportRows(snapshot) {
  if (!snapshot) return []
  const { position: p, defaults: d, results: r, steps } = snapshot, o = d.layout
  const rows = [
    ['結果の状態', snapshot.status === 'complete' ? '全取得（参考検討）' : '確認必要（取得・配置条件を確認）'],
    ['有効範囲・内部代表点', `${n(snapshot.areaM2,0)} m² / ${toDegreeMinutes(p.lat,'lat',3)} / ${toDegreeMinutes(p.lon,'lon',3)}`],
    ['代表点標高', `${n(r.elevation?.value)} m / ${r.elevation?.dataSource || '出典未取得'}`],
    ['断面・地平線の基本値', `東西・南北 ±${d.sectionRangeM}m / ${d.sectionIntervalM}m間隔 / ${d.horizonDirections}方位 / 250m〜5km / 仮障害物 ${d.obstructionHeightM}m`],
    ['モジュール・パネル角', `4段×4〜8列 / ${o.modulePowerW}W / ${o.moduleWidthM}×${o.moduleHeightM}m / ${o.tiltDeg}°（水平から）`],
    ['方位・地形勾配', `北0°から時計回り${o.azimuthDeg}° / 局所勾配${o.slopeLimitDeg}°未満（パネル角とは別）`],
    ['配置の基本値', `左右${o.rackGapM}m / 前後${o.rowGapM}m / 境界から${o.setbackM}m / モジュール間${o.moduleGapM*1000}mm / 高さ${o.minClearanceM}m`],
    ['探索・NEDOの基本値', `最大${o.maxRacks}架台 / 候補${o.maxCandidates} / 開始${o.scanOffsetUM},${o.scanOffsetVM}m / 積雪基準${d.snowBase}`],
    ['配置で実際に適用した値', r.layout ? `方位${r.layout.options.azimuthDeg}° / 地形${r.layout.options.slopeLimitDeg}°未満 / 開始${n(r.layout.options.scanOffsetUM,2)},${n(r.layout.options.scanOffsetVM,2)}m / ${r.layout.rackCount}架台・${r.layout.moduleCount}枚・DC${n(r.layout.dcKw,2)}kW` : '未計算'],
    ['一括取得日時', snapshot.acquiredAt],
    ...steps.map(s => [s.name, `${s.status === 'success' ? '取得済み' : '確認必要'} / ${s.message.slice(0,80)}`]),
  ]
  for (const line of r.section?.lines || []) rows.push([line.label, `最低${n(line.summary?.minElevation)}m / 最高${n(line.summary?.maxElevation)}m / 両端差${n(line.summary?.elevationDiff)}m`])
  for (const sample of r.horizon?.samples || []) rows.push([`地平線 ${sample.direction}`, Number.isFinite(sample.angle) && !sample.missing ? `${n(sample.angle,2)}° / 欠測${sample.missingCount || 0}点` : '未取得・0°とみなしません'])
  rows.push(['NEDO同一メッシュ', `${thirdMeshCode(p.lat,p.lon)} / ${r.snow?.id === thirdMeshCode(p.lat,p.lon) ? '一致' : '未確認'}`])
  rows.push(['NEDO 積雪10cm以上', r.snow?.snow10cm ? `年${n(r.snow.snow10cm.annual,2)}% / 冬${n(r.snow.snow10cm.winter,2)}% / ${r.snow.source?.statisticalPeriod || '期間未確認'}` : '未取得・積雪なしとみなしません'])
  for (const start of [0,6]) rows.push([`NEDO ${start+1}〜${start+6}月`, r.snow?.snow10cm?.monthly?.length === 12 ? r.snow.snow10cm.monthly.slice(start,start+6).map((rate,i)=>`${start+i+1}月${n(rate)}%`).join(' / ') : '月別値未取得'])
  return rows
}
