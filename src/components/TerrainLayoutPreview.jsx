import { useEffect, useId, useRef, useState } from 'react'
import { appliedTerrainPreview, terrainLayoutAnalysisKey } from '../utils/terrainLayoutComparison.js'
import { normalizeTerrainLayoutOptions } from '../utils/terrainLayout.js'
import { selectedTerrainLayout } from '../utils/terrainLayoutSelection.js'
import TerrainHelpDialog from './TerrainHelpDialog.jsx'
import { terrainLayoutErrorGuidance, terrainLayoutResultMatchesOptions } from '../utils/terrainLayoutError.js'
import { TERRAIN_LAYOUT_SAVE } from '../utils/terrainLayoutReport.js'
import { layoutOutputState, layoutRequestKey, terrainLayoutMode } from '../utils/layoutOutputState.js'
export { selectedTerrainLayout } from '../utils/terrainLayoutSelection.js'

const number = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString('ja-JP', { maximumFractionDigits: digits }) : '—'
export { terrainLayoutAnalysisKey } from '../utils/terrainLayoutComparison.js'

// Preview settings live in App. View toggles and navigation never edit the
// selected range, the acquired DEM or the saved record schema.
export function TerrainLayoutErrorNotice({ error, onRetry, onRefresh, onReacquire, onBoundary, onConditions }) {
  const actions = { refresh: ['画面を更新', onRefresh], reacquire: ['地形を再取得', onReacquire], boundary: ['範囲を見直す', onBoundary], conditions: ['配置条件を開く', onConditions] }
  const [label, action] = actions[error.action] || actions.refresh
  return <div className="terrain-area-warning terrain-layout-error" role="alert"><strong>{error.message}</strong><p>{error.hint}</p><div><button type="button" onClick={action} disabled={!action}>{label}</button><button type="button" onClick={onRetry} disabled={!onRetry}>再試行</button></div></div>
}

