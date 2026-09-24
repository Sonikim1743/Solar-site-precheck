import { useEffect, useRef, useState } from 'react'
import { buildGenerationScenario, scenarioHorizon } from '../../shared/generationScenario.js'
import { isConfirmedSnowStation, thirdMeshCode } from '../services/nedo.js'

export default function GenerationScenarioPanel({ position, result, onChange, terrain, snowStation, onSources }) {
  const [snowEnabled, setSnowEnabled] = useState(Boolean(result.scenario?.snow))
  const [terrainEnabled, setTerrainEnabled] = useState(Boolean(result.scenario?.terrain))
  const [weight, setWeight] = useState(result.scenario?.snow?.weight ?? 25)
  const [status, setStatus] = useState('idle'), [message, setMessage] = useState('')
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])

  const rates = snowStation?.snow10cm?.monthly
  const snowReady = isConfirmedSnowStation(snowStation) && snowStation.id === thirdMeshCode(position?.lat, position?.lon)
    && rates?.length === 12 && rates.every(value => Number.isFinite(value) && value >= 0 && value <= 1)
  let horizon = null
  try { horizon = scenarioHorizon(terrain, position) } catch { /* Unavailable data is explained beside its option. */ }

  function edit(setter, value) {
    controller.current?.abort(); controller.current = null
    setter(value); setStatus('idle'); setMessage('条件を変更しました。「この仮定で比較する」で反映します。')
    if (result.scenario) { const { scenario, ...baseline } = result; onChange(baseline) }
  }
  function cancel() { controller.current?.abort(); controller.current = null; setStatus('idle'); setMessage('追加比較を取り消しました。基本の発電量は残っています。') }
  function clear() { cancel(); setSnowEnabled(false); setTerrainEnabled(false); const { scenario, ...baseline } = result; onChange(baseline); setMessage('基本の参考発電量だけを表示しています。') }
  async function compare(event) {
    event.preventDefault()
    if (!snowEnabled && !terrainEnabled) { setMessage('比較に使う条件を選んでください。'); return }
    if ((snowEnabled && !snowReady) || (terrainEnabled && !horizon)) { setStatus('error'); setMessage('同じ候補地の確認済み資料が必要です。積雪・地平線の資料を先に確認してください。'); return }
    if (snowEnabled && (String(weight).trim() === '' || !Number.isFinite(Number(weight)) || Number(weight) < 0 || Number(weight) > 100)) { setStatus('error'); setMessage('仮定の影響度は0〜100%で入力してください。'); return }
    controller.current?.abort()
    const request = new AbortController(); controller.current = request
    const timeout = setTimeout(() => request.abort('timeout'), 35000)
    setStatus('loading'); setMessage(terrainEnabled ? '周辺地形に置き換えた参考値を計算しています…' : '積雪の仮定を月別に反映しています…')
    try {
      let terrainResult = null
      if (terrainEnabled) {
        const response = await fetch('/api/pv-generation?' + new URLSearchParams({ ...result.inputs, userhorizon: horizon.join(',') }), { signal: request.signal })
        if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('追加比較に対応した計算サーバーが必要です。')
        terrainResult = await response.json()
        if (!response.ok) throw new Error(terrainResult.error || '周辺地形の比較値を取得できませんでした。')
      }
      if (controller.current !== request || request.signal.aborted) return
      const snow = snowEnabled ? { rates: [...rates], weight: Number(weight), mesh: snowStation.id, source: `${snowStation.source?.name || 'NEDO MONSOLA-11'} / ${snowStation.source?.statisticalPeriod || '統計期間は原資料で確認'} / 積雪深10cm以上出現率${snowStation.mode === 'manual-corrected' ? '（手動補正値）' : ''}` } : null
      const scenario = buildGenerationScenario(result, { snow, terrain: terrainResult })
      onChange({ ...result, scenario }); setStatus('success'); setMessage('試算比較をレポートと検討記録に反映しました。残す場合は記録を再保存してください。')
    } catch (error) {
      if (controller.current !== request || (request.signal.aborted && request.signal.reason !== 'timeout')) return
      setStatus('error'); setMessage(request.signal.aborted ? '35秒以内に応答がありませんでした。基本の発電量はそのままです。' : error.message)
    } finally { clearTimeout(timeout); if (controller.current === request) controller.current = null }
  }

  return <section className="generation-scenario" aria-label="積雪・周辺地形の試算比較">
    <p>試験機能：基本値にはPVGIS標準の地形・システム損失が含まれます。確認したい条件だけを選び、違いを見比べます。</p>
    <form onSubmit={compare}>
      <div className="generation-scenario__options">
        <div className="generation-scenario__option">
          <label className="generation-scenario__check"><input type="checkbox" checked={snowEnabled} disabled={!snowReady && !snowEnabled} onChange={event => edit(setSnowEnabled, event.target.checked)} />積雪の影響を仮定する</label>
          <p>{snowReady ? `確認済みの積雪出現率 / メッシュ ${snowStation.id}` : '同じ候補地のNEDO積雪資料を確認すると使えます。'}</p>
          {!snowReady && onSources && <button type="button" onClick={() => onSources('simple-snow')}>積雪資料を確認</button>}
          {snowEnabled && <><label>出現率に対する仮定の影響度（%）<input aria-label="積雪の仮定の影響度（%）" type="number" min="0" max="100" step="any" required value={weight} onChange={event => edit(setWeight, event.target.value)} /></label>
            <p>例：出現率20% × 影響度25% → その月を5%減。25%は操作確認用の仮定で、推奨値ではありません。積雪出現率はパネル上の積雪や停止時間の実測値ではありません。</p>
            <p>システム損失にすでに見込んだ積雪分は重ねないでください。既存の積雪基準係数は掛け直しません。</p></>}
        </div>
        <div className="generation-scenario__option">
          <label className="generation-scenario__check"><input type="checkbox" checked={terrainEnabled} disabled={!horizon && !terrainEnabled} onChange={event => edit(setTerrainEnabled, event.target.checked)} />周辺地形で置き換えて比較する</label>
          <p>{horizon ? `欠測のない${horizon.length}方位の地形角を使用 / 樹高の一律加算は除外` : '同じ候補地の欠測のない8方位または36方位の地平線分析が必要です。'}</p>
          {horizon && terrain.radius && <p>範囲・資料：{terrain.radius}</p>}
          {!horizon && onSources && <button type="button" onClick={() => onSources('simple-horizon')}>地平線を分析</button>}
          <p>高低差を方位ごとの地形角として再計算します。PVGIS標準地形との置換比較です。近距離の調査では遠方の山が抜ける可能性があり、基本値より増える場合もあります。</p>
        </div>
      </div>
      <button className="power-page__primary" disabled={status === 'loading' || (!snowEnabled && !terrainEnabled) || (snowEnabled && !snowReady) || (terrainEnabled && !horizon)}>この仮定で比較する</button>
      {status === 'loading' && <button type="button" onClick={cancel}>追加比較を取り消す</button>}
      {result.scenario && <button type="button" onClick={clear}>比較を解除する</button>}
    </form>
    {message && <p role={status === 'error' ? 'alert' : 'status'}>{message}</p>}
    {result.scenario && <p>比較結果は上の年間サマリーと月別グラフに反映しています。実測発電量や確定売電量ではありません。</p>}
  </section>
}
