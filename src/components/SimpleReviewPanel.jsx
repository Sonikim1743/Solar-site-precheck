import { useEffect, useMemo, useRef } from 'react'
import { measureParcelReview } from '../utils/parcelReview.js'
import { terrainGeometryKey } from '../utils/terrainArea.js'
import { featureInteriorPoint } from '../services/parcelGeometry.js'
import { toDegreeMinutes } from '../utils/coordinates.js'
import { terrainLayoutAnalysisKey } from '../utils/terrainLayoutComparison.js'
import { runSimpleReview, simpleReviewDefaults } from '../services/simpleReview.js'
import { simpleReviewReportRows } from '../utils/simpleReviewReport.js'
import TerrainAreaReport from './TerrainAreaReport.jsx'
import TerrainSectionPreview from './TerrainSectionPreview.jsx'
import HorizonGraphPreview from './HorizonGraphPreview.jsx'
import './simple-review.css'

export const initialSimpleReview = () => ({ status: 'idle', progress: null, pending: null, result: null, error: '' })
const release = result => { for (const pdf of result?.pdfs || []) URL.revokeObjectURL(pdf.url) }
export default function SimpleReviewPanel({ review, referenceCount = 0, siteName, appVersion, terrainArea, state, onChange, onDraw, onRepresentativeChange, visible = true, run = runSimpleReview, exporter }) {
  const job = useRef({ id: 0, controller: null }), latest = useRef(null), source = useRef(null), stateRef = useRef(state)
  stateRef.current = state
  const metrics = useMemo(() => measureParcelReview(review), [review])
  const key = metrics.geometry ? terrainGeometryKey(metrics.geometry) : ''
  latest.current = key
  const representative = useMemo(() => metrics.geometry ? featureInteriorPoint({ geometry: metrics.geometry }) : null, [key])
  useEffect(() => { onRepresentativeChange?.(representative) }, [representative, onRepresentativeChange])
  useEffect(() => {
    job.current.id++; job.current.controller?.abort(); job.current.controller = null
    onChange(previous => {
      if (previous.result && previous.result.key !== key) release(previous.result)
      return { ...previous, status: previous.result?.key === key ? previous.result.snapshot.status : 'idle', progress: null, pending: null, result: previous.result?.key === key ? previous.result : null, error: '' }
    })
    return () => { job.current.id++; job.current.controller?.abort(); onChange(previous => ({ ...previous, pending: null, progress: null, status: previous.status === 'running' || previous.status === 'pdf' ? 'cancelled' : previous.status })) }
  }, [key, onChange])
  function cancel() { job.current.id++; job.current.controller?.abort(); onChange(previous => ({ ...previous, status: 'cancelled', pending: null, progress: null, error: '中止しました。同じ範囲の前回結果があれば下に保持しています。' })) }
  async function start() {
    if (!key || !representative) return
    job.current.controller?.abort(); const controller = new AbortController(), id = ++job.current.id
    job.current.controller = controller
    const current = () => job.current.id === id && latest.current === key && !controller.signal.aborted
    onChange(previous => ({ ...previous, status: 'running', pending: null, progress: null, error: '' }))
    try {
      const snapshot = await run(review, { signal: controller.signal, terrainArea, onProgress: value => current() && onChange(previous => ({ ...previous, progress: value })) })
      if (!current()) return
      if (!snapshot.results.area || !snapshot.results.layout) { onChange(previous => ({ ...previous, status: 'review', progress: { name: '確認必要', steps: snapshot.steps }, error: '地形または配置を取得できずPDFは未作成です。前回結果は保持しています。' })); return }
      const area = snapshot.results.area, layout = snapshot.results.layout
      const report = { siteName, appVersion, position: snapshot.position, parcelReview: snapshot.review, terrainArea: area, simpleReview: snapshot,
        terrainPreview: { options: layout.options, appliedOptions: layout.options, enabled: true, fence: false, disabledRackIds: [], simpleReview: true, layout: { ...layout, analysisReference: area, analysisKey: terrainLayoutAnalysisKey(area) } } }
      onChange(previous => ({ ...previous, status: 'pdf', pending: { report, snapshot, key, id }, progress: { name: '2種類のPDFを作成中', steps: snapshot.steps } }))
    } catch (error) { if (current()) onChange(previous => ({ ...previous, status: 'error', error: error.message || '解析を開始できません。再試行してください。', pending: null, progress: null })) }
  }
  useEffect(() => {
    const pending = state.pending
    if (!pending) return
    let active = true, committed = false
    const current = () => active && job.current.id === pending.id && latest.current === pending.key && !job.current.controller?.signal.aborted
    const generated = []
    ;(async () => {
      try {
        const exportPdf = exporter || (await import('../utils/terrainPdf.js')).exportTerrainAreaPdf
        for (const drawingOnly of [true, false]) {
          if (!current()) return
          const pdf = await exportPdf({ report: pending.report, element: source.current?.querySelector('.terrain-area-report'), drawingOnly })
          if (!current()) return
          generated.push({ ...pdf, kind: drawingOnly ? '配置図PDF · 1枚' : '地形・解析レポートPDF', url: URL.createObjectURL(pdf.blob) })
        }
        if (!current()) return
        release(stateRef.current.result)
        committed = true
        onChange(previous => ({ ...previous, pending: null, progress: null, error: '', status: pending.snapshot.status, result: { key: pending.key, snapshot: pending.snapshot, report: pending.report, pdfs: generated } }))
      } catch (error) { if (current()) onChange(previous => ({ ...previous, pending: null, progress: null, status: 'error', error: `PDFは未完成です。${error.message} 前回結果は保持しています。` })) }
      finally { if (!committed) for (const pdf of generated) URL.revokeObjectURL(pdf.url) }
    })()
    return () => { active = false }
  }, [state.pending, exporter, onChange])
  const busy = state.status === 'running' || state.status === 'pdf', result = state.result?.key === key ? state.result : null
  return <section className="simple-batch" hidden={!visible} aria-labelledby="simple-batch-title">
    <div className="simple-batch-heading"><div><h2 id="simple-batch-title">範囲からまとめて解析</h2><p>内部代表点 → 断面・地平線・NEDO → 地形・参考配置 → 2種類のPDF</p></div></div>
    {!key ? <p role="status">{referenceCount ? '地番の表示境界がまだ参考領域に適用されていません。' : '解析する有効範囲がありません。'} {referenceCount ? '地図の「地番選択」で境界を選び、「選択完了」で適用してください。' : '地図で角を点打ちして範囲を確定してください。'}</p> : <p>有効範囲 {Math.round(metrics.usableAreaM2).toLocaleString('ja-JP')} m² · 内部代表点 {representative ? `${toDegreeMinutes(representative.lat,'lat',3)} / ${toDegreeMinutes(representative.lon,'lon',3)}` : '確認できません'}</p>}
    <div className="simple-batch-actions"><button type="button" onClick={start} disabled={!key || !representative || busy}>{result || ['error','review','cancelled'].includes(state.status) ? '同じ範囲を再解析' : '基本値でまとめて解析'}</button>{busy ? <button type="button" onClick={cancel}>一括解析を中止</button> : <button type="button" onClick={onDraw}>{referenceCount ? '範囲を手動指定（任意）' : '地図で範囲を確定'}</button>}</div>
    {busy && <p role="status">{state.progress?.name || '開始中…'} <progress aria-label="一括解析の進捗" value={state.progress?.steps?.length || 0} max={7}/></p>}
    {!!state.error && <p role="alert">{state.error}</p>}
    {!!state.progress?.steps?.length && <ul>{state.progress.steps.map(s => <li key={s.name}>{s.name}：{s.status === 'success' ? '取得済み' : '確認必要'} · {s.message}</li>)}</ul>}
    <details><summary>適用する基本値と保存範囲</summary><p>断面±100m・10m間隔、地平線8方位・250m〜5km・仮障害物20m、モジュール傾斜15°・基準方位南180°・地形勾配10°未満、4段×4〜8列・720W、左右1m・前後の空き3.3m・境界離隔1m・モジュール間20mm・高さ0.8m。方位・開始位置は既存の自動探索を使い、実際の適用値は取得結果とPDFへ記録します。既存の詳細条件・結果を上書きしません。PDFは適用値と欠測・未取得を記録。配置・一括結果のJSON記録保存は未対応です。</p></details>
    {result && <div className="simple-batch-complete" data-simple-result-key={result.key} data-simple-lat={result.snapshot.position.lat} data-simple-lon={result.snapshot.position.lon}><h3>{busy || ['error','cancelled'].includes(state.status) ? '前回の同じ範囲の結果' : result.snapshot.status === 'complete' ? '解析と2種類のPDFができました' : '確認必要 · 2種類のPDFができました'}</h3><p>{result.snapshot.status === 'review' ? '取得状態・配置条件に確認が必要です。各項目とレポートを確認してください。' : '参考検討の取得が完了しました。施工可否は未確認です。'}</p><div className="simple-batch-downloads">{result.pdfs.map(pdf => <div key={pdf.kind}><a href={pdf.url} download={pdf.fileName}>{pdf.kind}をダウンロード（{pdf.pageCount}ページ）</a><a href={pdf.url} target="_blank" rel="noopener noreferrer">{pdf.kind}を開く</a><small>{pdf.fileName} · application/pdf</small></div>)}</div><p>{result.snapshot.results.layout.rackCount}架台 / {result.snapshot.results.layout.moduleCount.toLocaleString('ja-JP')}枚 / DC {result.snapshot.results.layout.dcKw.toLocaleString('ja-JP')} kW</p><details><summary>取得結果・適用値を確認</summary><dl>{simpleReviewReportRows(result.snapshot).map(([k,v],i)=><div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><TerrainSectionPreview analysis={result.snapshot.results.section}/><HorizonGraphPreview position={result.snapshot.position} terrain={result.snapshot.results.horizon} obstructionHeight={result.snapshot.defaults.obstructionHeightM}/></details></div>}
    <div className="simple-export-source" ref={source} aria-hidden="true">{state.pending && <TerrainAreaReport report={state.pending.report} id="simple-terrain-area-report"/>}</div>
  </section>
}
