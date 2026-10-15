import { simpleReviewReportRows } from '../utils/simpleReviewReport.js'
import { terrainReportTitle } from '../utils/terrainReportTitle.js'
import { terrainReportNotes } from '../utils/terrainReportNotes.js'
import TerrainLayoutReport from './TerrainLayoutReport.jsx'
import { terrainReportLayouts } from '../utils/terrainLayoutReport.js'
import { TerrainAreaPlan, TerrainArea3D } from './TerrainAreaFigures.jsx'
import { terrainGeometryKey } from '../utils/terrainArea.js'
import { measureParcelReview } from '../utils/parcelReview.js'
import { terrainSlopeDistribution, formatTerrainSlopeArea } from '../utils/terrainSlopeDistribution.js'
import TerrainDrawingPair from './TerrainDrawingPair.jsx'
import './terrain-area-report.css'

const number = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString('ja-JP', { maximumFractionDigits: digits }) : '—'
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '未記録'

function Sheet({ title, report, analysis, page, total = 2, children }) {
  return <article className="report-print-page terrain-report-sheet">
    <header className="terrain-report-header"><div><p>候補地・詳細設計前の参考検討</p><h2>{title}</h2><span>{terrainReportTitle(report)}</span></div><span>地形参考図 / {page} of {total}</span></header>
    <div className="terrain-report-body">{children}</div>
    <footer className="terrain-report-footer"><span>{report.position ? `地点 N${report.position.lat.toFixed(6)} / E${report.position.lon.toFixed(6)} · ` : ''}範囲：地図上の参考図形</span><span>取得 {date(analysis.fetchedAt)} / Solar Site Precheck v{report.appVersion || '—'}</span></footer>
  </article>
}

