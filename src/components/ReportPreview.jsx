import { productionFactor } from '../services/nedo.js'
import { toDegreeMinutes } from '../utils/coordinates.js'
import { snowRateLevel } from '../utils/snowRates.js'
import { evaluateSiteVerdict, primaryVerdictReasons } from '../utils/verdict.js'
import HorizonGraphPreview from './HorizonGraphPreview.jsx'
import TerrainSectionPreview from './TerrainSectionPreview.jsx'

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

function ValueRow({ label, children, wide = false, hint = '' }) {
  const hasHint = Boolean(hint)
  return (
    <div
      className={`report-value ${wide ? 'report-value--wide' : ''} ${hasHint ? 'report-value--hinted' : ''}`}
      title={hint || undefined}
      aria-label={hasHint ? `${label}。${hint}` : undefined}
    >
      <dt>{label}</dt>
      <dd>{children || '—'}</dd>
    </div>
  )
}

function ReportPage({ page, title, subtitle, children, className = '' }) {
  return (
    <article className={`report-print-page ${className}`}>
      <header className="report-page-header">
        <div>
          <p className="eyebrow">候補地 簡易分析レポート</p>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <span className="report-page-number">{page}</span>
      </header>
      <div className="report-page-body">{children}</div>
    </article>
  )
}

function demReliabilityLabel(source = '') {
  if (/DEM5|5A|5B|5C|レーザ|航空レーザ/.test(source)) {
    return { level: 'high', label: '◎ レーザ測量5m相当', note: '地形断面・地平線の概算に比較的使いやすい標高ソースです。' }
  }
  if (/DEM10|10m|DEM標高タイル|基盤地図情報/.test(source)) {
    return { level: 'medium', label: '△ 10mメッシュ相当', note: '山林・急傾斜地では断面・地平線を参考値として扱ってください。' }
  }
  if (/未取得|手動|—/.test(source)) {
    return { level: 'unknown', label: '— 未取得', note: '標高取得後に精度を確認できます。' }
  }
  return { level: 'unknown', label: '△ 出典確認', note: '取得元の表記を確認してください。' }
}

function collectDemSources(report) {
  const sources = []
  if (report.elevationSource) sources.push(report.elevationSource)
  for (const sample of report.terrain?.samples || []) {
    for (const point of sample.profile || []) {
      if (point.source) sources.push(point.source)
    }
  }
  for (const line of report.terrainSection?.lines || []) {
    for (const point of line.points || []) {
      if (point.source) sources.push(point.source)
    }
  }
  return sources
}

function demSourceSummary(report) {
  const sources = collectDemSources(report)
  const total = sources.length
  const dem5 = sources.filter((source) => /DEM5|5A|5B|5C|レーザ|航空レーザ/.test(source)).length
  const dem10 = sources.filter((source) => /DEM10|10m|DEM標高タイル|基盤地図情報/.test(source)).length
  const unknown = Math.max(0, total - dem5 - dem10)
  const primary = demReliabilityLabel(report.elevationSource)
  const detail = total
    ? `DEM5系 ${dem5}点 / DEM10系 ${dem10}点${unknown ? ` / その他 ${unknown}点` : ''}`
    : '地平線・断面を再分析するとDEM内訳を表示できます。'
  const shouldWarn = total > 0 && dem10 / total >= 0.5
  return { ...primary, total, dem5, dem10, unknown, detail, shouldWarn }
}

