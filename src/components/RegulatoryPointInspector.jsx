import { useCallback, useEffect, useRef, useState } from 'react'
import { inspectRegulatoryPoint } from '../services/regulatoryPointQuery.js'
import { activeReferenceSources, inspectionPointKey, POINT_REFERENCE_MEANINGS, pointStatusLabel } from '../utils/regulatoryPoint.js'
import { HAZARD_LAYERS, hazardRegionMessage, HIROSHIMA_SOIL_METADATA } from '../utils/regulatoryLayers.js'
import { REFERENCE_UNKNOWN, referenceYears } from '../utils/regulatoryRegistry.js'
import { toDegreeMinutes } from '../utils/coordinates.js'
import './regulatory-point.css'
import PointInspectionSummary from './PointInspectionSummary.jsx'

function Swatch({ color, historic = false }) {
  return <i aria-hidden="true" className={`point-zone-swatch${historic ? ' is-historic' : ''}`} style={{ backgroundColor: color }} />
}

function ReferenceSource({ source, sourceYear }) {
  return <details className="point-zone-source"><summary>出典・時点・位置精度</summary>
    <p>出典：{source.attribution}／{source.license}。図形分割・CP932文字復号による参考表示。</p>
    <p>{sourceYear ? `この図形の原資料 ${sourceYear}年` : referenceYears(source)}{source.fileEdition ? `／ファイル版 ${source.fileEdition}年` : ''}。{source.featureDate}{source.exportDate ? `／ZIP出力日 ${source.exportDate}` : ''}</p>
    <p>測地系：{source.sourceCrs?.epsg === 4612 ? 'JGD2000（EPSG:4612）' : '原本未記載・未確定'}。{source.displayMethod} 法定境界・取引の証拠ではありません。</p>
    <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">公式出典・利用条件 ↗</a>
  </details>
}

export function StoredPointResults({result}){
  return <details className="point-zone-raster" open><summary>保存ハザード：地点の面照合</summary>
    <p>対象県：{result.region.name||'未確定'}。{result.region.message} 行政境界はN03 2025-01-01。全精度の原本座標で面・穴を照合し、色から判定していません。</p>
    {result.region.state!=='ready'&&<p className="hazard-caution">対象県の境界または資料取得が未確認のため、区域の有無は判定できません。</p>}
    {result.datasets.map(row=><article key={row.source.id} className="point-zone-match">
      <h5>{row.source.category==='soil'?'土砂災害警戒区域':'洪水・想定最大規模'}：{row.state==='matched'?`重なり ${row.matches.length}件`:row.state==='none'?'収録面との重なり未検出・未収録は未確認':row.state==='unconfirmed'?'線資料あり・面範囲未確認':pointStatusLabel(row.state)}</h5>
      {row.matches.map(match=><div key={match.id}><strong>{match.name}</strong><p>{match.kind}／{match.designation}{match.boundary?'／境界上・位置要確認':''}</p><p>{match.place}／{match.date} {match.notice}</p>
        <details><summary>原資料の属性</summary><dl>{Object.entries(match.properties).filter(([k])=>/^A33_|^A31a_/.test(k)).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{String(v??'未記載')}</dd></div>)}</dl></details></div>)}
      {row.lineCandidates>0&&<p>この地点周辺に線資料 {row.lineCandidates}件。線から面を補間せず、面の有無は別途確認します。</p>}
      {row.source.geometryCounts?.LineString>0&&<p>原本に面として提供されない線資料があります。線を区域面や安全判定に変換していません。</p>}
      {row.failures.map(f=><p key={f.url}>{f.message}</p>)}
      <details><summary>保存範囲・出典・時点</summary><p>{row.source.sourceDate}／ファイル版 2025／取得 {result.collectedAt}。</p><p>{row.source.sourceCrs.name}（EPSG:{row.source.sourceCrs.epsg}）。{row.source.coordinateMethod}</p><p>出典：{row.source.attribution}／{row.source.license}。{row.source.notes}</p><p>原本 {row.source.archive}、収録 {row.source.recordCount}件。{row.source.prefecture==='87'?'国管理は中国地方整備局の対象河川、県管理は対象3県の収録河川のみ。':''}</p><a href={row.source.sourceUrl} target="_blank" rel="noopener noreferrer">公式原本・利用条件 ↗</a></details>
    </article>)}
    <p className="hazard-caution">未収録・空白・重なり未検出・取得失敗は安全や規制なしの根拠になりません。法定境界・取引証拠ではなく、現行情報は行政へ確認してください。</p>
  </details>
}

