import { productionFactor } from '../services/nedo.js'
import { toDegreeMinutes } from '../utils/coordinates.js'
import { snowRateLevel } from '../utils/snowRates.js'

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function SnowRateCell({ rate }) {
  const level = snowRateLevel(rate)
  return (
    <td className={`snow-rate-cell snow-rate-cell--${level}`}>
      <span className="snow-rate-cell__value">{rate.toFixed(2)}</span>
      {level === 'alert' && <span className="snow-rate-cell__mark" title="積雪注意">❄ 注意</span>}
    </td>
  )
}

function ValueRow({ label, children, wide = false }) {
  return (
    <div className={`report-value ${wide ? 'report-value--wide' : ''}`}>
      <dt>{label}</dt>
      <dd>{children || '—'}</dd>
    </div>
  )
}

export default function ReportPreview({ report, memoText }) {
  const terrain = report.terrain
  const station = report.snowStation
  const riskClass = terrain ? `risk risk--${terrain.risk}` : 'risk'
  const solarReference = report.solarReference

  return (
    <section className="report-card" id="report-preview">
      <div className="report-card__header">
        <div>
          <p className="eyebrow">候補地チェックレポート</p>
          <h2>{report.siteName || '名称未入力の候補地'}</h2>
        </div>
        <span className="draft-badge">一次検討</span>
      </div>

      <dl className="report-grid">
        <ValueRow label="緯度（度・分）">{report.position ? toDegreeMinutes(report.position.lat, 'lat') : '—'}</ValueRow>
        <ValueRow label="経度（度・分）">{report.position ? toDegreeMinutes(report.position.lon, 'lon') : '—'}</ValueRow>
        <ValueRow label="候補地点3次メッシュ">{report.expectedSnowMesh || '—'}</ValueRow>
        <ValueRow label="メッシュ境界距離">{report.meshBoundary ? `約${Math.round(report.meshBoundary.minDistanceMeters)}m` : '—'}</ValueRow>
        <ValueRow label="標高">{Number.isFinite(report.elevation) ? `${report.elevation.toFixed(1)} m` : '未取得'}</ValueRow>
        <ValueRow label="標高データ">{report.elevationSource}</ValueRow>
        <ValueRow label="地番">{report.parcel?.number || '未選択'}</ValueRow>
        <ValueRow label="地番区域">{report.parcel ? [report.parcel.municipality, report.parcel.area].filter(Boolean).join(' ') : '—'}</ValueRow>
        <ValueRow label="地平線影響（概算）">{terrain ? <span className={riskClass}>{terrain.risk}</span> : '未分析'}</ValueRow>
        <ValueRow label="最大仰角（概算）">{terrain ? `${terrain.maxAngle.toFixed(1)}°（${terrain.direction}）` : '—'}</ValueRow>
        <ValueRow label="冬至南中太陽高度">{solarReference ? `${solarReference.winterSolsticeNoon.toFixed(1)}°` : '—'}</ValueRow>
        <ValueRow label="太陽高度比較">{solarReference ? <span className={`solar-badge solar-badge--${solarReference.status}`}>{solarReference.label}</span> : '—'}</ValueRow>
        <ValueRow label="想定樹高">{`${report.obstructionHeight.toFixed(1)} m`}</ValueRow>
        <ValueRow label="NEDO参照地点">{station?.name || '未取得'}</ValueRow>
      </dl>

      {solarReference && (
        <div className={`report-alert report-alert--${solarReference.status}`}>
          <strong>地平線と冬至南中太陽高度の比較</strong>
          <span>{solarReference.message}</span>
        </div>
      )}

      {report.meshBoundary?.isNearBoundary && (
        <div className="report-alert report-alert--watch">
          <strong>3次メッシュ境界付近</strong>
          <span>候補地点は3次メッシュ境界まで約{Math.round(report.meshBoundary.minDistanceMeters)}mです。積雪出現率は隣接メッシュで変わる可能性があるため、必要に応じて隣接メッシュのNEDO値も確認してください。</span>
        </div>
      )}

      <div className="report-data-block">
        <h3>方位別 地平線仰角（地形標高 + 想定樹高 {report.obstructionHeight.toFixed(1)}m）</h3>
        <div className="report-horizon-row">
          {(terrain?.samples || []).map((sample) => (
            <div key={sample.bearing}>
              <span>{sample.bearing}°</span>
              <strong>{Number.isFinite(sample.angle) ? `${sample.angle.toFixed(1)}°` : '—'}</strong>
              <small>{sample.direction}{Number.isFinite(sample.terrainAngle) ? ` / 地形 ${sample.terrainAngle.toFixed(1)}°` : ''}</small>
            </div>
          ))}
          {!terrain && <p>未分析</p>}
        </div>
      </div>

      {station && (
        <div className="report-data-block">
          <h3>NEDO MONSOLA-11 積雪深10cm以上の出現率・発電量係数</h3>
          <p className="report-source-line">
            {station.name} / 北緯 {station.latDeg}度 {station.latMin.toFixed(1)}分 / 東経 {station.lonDeg}度 {station.lonMin.toFixed(1)}分 / 標高 {Number.isFinite(station.elevation) ? `${station.elevation}m` : 'PDF読取未確定'}
          </p>
          <div className="snow-table-wrap">
            <table className="snow-table snow-table--report">
              <thead><tr><th>月</th>{MONTHS.map((month) => <th key={month}>{month}</th>)}</tr></thead>
              <tbody>
                <tr><th>出現率</th>{station.snow10cm.monthly.map((rate, index) => <SnowRateCell key={MONTHS[index]} rate={rate} />)}</tr>
                <tr><th>係数</th>{station.snow10cm.monthly.map((rate, index) => <td key={MONTHS[index]}><strong>{productionFactor(report.snowBase, rate).toFixed(2)}</strong></td>)}</tr>
              </tbody>
            </table>
          </div>
          <p className="formula-note formula-note--with-legend">
            <span className="formula-note__main">発電量係数 = {report.snowBase.toFixed(2)} − 積雪深10cm以上の出現率</span>
            <span className="formula-note__legend"><span className="snow-legend__notice">0.01以上</span> は着色、<strong className="snow-legend__alert">0.50以上は ❄ 積雪注意</strong></span>
          </p>
        </div>
      )}

      <dl className="report-grid report-grid--notes">
        <ValueRow label="候補地メモ" wide>{report.memo}</ValueRow>
        <ValueRow label="現地確認メモ" wide>{report.fieldMemo}</ValueRow>
      </dl>

      <div className="solar-memo">
        <div className="solar-memo__title">Solar Pro 入力用メモ</div>
        <pre>{memoText}</pre>
      </div>

      <p className="report-note">
        ※ 地平線は国土地理院DEMによる概算です。積雪値は候補地点と同じ3次メッシュのNEDO PDFだけを採用し、最寄り観測地点の参考値は係数計算から除外しています。
      </p>
    </section>
  )
}