function SnowCompactTable({ station, snowBase }) {
  if (!station?.snow10cm?.monthly?.length) return <p className="report-empty-panel">NEDO積雪データは未取得です。</p>
  const groups = [0, 4, 8]
  return (
    <table className="snow-table snow-table--report snow-table--compact-report">
      <thead>
        <tr>
          {groups.map((start) => (
            <th key={start} colSpan="3">{MONTHS[start]}〜{MONTHS[start + 3]}</th>
          ))}
        </tr>
        <tr>
          {groups.map((start) => (
            <FragmentHeader key={start} />
          ))}
        </tr>
      </thead>
      <tbody>
        {[0, 1, 2, 3].map((offset) => (
          <tr key={offset}>
            {groups.map((start) => {
              const index = start + offset
              const rate = station.snow10cm.monthly[index]
              return (
                <FragmentRow key={index} month={MONTHS[index]} rate={rate} factor={productionFactor(snowBase, rate)} />
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function FragmentHeader() {
  return (
    <>
      <th>月</th>
      <th>出現率</th>
      <th>係数</th>
    </>
  )
}

function FragmentRow({ month, rate, factor }) {
  return (
    <>
      <th>{month}</th>
      <SnowRateCell rate={rate} />
      <td><strong>{factor.toFixed(2)}</strong></td>
    </>
  )
}

export default function ReportPreview({ report }) {
  const terrain = report.terrain
  const station = report.snowStation
  const solarReference = report.solarReference
  const reportTitle = report.siteName || report.placeLabel || '名称未入力の候補地'
  const demSummary = demSourceSummary(report)
  const verdict = evaluateSiteVerdict({
    position: report.position,
    terrain,
    solarReference,
    snowStation: station,
    meshBoundary: report.meshBoundary,
    demSummary,
    terrainSection: report.terrainSection,
  })
  const verdictReasons = primaryVerdictReasons(verdict, 3)
  const buildDate = report.buildDate || '—'
  const appVersion = report.appVersion || '—'
  const editHints = {
    siteName: '2. 候補地情報確認の「候補地名」で編集できます。',
    parcel: '地番ファイルを読み込み、地図上の筆界クリックまたは地番検索で選択できます。',
    memo: '2. 候補地情報確認の「候補地メモ」で編集できます。',
    fieldMemo: '2. 候補地情報確認の「現地確認メモ」で編集できます。',
  }

  return (
    <section className="report-card report-card--print-set" id="report-preview">
      <ReportPage page="1" title="候補地チェックレポート" subtitle={reportTitle} className="report-cover-page">
        <div className="report-cover-layout">
          <div>
            <p className="report-cover-kicker">Solar Site Precheck</p>
            <h3 className="report-title-hint" title={editHints.siteName}>{reportTitle}</h3>
            {report.siteName && report.placeLabel && report.siteName !== report.placeLabel && (
              <p className="report-card__place">選択地点：{report.placeLabel}</p>
            )}
            <p>地形・地平線・積雪をSolar Pro入力前に確認するための一次検討レポートです。</p>
          </div>
          <dl className="report-cover-summary">
            <div><dt>用途</dt><dd>候補地の一次確認</dd></div>
            <div><dt>一次確認</dt><dd><span className={`verdict-badge verdict-badge--${verdict.status}`}>{verdict.label}</span></dd></div>
            <div><dt>3次メッシュ</dt><dd>{report.expectedSnowMesh || '—'}</dd></div>
            <div><dt>作成</dt><dd>Solar Site Precheck v{appVersion}</dd></div>
          </dl>
        </div>
        <div className={`report-verdict report-verdict--${verdict.status}`}>
          <strong>Solar Pro入力前の一次確認</strong>
          <span>{verdict.summary}</span>
          {verdictReasons.length > 0 && (
            <ul>
              {verdictReasons.map((reason) => (
                <li key={`${reason.title}-${reason.detail}`}>
                  <b>{reason.title}</b>{reason.detail ? `：${reason.detail}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
        <dl className="report-grid report-grid--two-col report-grid--cover-data">
          <ValueRow label="緯度（度・分）">{report.position ? toDegreeMinutes(report.position.lat, 'lat') : '—'}</ValueRow>
          <ValueRow label="経度（度・分）">{report.position ? toDegreeMinutes(report.position.lon, 'lon') : '—'}</ValueRow>
          <ValueRow label="候補地点3次メッシュ">{report.expectedSnowMesh || '—'}</ValueRow>
          <ValueRow label="メッシュ境界距離">{report.meshBoundary ? `約${Math.round(report.meshBoundary.minDistanceMeters)}m` : '—'}</ValueRow>
          <ValueRow label="標高">{Number.isFinite(report.elevation) ? `${report.elevation.toFixed(1)} m` : '未取得'}</ValueRow>
          <ValueRow label="標高データ">{report.elevationSource}</ValueRow>
          <ValueRow label="標高精度">{<span className={`dem-quality dem-quality--${demSummary.level}`}>{demSummary.label}</span>}</ValueRow>
          <ValueRow label="想定樹高">{`${report.obstructionHeight.toFixed(1)} m`}</ValueRow>
          <ValueRow label="地番" hint={editHints.parcel}>{report.parcel?.number || '未選択'}</ValueRow>
          <ValueRow label="地番所在地" hint={editHints.parcel}>{report.parcel ? [report.parcel.municipality, report.parcel.area].filter(Boolean).join(' ') : '—'}</ValueRow>
          <ValueRow label="候補地メモ" wide hint={editHints.memo}>{report.memo}</ValueRow>
          <ValueRow label="現地確認メモ" wide hint={editHints.fieldMemo}>{report.fieldMemo}</ValueRow>
        </dl>
        {report.meshBoundary?.isNearBoundary && (
          <div className="report-alert report-alert--watch">
            <strong>3次メッシュ境界付近</strong>
            <span>候補地点は3次メッシュ境界まで約{Math.round(report.meshBoundary.minDistanceMeters)}mです。積雪出現率は隣接メッシュで変わる可能性があります。</span>
          </div>
        )}
      </ReportPage>

      <ReportPage page="2" title="太陽軌道・地平線グラフ" subtitle="冬至9〜15時の太陽高度と、DEM地平線角度の比較">
        <div className="report-visual-panel report-visual-panel--single">
          {terrain ? (
            <HorizonGraphPreview
              position={report.position}
              terrain={terrain}
              solarReference={solarReference}
              reportMode
            />
          ) : (
            <div className="report-empty-panel">地平線グラフは未分析です。</div>
          )}
        </div>
        {solarReference && (
          <div className={`report-alert report-alert--${solarReference.status}`}>
            <strong>太陽高度比較</strong>
            <span>{solarReference.message}</span>
          </div>
        )}
      </ReportPage>

      <ReportPage page="3" title="候補地周辺断面" subtitle="東西・南北100m断面">
        <div className="report-visual-panel report-visual-panel--single report-section-page">
          {report.terrainSection ? (
            <TerrainSectionPreview analysis={report.terrainSection} forceSlopeDetails reportMode />
          ) : (
            <div className="report-empty-panel">周辺100m断面は未取得です。</div>
          )}
        </div>
      </ReportPage>

      <ReportPage page="4" title="NEDOデータ・出典・計算条件" subtitle="積雪補正値と採用データの確認">
        <div className="report-data-block report-data-block--compact">
          <h3>NEDO MONSOLA-11 積雪深10cm以上の出現率・発電量係数</h3>
          {station ? (
            <>
              <p className="report-source-line">
                {station.name} / 北緯 {station.latDeg}度 {station.latMin.toFixed(1)}分 / 東経 {station.lonDeg}度 {station.lonMin.toFixed(1)}分 / 標高 {Number.isFinite(station.elevation) ? `${station.elevation}m` : 'PDF読取未確定'}
              </p>
              <SnowCompactTable station={station} snowBase={report.snowBase} />
              <p className="formula-note formula-note--with-legend">
                <span className="formula-note__main">発電量係数 = {report.snowBase.toFixed(2)} − 積雪深10cm以上の出現率</span>
                <span className="formula-note__legend"><span className="snow-legend__notice">0.01以上</span> は着色、<strong className="snow-legend__alert">0.50以上は ❄ 積雪注意</strong></span>
              </p>
            </>
          ) : (
            <p className="report-empty-panel">NEDO積雪データは未取得です。</p>
          )}
        </div>

        <div className="report-data-block report-source-block">
          <h3>データ出典・計算条件</h3>
          <dl>
            <div>
              <dt>標高</dt>
              <dd>{report.elevationSource || '未取得'} / 取得 {buildDate}</dd>
            </div>
            <div>
              <dt>標高精度</dt>
              <dd><span className={`dem-quality dem-quality--${demSummary.level}`}>{demSummary.label}</span> <small>{demSummary.detail}</small></dd>
            </div>
            <div>
              <dt>積雪・日射</dt>
              <dd>NEDO MONSOLA-11（1981–2009年平年値）{report.expectedSnowMesh ? ` / 3次メッシュ ${report.expectedSnowMesh}` : ''}</dd>
            </div>
            <div>
              <dt>座標・地番</dt>
              <dd>緯度経度表示。登記所備付地図データはファイル定義の平面直角座標系に基づき変換。</dd>
            </div>
            <div>
              <dt>計算</dt>
              <dd>Solar Site Precheck v{appVersion} / DEM点サンプリング概算 / 想定樹高 {report.obstructionHeight.toFixed(1)}m</dd>
            </div>
          </dl>
          {demSummary.shouldWarn && (
            <p className="report-source-warning">※ 地平線・断面の取得点で10mメッシュ相当のDEMが多いため、山林・急傾斜地では現地確認や詳細測量で補正してください。</p>
          )}
        </div>
        <p className="report-note">
          ※ 地平線は国土地理院DEMによる概算です。積雪値は候補地点と同じ3次メッシュのNEDO値だけを採用し、最寄り観測地点の参考値は係数計算から除外しています。
        </p>
      </ReportPage>
    </section>
  )
}
