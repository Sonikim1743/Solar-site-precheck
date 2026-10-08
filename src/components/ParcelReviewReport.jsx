import { useId, useMemo, useState } from 'react'
import { measureParcelReview } from '../utils/parcelReview.js'
import { terrainGeometryKey } from '../utils/terrainArea.js'
import { parcelReportMapLayout } from '../utils/parcelReportMap.js'
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

function MiniGeometryMap({ review, position, mapRegionLabel }) {
  const titleId = useId()
  const descriptionId = useId()
  const [tileState, setTileState] = useState({ key: '', failed: [], settled: [] })
  const shapes = useMemo(() => [
    ...(review.parcels || []).map((entry) => ({ key: entry.id, geometry: entry.geometry, kind: entry.role === 'reference' ? 'reference' : 'target' })),
    ...(review.boundary ? [{ key: 'boundary', geometry: review.boundary, kind: 'boundary' }] : []),
    ...(review.exclusions || []).map((geometry, index) => ({ key: `exclusion-${index}`, geometry, kind: 'exclusion' })),
  ], [review])
  const layout = useMemo(() => parcelReportMapLayout(shapes.map(shape => shape.geometry)), [shapes])
  if (!layout) return <p className="parcel-report-note">表示できる境界図形がありません。</p>
  const { width, height, project } = layout
  const failedTiles = tileState.key === layout.key ? tileState.failed.length : 0
  const pendingTiles = layout.tiles.length - (tileState.key === layout.key ? tileState.settled.length : 0)
  function tileResult(key, failed) {
    setTileState(previous => {
      const failures = new Set(previous.key === layout.key ? previous.failed : [])
      const settled = new Set(previous.key === layout.key ? previous.settled : [])
      settled.add(key)
      if (failed) failures.add(key); else failures.delete(key)
      return { key: layout.key, failed: [...failures], settled: [...settled] }
    })
  }
  const pathFor = (geometry) => geometryRings(geometry).map((ring) => ring.map((point, index) => `${index ? 'L' : 'M'}${project(point).map((value) => value.toFixed(2)).join(' ')}`).join(' ') + ' Z').join(' ')
  const hasPosition = Number.isFinite(position?.lat) && Number.isFinite(position?.lon)
  const selectedPoint = hasPosition ? project([position.lon, position.lat]) : null
  const pointVisible = selectedPoint && selectedPoint[0] >= 8 && selectedPoint[0] <= width - 8 && selectedPoint[1] >= 8 && selectedPoint[1] <= height - 8

  return <figure className="parcel-report-map">
    {mapRegionLabel && <div className="parcel-report-region">地域：{mapRegionLabel}</div>}
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>標準地図と対象・参考の筆、検討範囲・除外範囲</title>
      <desc id={descriptionId}>北を上にした国土地理院の標準地図に参考図形を重ねています。黄色は対象、青い破線は参考、緑は検討範囲、赤い破線は除外範囲。赤い点は計算地点です。測量境界を示す図ではありません。</desc>
      <rect x="0" y="0" width={width} height={height} rx="8" fill="#f7f9f6" />
      <defs><clipPath id={`${titleId}-viewport`}><rect width={width} height={height} rx="8" /></clipPath></defs>
      <g clipPath={`url(#${titleId}-viewport)`}>{layout.tiles.map(tile => <image key={`${layout.key}/${tile.key}`} href={tile.href} x={tile.x} y={tile.y} width="256" height="256" preserveAspectRatio="none" onError={() => tileResult(tile.key, true)} onLoad={() => tileResult(tile.key, false)} />)}</g>
      {shapes.map(({ key, geometry, kind }) => <path key={key} d={pathFor(geometry)} className={`parcel-report-shape parcel-report-shape--${kind}`} fillRule="evenodd" clipRule="evenodd" />)}
      {pointVisible && <g transform={`translate(${selectedPoint[0]}, ${selectedPoint[1]})`}><circle r="6" fill="#ab3434" stroke="#fff" strokeWidth="2" /><path d="M-10 0 H10 M0 -10 V10" stroke="#ab3434" strokeWidth="1.5" /></g>}
      <g transform="translate(690 22)" fill="#385446"><rect x="-13" y="-14" width="26" height="40" rx="4" fill="#fff" fillOpacity=".85" /><text textAnchor="middle" fontSize="11" y="0">N</text><path d="M0 7 L-5 21 L0 17 L5 21 Z" /></g>
    </svg>
    <figcaption>背景：<a href="https://maps.gsi.go.jp/" target="_blank" rel="noreferrer">国土地理院 標準地図</a>。北上・参考図形の重ね合わせ。位置精度は原資料に依存します。{hasPosition && !pointVisible ? ' 計算地点は図の範囲外です。' : !hasPosition ? ' 計算地点は未指定です。' : ''}</figcaption>
    {pendingTiles > 0 && <p className="parcel-report-note" role="status">背景地図を読み込み中です。表示を確認してから印刷してください。</p>}
    {failedTiles > 0 && <p className="parcel-report-map-warning" role="status">{failedTiles === layout.tiles.length ? '背景地図を取得できません。' : '背景地図の一部を取得できません。'}範囲線は表示しています。通信を確認し、背景が表示されてから印刷してください。</p>}
    <div className="parcel-report-legend"><span><i className="is-target" />対象</span><span><i className="is-reference" />参考</span><span><i className="is-boundary" />検討範囲</span><span><i className="is-exclusion" />除外</span><span><i className="is-position" />計算地点</span></div>
  </figure>
}

function ParcelReportPage({ page, title, subtitle, children, list = false }) {
  return <article className={`report-print-page parcel-report-page${list ? ' parcel-report-page--list' : ''}`}>
    <header className="report-page-header"><div><p className="eyebrow">候補地 簡易分析レポート</p><h2>{title}</h2><p>{subtitle}</p></div><span className="report-page-number">{page}</span></header>
    <div className="report-page-body">{children}</div>
  </article>
}

