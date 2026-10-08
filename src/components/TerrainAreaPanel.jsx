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
    <div className="terrain-area-heading"><div><h3 id={`${id}-heading`}>範囲の地形を確認</h3><p>選んだ範囲の等高線と勾配を、平面・3Dで確認します。</p></div>
      {geometry && !analysis && !loading && <button type="button" className="secondary-button" onClick={onAnalyze} disabled={!onAnalyze}>範囲の地形を確認</button>}
    </div>
    {!geometry && <div className="terrain-area-empty"><p>先に地図で検討範囲を描いてください。地点の周辺断面はそのまま使えます。</p><button type="button" className="secondary-button" onClick={onDrawBoundary} disabled={!onDrawBoundary}>範囲を描く</button></div>}
    {geometry && !analysis && !loading && !message && <p className="terrain-area-scope">検討面積 約{number(metrics?.usableAreaM2, 0)} m² · 地図上の参考範囲</p>}
    {loading && <div className="terrain-area-progress" role="status"><div><strong>{progress?.phase === 'calculating' ? '等高線と勾配を計算中…' : '標高データを取得中…'}</strong>{Number.isFinite(progress?.completedTiles) && <span>{progress.completedTiles}タイル取得済み{Number.isFinite(progress.totalTiles) ? `（現在の取得対象 ${progress.totalTiles}）` : ''}</span>}</div><button type="button" className="secondary-button" onClick={onCancel} disabled={!onCancel}>中止</button></div>}
    {!loading && message && <div className="terrain-area-warning" role="alert"><p>{message}</p>{geometry && <button type="button" className="secondary-button" onClick={onAnalyze} disabled={!onAnalyze}>再試行</button>}</div>}
    {!loading && ['cancelled', 'canceled'].includes(state) && !message && <p className="terrain-area-scope" role="status">取得を中止しました。範囲は保持されています。</p>}
    {analysis && <>
      <div className="terrain-area-view-row"><div className="terrain-area-view-switch" role="group" aria-label="地形の見方"><button type="button" aria-pressed={view === 'plan'} className={view === 'plan' ? 'is-active' : ''} onClick={() => setView('plan')}>平面</button><button type="button" aria-pressed={view === '3d'} className={view === '3d' ? 'is-active' : ''} onClick={() => setView('3d')}>3D</button></div><span>同じ参考範囲・同じ標高データ</span></div>
      {partial && <p className="terrain-area-warning" role="status">範囲内の一部は標高未取得または勾配未計算です。集計は取得できた部分の参考値です。</p>}
      {view === 'plan' ? <TerrainAreaPlan analysis={analysis} position={position} /> : <TerrainArea3D analysis={analysis} position={position} interactive />}
      <dl className="terrain-area-summary"><div><dt>検討面積</dt><dd>約{number(summary?.polygonAreaM2, 0)} <small>m²</small></dd></div><div><dt>範囲内の高低差</dt><dd>約{number(summary?.heightRange)} <small>m</small></dd></div><div><dt>地形の目安</dt><dd>{Number.isFinite(summary?.medianSlope) ? `局所勾配 ${number(summary.medianSlope)}°` : '勾配未取得'}<small className="terrain-area-summary-note">中央値・両端平均ではありません</small></dd></div></dl>
      <p className="terrain-area-condition">参考範囲・DEMによる概算です。施工可否は未判定。</p>
      <details className="terrain-area-evidence"><summary>資料と計算条件</summary><dl>
        <div><dt>対象</dt><dd>地図上の有効な検討範囲。参考の筆と除外範囲は集計に含みません。</dd></div>
        <div><dt>標高資料</dt><dd>{analysis.source?.name || '国土地理院DEM'}{analysis.source?.mixed ? '（資料混在）' : ''}{sourceLayers.length > 0 && <ul>{sourceLayers.map((layer) => <li key={layer.id}>{layer.label || layer.id}{Number.isFinite(layer.nativeResolutionMeters) ? `・原資料${layer.nativeResolutionMeters}m級` : ''}</li>)}</ul>}</dd></div>
        <div><dt>計算</dt><dd>表示・集計格子 {analysis.grid?.step}m、局所勾配は10m幅の中央差分。表示間隔は測量精度ではありません。</dd></div>
        <div><dt>取得範囲</dt><dd>標高 約{number(summary?.coveragePercent)}% ／ 勾配 約{number(summary?.slopeCoveragePercent)}%</dd></div>
        <div><dt>取得</dt><dd>{dateText(analysis.fetchedAt)}</dd></div>
      </dl><p>黄色線は測量で確認した筆界ではありません。樹木・建物・擁壁や造成の細部は現地・図面で確認してください。</p><button type="button" className="terrain-area-quiet-button" onClick={onClear} disabled={!onClear}>地形の結果をクリア</button></details>
      <div className="terrain-area-result-actions"><button type="button" className="secondary-button" onClick={onOpenReport} disabled={!onOpenReport}>レポートへ</button><button type="button" className="terrain-area-quiet-button" onClick={onAnalyze} disabled={!onAnalyze || loading}>再取得</button></div>
    </>}
  </section>
}
