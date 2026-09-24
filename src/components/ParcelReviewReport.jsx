import { useId } from 'react'
import './parcel-review-report.css'

function hasReviewGeometry(review) {
  return !!(review?.boundary || review?.exclusions?.length || review?.parcels?.some((entry) => entry.geometry))
}

function listPages(review) {
  const pages = []
  let page = [], lines = 0
  for (const entry of review?.parcels || []) {
    const address = [entry.info?.municipality, entry.info?.area].filter(Boolean).join(' ')
    // Eight normal entries per page; unusually long evidence text gets more space.
    const rowLines = Math.max(3, Math.ceil(address.length / 23), Math.ceil((entry.info?.number || '').length / 11), Math.ceil((entry.source?.fileName || '').length / 25) + Math.ceil((entry.info?.mapType || '').length / 25) + 3)
    if (page.length && (page.length >= 8 || lines + rowLines > 44)) { pages.push(page); page = []; lines = 0 }
    page.push(entry)
    lines += rowLines
  }
  if (page.length) pages.push(page)
  return pages
}

export function parcelReviewReportPageCount(review) {
  return hasReviewGeometry(review) ? 1 + listPages(review).length : 0
}

function geometryRings(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates || []
  if (geometry?.type === 'MultiPolygon') return (geometry.coordinates || []).flat()
  return []
}

function dateLabel(value) {
  const date = new Date(value)
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '日時未記録'
}

function areaLabel(value) {
  return Number.isFinite(value) ? value.toLocaleString('ja-JP', { maximumFractionDigits: 1 }) : '—'
}

function MiniGeometryMap({ review, position }) {
  const titleId = useId()
  const descriptionId = useId()
  const shapes = [
    ...(review.parcels || []).map((entry) => ({ key: entry.id, geometry: entry.geometry, kind: entry.role === 'reference' ? 'reference' : 'target' })),
    ...(review.boundary ? [{ key: 'boundary', geometry: review.boundary, kind: 'boundary' }] : []),
    ...(review.exclusions || []).map((geometry, index) => ({ key: `exclusion-${index}`, geometry, kind: 'exclusion' })),
  ]
  const points = shapes.flatMap(({ geometry }) => geometryRings(geometry).flat()).filter((point) => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite))
  if (!points.length) return <p className="parcel-report-note">表示できる境界図形がありません。</p>
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity
  for (const [lon, lat] of points) { west = Math.min(west, lon); east = Math.max(east, lon); south = Math.min(south, lat); north = Math.max(north, lat) }
  const middleLat = (south + north) / 2
  const lonScale = Math.cos(middleLat * Math.PI / 180)
  const width = 720, height = 300, padding = 26
  const xSpan = Math.max((east - west) * lonScale, 1e-8), ySpan = Math.max(north - south, 1e-8)
  const scale = Math.min((width - padding * 2) / xSpan, (height - padding * 2) / ySpan)
  const project = ([lon, lat]) => [width / 2 + (lon - (west + east) / 2) * lonScale * scale, height / 2 - (lat - middleLat) * scale]
  const pathFor = (geometry) => geometryRings(geometry).map((ring) => ring.map((point, index) => `${index ? 'L' : 'M'}${project(point).map((value) => value.toFixed(2)).join(' ')}`).join(' ') + ' Z').join(' ')
  const hasPosition = Number.isFinite(position?.lat) && Number.isFinite(position?.lon)
  const selectedPoint = hasPosition ? project([position.lon, position.lat]) : null
  const pointVisible = selectedPoint && selectedPoint[0] >= 8 && selectedPoint[0] <= width - 8 && selectedPoint[1] >= 8 && selectedPoint[1] <= height - 8

  return <figure className="parcel-report-map">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>対象・参考の筆、検討範囲と除外範囲の概略図</title>
      <desc id={descriptionId}>北を上にした経緯度の概略表示。黄色は対象、青い破線は参考、緑は検討範囲、赤い破線は除外範囲。赤い点は計算地点です。背景地図・測量図ではありません。</desc>
      <rect x="0" y="0" width={width} height={height} rx="8" fill="#f7f9f6" />
      {shapes.map(({ key, geometry, kind }) => <path key={key} d={pathFor(geometry)} className={`parcel-report-shape parcel-report-shape--${kind}`} fillRule="evenodd" clipRule="evenodd" />)}
      {pointVisible && <g transform={`translate(${selectedPoint[0]}, ${selectedPoint[1]})`}><circle r="6" fill="#ab3434" stroke="#fff" strokeWidth="2" /><path d="M-10 0 H10 M0 -10 V10" stroke="#ab3434" strokeWidth="1.5" /></g>}
      <g transform="translate(690 22)" fill="#385446"><text textAnchor="middle" fontSize="11" y="0">N</text><path d="M0 7 L-5 21 L0 17 L5 21 Z" /></g>
    </svg>
    <figcaption>北上・概略図。背景地図は省略。図形の位置精度は原資料に依存します。{hasPosition && !pointVisible ? ' 計算地点は図の範囲外です。' : !hasPosition ? ' 計算地点は未指定です。' : ''}</figcaption>
    <div className="parcel-report-legend"><span><i className="is-target" />対象</span><span><i className="is-reference" />参考</span><span><i className="is-boundary" />検討範囲</span><span><i className="is-exclusion" />除外</span><span><i className="is-position" />計算地点</span></div>
  </figure>
}

