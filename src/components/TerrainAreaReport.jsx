import { TerrainAreaPlan, TerrainArea3D } from './TerrainAreaFigures.jsx'
import { terrainGeometryKey } from '../utils/terrainArea.js'
import { measureParcelReview } from '../utils/parcelReview.js'
import './terrain-area-report.css'

const number = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString('ja-JP', { maximumFractionDigits: digits }) : '—'
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '未記録'

function Sheet({ title, report, analysis, page, children }) {
  return <article className="report-print-page terrain-report-sheet">
    <header className="terrain-report-header"><div><p>候補地・詳細設計前の参考検討</p><h2>{title}</h2><span>{report.siteName || report.placeLabel || '検討範囲'}</span></div><span>地形参考図 / {page} of 2</span></header>
    <div className="terrain-report-body">{children}</div>
    <footer className="terrain-report-footer"><span>{report.position ? `地点 N${report.position.lat.toFixed(6)} / E${report.position.lon.toFixed(6)} · ` : ''}範囲：地図上の参考図形</span><span>取得 {date(analysis.fetchedAt)} / Solar Site Precheck v{report.appVersion || '—'}</span></footer>
  </article>
}

export default function TerrainAreaReport({ report }) {
  const analysis = report.terrainArea
  let geometry
  try { geometry = measureParcelReview(report.parcelReview).geometry } catch { geometry = null }
  if (!analysis || !geometry || analysis.geometryKey !== terrainGeometryKey(geometry)) return <p className="report-empty-panel">範囲と地形結果が一致しません。現在の範囲で地形を取得してから出力してください。</p>
  const { summary, grid, source } = analysis
  const layers = source.layers || []
  // Keep the fixed two-sheet terrain drawing bounded. Full notes stay in the
  // candidate check report/record; don't silently let them add overflow pages.
  const memoExcerpt = report.fieldMemo?.replace(/\s+/g, ' ').slice(0, 180)
  const partial = summary.coveragePercent < 100 || summary.slopeCoveragePercent < 100
  const steepPercent = summary.slopeBins.filter(bin => bin.min >= 20).reduce((sum, bin) => sum + (Number.isFinite(bin.percent) ? bin.percent : 0), 0)
  const interpretation = !Number.isFinite(summary.medianSlope) ? '勾配を確認できる標高点が不足しています。取得範囲を確認して再取得してください。' : summary.medianSlope >= 20 ? '参考範囲には傾斜が広がっています。配置・接道・排水・造成の前提をそろえて、詳細検討へ進めてください。' : summary.medianSlope >= 10 ? '一枚の平地として扱わず、起伏と勾配に合わせた配置を検討してください。' : '勾配が比較的小さい部分があります。局所的な段差と現況を確認して配置を検討してください。'
  return <section className="report-card report-card--print-set terrain-area-report" id="terrain-area-report" aria-label="同じ範囲の等高線・3D地形参考図">
    <Sheet title="等高線・勾配と検討範囲" report={report} analysis={analysis} page={1}>
      <div className="terrain-report-plan-layout"><div className="terrain-report-main-figure"><TerrainAreaPlan analysis={analysis} position={report.position} reportMode /></div><aside className="terrain-report-findings">
        <h3>範囲内の参考値</h3><dl className="terrain-report-values">
          <div><dt>図形面積</dt><dd>{number(summary.polygonAreaM2, 0)} m²</dd></div>
          <div><dt>標高 最低–最高</dt><dd>{number(summary.minElevation)}–{number(summary.maxElevation)} m</dd></div>
          <div><dt>高低差</dt><dd>{number(summary.heightRange)} m</dd></div>
          <div><dt>局所勾配 中央値</dt><dd>{number(summary.medianSlope)}°</dd></div>
          <div><dt>局所勾配 上位10%の境目</dt><dd>{number(summary.p90Slope)}°</dd></div>
        </dl>
        <p className="terrain-report-observation">{interpretation}</p>
        <h3>勾配の分布</h3><table className="terrain-report-bins"><thead><tr><th>10m幅で見た局所勾配</th><th>割合</th></tr></thead><tbody>{summary.slopeBins.map(bin => <tr key={bin.min}><th>{bin.max === 90 ? `${bin.min}°以上` : `${bin.min}–${bin.max}°未満`}</th><td>{Number.isFinite(bin.percent) ? `${number(bin.percent)}%` : '未計算'}</td></tr>)}</tbody></table>
        <p>割合は勾配を計算できた範囲内の格子点が分母です。登記面積を分母にした値ではありません。</p>
        {Number.isFinite(summary.medianSlope) && <p>20°以上の参考割合：約{number(steepPercent)}%。色分けは施工可否の判定基準ではありません。</p>}
        {partial && <p className="terrain-report-warning">取得できた範囲：標高 {number(summary.coveragePercent)}% / 勾配 {number(summary.slopeCoveragePercent)}%。欠測を除いた参考値であり、範囲全体の確定値ではありません。</p>}
      </aside></div>
      <div className="terrain-report-bottom-note"><strong>範囲の扱い</strong><span>対象筆と指定範囲の共通部分から除外分を引いた図形を、平面・3D・集計で共通使用。参考の筆は集計しません。黄色線は測量で確認した筆界ではありません。</span></div>
    </Sheet>
    <Sheet title="実DEMの3D地形と確認事項" report={report} analysis={analysis} page={2}>
      <div className="terrain-report-3d-layout"><div><TerrainArea3D analysis={analysis} position={report.position} azimuth={35} reportMode /></div><div><TerrainArea3D analysis={analysis} position={report.position} azimuth={145} reportMode /></div></div>
      <div className="terrain-report-evidence-layout"><section><h3>使用資料と計算条件</h3><dl className="terrain-report-evidence">
        <div><dt>標高資料</dt><dd><a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院 標高タイル</a>{source.mixed ? '（資料混在）' : ''}<br />{layers.map(layer => `${layer.label} / 原資料${layer.nativeResolutionMeters}m級`).join('、')}</dd></div>
        <div><dt>計算方法</dt><dd>表示・集計格子 {grid.step}m / 勾配は東西・南北10m幅の中央差分 / 等高線2m、太線10m / 3D高さ強調なし（1:1）</dd></div>
        <div><dt>立体の底面</dt><dd>側面・底面は高さを見やすくする表示用です。地下構造・地層・造成量は示しません。</dd></div>
        <div><dt>精度と欠測</dt><dd>補間と表示の間隔は測量精度ではありません。欠測や除外範囲は埋めず、異なる標高資料の境目には勾配差が出る可能性があります。</dd></div>
      </dl></section><section><h3>詳細検討へ渡す確認事項</h3><ul><li>境界・資料記載面積と図形面積の照合</li><li>接道、入口の段差、搬入経路、局所的な法面・擁壁</li><li>樹木・建物、地盤、排水、造成後の現況</li><li>勾配に合わせた配置・基礎・必要な造成の検討</li></ul><p>造成量、設置可能容量、施工可否は未判定です。現地測量・配置検討・詳細設計の前に使う参考図です。</p>{memoExcerpt && <p className="terrain-report-field-memo">現地メモ（抜粋）：{memoExcerpt}{report.fieldMemo.replace(/\s+/g, ' ').length > 180 && '…（180文字まで抜粋。全文はアプリの現地確認メモを参照）'}</p>}</section></div>
    </Sheet>
  </section>
}
