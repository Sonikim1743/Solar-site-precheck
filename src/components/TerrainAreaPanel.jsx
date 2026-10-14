import { useEffect, useId, useMemo, useState } from 'react'
import { TerrainAreaPlan, TerrainArea3D } from './TerrainAreaFigures.jsx'
import TerrainLayoutPreview, { selectedTerrainLayout, terrainLayoutAnalysisKey } from './TerrainLayoutPreview.jsx'
import { toggleTerrainRackSelection, adjustTerrainRackSelection } from '../utils/terrainLayoutSelection.js'
import TerrainHelpDialog from './TerrainHelpDialog.jsx'
import { buildTerrainFence } from '../utils/terrainFence.js'
import { buildTerrainParcelOverlay } from '../utils/terrainParcelOverlay.js'
import './terrain-area.css'

const number = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString('ja-JP', { maximumFractionDigits: digits }) : '—'

function dateText(value) {
  const date = new Date(value)
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '未記録'
}

export default function TerrainAreaPanel({ geometry, metrics, analysis, status = 'idle', progress, error, onAnalyze, onCancel, onClear, position, onDrawBoundary, onOpenReport, onOpenDrawing, parcels = [], publicParcels = [], publicParcelsLimited = false, preview, onPreviewChange }) {
  const [view, setView] = useState('plan')
  const id = `terrain-area-${useId().replace(/:/g, '')}`
  const state = typeof status === 'string' ? status : status?.status || 'idle'
  const loading = ['loading', 'fetching', 'calculating'].includes(state)
  const summary = analysis?.summary
  const partial = summary && (summary.coveragePercent < 100 || summary.slopeCoveragePercent < 100)
  const sourceLayers = analysis?.source?.layers || []
  const message = typeof error === 'string' ? error : error?.message || (state === 'error' ? status?.message : '')
  const parcelOverlay = useMemo(() => buildTerrainParcelOverlay(analysis, [...parcels, ...publicParcels]), [analysis, parcels, publicParcels])
  const layoutPool = preview?.enabled && preview?.layout?.analysisKey === terrainLayoutAnalysisKey(analysis) && preview.layout.analysisReference === analysis && preview.layout.options?.rows === 4 && Number.isInteger(preview.layout.options?.minColumns) ? preview.layout : null
  const layout = useMemo(() => layoutPool ? selectedTerrainLayout(layoutPool, preview) : null, [layoutPool, preview?.activeRackCount, preview?.disabledRackIds])
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
  useEffect(() => { setView('plan') }, [analysis?.geometryKey, analysis?.fetchedAt])

  return <section className="terrain-area-panel" aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`} className="terrain-area-panel-heading">範囲の地形</h3>
    {analysis ? <div className="terrain-area-toolbar">
      <div className="terrain-area-view-switch" role="group" aria-label="地形の見方"><button type="button" aria-pressed={view === 'plan'} className={view === 'plan' ? 'is-active' : ''} onClick={() => setView('plan')}>等高線</button><button type="button" aria-pressed={view === '3d'} className={`terrain-area-3d-button${view === '3d' ? ' is-active' : ''}`} onClick={() => setView('3d')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 22 7.5v9L12 22 2 16.5v-9Z M2 7.5 12 13l10-5.5 M12 13v9" /></svg>3Dで見る</button></div>
      <div className="terrain-area-result-actions">{preview?.layout?.analysisReference === analysis && <button type="button" className="secondary-button" onClick={onOpenDrawing} disabled={!onOpenDrawing || preview?.calculating}>配置図PDF · 1枚</button>}<button type="button" className="secondary-button" onClick={onOpenReport} disabled={!onOpenReport}>レポート</button><button type="button" className="terrain-area-quiet-button" onClick={onAnalyze} disabled={!onAnalyze || loading}>再取得</button></div>
    </div> : geometry && !loading ? <div className="terrain-area-toolbar"><p className="terrain-area-scope terrain-area-preview"><span>参考範囲</span><strong>約{number(metrics?.usableAreaM2, 0)} <small>m²</small></strong></p><button type="button" className="secondary-button terrain-area-primary-action" onClick={onAnalyze} disabled={!onAnalyze}>{message ? '再試行' : '地形を確認'}</button></div> : null}
    {!geometry && <div className="terrain-area-empty"><p>地図で範囲を描き、「地形を確認」を押してください。</p><button type="button" className="secondary-button" onClick={onDrawBoundary} disabled={!onDrawBoundary}>範囲を描く</button></div>}
    {loading && <div className="terrain-area-progress" role="status"><div><strong>{progress?.phase === 'calculating' ? '等高線・勾配を計算中…' : '標高を取得中…'}</strong>{Number.isFinite(progress?.completedTiles) && <span>取得 {progress.completedTiles}タイル{Number.isFinite(progress.totalTiles) ? ` / 現在の対象 ${progress.totalTiles}タイル` : ''}</span>}</div><button type="button" className="secondary-button" onClick={onCancel} disabled={!onCancel}>中止</button></div>}
    {!loading && message && <div className="terrain-area-warning" role="alert"><p>{message}</p></div>}
    {!loading && ['cancelled', 'canceled'].includes(state) && !message && <p className="terrain-area-scope" role="status">取得を中止しました。範囲は保持されています。</p>}
    {analysis && <>
      <dl className="terrain-area-summary"><div><dt>図形面積</dt><dd>約{number(summary?.polygonAreaM2, 0)} <small>m²</small></dd></div><div><dt>高低差</dt><dd>約{number(summary?.heightRange)} <small>m</small></dd></div><div><dt title="10m幅で見た局所勾配の中央値">勾配の中央値</dt><dd>{Number.isFinite(summary?.medianSlope) ? `${number(summary.medianSlope)}°` : '未取得'}</dd></div></dl>
      {partial && <p className="terrain-area-warning" role="status">標高・勾配に未確認部分があります。集計は取得部分の参考値です。</p>}
      {onPreviewChange && <TerrainLayoutPreview analysis={analysis} preview={preview} onChange={onPreviewChange} parcelCount={parcelOverlay.labels.length} onShow3D={() => setView('3d')} onReacquire={onAnalyze} onBoundary={onDrawBoundary} />}
      {view === 'plan' ? <TerrainAreaPlan analysis={analysis} position={position} layout={layout} layoutCandidates={layoutPool} onToggleRack={toggleRack} fence={fence} parcelOverlay={shownParcels} rackControls={rackControls} /> : <TerrainArea3D analysis={analysis} position={position} layout={layout} layoutCandidates={layoutPool} onToggleRack={toggleRack} fence={fence} parcelOverlay={shownParcels} rackControls={rackControls} interactive />}
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
      </dl><p>黄色線は測量で確認した筆界ではありません。樹木・建物・擁壁や造成の細部は現地・図面で確認してください。</p><p>地番・筆の線は読み込んだ資料／公開地番の参考表示です。公開データは2024年資料のタイル片で、測量筆界ではありません。</p><button type="button" className="terrain-area-quiet-button" onClick={onClear} disabled={!onClear}>地形の結果をクリア</button></TerrainHelpDialog></div>
    </>}
  </section>
}
