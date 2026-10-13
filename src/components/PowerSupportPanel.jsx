import { useEffect, useMemo, useRef, useState } from 'react'
import { createPowerSupportQuery, powerSupportSiteKey } from '../utils/powerSupportQuery.js'
import './power-support.css'

export function usePowerSupports(position) {
  const [state, setState] = useState({ siteKey: '', status: 'idle', data: null, message: '', retryAt: 0 })
  const [radius, setRadius] = useState(500), [kind, setKind] = useState('all'), [selectedId, setSelectedId] = useState('')
  const [fitRevision, setFitRevision] = useState(0), [, setClock] = useState(0)
  const [mapActive, setMapActive] = useState(false)
  const query = useRef(null), siteKey = powerSupportSiteKey(position)
  useEffect(() => {
    const instance = createPowerSupportQuery({ onChange: setState })
    query.current = instance
    instance.setPosition(position)
    return () => instance.dispose()
  }, [])
  useEffect(() => { query.current?.setPosition(position); setSelectedId(''); setMapActive(false) }, [siteKey])
  useEffect(() => {
    if (state.retryAt <= Date.now()) return
    const timer = setTimeout(() => setClock(value => value + 1), Math.min(2147483647, state.retryAt - Date.now() + 20))
    return () => clearTimeout(timer)
  }, [state.retryAt])
  const current = state.siteKey === siteKey ? state : { siteKey, status: 'idle', data: null, message: '', retryAt: 0 }
  const visible = useMemo(() => (current.data?.supports || []).filter(item => kind === 'all' || item.type === kind), [current.data, kind])
  const selected = visible.find(item => item.id === selectedId) || null
  return {
    state: current, radius, kind, selected, visible, siteKey, fitRevision, mapActive,
    disabled: !siteKey || current.status === 'loading' || current.retryAt > Date.now(),
    setRadius, setKind: value => { setKind(value); setSelectedId('') },
    select: id => { setSelectedId(id); setMapActive(true) }, clearSelection: () => setSelectedId(''), releaseMap: () => setMapActive(false),
    cancel: () => query.current?.cancel(), showRange: () => { setMapActive(true); setFitRevision(value => value + 1) },
    load: async () => { const data = await query.current?.run(position, radius); if (data) { setSelectedId(''); setMapActive(true); setFitRevision(value => value + 1) } },
  }
}

const distanceLabel = value => `${Math.round(value).toLocaleString('ja-JP')} m`
export default function PowerSupportPanel({ controller, variant = 'controls' }) {
  const { state, radius, kind, selected, visible } = controller
  if (variant === 'detail') {
    if (!selected) return null
    return <section className="power-support-card" aria-label="選択した電柱・鉄塔">
      <div className="power-support-card__heading"><h2>{selected.type === 'pole' ? '電柱' : '鉄塔'}の登録情報</h2><button type="button" onClick={controller.clearSelection} aria-label="電柱・鉄塔の選択を閉じる">閉じる</button></div>
      <dl><div><dt>設備番号</dt><dd>{selected.ref || '未記載'}</dd></div><div><dt>登録電圧</dt><dd>{selected.voltageLabel}</dd></div><div><dt>登録事業者</dt><dd>{selected.operator || '未記載'}</dd></div><div><dt>候補地から</dt><dd>{distanceLabel(selected.distanceMeters)} / 直線距離</dd></div><div><dt>取得日時</dt><dd>{state.data?.fetchedAt ? new Date(state.data.fetchedAt).toLocaleString('ja-JP') : '未記録'}</dd></div></dl>
      <a href={selected.sourceUrl} target="_blank" rel="noreferrer">OSMの登録情報を確認 ↗</a>
      <details><summary>情報の読み方</summary><p>登録事業者は所有権の確認ではありません。電圧の公式確認・接続先・資料更新日は未確認です。取得日時は資料の更新日ではありません。</p></details>
    </section>
  }
  const message = state.message || (state.retryAt > Date.now() ? '公開地図サーバーの利用制限中です。時間をおいて再試行してください。' : '')
  return <section className="power-support-panel" aria-label="近くの電柱・鉄塔">
    <div className="power-support-controls"><strong>電柱・鉄塔</strong><label>範囲<select aria-label="電柱・鉄塔の検索範囲" value={radius} onChange={event => controller.setRadius(Number(event.target.value))} disabled={state.status === 'loading'}><option value={500}>500m</option><option value={1000}>1km</option></select></label>
      <button type="button" className="power-support-primary" disabled={controller.disabled} onClick={controller.load}>周辺を確認</button>
      {state.status === 'loading' && <button type="button" onClick={controller.cancel}>取得を中止</button>}
      {state.data && <><label>表示<select aria-label="電柱・鉄塔の表示種別" value={kind} onChange={event => controller.setKind(event.target.value)}><option value="all">電柱・鉄塔</option><option value="pole">電柱</option><option value="tower">鉄塔</option></select></label><button type="button" onClick={controller.showRange}>取得範囲を見る</button><span className="power-support-count">{visible.length}件{state.data.truncated && ` / 取得${state.data.totalCount}件の一部`}</span></>}
    </div>
    {message && <p className={`power-support-status${state.status === 'error' ? ' is-error' : ''}`} role={state.status === 'error' ? 'alert' : 'status'}>{message}{state.status === 'loading' && state.data ? ` 前回の${state.data.radiusMeters}m結果を表示中。` : ''}</p>}
    {state.data && <div className="power-support-legend"><span><i className="power-support-dot"/>電柱</span><span><i className="power-support-triangle"/>鉄塔</span><span>出典：OpenStreetMap / 取得範囲 {state.data.radiusMeters}m / 未登録設備は表示されません。</span></div>}
  </section>
}