function PointInspectionDetails({ result }) {
  const matched = result.references.flatMap(row => row.matches.map(match => ({ source: row.source, match })))
  const remaining = result.references.filter(row => row.state !== 'matched')
  return <div className="point-zone-results">
    <h4>選択地点の重なり：参考図形 {matched.length}件</h4>
    <p>収録ベクトルの外周・穴と地点を照合。検索欄や地図中心の位置ではありません。測地系・位置精度の限界があります。</p>
    {result.checkedAt && <small>確認日時（UTC）：{result.checkedAt}</small>}
    {matched.map(({ source, match }) => {
      const info = POINT_REFERENCE_MEANINGS[source.category]
      return <article className="point-zone-match" key={match.id}>
        <h5><Swatch color={source.color} historic={source.historic} />{match.name}</h5>
        <p><strong>{info?.colorName}：{info?.label || source.label}</strong>／{match.kind}{match.place ? `／${match.place}` : ''}{match.boundary ? '／図形境界上・位置要確認' : ''}</p>
        {match.era && <p>時代：{match.era}</p>}{match.detailKind && <p>詳細区分：{match.detailKind}</p>}
        {match.condition && <p className="hazard-caution">原資料の残存記載：{match.condition}（現況未確認）</p>}
        {match.remark && <p className="hazard-caution">原資料の備考：{match.remark}</p>}
        <p>{info?.meaning} {info?.check}</p>
        <details><summary>原資料の識別・属性</summary><p>資料：{source.label}／レコードID {match.sourceRecordId}{match.sourceRecordIndex != null ? `／取込時の原本行 ${match.sourceRecordIndex}` : ''}</p>
          {match.description && <p>原資料の概要：{match.description}</p>}{match.finds && <p>原資料の主な出土：{match.finds}</p>}
          <p>表示項目は収録済みの原本属性です。原本の全属性を取り込んだものではありません。残存・概要・備考は原資料時点の記載で、現況や指定・届出要否は未確認。</p></details>
        <ReferenceSource source={source} sourceYear={match.sourceYear} />
      </article>
    })}
    {!matched.length && <p>重なりを確認した図形はありません。下の資料別の未確認状況も確認してください。未収録資料や現行指定の有無は未確認です。</p>}
    {remaining.length > 0 && <details className="point-zone-other"><summary>その他の資料・未確認 {remaining.length}件</summary>
      {remaining.map(row => <div key={row.source.id}><p><Swatch color={row.source.color} historic={row.source.historic} />{row.source.label}：<strong>{pointStatusLabel(row.state)}</strong>{row.matches.length ? `（確認済みの重なり ${row.matches.length}件、残りは未確認）` : ''}</p>
        {row.failures.map(item => <p key={item.url}>{item.message}</p>)}
        <ReferenceSource source={row.source} />
      </div>)}
    </details>}
    {result.hazards.mode==='stored'?<StoredPointResults result={result.hazards}/>:<details className="point-zone-raster"><summary>洪水・土砂：地点画素の確認結果</summary>
      <p>選択地点のz17 PNG画素を照合。色の存在だけを確認し、深さ・警戒種別・指定名は自動判読しません。線の太さ・縮尺・境界精度にも限界があります。</p>
      <p>選択地点の県：{result.hazards.region.name || pointStatusLabel(result.hazards.region.state)}。地図表示の中心県とは別に照会しています。</p>
      {result.hazards.layers.map(item => <article key={item.layer.id} className="point-zone-raster-item">
        <h5>{item.state === 'painted' && <Swatch color={item.color} />}{item.layer.name}：{pointStatusLabel(item.state)}</h5>
        <p>{item.message}</p>
        <p>{item.layer.date}／{item.layer.coverage}</p>
        <p>出典：ハザードマップポータルサイト・国交省・都道府県。土砂は国土数値情報をGSIが加工。</p>
        {item.prefecture === '34' && <p>広島原資料 {HIROSHIMA_SOIL_METADATA.sourceDate}／A33共通基準 {HIROSHIMA_SOIL_METADATA.a33Date}／GSI反映 {HIROSHIMA_SOIL_METADATA.gsiDate}。CC BY／{HIROSHIMA_SOIL_METADATA.attribution}</p>}
        <a href={item.layer.legend} target="_blank" rel="noopener noreferrer">{item.layer.name}の公式凡例 ↗</a>{' / '}<a href={item.layer.source} target="_blank" rel="noopener noreferrer">原典・条件 ↗</a>
        {item.url && <details><summary>照合した配信位置</summary><p>z{item.coords.z} / x{item.coords.x} / y{item.coords.y}、画素{item.pixel.x},{item.pixel.y}</p><a href={item.url} target="_blank" rel="noopener noreferrer">確認タイル ↗</a></details>}
      </article>)}
    </details>}
    <p className="hazard-caution">重なりは検討の手掛かりで、開発不可の一括判定ではありません。{REFERENCE_UNKNOWN} 地点の結果は敷地全体の判定ではありません。</p>
  </div>
}

export function RegulatoryPointResults({result}) {
  return <PointInspectionSummary result={result}><PointInspectionDetails result={result}/></PointInspectionSummary>
}