export default function TerrainAreaReport({ report, id = 'terrain-area-report', drawingScale = 1000 }) {
  const analysis = report.terrainArea
  let geometry
  try { geometry = measureParcelReview(report.parcelReview).geometry } catch { geometry = null }
  if (!analysis || !geometry || analysis.geometryKey !== terrainGeometryKey(geometry)) return <p className="report-empty-panel">範囲と地形結果が一致しません。現在の範囲で地形を取得してから出力してください。</p>
  const layoutReport = terrainReportLayouts(analysis, report.terrainPreview)
  const { summary } = analysis
  const notes = terrainReportNotes(report, layoutReport)
  const distribution = terrainSlopeDistribution(analysis)
  const partial = summary.coveragePercent < 100 || distribution.coveragePercent < 100
  const steepPercent = distribution.bins.filter(bin => bin.min >= 20).reduce((sum, bin) => sum + (Number.isFinite(bin.percent) ? bin.percent : 0), 0)
  const interpretation = !Number.isFinite(summary.medianSlope) ? '勾配を確認できる標高点が不足しています。取得範囲を確認して再取得してください。' : summary.medianSlope >= 20 ? '参考範囲には傾斜が広がっています。配置・接道・排水・造成の前提をそろえて、詳細検討へ進めてください。' : summary.medianSlope >= 10 ? '一枚の平地として扱わず、起伏と勾配に合わせた配置を検討してください。' : '勾配が比較的小さい部分があります。局所的な段差と現況を確認して配置を検討してください。'
  return <section className="report-card report-card--print-set terrain-area-report" id={id} aria-label="同じ範囲の等高線・3D地形参考図">
    <Sheet title="等高線・勾配と検討範囲" report={report} analysis={analysis} page={1} total={layoutReport.totalPages}>
      <div className="terrain-report-plan-layout"><div className="terrain-report-main-figure"><TerrainAreaPlan analysis={analysis} position={report.position} reportTitle={terrainReportTitle(report)} reportMode compactReport noteRef="注1" /></div><aside className="terrain-report-findings">
        <h3>範囲内の参考値</h3><dl className="terrain-report-values">
          <div><dt>図形面積</dt><dd>{number(summary.polygonAreaM2, 0)} m²</dd></div>
          <div><dt>敷地標高 最低点–最高点</dt><dd>{Number.isFinite(summary.minElevation)&&Number.isFinite(summary.maxElevation)?`${number(summary.minElevation)}–${number(summary.maxElevation)} m`:'確認不可'}</dd></div>
          <div><dt>高低差</dt><dd>{Number.isFinite(summary.minElevation)&&Number.isFinite(summary.maxElevation)?`${number(summary.maxElevation-summary.minElevation)} m`:'確認不可'}</dd></div>
          <div><dt>局所勾配 中央値</dt><dd>{number(summary.medianSlope)}°</dd></div>
          <div><dt>局所勾配 上位10%の境目</dt><dd>{number(summary.p90Slope)}°</dd></div>
        </dl>
        <p className="terrain-report-observation">{interpretation}</p>
        <h3>勾配の分布</h3><table className="terrain-report-bins"><thead><tr><th>セル勾配（範囲面積比）</th><th>割合 / 推定面積</th></tr></thead><tbody>{distribution.bins.map(bin => <tr key={bin.min}><th>{bin.max === null ? `${bin.min}°以上` : `${bin.min}–${bin.max}°未満`}</th><td>{Number.isFinite(bin.percent) ? `${number(bin.percent)}%` : '未計算'} / {formatTerrainSlopeArea(bin.areaM2)}</td></tr>)}<tr><th>未確認 / NoData</th><td>{number(distribution.unknownPercent)}% / {formatTerrainSlopeArea(distribution.unknownAreaM2)}</td></tr></tbody></table>
        <p className="terrain-report-distribution-summary">有効範囲（除外後）：{formatTerrainSlopeArea(distribution.totalAreaM2)}{(distribution.unknownAreaM2 === null || distribution.unknownAreaM2 > 0) && ` / 未計算：${formatTerrainSlopeArea(distribution.unknownAreaM2)}`}</p>
        <p className="terrain-report-distribution-note">勾配確認 {number(distribution.coveragePercent)}% · 五区分＋未確認＝100%。セル交差面積・欠測：注1</p>
        {Number.isFinite(summary.medianSlope) && <p>20°以上の参考割合：約{number(steepPercent)}%。注1</p>}
        {partial && <p className="terrain-report-warning">取得できた範囲：標高 {number(summary.coveragePercent)}% / 勾配 {number(distribution.coveragePercent)}%。欠測を除いた参考値であり、範囲全体の確定値ではありません。</p>}
      </aside></div>
      <div className="terrain-report-bottom-note"><strong>範囲の扱い</strong><span>範囲・出典・計算条件は最終ページ（注1）を参照。</span></div>
    </Sheet>
    <Sheet title={layoutReport.current ? "実DEM地形と参考配置の比較" : "実DEMの3D地形"} report={report} analysis={analysis} page={2} total={layoutReport.totalPages}>
      {layoutReport.current ? <TerrainLayoutReport analysis={analysis} position={report.position} layout={layoutReport.current} fence={layoutReport.fence} reportTitle={terrainReportTitle(report)} /> : <><div className="terrain-report-3d-layout"><div><TerrainArea3D analysis={analysis} position={report.position} azimuth={35} reportMode compactReport noteRef="注1・2" /></div><div><TerrainArea3D analysis={analysis} position={report.position} azimuth={145} reportMode compactReport noteRef="注1・2" /></div></div><p className="terrain-report-note-reference">固定視点 35° / 145° · 高さ1:1 · 資料・計算と確認事項：注1・2（最終ページ）</p></>}
    </Sheet>
    {layoutReport.comparison && <Sheet title="地形勾配15° / 20°の同条件比較" report={report} analysis={analysis} page={3} total={layoutReport.totalPages}><TerrainLayoutReport analysis={analysis} position={report.position} comparison={layoutReport.comparison} comparisonFences={layoutReport.comparisonFences} reportTitle={terrainReportTitle(report)} /></Sheet>}
    {report.simpleReview && <Sheet title="シンプル解析の取得結果・適用値" report={report} analysis={analysis} page={layoutReport.totalPages-1} total={layoutReport.totalPages}><dl className="simple-report-values">{simpleReviewReportRows(report.simpleReview).map(([key,value],i)=><div key={i}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></Sheet>}
    <Sheet title="注記・計算条件" report={report} analysis={analysis} page={layoutReport.totalPages} total={layoutReport.totalPages}>
      <div className="terrain-report-footnotes">{notes.map(note => <section key={note.id} className="terrain-report-footnote" data-note={note.id}><h3>注{note.id}　{note.title}</h3><p>{note.body}</p></section>)}</div>
    </Sheet>
    {layoutReport.current && <TerrainDrawingPair analysis={analysis} layout={layoutReport.current} fence={layoutReport.fence} parcels={report.parcelReview.parcels} drawingScale={drawingScale} />}
  </section>
}
