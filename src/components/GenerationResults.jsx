import { useState } from 'react'
import './generation-results.css'

const number = value => Math.round(value).toLocaleString('ja-JP')
const approximate = value => value >= 10000
  ? { value: (value / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 }), unit: '万 kWh / 年' }
  : { value: value.toLocaleString('ja-JP', { maximumFractionDigits: 0 }), unit: 'kWh / 年' }
const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value))}`

export default function GenerationResults({ result, onCompare, reportMode = false }) {
  const [activeMonth, setActiveMonth] = useState(null)
  const scenario = result.scenario
  const comparedConditions = scenario?.snow && scenario?.terrain ? '積雪・地形の仮定' : scenario?.snow ? '積雪の仮定' : '周辺地形の条件'
  const annual = approximate(result.annualKwh)
  const rows = [...result.monthly].sort((a, b) => a.month - b.month)
  const scenarioMonths = new Map((scenario?.monthly || []).map(row => [row.month, row.kwh]))
  const peak = Math.max(0, ...rows.map(row => row.kwh), ...(scenario?.monthly || []).map(row => row.kwh))
  const magnitude = peak > 0 ? 10 ** Math.floor(Math.log10(peak)) : 1
  const ceiling = peak > 0 ? Math.ceil(peak / magnitude) * magnitude : 1
  const highest = rows.reduce((best, row) => row.kwh > best.kwh ? row : best, rows[0])
  const lowest = rows.reduce((best, row) => row.kwh < best.kwh ? row : best, rows[0])
  const active = rows.find(row => row.month === activeMonth)
  const chartLabel = reportMode ? '月別の参考発電量。数値は下の月別表に記載しています。' : '月別の参考発電量。各月を選ぶと数値を確認できます。'

  return <div className={`generation-overview${reportMode ? ' generation-overview--report' : ''}`}>
    <div className="generation-overview__hero">
      <div className="generation-overview__annual">
        <span className="generation-overview__eyebrow">この条件で、1年間に</span>
        <div className="generation-overview__value"><span>約</span><strong>{annual.value}</strong><span>{annual.unit}</span></div>
        <p className="generation-overview__exact">基本の参考発電量 <b>{number(result.annualKwh)}</b> kWh / 年</p>
        <div className="generation-overview__chips"><span>DC {result.inputs.peakpower} kWp</span><span>傾斜 {result.inputs.angle}°</span><span>長期平均の参考値</span></div>
      </div>
      {scenario ? <div className="generation-overview__comparison" aria-label="基本値と試算の差">
        <span className="generation-overview__eyebrow">{comparedConditions}を加えると</span>
        <p className="generation-overview__delta"><strong>{signed(scenario.differenceKwh)}</strong><span>kWh / 年</span></p>
        <p>{scenario.differencePercent == null ? '基本値0のため比率は表示しません' : `${Math.abs(scenario.differencePercent).toFixed(2)}% ${scenario.differenceKwh < 0 ? '減少' : scenario.differenceKwh > 0 ? '増加' : '変化なし'}`}</p>
        <p className="generation-overview__after">試算後 <b>{number(scenario.annualKwh)}</b> kWh / 年</p>
        {!reportMode && <button type="button" onClick={onCompare}>比較条件を確認 <span aria-hidden="true">↗</span></button>}
      </div> : !reportMode && <div className="generation-overview__compare-prompt">
        <span className="generation-overview__eyebrow">条件による違いも見る</span>
        <p>雪や周辺地形を考慮した場合の変化を、基本値と見比べられます。</p>
        <button type="button" onClick={onCompare}>積雪・地形を比較 <span aria-hidden="true">↗</span></button>
      </div>}
    </div>

    <figure className="generation-season" aria-label={chartLabel}>
      <figcaption><div><h3>季節ごとの発電の流れ</h3><p>{peak === 0 ? 'この条件では、すべての月が0 kWhです。' : highest.kwh === lowest.kwh ? '各月の基本値は同じです。' : `基本値が最も多いのは${highest.month}月、少ないのは${lowest.month}月です。`}</p></div>
        <div className="generation-season__legend"><span><i />基本値</span>{scenario && <span><i className="is-scenario" />試算</span>}</div>
      </figcaption>
      <div className="generation-season__unit">kWh / 月</div>
      <div className="generation-season__plot">
        <div className="generation-season__axis" aria-hidden="true"><span>{number(ceiling)}</span><span>{number(ceiling / 2)}</span><span>0</span></div>
        <div className="generation-season__bars">
          {rows.map(row => {
            const compared = scenarioMonths.get(row.month)
            const Month = reportMode ? 'div' : 'button'
            const interaction = reportMode ? {} : { type: 'button', 'aria-pressed': activeMonth === row.month, onMouseEnter: () => setActiveMonth(row.month), onFocus: () => setActiveMonth(row.month), onClick: () => setActiveMonth(row.month) }
            return <Month key={row.month} {...interaction} className={`generation-season__month${activeMonth === row.month ? ' is-active' : ''}`} aria-label={`${row.month}月 基本値 ${number(row.kwh)} kWh${compared == null ? '' : `、試算 ${number(compared)} kWh`}`}>
              <span className="generation-season__columns" aria-hidden="true"><span className="generation-season__bar" style={{ height: `${row.kwh / ceiling * 100}%` }} />{compared != null && <span className="generation-season__bar is-scenario" style={{ height: `${compared / ceiling * 100}%` }} />}</span>
              <span className="generation-season__month-label">{row.month}<small>月</small></span>
            </Month>
          })}
        </div>
      </div>
      {!reportMode && <div className="generation-season__reading" aria-live="polite">
        {active ? <><strong>{active.month}月</strong><span>基本値 <b>{number(active.kwh)}</b> kWh</span>{scenarioMonths.has(active.month) && <span>試算 <b>{number(scenarioMonths.get(active.month))}</b> kWh <small>（差 {signed(scenarioMonths.get(active.month) - active.kwh)}）</small></span>}</> : <span>グラフの月を選ぶと、詳しい数値がここに表示されます。</span>}
      </div>}
    </figure>
  </div>
}
