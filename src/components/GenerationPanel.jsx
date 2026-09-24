import { useEffect, useRef, useState } from 'react'
import { GENERATION_DOCS, generationInputs } from '../../shared/generation.js'
import GenerationScenarioPanel from './GenerationScenarioPanel.jsx'
import GenerationResults from './GenerationResults.jsx'

export default function GenerationPanel({ position, result, onChange, annualYield = '', draftInputs, onInputsChange, expanded = false, onNotice, terrain, snowStation, onScenarioSources }) {
  const [localInputs, setLocalInputs] = useState(() => result?.inputs || { peakpower: 50, angle: 20, aspect: 0, loss: 14 })
  const inputs = draftInputs || localInputs
  const setInputs = onInputsChange || setLocalInputs
  const [status, setStatus] = useState('idle'), [message, setMessage] = useState('')
  const controller = useRef(null)
  const comparison = useRef(null)
  useEffect(() => () => {
    if (controller.current && !controller.current.signal.aborted) {
      controller.current.abort()
      onNotice?.('前の発電量計算は画面移動・候補地変更で取り消しました。表示中の条件で再計算できます。')
    }
  }, [onNotice])
  function edit(key, value) { controller.current?.abort(); setStatus('idle'); setMessage('条件を変更しました。再計算するとレポートに反映されます。'); setInputs(current => ({ ...current, [key]: value })); onChange(null) }
  async function calculate(event) {
    event.preventDefault()
    let values
    try { values = generationInputs({ ...inputs, ...position }) } catch (error) { setMessage(error.message); setStatus('error'); return }
    controller.current?.abort()
    onNotice?.('')
    const request = new AbortController(); controller.current = request
    const timeout = setTimeout(() => request.abort('timeout'), 35000)
    setStatus('loading'); setMessage('月別・年間の参考発電量を計算しています…'); onChange(null)
    try {
      const response = await fetch('/api/pv-generation?' + new URLSearchParams(values), { signal: request.signal })
      if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('計算用サーバーの更新が必要です。最新版の起動ファイルでアプリを再起動してください。')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '発電量を取得できませんでした。')
      if (controller.current !== request || request.signal.aborted) return
      onChange(data); setStatus('success'); setMessage('この候補地のレポート・設備確認メモに反映しました。')
    } catch (error) {
      if (controller.current !== request) return
      if (request.signal.aborted && request.signal.reason !== 'timeout') return
      setStatus('error'); setMessage(request.signal.aborted ? '35秒以内に応答がありませんでした。再試行できます。' : error.message)
    } finally { clearTimeout(timeout); if (controller.current === request) controller.current = null }
  }
  function cancel() { controller.current?.abort(); controller.current = null; setStatus('idle'); setMessage('計算を取り消しました。') }
  function showComparison() { if (comparison.current) { comparison.current.open = true; comparison.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); comparison.current.querySelector('summary')?.focus({ preventScroll: true }) } }
  return <details className="generation-panel generation-panel--overview" id="generation-panel" open={expanded || undefined}>
    <summary>参考発電量を見る</summary>
    {message && <p className="generation-status" role={status === 'error' ? 'alert' : 'status'}>{message}</p>}
    {result && <GenerationResults key={result.fetchedAt} result={result} onCompare={showComparison} />}
    <details className="generation-fold generation-conditions" open={!result || undefined}>
      <summary>{result ? '計算条件を確認・変更' : '設備の条件を入れて計算'}{result && <small>容量・向き・傾斜・損失</small>}</summary>
      <div className="generation-fold__body"><p>同じ候補地の長期平均をPVGISで計算します。初期値は検討用の仮条件です。実際の設備に合わせて変更してください。</p>
      <form onSubmit={calculate}><div className="generation-panel__inputs">
      <label>パネル容量（DC kWp）<input type="number" min="0.1" max="100000" step="any" required value={inputs.peakpower} onChange={e => edit('peakpower', e.target.value)} /></label>
      <label>傾斜角（°）<input type="number" min="0" max="90" step="any" required value={inputs.angle} onChange={e => edit('angle', e.target.value)} /></label>
      <label>向き<select value={inputs.aspect} onChange={e => edit('aspect', e.target.value)}><option value="0">南</option><option value="-45">南東</option><option value="45">南西</option><option value="-90">東</option><option value="90">西</option><option value="180">北</option></select></label>
      <label>システム損失（%）<input type="number" min="0" max="99" step="any" required value={inputs.loss} onChange={e => edit('loss', e.target.value)} /></label>
      </div><button className="power-page__primary" disabled={!position || status === 'loading'}>{status === 'loading' ? '計算中…' : 'この条件で計算する'}</button>{status === 'loading' && <button type="button" onClick={cancel}>計算を取り消す</button>}</form></div>
    </details>
    {result && <details className="generation-fold generation-comparison-controls" ref={comparison}><summary>積雪・地形の比較条件<small>{result.scenario ? '仮定を適用中' : '必要なときに比較'}</small></summary><div className="generation-fold__body"><GenerationScenarioPanel key={result.fetchedAt} position={position} result={result} onChange={onChange} terrain={terrain} snowStation={snowStation} onSources={onScenarioSources} /></div></details>}
    <details className="generation-fold generation-evidence"><summary>詳しい数値と計算の出典</summary><div className="generation-fold__body">
      {result && <><p>{result.source} / {result.period || '期間は出典で確認'} / 取得 {new Date(result.fetchedAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}。容量1 kWpあたり {Math.round(result.annualKwh / result.inputs.peakpower).toLocaleString('ja-JP')} kWh/年。</p>
        <div className="generation-exact-table"><table><caption>月別の参考発電量（kWh）</caption><thead><tr><th scope="col">月</th><th scope="col">基本値</th>{result.scenario && <><th scope="col">試算</th><th scope="col">積雪の仮定減少率</th></>}</tr></thead><tbody>{result.monthly.map(row => <tr key={row.month}><th scope="row">{row.month}月</th><td>{row.kwh.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}</td>{result.scenario && <><td>{result.scenario.monthly.find(item => item.month === row.month)?.kwh.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}</td><td>{result.scenario.snow ? (result.scenario.snow.rates[row.month - 1] * result.scenario.snow.weight).toFixed(2) + '%' : '—'}</td></>}</tr>)}</tbody></table></div>
        {result.scenario && <p>試算の計算日時 {new Date(result.scenario.calculatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}。{result.scenario.snow && `${result.scenario.snow.source} / メッシュ ${result.scenario.snow.mesh} / 影響度 ${result.scenario.snow.weight}%の仮定。`}{result.scenario.terrain ? '周辺地形でPVGIS標準地形を置換しています。分析範囲外の遠方地形は抜ける可能性があります。' : 'PVGIS標準地形を使用しています。'} 資料を変更したら再比較してください。</p>}
      </>}
      {annualYield && <p>Solar Pro年間発電量（既存の入力値）：<strong>{annualYield}</strong></p>}
      <p>結晶シリコン・架台設置・固定式。基本値はPVGIS標準の地形地平線を使用します。選択した積雪の仮定・周辺地形の置換は試算に分けて表示します。個別の樹木・建物、PCS制約、系統出力制御は未反映です。売電量・売上の確定値ではありません。<a href={GENERATION_DOCS} target="_blank" rel="noreferrer">計算方法・出典</a></p>
    </div></details>
  </details>
}
