import { useEffect, useId, useState } from 'react'
import { TerrainAreaPlan, TerrainArea3D } from './TerrainAreaFigures.jsx'
import './terrain-area.css'

const number = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString('ja-JP', { maximumFractionDigits: digits }) : '—'

function dateText(value) {
  const date = new Date(value)
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '未記録'
}

export default function TerrainAreaPanel({ geometry, metrics, analysis, status = 'idle', progress, error, onAnalyze, onCancel, onClear, position, onDrawBoundary, onOpenReport }) {
  const [view, setView] = useState('plan')
  const id = `terrain-area-${useId().replace(/:/g, '')}`
  const state = typeof status === 'string' ? status : status?.status || 'idle'
  const loading = ['loading', 'fetching', 'calculating'].includes(state)
  const summary = analysis?.summary
  const partial = summary && (summary.coveragePercent < 100 || summary.slopeCoveragePercent < 100)
  const sourceLayers = analysis?.source?.layers || []
  const message = typeof error === 'string' ? error : error?.message || (state === 'error' ? status?.message : '')
  useEffect(() => { setView('plan') }, [analysis?.geometryKey, analysis?.fetchedAt])

  return <section className="terrain-area-panel" aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`} className="terrain-area-panel-heading">範囲の地形</h3>
    {analysis ? <div className="terrain-area-toolbar">
      <div className="terrain-area-view-switch" role="group" aria-label="地形の見方"><button type="button" aria-pressed={view === 'plan'} className={view === 'plan' ? 'is-active' : ''} onClick={() => setView('plan')}>等高線</button><button type="button" aria-pressed={view === '3d'} className={view === '3d' ? 'is-active' : ''} onClick={() => setView('3d')}>3D</button></div>
      <div className="terrain-area-result-actions"><button type="button" className="secondary-button" onClick={onOpenReport} disabled={!onOpenReport}>レポート</button><button type="button" className="terrain-area-quiet-button" onClick={onAnalyze} disabled={!onAnalyze || loading}>再取得</button></div>
    </div> : geometry && !loading ? <div className="terrain-area-toolbar"><p className="terrain-area-scope terrain-area-preview"><span>参考範囲</span><strong>約{number(metrics?.usableAreaM2, 0)} <small>m²</small></strong></p><button type="button" className="secondary-button terrain-area-primary-action" onClick={onAnalyze} disabled={!onAnalyze}>{message ? '再試行' : '地形を確認'}</button></div> : null}
    {!geometry && <div className="terrain-area-empty"><p>地図で範囲を描き、「地形を確認」を押してください。</p><button type="button" className="secondary-button" onClick={onDrawBoundary} disabled={!onDrawBoundary}>範囲を描く</button></div>}
    {loading && <div className="terrain-area-progress" role="status"><div><strong>{progress?.phase === 'calculating' ? '等高線・勾配を計算中…' : '標高を取得中…'}</strong>{Number.isFinite(progress?.completedTiles) && <span>取得 {progress.completedTiles}タイル{Number.isFinite(progress.totalTiles) ? ` / 現在の対象 ${progress.totalTiles}タイル` : ''}</span>}</div><button type="button" className="secondary-button" onClick={onCancel} disabled={!onCancel}>中止</button></div>}
    {!loading && message && <div className="terrain-area-warning" role="alert"><p>{message}</p></div>}
    {!loading && ['cancelled', 'canceled'].includes(state) && !message && <p className="terrain-area-scope" role="status">取得を中止しました。範囲は保持されています。</p>}
    {analysis && <>
      <dl className="terrain-area-summary"><div><dt>図形面積</dt><dd>約{number(summary?.polygonAreaM2, 0)} <small>m²</small></dd></div><div><dt>高低差</dt><dd>約{number(summary?.heightRange)} <small>m</small></dd></div><div><dt title="10m幅で見た局所勾配の中央値">勾配の中央値</dt><dd>{Number.isFinite(summary?.medianSlope) ? `${number(summary.medianSlope)}°` : '未取得'}</dd></div></dl>
      {partial && <p className="terrain-area-warning" role="status">標高・勾配に未確認部分があります。集計は取得部分の参考値です。</p>}
      {view === 'plan' ? <TerrainAreaPlan analysis={analysis} position={position} /> : <TerrainArea3D analysis={analysis} position={position} interactive />}
      <details className="terrain-area-evidence"><summary>資料・条件 <span>DEM参考値 / 施工可否未判定</span></summary><dl>
        <div><dt>対象</dt><dd>地図上の有効な検討範囲。参考の筆と除外範囲は集計に含みません。</dd></div>
        <div><dt>標高資料</dt><dd>{analysis.source?.name || '国土地理院DEM'}{analysis.source?.mixed ? '（資料混在）' : ''}{sourceLayers.length > 0 && <ul>{sourceLayers.map((layer) => <li key={layer.id}>{layer.label || layer.id}{Number.isFinite(layer.nativeResolutionMeters) ? `・原資料${layer.nativeResolutionMeters}m級` : ''}</li>)}</ul>}</dd></div>
        <div><dt>計算</dt><dd>表示・集計格子 {analysis.grid?.step}m、局所勾配は10m幅の中央差分。上の勾配は中央値で、両端平均ではありません。表示間隔は測量精度ではありません。</dd></div>
        <div><dt>取得範囲</dt><dd>標高 約{number(summary?.coveragePercent)}% ／ 勾配 約{number(summary?.slopeCoveragePercent)}%</dd></div>
        <div><dt>取得</dt><dd>{dateText(analysis.fetchedAt)}</dd></div>
      </dl><p>黄色線は測量で確認した筆界ではありません。樹木・建物・擁壁や造成の細部は現地・図面で確認してください。</p><button type="button" className="terrain-area-quiet-button" onClick={onClear} disabled={!onClear}>地形の結果をクリア</button></details>
    </>}
  </section>
}
