import '../review-toolbar.css'

export default function CandidateWorkflow({ position, placeLabel, siteName, generation, powerGrid, terrain, snowReady, generationNotice, onSite, onGeneration, onGrid, onReport, children }) {
  const gridStatus = powerGrid.status === 'loading' ? '設備を取得中' : powerGrid.status === 'error' ? '取得結果を確認' : powerGrid.data ? '設備取得済み・接続未確認' : '未確認'
  const steps = [
    { title: '候補地', value: position ? '選択済み' : '住所・地図から選択', action: onSite },
    { title: '参考発電量', value: generation ? `${Math.round(generation.annualKwh).toLocaleString('ja-JP')} kWh/年` : '条件を入れて計算', action: onGeneration },
    { title: '系統確認', value: gridStatus, action: onGrid },
    { title: 'レポート', value: '結果・未確認事項を整理', action: onReport },
  ]
  return <section className="review-toolbar no-print" aria-label="候補地の検討手順">
    <div className="review-toolbar__context">
      <div className="review-toolbar__candidate"><span>候補地</span><strong>{siteName || placeLabel || (position ? `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}` : '未選択')}</strong></div>
      <p className="review-toolbar__status"><span>発電量 {generation ? '計算済み' : '未計算'}</span><span>系統 {gridStatus}</span></p>
    </div>
    <details className="review-toolbar__menu review-toolbar__menu--flow" name="candidate-review-tools">
      <summary>検討の流れ</summary>
      <div className="review-toolbar__popover">
        <nav className="review-toolbar__steps" aria-label="検討項目へ移動">
          {steps.map((step, index) => <button type="button" key={step.title} onClick={event => { event.currentTarget.closest('details').open = false; step.action() }} disabled={index > 0 && !position}>
            <span className="review-toolbar__number" aria-hidden="true">{index + 1}</span><span><b>{step.title}</b><small>{step.value}</small></span>
          </button>)}
        </nav>
        {position && <p className="review-toolbar__support">地平線 {terrain?.samples?.length ? '分析済み' : '未分析'} / NEDO積雪 {snowReady ? '同一メッシュ確認済み' : '未取得'}</p>}
      </div>
    </details>
    {children}
    {generationNotice && <p className="review-toolbar__notice" role="status">{generationNotice}</p>}
  </section>
}
