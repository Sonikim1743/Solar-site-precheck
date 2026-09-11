export default function CandidateWorkflow({ position, placeLabel, siteName, generation, powerGrid, terrain, snowReady, generationNotice, onSite, onGeneration, onGrid, onReport }) {
  const steps = [
    { title: '候補地', value: position ? '選択済み' : '住所・地図から選択', action: onSite },
    { title: '参考発電量', value: generation ? `${Math.round(generation.annualKwh).toLocaleString('ja-JP')} kWh/年` : '条件を入れて計算', action: onGeneration },
    { title: '系統確認', value: powerGrid.status === 'loading' ? '周辺設備を取得中' : powerGrid.status === 'error' ? '取得結果を確認' : powerGrid.data ? '周辺設備を取得済み' : '周辺設備・公式資料', action: onGrid },
    { title: 'レポート', value: '結果・未確認事項を整理', action: onReport },
  ]
  return <section className="candidate-workflow no-print" aria-label="候補地の検討手順">
    <div className="candidate-workflow__context">
      <div><span>検討中の候補地</span><strong>{siteName || placeLabel || (position ? `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}` : 'まだ選択されていません')}</strong></div>
      {position && <p>地平線 {terrain?.samples?.length ? '分析済み' : '未分析'}<span>・</span>NEDO積雪 {snowReady ? '同一メッシュ確認済み' : '未取得'}</p>}
    </div>
    {generationNotice && <p className="candidate-workflow__notice" role="status">{generationNotice}</p>}
    <nav className="candidate-workflow__steps" aria-label="検討項目へ移動">
      {steps.map((step, index) => <button type="button" key={step.title} onClick={step.action} disabled={index > 0 && !position}>
        <span className="candidate-workflow__number" aria-hidden="true">{index + 1}</span><span><b>{step.title}</b><small>{step.value}</small></span><span className="candidate-workflow__arrow" aria-hidden="true">→</span>
      </button>)}
    </nav>
  </section>
}
