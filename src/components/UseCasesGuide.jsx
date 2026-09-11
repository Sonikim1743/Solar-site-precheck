export default function UseCasesGuide({ onExample, onReport }) {
  return <section className="use-cases no-print" id="use-cases" aria-labelledby="use-cases-title">
    <div className="use-cases__heading"><div><span>活用例・資料案内</span><h2 id="use-cases-title">検討した内容を、次の仕事に使う</h2><p>土地を紹介された方や、Solar Proへの入力を準備する方が、条件・参考結果・未確認事項を整理するためのツールです。</p></div><button type="button" className="secondary-button" onClick={onReport}>自分のレポートを確認</button></div>
    <details open><summary>今使える無料の機能と出力</summary><div className="use-cases__table"><table><thead><tr><th>得られる資料</th><th>使い道</th><th>保存する場所</th></tr></thead><tbody>
      <tr><td>検討記録（JSON）</td><td>同じ条件・結果・メモで作業を再開</td><td>画面上部の「検討記録を保存」</td></tr>
      <tr><td>基本レポート・チェックCSV</td><td>参考発電量、条件、出典、残る確認事項を共有</td><td>レポートの「PDF印刷」「チェックCSV出力」</td></tr>
      <tr><td>Solar Pro用地平線CSV</td><td>DEMから作成した参考地平線を入力準備に使用</td><td>地平線分析後のデータ保存</td></tr>
      <tr><td>設備確認メモ</td><td>設備番号・資料の日付・照合状況を記録</td><td>系統画面で設備を選んで保存。追加後は検討記録を再保存</td></tr>
    </tbody></table></div><p>これらの基本機能は無料です。以前保存したファイルは自動更新されません。設備メモの追加や条件変更後は、もう一度「検討記録を保存」してください。検討記録にはPDF原本・PDF編集状態・全設備地図・地番の全図形・結線アシストの機器設定は含みません。地図データや計算値の確認を代行するサービスではありません。</p></details>
    <details><summary>活用例：紹介された土地を、次の打合せまでに整理</summary><p className="use-cases__example-label">架空の相談例・仮条件。実際の発電量、接続可否、販売実績を示す例ではありません。</p><ol><li><b>候補地を選ぶ。</b> 航空写真・座標を確認し、相談の目的と受け取った資料をメモします。</li><li><b>仮条件で計算する。</b> DC 50kWp・南向き・20°・損失14%を練習条件にします。推奨設計値ではありません。結果は対象地点で実際に計算した値を使います。</li><li><b>地形・積雪・系統を確認する。</b> 樹木や建物、NEDO資料、公式設備番号と資料の日付を確認します。</li><li><b>分かったことと残ったことを渡す。</b> 「樹高を現地で確認」「電力会社に接続点と条件を確認」などを追記し、レポートと検討記録を保存します。</li></ol><button type="button" className="secondary-button" onClick={onExample}>仮条件の練習例を確認</button><p>確認画面が開きます。選択するまでは現在の候補地を変更しません。練習例には計算済みの発電量を入れていません。</p></details>
    <details><summary>条件をそろえて結果を読む</summary><dl><div><dt>パネル容量（DC kWp）</dt><dd>パネル側の容量。PCS出力とは別です。</dd></div><div><dt>傾斜角・向き・損失</dt><dd>初期値は仮条件です。実設備に合わせて見直します。</dd></div><div><dt>出典・期間・取得日</dt><dd>PVGISの長期平均を使った参考値です。特定の年の実測発電量ではありません。</dd></div></dl><p>アプリの地平線・樹木・建物やNEDO積雪係数、個別PCS制約、系統出力制御は参考発電量に自動反映されません。結線アシストで選んだ機器や枚数も、発電量の入力容量とは別です。</p><p>発電量を金額へ換算するには、売電・自家消費の量、適用単価、制御条件、工事費・運用費などの確認が必要です。この画面の発電量だけで売上や利益は決まりません。</p></details>
    <details><summary>実務資料パッケージの企画について</summary><p><strong>企画中・販売未開始</strong></p><p>入力条件シート、確認記録シート、説明用テンプレート、記入例をまとめた編集可能な資料を検討しています。基本計算と基本レポートは引き続き無料で使う方針です。</p><p>収録内容・形式・価格・提供時期は未定です。利用人数・業務で使える範囲、編集・再配布、更新・問い合わせ対応、提供・取消条件は販売前に明示します。</p><p>Solar Pro本体、個別案件の設計、接続申込み代行はこの資料企画に含めていません。</p></details>
  </section>
}