export default function RegulatoryPointInspector({ id, open = false, onClose, position, settings, includeHistorical = false, isDrawing = false, region = {}, queryPoint = inspectRegulatoryPoint }) {
  const key = `${inspectionPointKey(position)}|${!!settings.enabled}|${includeHistorical}`
  const job = useRef(null)
  const autoTimer = useRef(null)
  const closeButton = useRef(null)
  useEffect(() => { if(open) closeButton.current?.focus({preventScroll:true}) }, [open])
  const [state, setState] = useState({ key, status: 'idle' })
  useEffect(() => {
    job.current?.abort()
    setState({ key, status: 'idle' })
    return () => job.current?.abort()
  }, [key])
  const valid = !!inspectionPointKey(position)
  const current = state.key === key ? state : { status: 'idle' }
  const lat = position?.lat, lon = position?.lon
  const inspect = useCallback(async () => {
    clearTimeout(autoTimer.current)
    if (!open || !valid || !settings.enabled || isDrawing) return
    job.current?.abort()
    const controller = new AbortController()
    job.current = controller
    setState({ key, status: 'loading' })
    try {
      const result = await queryPoint({lat,lon}, { enabled: settings.enabled, includeHistorical, signal: controller.signal })
      if (!controller.signal.aborted && job.current === controller) setState({ key, status: 'ready', result })
    } catch (error) {
      if (!controller.signal.aborted && job.current === controller) setState({ key, status: 'error', message: error.message })
    }
  }, [open,valid,settings.enabled,isDrawing,key,lat,lon,includeHistorical,queryPoint])
  useEffect(() => {
    if (!open) { job.current?.abort(); return }
    if (!valid || !settings.enabled || isDrawing || (state.key === key && state.status === 'ready')) return
    autoTimer.current = setTimeout(inspect, 250)
    return () => { clearTimeout(autoTimer.current); job.current?.abort() }
    // The result state is deliberately not a trigger: cancelling must stay cancelled.
  }, [open,key,valid,settings.enabled,isDrawing,inspect])
  return <section id={id} hidden={!open} className="point-zone-inspector" role="dialog" aria-modal="false" aria-label="選択地点の区域確認" onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()} onTouchStart={event=>event.stopPropagation()} onKeyDown={event => {
    event.stopPropagation()
    if(event.key==='Escape'){event.preventDefault();onClose?.()}
    if(event.key==='PageDown'||event.key==='PageUp'){
      event.preventDefault()
      event.currentTarget.scrollBy({top:event.currentTarget.clientHeight*.85*(event.key==='PageDown'?1:-1),behavior:'instant'})
    }
  }}>
    <div className="point-zone-header"><strong>区域の確認</strong><div className="point-zone-actions">
      {valid && settings.enabled && (current.status === 'loading' ? <button type="button" className="secondary-button" onClick={() => { clearTimeout(autoTimer.current); job.current?.abort(); setState({ key, status: 'cancelled' }) }}>中止</button> : <button type="button" className="secondary-button" onClick={inspect} disabled={isDrawing}>再確認</button>)}
      <button ref={closeButton} type="button" className="secondary-button" onClick={onClose} aria-label="区域の説明を閉じる（区域表示は維持）">閉じる</button>
    </div></div>
    {!valid ? <p>先に住所検索または地図で地点を選択してください。</p> : <>
    <p className="point-zone-hint">{!settings.enabled ? '区域表示はOFFです。地図の「検討区域」をONにすると確認できます。' : isDrawing ? '作図を終えてから確認できます。' : ''}</p>
    {valid && <p className="point-zone-coordinate">確認対象：{toDegreeMinutes(position.lat, 'lat', 4)} / {toDegreeMinutes(position.lon, 'lon', 4)}</p>}
    <details className="point-zone-enabled"><summary>{settings.enabled ? 'ONの資料' : 'OFFの資料（未照会）'}・色と対応範囲</summary>
      <p>以下は表示設定の一覧です。地点で重なる区域は下の照合結果と区別します。</p>
      <ul>{activeReferenceSources(includeHistorical).map(source => <li key={source.id}><Swatch color={source.color} historic={source.historic} />{POINT_REFERENCE_MEANINGS[source.category]?.colorName}：{source.label}</li>)}
        {HAZARD_LAYERS.map(layer => <li key={layer.id}>{layer.name} <a href={layer.legend} target="_blank" rel="noopener noreferrer">色凡例 ↗</a></li>)}
      </ul>
      <p>{settings.enabled ? hazardRegionMessage(region) : 'OFF・表示および地点照会は未実行'}。古い農用地区域：{includeHistorical ? 'ON' : 'OFF・未照会'}。</p>
    </details>
    <p role="status" aria-live="polite">{current.status === 'loading' ? '選択地点の資料を確認中…' : current.status === 'cancelled' ? '地点確認を中止しました。結果は未確認です。' : current.status === 'error' ? `地点確認失敗・未確認：${current.message}` : current.status === 'ready' ? '' : ''}</p>
    {current.status === 'ready' && <RegulatoryPointResults result={current.result} />}
    </>}
  </section>
}