function ParcelReportPage({ page, title, subtitle, children, list = false }) {
  return <article className={`report-print-page parcel-report-page${list ? ' parcel-report-page--list' : ''}`}>
    <header className="report-page-header"><div><p className="eyebrow">候補地 簡易分析レポート</p><h2>{title}</h2><p>{subtitle}</p></div><span className="report-page-number">{page}</span></header>
    <div className="report-page-body">{children}</div>
  </article>
}

export default function ParcelReviewReport({ review, metrics, position, startPage = 5 }) {
  if (!hasReviewGeometry(review)) return null
  const pages = listPages(review)
  const targetCount = (review.parcels || []).filter((entry) => entry.role === 'target').length
  const referenceCount = (review.parcels || []).filter((entry) => entry.role === 'reference').length
  const rowNumbers = new Map((review.parcels || []).map((entry, index) => [entry.id, index + 1]))

  return <>
    <ParcelReportPage page={startPage} title="筆界・検討範囲" subtitle={`対象 ${targetCount}筆 ／ 参考 ${referenceCount}筆 ／ 除外 ${(review.exclusions || []).length}範囲`}>
      <MiniGeometryMap review={review} position={position} />
      <dl className="parcel-report-metrics">
        {[['対象筆の図形', metrics?.targetAreaM2], ['検討範囲', metrics?.reviewAreaM2], ['除外分', metrics?.excludedAreaM2], ['有効範囲', metrics?.usableAreaM2]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{areaLabel(value)} <small>m²</small></dd></div>)}
      </dl>
      <div className="parcel-report-conditions">
        <h3>面積の採用条件</h3>
        <p>{review.boundary ? targetCount ? '対象筆と手描きの検討範囲の共通部分を採用。' : '対象筆がないため、手描きの検討範囲を採用。' : '検討範囲未指定のため、対象筆の図形を採用。'}参考の筆は面積に含みません。重複は二重に数えず、除外範囲と重なる部分を控除します。</p>
        <p>図形面積の概算です。登記面積・確定境界・設置可能面積を保証しません。作図範囲は利用者が指定した検討条件です。敷地利用・離隔・工事条件を別途確認してください。</p>
        <h3>計算地点と発電量の扱い</h3>
        <p>{Number.isFinite(position?.lat) && Number.isFinite(position?.lon) ? `計算地点：北緯 ${position.lat.toFixed(6)} / 東経 ${position.lon.toFixed(6)}。` : '計算地点は未指定です。'}1地点の地形・発電量は筆全体を代表するとは限りません。面積から設備容量・発電量は自動確定していません。</p>
        <h3>出典・保存範囲</h3>
        <p>{pages.length ? '地番・所在地・出典ファイル・読込日時は次ページ以降の選択筆一覧に記載します。' : '選択された原資料の筆はありません。検討・除外範囲は利用者による作図です。'}原資料の境界・基準日・座標系は原本で確認してください。GEONEXでの外部確認結果は自動取得していません。</p>
      </div>
    </ParcelReportPage>
    {pages.map((entries, pageIndex) => <ParcelReportPage key={`parcel-list-${pageIndex}`} page={startPage + 1 + pageIndex} title="選択筆一覧・出典" subtitle={`一覧 ${pageIndex + 1} / ${pages.length} · 全 ${(review.parcels || []).length}筆`} list>
      <table className="parcel-report-table"><caption>対象と参考の区分・原資料の記録（読込日時は日本時間）</caption><colgroup><col className="parcel-report-col-index" /><col className="parcel-report-col-role" /><col className="parcel-report-col-number" /><col className="parcel-report-col-address" /><col className="parcel-report-col-source" /></colgroup><thead><tr><th scope="col">No.</th><th scope="col">区分</th><th scope="col">地番</th><th scope="col">所在地</th><th scope="col">出典ファイル / 読込日時</th></tr></thead><tbody>
        {entries.map((entry) => <tr key={entry.id}><td data-label="No.">{rowNumbers.get(entry.id)}</td><td data-label="区分">{entry.role === 'reference' ? '参考' : '対象'}</td><td data-label="地番">{entry.info?.number || '未記載'}</td><td data-label="所在地">{[entry.info?.municipality, entry.info?.area].filter(Boolean).join(' ') || '未記載'}</td><td data-label="出典・読込日時"><span>{entry.source?.fileName || 'ファイル名未記載'}</span><small>{dateLabel(entry.source?.importedAt)}</small>{entry.info?.mapType && <small>資料表記：{entry.info.mapType}</small>}</td></tr>)}
      </tbody></table>
      <p className="parcel-report-note">「所在地」は住所の文字列であり、面積の値ではありません。対象・参考の区分は利用者の検討条件です。所有権・利用権・境界確定を示すものではありません。</p>
    </ParcelReportPage>)}
  </>
}
