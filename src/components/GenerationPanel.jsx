import { useEffect, useRef, useState } from 'react'
import { GENERATION_DOCS, generationInputs } from '../../shared/generation.js'

export default function GenerationPanel({ position, result, onChange, annualYield = '' }) {
  const [inputs, setInputs] = useState(() => result?.inputs || { peakpower: 50, angle: 20, aspect: 0, loss: 14 })
  const [status, setStatus] = useState('idle'), [message, setMessage] = useState('')
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])
  function edit(key, value) { controller.current?.abort(); setStatus('idle'); setMessage('条件を変更しました。再計算するとレポートに反映されます。'); setInputs(current => ({ ...current, [key]: value })); onChange(null) }
  async function calculate(event) {
    event.preventDefault()
    let values
    try { values = generationInputs({ ...inputs, ...position }) } catch (error) { setMessage(error.message); setStatus('error'); return }
    controller.current?.abort()
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
    } finally { clearTimeout(timeout) }
  }
  function cancel() { controller.current?.abort(); controller.current = null; setStatus('idle'); setMessage('計算を取り消しました。') }
  return <details className="generation-panel" id="generation-panel">
    <summary>参考発電量を計算・確認する</summary>
    <p>同じ候補地の長期平均をPVGISで計算します。初期値は検討用の仮条件です。実際の設備に合わせて変更してください。</p>
    <form onSubmit={calculate}><div className="generation-panel__inputs">
      <label>パネル容量（DC kWp）<input type="number" min="0.1" max="100000" step="any" required value={inputs.peakpower} onChange={e => edit('peakpower', e.target.value)} /></label>
      <label>傾斜角（°）<input type="number" min="0" max="90" step="any" required value={inputs.angle} onChange={e => edit('angle', e.target.value)} /></label>
      <label>向き<select value={inputs.aspect} onChange={e => edit('aspect', e.target.value)}><option value="0">南</option><option value="-45">南東</option><option value="45">南西</option><option value="-90">東</option><option value="90">西</option><option value="180">北</option></select></label>
      <label>システム損失（%）<input type="number" min="0" max="99" step="any" required value={inputs.loss} onChange={e => edit('loss', e.target.value)} /></label>
    </div><button className="power-page__primary" disabled={!position || status === 'loading'}>{status === 'loading' ? '計算中…' : 'この条件で計算する'}</button>{status === 'loading' && <button type="button" onClick={cancel}>計算を取り消す</button>}</form>
    {message && <p role={status === 'error' ? 'alert' : 'status'}>{message}</p>}
    {result && <div className="generation-panel__result"><strong>参考年間発電量 <b>{Math.round(result.annualKwh).toLocaleString('ja-JP')}</b> kWh/年</strong><span>容量1 kWpあたり {Math.round(result.annualKwh / result.inputs.peakpower).toLocaleString('ja-JP')} kWh/年</span><div className="generation-panel__months">{result.monthly.map(row => <div key={row.month}><span>{row.month}月</span><b>{Math.round(row.kwh).toLocaleString('ja-JP')}</b><small>kWh</small></div>)}</div><p>{result.source} / {result.period || '期間は出典で確認'} / 取得 {new Date(result.fetchedAt).toLocaleDateString('ja-JP')}</p></div>}
    {annualYield && <p>Solar Pro年間発電量（既存の入力値）：<strong>{annualYield}</strong></p>}
    <p className="power-page__footnote">結晶シリコン・架台設置・固定式。PVGIS標準の地形地平線を使用します。このアプリで調べた樹木・建物の日影、NEDO積雪係数、個別PCS制約、系統の出力制御条件は未反映です。売電量・売上の確定値ではありません。<a href={GENERATION_DOCS} target="_blank" rel="noreferrer">計算方法・出典</a></p>
  </details>
}