export default function TerrainLayoutPreview({ analysis, preview, onChange, parcelCount, onShow3D, onReacquire, onBoundary }) {
  const [localBusy, setBusy] = useState(false)
  const busy = localBusy || Boolean(preview?.calculating)
  const [error, setError] = useState('')
  const workerRef = useRef(null)
  const retryRef = useRef(null)
  const [conditionsOpen, setConditionsOpen] = useState(false)
  const conditionsRef = useRef(null)
  const conditionsId = `layout-conditions-${useId().replace(/:/g, '')}`
  const onChangeRef = useRef(onChange)
  const latestAnalysisRef = useRef(analysis)
  onChangeRef.current = onChange
  latestAnalysisRef.current = analysis
  const key = terrainLayoutAnalysisKey(analysis)
  const options = { ...normalizeTerrainLayoutOptions(), ...preview?.options }
  const draftChanged = layoutOutputState(analysis, preview).blocked && !preview?.calculating
  const requestKey = layoutRequestKey(preview), latestRequest = useRef(requestKey)
  latestRequest.current = requestKey
  const southDraftChanged = Boolean(preview?.southComparison && !terrainLayoutResultMatchesOptions({options:preview.southComparison.requestedOptions || preview.southComparison.options},normalizeTerrainLayoutOptions(options)))
  const comparisonDraftChanged = Boolean(preview?.comparison && !terrainLayoutResultMatchesOptions({options:preview.comparison.options},{...normalizeTerrainLayoutOptions(options),slopeLimitDeg:preview.comparison.options.slopeLimitDeg}))
  const pool = appliedTerrainPreview(analysis, preview)
  const layout = selectedTerrainLayout(pool, preview)
  const enabled = Boolean(layout && preview?.enabled)
  useEffect(() => {
    retryRef.current = null
    setBusy(false); setError('')
    onChangeRef.current(previous => previous?.layout && (previous.layout.analysisReference !== analysis || previous.layout.analysisKey !== key)
      ? { ...previous, layout: null, comparison: null, southComparison: null, activeRackCount: null, disabledRackIds: [], enabled: false, calculating: false } : previous?.calculating ? { ...previous, calculating: false } : previous)
    return () => { workerRef.current?.terminate(); workerRef.current = null; onChangeRef.current(previous => previous?.calculating ? { ...previous, calculating: false } : previous) }
  }, [analysis, key])
  useEffect(() => {
    if (workerRef.current && workerRef.current.layoutRequestKey !== requestKey) {
      workerRef.current.terminate(); workerRef.current = null; setBusy(false)
      onChangeRef.current(previous => ({ ...previous, calculating: false }))
    }
  }, [requestKey])

  const changeOptions = patch => {
    retryRef.current = null
    workerRef.current?.terminate(); workerRef.current = null
    setBusy(false); setError('')
    onChangeRef.current(previous => ({ ...previous, options: { ...options, ...patch }, ...(Object.hasOwn(patch, 'azimuthDeg') ? { layoutMode: 'manual' } : {}), calculating: false }))
  }
  const calculate = (patch = {}, optimized = false, compareSlopes = false, fixedSouth = false) => {
    const runOptions = normalizeTerrainLayoutOptions({ ...options, ...patch })
    const mode = compareSlopes || fixedSouth ? terrainLayoutMode(preview) : optimized ? 'optimized' : 'manual'
    retryRef.current = { options: runOptions, optimized, compareSlopes, fixedSouth }
    workerRef.current?.terminate()
    workerRef.current = null
    setBusy(true); setError('')
    onChangeRef.current(previous => ({ ...previous, options: runOptions, layoutMode: mode, calculating: true }))
    try {
      const worker = new Worker(new URL('../workers/terrainLayoutWorker.js', import.meta.url), { type: 'module' })
      workerRef.current = worker
      worker.layoutRequestKey = layoutRequestKey({ options: runOptions, layoutMode: mode })
      worker.onmessage = ({ data }) => {
        if (workerRef.current !== worker || latestAnalysisRef.current !== analysis || latestRequest.current !== worker.layoutRequestKey) { worker.terminate(); return }
        worker.terminate(); workerRef.current = null; setBusy(false)
        if (data.error) { setError(terrainLayoutErrorGuidance(data.code || 'calculation', data.error)); onChangeRef.current(previous => ({ ...previous, calculating: false })); return }
        if (compareSlopes ? !(data.comparison?.layouts?.length === 2 && data.comparison.layouts.every((result, index) => terrainLayoutResultMatchesOptions(result, { ...runOptions, slopeLimitDeg: [15,20][index] }))) : !terrainLayoutResultMatchesOptions(data.result, fixedSouth ? { ...runOptions, azimuthDeg:180 } : runOptions, optimized)) { setError(terrainLayoutErrorGuidance('worker')); onChangeRef.current(previous => ({ ...previous, calculating: false })); return }
        if (fixedSouth) {
          if(data.result.options.azimuthDeg!==180 || data.result.stats?.autoSearch?.mode!=='south-fixed'){setError(terrainLayoutErrorGuidance('worker'));onChangeRef.current(previous=>({...previous,calculating:false}));return}
          onChangeRef.current(previous=>({...previous,southComparison:{...data.result,requestedOptions:runOptions,analysisKey:key,analysisReference:analysis},calculating:false}));return
        }
        if (compareSlopes) {
          onChangeRef.current(previous => ({ ...previous, comparison: { ...data.comparison, analysisKey: key, analysisReference: analysis }, calculating: false }))
          return
        }
        const appliedOptions={ ...runOptions, azimuthDeg:data.result.options.azimuthDeg, scanOffsetUM:data.result.options.scanOffsetUM, scanOffsetVM:data.result.options.scanOffsetVM }
        onChangeRef.current(previous => ({ ...previous, options: appliedOptions, appliedOptions, layoutMode: mode, appliedMode: mode, layout: { ...data.result, analysisKey: key, analysisReference: analysis }, activeRackCount: null, disabledRackIds: [], enabled: true, calculating: false }))
        onShow3D?.()
      }
      worker.onerror = event => {
        if (workerRef.current !== worker) return
        worker.terminate(); workerRef.current = null; setBusy(false)
        setError(terrainLayoutErrorGuidance('worker', event.message))
        onChangeRef.current(previous => ({ ...previous, calculating: false }))
      }
      worker.postMessage({ analysis, options: runOptions, optimized, compareSlopes, fixedSouth, baseline: optimized || fixedSouth ? pool : null })
    } catch (failure) {
      workerRef.current?.terminate(); workerRef.current = null
      setBusy(false); setError(terrainLayoutErrorGuidance(failure?.name === 'DataCloneError' ? 'data' : 'startup'))
      onChangeRef.current(previous => ({ ...previous, calculating: false }))
    }
  }
  const toggle = () => {
    if (!layout) { calculate(); return }
    onChangeRef.current(previous => ({ ...previous, enabled: !enabled }))
    if (!enabled) onShow3D?.()
  }
  const cancel = () => { workerRef.current?.terminate(); workerRef.current = null; setBusy(false); onChangeRef.current(previous => ({ ...previous, calculating: false })) }
  const changeSlope = value => {
    changeOptions({ slopeLimitDeg: value })
    if (pool) calculate({ slopeLimitDeg: value })
  }
  const columns = options.minColumns === options.maxColumns ? `${options.maxColumns}列` : `${options.minColumns}〜${options.maxColumns}列`
  const widthFor = columns => columns * options.moduleWidthM + (columns - 1) * options.moduleGapM
  const rackLength = options.rows * options.moduleHeightM + (options.rows - 1) * options.moduleGapM
  const rackDepth = rackLength * Math.cos(options.tiltDeg * Math.PI / 180)

  return <div className="terrain-layout-preview">
    <div className="terrain-layout-bar">
      <button type="button" className="terrain-layout-toggle" aria-pressed={enabled} disabled={busy} onClick={toggle}>{pool ? `参考配置 ${enabled ? 'ON' : 'OFF'}` : '自動で参考配置'}</button>
      <button type="button" disabled={busy} onClick={() => calculate({}, false, true)}>地形勾配15° / 20°を比較</button>
      {pool && <button type="button" className="terrain-layout-optimize" disabled={busy} onClick={() => calculate({}, true)}>方位も最適化して適用（±30°）</button>}
      <button type="button" className="terrain-layout-optimize" disabled={busy} onClick={()=>calculate({},false,false,true)}>真南固定・最大配置を比較</button>
      <label className="terrain-layout-slope-select">配置可能な地形勾配<select aria-label="参考配置の勾配条件" title="選んだ局所勾配未満で参考配置を比較。施工可否の判定ではありません。" value={options.slopeLimitDeg} disabled={busy} onChange={event => changeSlope(Number(event.target.value))}>{[10,15,20].map(degrees => <option key={degrees} value={degrees}>{degrees}°未満</option>)}</select></label>
    </div>
    <div className="terrain-layout-utility">
      <button type="button" aria-expanded={conditionsOpen} aria-controls={conditionsId} onClick={() => setConditionsOpen(value => !value)}><span aria-hidden="true">{conditionsOpen ? '▾' : '▸'}</span> 配置条件</button>
      <span className="terrain-layout-format">4段 × {columns} · モジュール{options.tiltDeg}°{layout && ` · 適用方位${number(layout.options.azimuthDeg)}°`}</span>
      <div className="terrain-layout-view-options" role="group" aria-label="地形図の表示">
      <button type="button" className="terrain-layout-parcel-toggle" aria-pressed={Boolean(preview?.labels)} disabled={!parcelCount} onClick={() => onChangeRef.current(previous => ({ ...previous, labels: !previous.labels }))}>3D地番 {preview?.labels ? 'ON' : 'OFF'}</button>
      <button type="button" className="terrain-layout-fence-toggle" aria-label="配置を囲むフェンス" aria-pressed={Boolean(preview?.fence)} title="選択中の架台を囲む参考フェンスを表示・非表示" onClick={() => onChangeRef.current(previous => ({ ...previous, fence: !previous.fence }))}>フェンス {preview?.fence ? 'ON' : 'OFF'}</button>
      <TerrainHelpDialog title="参考配置の使い方・条件">
        <h4>操作</h4><p>架台をクリックで除外、点線で復元。図の下で増減できます。再配置すると個別除外を初期化します。</p>
        <h4>実寸と対象範囲</h4>
        <p>1架台：幅 {number(widthFor(options.minColumns), 3)}{options.maxColumns !== options.minColumns ? `〜${number(widthFor(options.maxColumns), 3)}` : ''}m × 水平奥行 {number(rackDepth, 3)}m（パネル面の奥行 {number(rackLength, 3)}m）。前後の空き{number(options.rowGapM)}mを加えた行ピッチは{number(rackDepth+options.rowGapM,3)}m。4段固定・横置きの実寸を地形と同じメートル座標で配置します。初期値はモジュール15°・前後の空き3.3mで、日影を保証する離隔ではありません。</p>
        <p>JKM720N-66HL5-BDVの外形2.384 × 1.303m、モジュール間20mm、地表から最低0.8mの仮条件。地形のセル4点平均の局所勾配が{options.slopeLimitDeg}°未満で、架台全体と空きが有効範囲に収まるものだけを数えます。欠測と除外は使いません。15°・20°の選択は比較用で、施工可否の判定ではありません。</p>
        {layout && <p>対象勾配の参考面積：{layout.stats?.eligibleAreaCalculated === false ? '未計算' : `約${number(layout.eligibleAreaM2, 0)}m²`}。{pool.stats?.autoSearch && `${pool.stats.autoSearch.trials}案を比較、正面${number(pool.options.azimuthDeg, 0)}°。`}</p>}
        <h4>容量の目安</h4><p>DC＝枚数×720W。AC＝DC÷1.5を標準刻みで丸めた参考値（100kW以下は10kW、超えると50kW）。連系・機器・日影・基礎・造成・施工可否は未判定。高さ2倍は表示だけで、枚数と容量は変わりません。</p>
        {layout?.dcKw > 0 && <p>AC参考帯：{number(layout.acRangeKw?.[0], 0)}〜{number(layout.acRangeKw?.[1], 0)}kW。{layout.acTargetKw < 10 && '換算が10kW未満のため表示は下限10kWです。'}</p>}
        <h4>最適配置と仮フェンス</h4><p>最適配置は基準方位±30°を7.5°刻み・開始位置も比較する参考探索です。最大32案・8秒で、最大枚数を保証しません。</p><p>仮フェンスは選択中の架台全体を囲み、端の空きと同じ距離を外側に取る高さ1.2mの参考表示です。離れた架台の間も一緒に囲みます。有効範囲の外と欠測はつなぎません。実測境界・施工線ではありません。</p>
        <h4>保存と地番</h4><p>{TERRAIN_LAYOUT_SAVE}</p><p>地番は公開資料・読み込んだ筆の実データだけを表示し、住所から推測しません。</p>
        {layout?.warnings?.length > 0 && <ul>{layout.warnings.map((warning, index) => <li key={index}>{typeof warning === 'string' ? warning : warning.message}</li>)}</ul>}
      </TerrainHelpDialog>
      </div>
    </div>
    {draftChanged && <p className="terrain-layout-footnote" role="status">条件は未適用です。図は前回の結果です。PDFは現在の条件で再計算してから出力してください。</p>}
    {preview?.comparison?.analysisReference === analysis && <div className="terrain-layout-comparison"><p>地形の局所勾配のみ変更。パネル傾斜・方位・開始位置・間隔・範囲は同一。個別除外なしの自動案です。</p><table><thead><tr><th>地形勾配</th><th>架台</th><th>枚数</th><th>DC kW</th><th>表示</th></tr></thead><tbody>{preview.comparison.layouts.map(result => <tr key={result.options.slopeLimitDeg}><th>{result.options.slopeLimitDeg}°未満</th><td>{result.rackCount}</td><td>{result.moduleCount}</td><td>{number(result.dcKw)}</td><td><button type="button" disabled={busy||comparisonDraftChanged} onClick={() => { if(comparisonDraftChanged)return; onChangeRef.current(previous => ({ ...previous, options: result.options, appliedOptions: result.options, layoutMode: 'manual', appliedMode: 'manual', layout: { ...result, analysisKey: key, analysisReference: analysis }, disabledRackIds: [], activeRackCount: null, enabled: true })); onShow3D?.() }}>この案を見る</button></td></tr>)}</tbody></table><p>{comparisonDraftChanged && <span role="status">条件を変更しました。比較を再計算してから適用してください。 </span>}差（20° − 15°）：{preview.comparison.layouts[1].rackCount - preview.comparison.layouts[0].rackCount}架台 / {preview.comparison.layouts[1].moduleCount - preview.comparison.layouts[0].moduleCount}枚 / {number(preview.comparison.layouts[1].dcKw - preview.comparison.layouts[0].dcKw)} kW。案の切替・再計算成功時は個別除外を初期化します。</p></div>}
    {preview?.southComparison?.analysisReference===analysis && <div className="terrain-layout-comparison terrain-layout-south-comparison"><p><strong>真南180°固定 · 探索候補内の最多配置</strong> / モジュール傾斜{preview.southComparison.options.tiltDeg}°、間隔・離隔・地形条件は入力時の値を維持。開始位置を{preview.southComparison.stats.autoSearch.trials}案比較。全域最大は未保証。</p><table><thead><tr><th>案</th><th>架台</th><th>枚数</th><th>DC kW</th></tr></thead><tbody>{[['現在の適用案',layout],['真南固定案',preview.southComparison]].filter(([,result])=>result).map(([label,result])=><tr key={label}><th>{label}</th><td>{result.rackCount}</td><td>{result.moduleCount}</td><td>{number(result.dcKw)}</td></tr>)}</tbody></table><button type="button" disabled={busy||southDraftChanged} onClick={()=>{if(southDraftChanged)return;const result=preview.southComparison;onChangeRef.current(previous=>({...previous,options:result.options,appliedOptions:result.options,layoutMode:'south',appliedMode:'south',layout:result,activeRackCount:null,disabledRackIds:[],enabled:true}));onShow3D?.()}}>真南固定案を適用</button>{southDraftChanged&&<p role="status">比較後に配置条件を変更しました。入力条件を保つため、もう一度「真南固定」を比較してください。</p>}<p>比較だけでは現在の結果・個別除外を変えません。適用すると架台の個別除外を初期化します。描いた除外領域は引き続き配置対象外です。</p></div>}
    {localBusy && <div className="terrain-layout-status" role="status"><span>{options.slopeLimitDeg}°未満の地形と除外範囲を確認して配置中…</span><button type="button" onClick={cancel}>中止</button></div>}
    {error && <TerrainLayoutErrorNotice error={error} onRetry={() => { const attempt = retryRef.current; calculate(attempt?.options, attempt?.optimized, attempt?.compareSlopes, attempt?.fixedSouth) }} onRefresh={() => window.location.reload()} onReacquire={onReacquire} onBoundary={onBoundary} onConditions={() => { setConditionsOpen(true); requestAnimationFrame(() => conditionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })) }} />}
    {layout && <>
      <dl className="terrain-layout-totals" aria-label="参考配置の予測規模">
        <div><dt>モジュール</dt><dd>{number(layout.moduleCount, 0)} <small>枚</small></dd></div>
        <div><dt>DC · {number(layout.options.modulePowerW, 0)}W/枚</dt><dd>{number(layout.dcKw)} <small>kW</small></dd></div>
        <div><dt>ACの目安</dt><dd>約{number(layout.acKw, 0)} <small>kW</small></dd></div>
      </dl>
      {(pool.stats?.capped || pool.stats?.autoSearch?.timeLimited) && <p className="terrain-area-warning" role="status">計算上限に達した途中の候補です。最大枚数の保証ではありません。範囲を分けて確認してください。</p>}
      {layout.moduleCount === 0 && <p className="terrain-layout-status" role="status">{pool.moduleCount ? '0架台です。図の点線をクリック、または「増やす」で戻せます。' : '現在の条件では配置できません。範囲・除外・間隔を確認してください。'}</p>}
    </>}
    <div ref={conditionsRef} id={conditionsId} className="terrain-layout-conditions" hidden={!conditionsOpen}>
      <div className="terrain-layout-fields">
        <label>1架台の列数<select value={options.minColumns === options.maxColumns ? options.maxColumns : 'auto'} onChange={event => changeOptions(event.target.value === 'auto' ? { minColumns: 4, maxColumns: 8 } : { minColumns: Number(event.target.value), maxColumns: Number(event.target.value) })}><option value="auto">4〜8列で調整</option>{[4,5,6,7,8].map(columns => <option key={columns} value={columns}>4段 × {columns}列</option>)}</select></label>
        <label>モジュール正面の方位（北0°・時計回り）<select value={options.azimuthDeg} onChange={event => changeOptions({ azimuthDeg: Number(event.target.value) })}>{[...new Set([0,45,90,135,180,225,270,315,options.azimuthDeg])].sort((a,b)=>a-b).map(angle => <option key={angle} value={angle}>{angle}°{angle === 180 ? '（南）' : angle === 0 ? '（北）' : angle === 90 ? '（東）' : angle === 270 ? '（西）' : ''}</option>)}</select></label>
        <label>モジュール傾斜（水平から）<input type="number" min="0" max="60" step="1" value={options.tiltDeg} onChange={event => changeOptions({ tiltDeg: event.target.value === '' ? '' : Number(event.target.value) })} /><span>°</span></label>
        <p className="terrain-layout-angle-note">方位は低い辺側へ向くパネル正面。再計算では入力方位を固定し、「方位も最適化して適用（±30°）」だけが方位も探索します。モジュール傾斜はパネル面の上下角。地形勾配の除外基準・3D視点とは独立です。</p>
        <label>架台左右の空き<input type="number" min="0" max="30" step="0.5" value={options.rackGapM} onChange={event => changeOptions({ rackGapM: event.target.value === '' ? '' : Number(event.target.value) })} /><span>m</span></label>
        <label>アレイ間前後の空き<input type="number" min="0" max="30" step="0.1" value={options.rowGapM} onChange={event => changeOptions({ rowGapM: event.target.value === '' ? '' : Number(event.target.value) })} /><span>m</span></label>
        <div className="terrain-layout-setback-field"><span>範囲・対象勾配の端からの空き</span><div><label><input aria-label="範囲・対象勾配の端からの空き" type="number" min="0" max="30" step="0.5" value={options.setbackM} onChange={event => changeOptions({ setbackM: event.target.value === '' ? '' : Number(event.target.value) })} /><span>m</span></label></div></div>
      </div>
      <button type="button" className="terrain-area-quiet-button" disabled={busy} onClick={() => calculate()}>この条件で再計算</button>
      <button type="button" className="terrain-area-quiet-button" onClick={()=>changeOptions(normalizeTerrainLayoutOptions())}>基本値を入力（15° / 前後3.3m）</button>
    </div>
  </div>
}
