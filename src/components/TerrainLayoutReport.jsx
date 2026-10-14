import { TerrainAreaPlan, TerrainArea3D } from './TerrainAreaFigures.jsx'
import { terrainLayoutReportRows } from '../utils/terrainLayoutReport.js'

export default function TerrainLayoutReport({ analysis, position, layout, comparison, fence, comparisonFences = [], reportTitle }) {
  const layouts = comparison ? comparison.layouts : [layout]
  return <div className="terrain-layout-report" data-layout-report-kind={comparison ? 'comparison' : 'current'}>
    <div className="terrain-report-3d-layout">
      {comparison ? layouts.map((result,index) => <section key={result.options.slopeLimitDeg}>
        <h3>地形勾配 {result.options.slopeLimitDeg}°未満（個別除外なし）</h3>
        <TerrainAreaPlan analysis={analysis} position={position} layout={result} fence={comparisonFences[index]} reportTitle={reportTitle} reportMode reportLayout compactReport noteRef="注1・3・4" />
        <dl className="terrain-layout-report-values">{terrainLayoutReportRows(result).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </section>) : <><section><h3>実DEM地形 · 配置前</h3><TerrainArea3D analysis={analysis} position={position} azimuth={35} reportMode compactReport noteRef="注1・2" /></section><section><h3>参考配置3D · 適用済み</h3><TerrainArea3D analysis={analysis} position={position} azimuth={35} layout={layout} fence={fence} reportMode reportLayout compactReport noteRef="注1・3" /></section></>}
    </div>
    {!comparison && <dl className="terrain-layout-report-values terrain-layout-report-values--primary">{terrainLayoutReportRows(layout).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {comparison && <p className="terrain-layout-report-difference">差（20° − 15°）：{layouts[1].rackCount-layouts[0].rackCount}架台 / {layouts[1].moduleCount-layouts[0].moduleCount}枚 / {(layouts[1].dcKw-layouts[0].dcKw).toLocaleString('ja-JP',{maximumFractionDigits:2})} kW</p>}
    <p className="terrain-layout-report-legend">黒矩形：使用モジュール · 破線：個別除外{(fence?.rails?.length || comparisonFences.some(value=>value?.rails?.length)) ? ' · 一点鎖線：仮フェンス' : ''}</p>
    <p className="terrain-report-note-reference">{comparison ? '同条件比較の仮定：注1・3・4・5' : '適用条件・出典・仮定：注1・3・5'}（最終ページ）</p>
    {layouts.some(result=>result.stats?.capped || result.stats?.autoSearch?.timeLimited) && <p className="terrain-report-warning">計算上限に達した途中結果を含みます。最大枚数の保証ではありません。</p>}

  </div>
}
