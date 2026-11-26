import { useEffect, useId, useMemo, useState } from 'react'
import { layoutOutputState } from '../utils/layoutOutputState.js'
import TerrainDxfButton from './TerrainDxfButton.jsx'
import { TerrainAreaPlan, TerrainArea3D } from './TerrainAreaFigures.jsx'
import TerrainLayoutPreview, { selectedTerrainLayout, terrainLayoutAnalysisKey } from './TerrainLayoutPreview.jsx'
import { toggleTerrainRackSelection, adjustTerrainRackSelection } from '../utils/terrainLayoutSelection.js'
import TerrainHelpDialog from './TerrainHelpDialog.jsx'
import { buildTerrainFence } from '../utils/terrainFence.js'
import { buildTerrainParcelOverlay } from '../utils/terrainParcelOverlay.js'
import { appliedTerrainPreview } from '../utils/terrainLayoutComparison.js'
import { isMapParcel, MAP_PARCEL_NOTICE } from '../utils/mapParcelSelection.js'
import './terrain-area.css'

const number = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString('ja-JP', { maximumFractionDigits: digits }) : '—'

function dateText(value) {
  const date = new Date(value)
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '未記録'
}

export default function TerrainAreaPanel({ geometry, metrics, analysis, status = 'idle', progress, error, onAnalyze, onCancel, onClear, position, onDrawBoundary, onOpenReport, onOpenDrawing, parcels = [], publicParcels = [], publicParcelsLimited = false, preview, onPreviewChange, outputBlocked = false, dxfReport, preferredView = 'plan', autoLayoutKey, geometryKey = analysis?.geometryKey ?? '', onModulesVisibleChange, onSlopeChanged, suppressSlopeCoachmark }) {
  const [layoutNotice, setLayoutNotice] = useState(null)
  const [view, setView] = useState(preferredView === '3d' ? '3d' : 'plan')
  const [shownGeometryKey, setShownGeometryKey] = useState(null)
  const showModules = shownGeometryKey === geometryKey
  useEffect(() => setShownGeometryKey(null), [geometryKey])
  const toggleModules = () => setShownGeometryKey(showModules ? null : geometryKey)
  const id = `terrain-area-${useId().replace(/:/g, '')}`
  const state = typeof status === 'string' ? status : status?.status || 'idle'
  const loading = ['loading', 'fetching', 'calculating'].includes(state)
  const summary = analysis?.summary
  const partial = summary && (summary.coveragePercent < 100 || summary.slopeCoveragePercent < 100)
  const sourceLayers = analysis?.source?.layers || []
  const message = typeof error === 'string' ? error : error?.message || (state === 'error' ? status?.message : '')
  const parcelOverlay = useMemo(() => buildTerrainParcelOverlay(analysis, [...parcels, ...publicParcels]), [analysis, parcels, publicParcels])
  const analysisKey = terrainLayoutAnalysisKey(analysis)
  const applied = analysis ? appliedTerrainPreview(analysis, preview) : null
  const appliedPool = applied?.options?.rows === 4 && Number.isInteger(applied.options.minColumns) ? applied : null
  const appliedLayout = useMemo(() => selectedTerrainLayout(appliedPool, preview), [appliedPool, preview?.activeRackCount, preview?.disabledRackIds])
  const showLayout = view === '3d' ? showModules : preview?.enabled
  const layoutPool = showLayout ? appliedPool : null
  const layout = showLayout ? appliedLayout : null
  const visibleModulesKey = view === '3d' && layout?.moduleCount > 0 ? geometryKey : null
  useEffect(() => {
    onModulesVisibleChange?.(visibleModulesKey)
    return () => onModulesVisibleChange?.(null)
  }, [visibleModulesKey, onModulesVisibleChange])
  const waitingForLayout = onPreviewChange && autoLayoutKey === analysisKey && preview?.autoCalculatedKey !== analysisKey && !appliedPool
  const terrainAcquired = `地形を取得しました（図形面積 約${number(summary?.polygonAreaM2, 0)} m²・高低差 約${number(summary?.heightRange)} m）。`
  let feedback = terrainAcquired
  if (preview?.calculating || waitingForLayout) {
    feedback += '参考配置を計算しています…'
  } else if (layoutNotice?.key === analysisKey) {
    feedback += layoutNotice.message
  } else if (appliedLayout?.moduleCount > 0) {
    feedback = `地形と参考配置を確認しました。モジュール ${number(appliedLayout.moduleCount, 0)}枚・DC 約${number(appliedLayout.dcKw)} kW（参考）。`
  } else if (appliedLayout) {
    feedback += appliedPool.moduleCount
      ? '現在の選択は0枚です。架台を復元すると配置を表示できます。'
      : '参考配置は0枚です。現在の範囲・除外・間隔の条件では配置できません。'
  }
  const toggleRack = layoutPool && onPreviewChange && !preview?.calculating ? id => onPreviewChange(previous => previous.layout === layoutPool ? { ...previous, disabledRackIds: toggleTerrainRackSelection(layoutPool, previous, id), activeRackCount: null } : previous) : undefined
  const fence = useMemo(() => preview?.fence && layout ? buildTerrainFence(analysis, { racks: layout.racks, marginM: layout.options.setbackM }) : null, [analysis, layout, preview?.fence])
  const adjustRack = delta => onPreviewChange?.(previous => previous.layout === layoutPool ? { ...previous, disabledRackIds: adjustTerrainRackSelection(layoutPool, previous, delta), activeRackCount: null } : previous)
  const rackControls = layout && <div className="terrain-layout-count-controls" role="group" aria-label="自動配置の架台数を調整">
    <button type="button" aria-label="架台を1つ減らす" disabled={preview?.calculating || layout.rackCount === 0} onClick={() => adjustRack(-1)}>− 減らす</button>
    <span>{layout.rackCount}架台 <small>/ {layoutPool.rackCount}</small></span>
    <button type="button" aria-label="架台を1つ増やす" disabled={preview?.calculating || layout.rackCount >= layoutPool.rackCount} onClick={() => adjustRack(1)}>＋ 増やす</button>
    <p>架台をクリックで除外・点線で戻す</p>
  </div>
  const shownParcels = preview?.labels ? parcelOverlay : null
  useEffect(() => { setView(preferredView === '3d' ? '3d' : 'plan') }, [analysis?.geometryKey, analysis?.fetchedAt, preferredView])

  return <section className="terrain-area-panel" aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`} className="terrain-area-panel-heading">範囲の地形</h3>
    {analysis ? <div className="terrain-area-toolbar">
      <div className="terrain-area-view-switch" role="group" aria-label="地形の見方"><button type="button" aria-pressed={view === 'plan'} className={view === 'plan' ? 'is-active' : ''} onClick={() => setView('plan')}>等高線</button><button type="button" data-terrain-tour-anchor="terrain-3d-view" aria-pressed={view === '3d'} className={`terrain-area-3d-button${view === '3d' ? ' is-active' : ''}`} onClick={() => setView('3d')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 22 7.5v9L12 22 2 16.5v-9Z M2 7.5 12 13l10-5.5 M12 13v9" /></svg>3Dで見る</button></div>
      <div className="terrain-area-result-actions">{preview?.layout?.analysisReference === analysis && <><button type="button" className="secondary-button" onClick={onOpenDrawing} disabled={!onOpenDrawing || outputBlocked || loading || !layoutOutputState(analysis, preview).current}>配置図PDF · 1枚</button><TerrainDxfButton report={dxfReport} blocked={outputBlocked || loading} /></>}<button type="button" className="secondary-button" data-terrain-tour-anchor="terrain-output" onClick={onOpenReport} disabled={!onOpenReport}>レポート</button><button type="button" className="terrain-area-quiet-button" onClick={onAnalyze} disabled={!onAnalyze || loading}>再取得</button></div>
    </div> : geometry && !loading ? <div className="terrain-area-toolbar"><p className="terrain-area-scope terrain-area-preview"><span>参考範囲</span><strong>約{number(metrics?.usableAreaM2, 0)} <small>m²</small></strong></p><button type="button" className="secondary-button terrain-area-primary-action" data-terrain-tour-anchor="terrain-acquire" onClick={onAnalyze} disabled={!onAnalyze}>{message ? '再試行' : '地形を確認'}</button></div> : null}
    {!geometry && <div className="terrain-area-empty"><p>地図で範囲を描き、「地形を確認」を押してください。</p><button type="button" className="secondary-button" onClick={onDrawBoundary} disabled={!onDrawBoundary}>範囲を描く</button></div>}
    {loading && <div className="terrain-area-progress" data-terrain-tour-anchor="terrain-progress" role="status"><div><strong>{progress?.phase === 'calculating' ? '等高線・勾配を計算中…' : '標高を取得中…'}</strong>{Number.isFinite(progress?.completedTiles) && <span>取得 {progress.completedTiles}タイル{Number.isFinite(progress.totalTiles) ? ` / 現在の対象 ${progress.totalTiles}タイル` : ''}</span>}</div><button type="button" className="secondary-button" onClick={onCancel} disabled={!onCancel}>中止</button></div>}
    {!loading && message && <div className="terrain-area-warning" role="alert"><p>{message}</p></div>}
    {!loading && ['cancelled', 'canceled'].includes(state) && !message && <p className="terrain-area-scope" role="status">取得を中止しました。範囲は保持されています。</p>}
    {analysis && <>
      {!loading && <p className="terrain-area-feedback" data-terrain-tour-anchor="terrain-results" role="status">{feedback}
        {view === '3d' && appliedLayout && <><br />{showModules && appliedLayout.moduleCount > 0 ? '3Dはモジュール配置を表示中です。' : '3Dは地形のみ表示中です。'}</>}
      </p>}
      <dl className="terrain-area-summary"><div><dt>図形面積</dt><dd>約{number(summary?.polygonAreaM2, 0)} <small>m²</small></dd></div><div><dt>高低差</dt><dd>約{number(summary?.heightRange)} <small>m</small></dd></div><div><dt title="10m幅で見た局所勾配の中央値">勾配の中央値</dt><dd>{Number.isFinite(summary?.medianSlope) ? `${number(summary.medianSlope)}°` : '未取得'}</dd></div></dl>
      {partial && <p className="terrain-area-warning" role="status">標高・勾配に未確認部分があります。集計は取得部分の参考値です。</p>}
      {onPreviewChange && <TerrainLayoutPreview analysis={analysis} preview={preview} onChange={onPreviewChange} moduleVisibility={view === '3d' ? { shown: showModules, onToggle: toggleModules } : null} autoCalculateKey={autoLayoutKey} suppressSlopeCoachmark={suppressSlopeCoachmark} onSlopeChanged={onSlopeChanged} onNoticeChange={setLayoutNotice} parcelCount={parcelOverlay.labels.length} onShow3D={() => setView('3d')} onReacquire={onAnalyze} onBoundary={onDrawBoundary} />}
      {view === 'plan' ? <TerrainAreaPlan analysis={analysis} position={position} layout={layout} layoutCandidates={layoutPool} onToggleRack={toggleRack} fence={fence} parcelOverlay={shownParcels} rackControls={rackControls} /> : <TerrainArea3D analysis={analysis} position={position} layout={layout} layoutCandidates={layoutPool} onToggleRack={toggleRack} fence={fence} parcelOverlay={shownParcels} rackControls={rackControls} fitOnLayoutReveal interactive azimuth={215} />}
      {fence?.truncated && <p className="terrain-layout-footnote" role="status">フェンスは表示上限のため一部だけを描いています。</p>}
      {shownParcels?.truncated && <p className="terrain-layout-footnote" role="status">地番の表示数を制限しています。</p>}
      {shownParcels && publicParcelsLimited && <p className="terrain-layout-footnote" role="status">公開地番の取得・表示は一部です。地番が見えない部分を「筆がない」と判断しないでください。</p>}
      <div className="terrain-area-evidence-tools"><span>資料・条件</span><TerrainHelpDialog title="地形の資料・条件"><dl className="terrain-area-evidence-list">
        <div><dt>対象</dt><dd>地図上の有効な検討範囲。参考の筆と除外範囲は集計に含みません。</dd></div>
        <div><dt>標高資料</dt><dd>{analysis.source?.name || '国土地理院DEM'}{analysis.source?.mixed ? '（資料混在）' : ''}{sourceLayers.length > 0 && <ul>{sourceLayers.map((layer) => <li key={layer.id}>{layer.label || layer.id}{Number.isFinite(layer.nativeResolutionMeters) ? `・原資料${layer.nativeResolutionMeters}m級` : ''}</li>)}</ul>}</dd></div>
        <div><dt>計算</dt><dd>表示・集計格子 {analysis.grid?.step}m、局所勾配は10m幅の中央差分。上の勾配は中央値で、両端平均ではありません。表示間隔は測量精度ではありません。</dd></div>
        <div><dt>3Dの底面</dt><dd>高さを見やすくする表示用です。地層・土量は示さず、除外・欠測部分は地表と同じ範囲で空けています。</dd></div>
        <div><dt>取得範囲</dt><dd>標高 約{number(summary?.coveragePercent)}% ／ 勾配 約{number(summary?.slopeCoveragePercent)}%</dd></div>
        <div><dt>取得</dt><dd>{dateText(analysis.fetchedAt)}</dd></div>
      </dl><p>黄色線は測量で確認した筆界ではありません。樹木・建物・擁壁や造成の細部は現地・図面で確認してください。</p><p>地番・筆の線は読み込んだ資料／公開地番の参考表示です。公開データは2024年資料のタイル片で、測量筆界ではありません。</p><p>この地形・配置の検討範囲には、指定範囲と除外図形が反映されます。シンプルモードで地図から選んだ対象を分析するときは、指定範囲や除外図形で切り取る前の合併形状を使います。{parcels.some(isMapParcel) && MAP_PARCEL_NOTICE}</p><button type="button" className="terrain-area-quiet-button" onClick={onClear} disabled={!onClear}>地形の結果をクリア</button></TerrainHelpDialog></div>
    </>}
  </section>
}
