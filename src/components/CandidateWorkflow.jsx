import { comprehensiveReview } from '../utils/comprehensiveReview.js'

export default function CandidateWorkflow({ onOpen, ...evidence }) {
  const items = comprehensiveReview(evidence)
  return <details className="comprehensive-review no-print" aria-labelledby="comprehensive-title">
    <summary className="comprehensive-review__heading"><h2 id="comprehensive-title">総合チェック</h2><span>地平線・積雪・規制の補足確認</span></summary>
    <div className="comprehensive-review__body">
    <div className="comprehensive-review__grid">{items.map(item => <button key={item.id} data-review-id={item.id} type="button" className={`comprehensive-review__item${item.pending ? ' is-pending' : ''}`} onClick={() => onOpen(item.id)}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small><em>確認する →</em></button>)}</div>
    <details className="comprehensive-review__next"><summary>残る確認・次の対応</summary><ul>
      {items.filter(item => item.pending).map(item => <li key={item.id}><button type="button" onClick={() => onOpen(item.id)}>{item.label}</button><span>{item.detail}</span></li>)}
      <li><strong>現地・行政・原本で確認</strong><span>用途地域、筆ごとの農地、接道、境界、現況の樹木・建物、許認可の進捗は、この一覧では確定しません。</span></li>
    </ul></details>
    <p className="comprehensive-review__note">規制・ハザードは選択地点の参考照合です。敷地全体の確認ではありません。取得済みは条件解消や事業可否を示さず、未検出・資料なしも「問題なし」ではありません。</p>
    </div>
  </details>
}