export default function ParcelReviewReport({ review, metrics, position, startPage = 5, terrainArea = null, mapRegionLabel = '', fieldMemo = '' }) {
  if (!hasReviewGeometry(review)) return null
  const pages = listPages(review)
  const targetCount = (review.parcels || []).filter((entry) => entry.role === 'target').length
  const referenceCount = (review.parcels || []).filter((entry) => entry.role === 'reference').length
  const rowNumbers = new Map((review.parcels || []).map((entry, index) => [entry.id, index + 1]))
  let measured = null, currentTerrain = null
  try {
    measured = measureParcelReview(review)
    if (terrainArea?.summary && measured.geometry && terrainArea.geometryKey === terrainGeometryKey(measured.geometry)) currentTerrain = terrainArea
  } catch { /* Invalid or stale geometry never reuses a terrain result. */ }
  const currentMetrics = measured || metrics
  const summary = currentTerrain?.summary
  const memo = typeof fieldMemo === 'string' ? fieldMemo.replace(/\s+/g, ' ').trim() : ''
  const region = typeof mapRegionLabel === 'string' ? mapRegionLabel.trim() : ''
  const sources = (currentTerrain?.source?.layers || []).map(layer => `${layer.label} / 原資料${layer.nativeResolutionMeters}m級`).join('、')

  return <>
    <ParcelReportPage page={startPage} title="検討範囲・地形と次の確認" subtitle={`対象 ${targetCount}筆 ／ 参考 ${referenceCount}筆 ／ 除外 ${(review.exclusions || []).length}範囲`}>
      <MiniGeometryMap review={review} position={position} mapRegionLabel={region} />
      <dl className="parcel-report-metrics">
        {[['有効範囲', currentMetrics?.usableAreaM2, 'm²'], ['範囲内の高低差', summary?.heightRange, 'm'], ['局所勾配の中央値', summary?.medianSlope, '°']].map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{areaLabel(value)} <small>{unit}</small></dd></div>)}
      </dl>
      {currentTerrain ? <p className="parcel-report-terrain-evidence">同じ有効範囲のDEM参考値。{sources || '標高資料は記録を参照'}{currentTerrain.source?.mixed ? '（資料混在）' : ''} / 取得 {dateLabel(currentTerrain.fetchedAt)}。表示・集計 {currentTerrain.grid?.step}m、勾配は10m幅。標高取得 {areaLabel(summary.coveragePercent)}%・勾配計算 {areaLabel(summary.slopeCoveragePercent)}%。{(summary.coveragePercent < 100 || summary.slopeCoveragePercent < 100) && '欠測を除いた値で、範囲全体の確定値ではありません。'}原資料・表示間隔は測量精度ではありません。</p> : <p className="parcel-report-terrain-evidence parcel-report-terrain-evidence--missing">{terrainArea ? '現在の範囲と保存済みの地形結果が一致しないため、この結果は使用していません。現在の範囲で地形を再取得してください。' : '範囲の地形は未取得です。地図下の地形分析から取得すると、高低差と勾配を確認できます。'}</p>}
      <div className="parcel-report-next">
        <h3>次に確認して設計へ渡すこと</h3>
        <ol><li><strong>範囲を照合</strong>　参考線・図形面積を原資料と照合し、境界の未確認部分を残す。</li><li><strong>現地で確認</strong>　高低差・勾配を踏まえ、入口の段差、接道・搬入、排水、法面・擁壁を確認する。</li><li><strong>設計へ引継ぎ</strong>　同じ範囲・出典・確認メモを渡し、配置・基礎・造成条件を検討する。</li></ol>
        {memo && <p>現地メモ{memo.length > 120 ? '（抜粋）' : ''}：{memo.slice(0, 120)}{memo.length > 120 && '…（全文は1ページ目・検討記録）'}</p>}
        <p>造成量・設備容量・施工可否は未判定です。{currentTerrain && '等高線・3Dの詳細は「地形図面・A3」から別途出力できます。'}</p>
      </div>
      <div className="parcel-report-conditions">
        <h3>面積の採用条件</h3>
        <p>対象筆の図形 {areaLabel(currentMetrics?.targetAreaM2)}m² ／ 検討範囲 {areaLabel(currentMetrics?.reviewAreaM2)}m² ／ 除外分 {areaLabel(currentMetrics?.excludedAreaM2)}m²。</p>
        <p>{review.boundary ? targetCount ? '対象筆と手描きの検討範囲の共通部分を採用。' : '対象筆がないため、手描きの検討範囲を採用。' : '検討範囲未指定のため、対象筆の図形を採用。'}参考の筆は面積に含みません。重複は二重に数えず、除外範囲と重なる部分を控除します。</p>
        <p>図形面積の概算です。登記面積・確定境界・設置可能面積を保証しません。作図範囲は利用者が指定した検討条件です。敷地利用・離隔・工事条件を別途確認してください。</p>
        <p>{Number.isFinite(position?.lat) && Number.isFinite(position?.lon) ? `計算地点：北緯 ${position.lat.toFixed(6)} / 東経 ${position.lon.toFixed(6)}。` : '計算地点は未指定です。'}1地点の発電量は範囲全体を代表するとは限りません。</p>
        <h3>出典・保存範囲</h3>
        <p>{pages.length ? '地番・所在地・出典ファイル・読込日時は次ページ以降の選択筆一覧に記載します。' : '選択された原資料の筆はありません。検討・除外範囲は利用者による作図です。'}原資料の境界・基準日・座標系は原本で確認してください。</p>
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
