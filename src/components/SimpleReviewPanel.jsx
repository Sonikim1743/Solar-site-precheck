import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
import TerrainDrawingScaleControl from './TerrainDrawingScaleControl.jsx'
import { terrainDrawingPrintFit } from '../utils/terrainDrawingViewport.js'
import './simple-review.css'

export const initialSimpleReview = () => ({ status: 'idle', progress: null, pending: null, result: null, error: '', layoutSettings: { tiltDeg: 15, direction: 'south' } })
const release = result => { for (const pdf of result?.pdfs || []) URL.revokeObjectURL(pdf.url) }

export default function SimpleReviewPanel({ review, referenceCount = 0, siteName, appVersion, terrainArea, state, onChange, onDraw, onRepresentativeChange, visible = true, run = runSimpleReview, exporter, drawingScale = 1000, onDrawingScaleChange, layoutOptions, layoutSettings, onLayoutSettingsChange, layoutPreview, onApplied, onBusyChange }) {
  const job = useRef({ id: 0, controller: null }), latest = useRef(null), source = useRef(null), stateRef = useRef(state)
  const [settingsOpen, setSettingsOpen] = useState(false), settingsId = useId(), settingsButton = useRef(null)
  stateRef.current = state
  const metrics = useMemo(() => measureParcelReview(review), [review])
  const key = metrics.geometry ? terrainGeometryKey(metrics.geometry) : ''
  const defaults = simpleReviewDefaults(layoutOptions, layoutSettings || state.layoutSettings), selected = defaults.layoutSettings
  // Geometry alone is insufficient: old PDFs must never represent new conditions.
  const analysisKeyFor = (area, preview) => JSON.stringify([key, defaults.layout, selected.direction,
    area?.geometryKey === key ? terrainLayoutAnalysisKey(area) : '', preview?.disabledRackIds || [], preview?.activeRackCount ?? null, Boolean(preview?.fence)])
  const requestKeyFor = (area, preview) => JSON.stringify([analysisKeyFor(area, preview), drawingScale, siteName, appVersion])
  const analysisKey = analysisKeyFor(terrainArea, layoutPreview), requestKey = requestKeyFor(terrainArea, layoutPreview)
  const sharedPool = useRef(layoutPreview?.layout)
  sharedPool.current = layoutPreview?.layout
  latest.current = requestKey
  const representative = useMemo(() => metrics.geometry ? featureInteriorPoint({ geometry: metrics.geometry }) : null, [key])
  useEffect(() => { onRepresentativeChange?.(representative) }, [representative, onRepresentativeChange])
  useEffect(() => {
    const owned = Boolean(job.current.controller)
    job.current.id++; job.current.controller?.abort(); job.current.controller = null
    if (owned) onBusyChange?.(false)
    onChange(previous => {
      const result = previous.result?.analysisKey === analysisKey ? previous.result : null
      if (previous.result && !result) release(previous.result)
      return { ...previous, status: result?.requestKey === requestKey ? result.snapshot.status : 'idle', progress: null, pending: null, result, error: '' }
    })
    return () => { const owned = Boolean(job.current.controller); job.current.id++; job.current.controller?.abort(); job.current.controller = null; if (owned) onBusyChange?.(false) }
  }, [requestKey, onChange])
  // Keep completed results across the simple/detail round trip, but stop in-flight work.
  useEffect(() => () => onChange(previous => ({ ...previous, pending: null, progress: null, status: ['running', 'pdf'].includes(previous.status) ? 'cancelled' : previous.status })), [onChange])
  const ownBusy = state.status === 'running' || state.status === 'pdf', busy = ownBusy || Boolean(layoutPreview?.calculating)
  const samePool = !layoutPreview?.layout || layoutPreview.layout.analysisReference?.geometryKey !== key || state.result?.report.terrainPreview.layout === layoutPreview.layout
  const result = state.result?.requestKey === requestKey && samePool ? state.result : null
  const cached = state.result?.analysisKey === analysisKey && samePool ? state.result : null
  function changeSetting(value) {
    // Abort before React's next effect to reject late worker/PDF replies.
    job.current.id++; job.current.controller?.abort(); job.current.controller = null
    onLayoutSettingsChange?.(value)
    onChange(previous => ({ ...previous, layoutSettings: { ...selected, ...value } }))
  }
  function cancel() {
    job.current.id++; job.current.controller?.abort(); job.current.controller = null
    onBusyChange?.(false)
    onChange(previous => ({ ...previous, status: 'cancelled', pending: null, progress: null, error: '中止しました。条件が同じ前回のPDFは保持しています。' }))
  }
  async function start() {
    if (!key || !representative || busy || job.current.controller) return
    const controller = new AbortController(), id = ++job.current.id
    job.current.controller = controller
    const inputPool = layoutPreview?.layout
    const current = () => job.current.id === id && latest.current === requestKey && sharedPool.current === inputPool && !controller.signal.aborted
    onBusyChange?.(true)
    onChange(previous => ({ ...previous, status: 'running', pending: null, progress: null, error: '' }))
    try {
      // Only a scale/title change reuses analysis; new placement conditions always recalculate.
      const snapshot = cached && !result ? cached.snapshot : await run(review, { signal: controller.signal, terrainArea, layoutOptions: defaults.layout, layoutSettings: selected, layoutPreview, onProgress: value => current() && onChange(previous => ({ ...previous, progress: value })) })
      if (!current()) return
      if (!snapshot.results.area || !snapshot.results.layout) {
        job.current.controller = null
        onBusyChange?.(false)
        onChange(previous => ({ ...previous, status: 'review', progress: null, error: '地形または配置を取得できません。範囲・通信を確認して再試行してください。' }))
        return
      }
      const area = snapshot.results.area, layout = snapshot.results.layout
      if (!layout.rackCount) {
        job.current.controller = null
        onBusyChange?.(false)
        onChange(previous => ({ ...previous, status: 'review', progress: null, error: 'この条件で配置できる架台がありません。範囲・地形勾配・間隔を確認してください。' }))
        return
      }
      const reused = snapshot.reusedLayout && layoutPreview?.layout
      const rebind = value => reused && value?.analysisReference === terrainArea ? { ...value, analysisReference: area, analysisKey: terrainLayoutAnalysisKey(area) } : null
      const preview = { ...(reused ? layoutPreview : {}), options: defaults.layout, appliedOptions: defaults.layout, layoutMode: selected.direction, appliedMode: selected.direction,
        comparison: rebind(layoutPreview?.comparison), southComparison: rebind(layoutPreview?.southComparison),
        enabled: true, calculating: false, fence: Boolean(layoutPreview?.fence), disabledRackIds: reused ? layoutPreview.disabledRackIds : [], activeRackCount: reused ? layoutPreview.activeRackCount : null,
        simpleReview: true, layout: { ...(reused || layout), analysisReference: area, analysisKey: terrainLayoutAnalysisKey(area) } }
      const report = { siteName, appVersion, drawingScale, position: snapshot.position, parcelReview: snapshot.review, terrainArea: area, simpleReview: snapshot, terrainPreview: preview }
      onChange(previous => ({ ...previous, status: 'pdf', pending: { report, snapshot, key, analysisKey, requestKey, outputAnalysisKey: analysisKeyFor(area, preview), outputRequestKey: requestKeyFor(area, preview), inputPool, id }, progress: { name: 'PDFを作成中', steps: snapshot.steps } }))
    } catch (error) {
      if (current()) { job.current.controller = null; onBusyChange?.(false); onChange(previous => ({ ...previous, status: 'error', error: error.message || '解析を開始できません。再試行してください。', pending: null, progress: null })) }
    }
  }
  useEffect(() => {
    const pending = state.pending
    if (!pending || pending.requestKey !== latest.current) return
    let active = true, committed = false
    const current = () => active && job.current.id === pending.id && latest.current === pending.requestKey && sharedPool.current === pending.inputPool && !job.current.controller?.signal.aborted
    const generated = []
    ;(async () => {
      try {
        const exportPdf = exporter || (await import('../utils/terrainPdf.js')).exportTerrainAreaPdf
        const drawingFit = terrainDrawingPrintFit(pending.report.terrainArea.grid, pending.report.drawingScale)
        for (const drawingOnly of [true, false]) {
          if (!current()) return
          if (drawingOnly && !drawingFit.fits) continue
          const pdf = await exportPdf({ report: pending.report, element: source.current?.querySelector('.terrain-area-report'), drawingOnly, drawingScale: pending.report.drawingScale, signal: job.current.controller.signal })
          if (!current()) return
          generated.push({ ...pdf, kind: drawingOnly ? '配置図PDF · 1枚' : '地形・解析レポートPDF', drawingOnly, url: URL.createObjectURL(pdf.blob) })
        }
        if (!current()) return
        release(stateRef.current.result)
        committed = true; job.current.controller = null
        onApplied?.(pending.report)
        onBusyChange?.(false)
        onChange(previous => ({ ...previous, pending: null, progress: null, error: '', status: pending.snapshot.status, result: { key: pending.key, analysisKey: layoutPreview ? pending.outputAnalysisKey : pending.analysisKey, requestKey: layoutPreview ? pending.outputRequestKey : pending.requestKey, snapshot: pending.snapshot, report: pending.report, pdfs: generated, drawingWarning: drawingFit.reason } }))
      } catch (error) {
        if (current()) { job.current.controller = null; onBusyChange?.(false); onChange(previous => ({ ...previous, pending: null, progress: null, status: 'error', error: `PDFは未完成です。${error.message} 条件が同じ前回のPDFは保持しています。` })) }
      } finally { if (!committed) for (const pdf of generated) URL.revokeObjectURL(pdf.url) }
    })()
    return () => { active = false }
  }, [state.pending, exporter, onChange])
  const directionLabel = selected.direction === 'south' ? '真南' : selected.direction === 'manual' ? `入力方位${defaults.layout.azimuthDeg}°` : '最適（参考）'
  return <section className="simple-batch" hidden={!visible} aria-labelledby="simple-batch-title">
    <div className="simple-batch-heading"><h2 id="simple-batch-title">配置図をつくる</h2><p>{key ? `有効範囲 ${Math.round(metrics.usableAreaM2).toLocaleString('ja-JP')} m²` : '地図で範囲を選んでください。'}</p></div>
    {!key && <p role="status">{referenceCount ? '「地番選択」で境界を選び、「選択完了」で適用してください。' : '地図で角を点打ちして範囲を確定してください。'}</p>}
    <div className="simple-batch-actions">
      <button type="button" className="simple-primary" onClick={start} disabled={!key || !representative || busy}>{busy ? '作成中…' : result ? '配置図PDFを作り直す' : '配置図PDFを作成'}</button>
      <button type="button" className="simple-settings-toggle" ref={settingsButton} aria-expanded={settingsOpen} aria-controls={settingsId} onClick={() => setSettingsOpen(value => !value)}>条件 <span aria-hidden="true">{settingsOpen ? '▴' : '▾'}</span></button>
      <span className="simple-condition-summary">{selected.tiltDeg}° · {directionLabel}</span>
      {ownBusy ? <button type="button" className="simple-secondary" onClick={cancel}>中止</button> : <button type="button" className="simple-secondary" onClick={onDraw}>範囲を変更</button>}
    </div>
    <div id={settingsId} className="simple-settings" hidden={!settingsOpen} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setSettingsOpen(false); settingsButton.current?.focus() } }}>
      <div className="simple-setting-fields"><label>パネル傾斜 <select value={selected.tiltDeg} onChange={e => changeSetting({ tiltDeg: Number(e.target.value) })}>{[...new Set([10, 15, 20, selected.tiltDeg])].sort((a,b)=>a-b).map(value => <option key={value} value={value}>{value}°</option>)}</select></label>
        <label>配置方向 <select value={selected.direction} onChange={e => changeSetting({ direction: e.target.value })}><option value="south">真南</option><option value="optimized">最適（参考）</option>{selected.direction === 'manual' && <option value="manual">入力方位を維持</option>}</select></label></div>
      <p className="simple-settings-hint">パネルの水平からの角度です。地形勾配の条件とは別です。</p>
      <details><summary>縮尺・配置条件</summary><TerrainDrawingScaleControl value={drawingScale} onChange={onDrawingScaleChange} grid={terrainArea?.grid || cached?.snapshot.results.area.grid} disabled={busy || !onDrawingScaleChange}/><p>真南は北0°・時計回り180°固定。最適（参考）は基準方位{defaults.layout.azimuthDeg}°±30°を7.5°刻みと開始位置で比較（最大32試行・24,000候補・8秒）。全域最適は保証しません。</p><p>地形勾配{defaults.layout.slopeLimitDeg}°未満・4段×{defaults.layout.minColumns}〜{defaults.layout.maxColumns}列・720W。左右{defaults.layout.rackGapM}m・前後の空き{defaults.layout.rowGapM}m・境界離隔{defaults.layout.setbackM}m。詳細モードの間隔等を引き継ぎます。</p></details>
    </div>
    {busy && <p role="status">{state.progress?.name || '開始中…'} <progress aria-label="配置図作成の進捗" value={state.progress?.steps?.length || 0} max={6}/></p>}
    {!!state.error && <p role="alert">{state.error}</p>}
    {result && <div className="simple-batch-complete" data-simple-result-key={result.key} data-simple-lat={result.snapshot.position.lat} data-simple-lon={result.snapshot.position.lon}>
      <h3>{busy || ['error', 'cancelled'].includes(state.status) ? '同じ条件の前回PDF' : 'PDFができました'}</h3>
      {result.snapshot.status === 'review' && <p role="status">一部の取得・計算結果は確認が必要です。レポートで確認してください。</p>}
      {result.drawingWarning && <p role="alert">配置図1枚は未作成：{result.drawingWarning} 「条件」で縮尺を変更して作成してください。</p>}
      <p>{result.snapshot.results.layout.moduleCount.toLocaleString('ja-JP')}枚 · DC {result.snapshot.results.layout.dcKw.toLocaleString('ja-JP')} kW · {result.snapshot.results.layout.options.tiltDeg}° / 方位{result.snapshot.results.layout.options.azimuthDeg}°</p>
      <div className="simple-batch-downloads">{result.pdfs.filter(pdf => pdf.drawingOnly).map(pdf => <a key={pdf.kind} href={pdf.url} download={pdf.fileName}>配置図PDFを保存（1枚）</a>)}</div>
      <details><summary>レポート・解析結果</summary><div className="simple-batch-downloads">{result.pdfs.map(pdf => <div key={pdf.kind}>{!pdf.drawingOnly && <a href={pdf.url} download={pdf.fileName}>{pdf.kind}を保存（{pdf.pageCount}ページ）</a>}<a href={pdf.url} target="_blank" rel="noopener noreferrer">{pdf.kind}を開く</a><small>{pdf.fileName} · application/pdf</small></div>)}</div><dl>{simpleReviewReportRows(result.snapshot).map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><TerrainSectionPreview analysis={result.snapshot.results.section}/><HorizonGraphPreview position={result.snapshot.position} terrain={result.snapshot.results.horizon} obstructionHeight={result.snapshot.defaults.obstructionHeightM}/></details>
    </div>}
    <details className="simple-batch-notes"><summary>解析・保存について</summary><p>範囲の内部代表点から断面・地平線・NEDOを取得し、地形・参考配置と2種類のPDFを作成します。代表点 {representative ? `${toDegreeMinutes(representative.lat, 'lat', 3)} / ${toDegreeMinutes(representative.lon, 'lon', 3)}` : '未確定'}。断面±100m・10m間隔、地平線8方位・250m〜5km・仮障害物20m。取得状態・適用値はレポートに記録。施工可否は未確認です。配置条件と適用済み配置は詳細モード・レポートと共通です。配置・一括結果のJSON保存は未対応です。</p></details>
    <div className="simple-export-source" ref={source} aria-hidden="true">{state.pending?.requestKey === requestKey && <TerrainAreaReport report={state.pending.report} drawingScale={state.pending.report.drawingScale} id="simple-terrain-area-report"/>}</div>
  </section>
}
