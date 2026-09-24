import { useEffect, useRef } from 'react'
import '../use-cases-guide.css'

export default function UseCasesGuide({ onExample, onReport }) {
  const disclosure = useRef(null)
  useEffect(() => {
    let frame
    function revealLinkedGuide() {
      if (window.location.hash !== '#use-cases' || !disclosure.current) return
      disclosure.current.open = true
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const guide = disclosure.current
        if (!guide || window.location.hash !== '#use-cases') return
        guide.querySelector(':scope > summary')?.focus({ preventScroll: true })
        guide.scrollIntoView({ block: 'start' })
      })
    }
    revealLinkedGuide()
    window.addEventListener('hashchange', revealLinkedGuide)
    return () => { window.removeEventListener('hashchange', revealLinkedGuide); window.cancelAnimationFrame(frame) }
  }, [])
  function leaveGuide(action) {
    if (disclosure.current) disclosure.current.open = false
    action()
  }
  return <details ref={disclosure} className="use-cases-guide no-print" id="use-cases">
    <summary id="use-cases-title"><span>使い方・活用例</span><small>保存・共有・練習例</small></summary>
    <div className="use-cases-guide__body">
      <div className="use-cases-guide__intro"><p>候補地の条件・参考結果・未確認事項を、次の確認や打合せに使うための案内です。</p><button type="button" className="secondary-button" onClick={() => leaveGuide(onReport)}>レポートに戻る</button></div>
      <section className="use-cases-guide__outputs" aria-labelledby="use-cases-outputs-title">
        <h3 id="use-cases-outputs-title">保存した資料の使い道</h3>
        <dl>
          <div><dt>検討記録（JSON）</dt><dd>同じ条件・結果・メモで作業を再開。<small>画面上部の「検討資料」→「検討記録を保存」</small></dd></div>
          <div><dt>基本レポート・チェックCSV</dt><dd>参考発電量、条件、出典、残る確認事項を共有。<small>レポートの「PDF印刷」「チェックCSV出力」</small></dd></div>
          <div><dt>Solar Pro用地平線CSV</dt><dd>DEMから作成した参考地平線を入力準備に使用。<small>地平線分析後のデータ保存</small></dd></div>
          <div><dt>設備確認メモ</dt><dd>設備番号・資料の日付・照合状況を記録。<small>系統画面で設備を選んで保存。追加後は検討記録を再保存</small></dd></div>
        </dl>
        <p className="use-cases-guide__note">これらの基本機能は無料です。以前保存したファイルは自動更新されません。設備メモの追加や条件変更後は、もう一度「検討記録を保存」してください。</p>
      </section>
      <details className="use-cases-guide__topic"><summary>練習例で確認する</summary><div>
        <p className="use-cases-guide__example-label">架空の相談例・仮条件。実際の発電量、接続可否、販売実績を示す例ではありません。</p>
        <ol><li><b>候補地を選ぶ。</b> 航空写真・座標を確認し、相談の目的と受け取った資料をメモします。</li><li><b>仮条件で計算する。</b> DC 50kWp・南向き・20°・損失14%を練習条件にします。推奨設計値ではありません。結果は対象地点で実際に計算した値を使います。</li><li><b>地形・積雪・系統を確認する。</b> 樹木や建物、NEDO資料、公式設備番号と資料の日付を確認します。</li><li><b>分かったことと残ったことを渡す。</b> 「樹高を現地で確認」「電力会社に接続点と条件を確認」などを追記し、レポートと検討記録を保存します。</li></ol>
        <button type="button" className="secondary-button" onClick={() => leaveGuide(onExample)}>仮条件の練習例を確認</button>
        <p>確認画面が開きます。選択するまでは現在の候補地を変更しません。練習例には計算済みの発電量を入れていません。</p>
      </div></details>
      <details className="use-cases-guide__topic"><summary>結果の読み方と保存の範囲</summary><div>
        <dl><div><dt>パネル容量（DC kWp）</dt><dd>パネル側の容量。PCS出力とは別です。</dd></div><div><dt>傾斜角・向き・損失</dt><dd>初期値は仮条件です。実設備に合わせて見直します。</dd></div><div><dt>出典・期間・取得日</dt><dd>PVGISの長期平均を使った参考値です。特定の年の実測発電量ではありません。</dd></div></dl>
        <p>基本の参考発電量にはPVGIS標準地形を使用します。積雪の仮定や周辺地形による試算は、発電量画面で選択・比較した結果を別に表示します。既存の積雪基準係数は掛け直しません。個別の樹木・建物、PCS制約、系統出力制御は未反映です。結線アシストで選んだ機器や枚数も、発電量の入力容量とは別です。</p>
        <p>検討記録にはPDF原本・PDF編集状態・全設備地図・地番の全図形・結線アシストの機器設定は含みません。地図データや計算値の確認を代行するサービスではありません。</p>
        <p>発電量を金額へ換算するには、売電・自家消費の量、適用単価、制御条件、工事費・運用費などの確認が必要です。この画面の発電量だけで売上や利益は決まりません。</p>
      </div></details>
      <details className="use-cases-guide__topic"><summary>実務資料パッケージの企画について</summary><div>
        <p><strong>企画中・販売未開始</strong></p><p>入力条件シート、確認記録シート、説明用テンプレート、記入例をまとめた編集可能な資料を検討しています。基本計算と基本レポートは引き続き無料で使う方針です。</p><p>収録内容・形式・価格・提供時期は未定です。利用人数・業務で使える範囲、編集・再配布、更新・問い合わせ対応、提供・取消条件は販売前に明示します。</p><p>Solar Pro本体、個別案件の設計、接続申込み代行はこの資料企画に含めていません。</p>
      </div></details>
    </div>
  </details>
}
