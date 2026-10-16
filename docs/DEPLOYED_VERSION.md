# 公開更新 — 地図の2段階初期化 / 2026-10-16

利用者の当日更新承認に基づき、公開main1053403の直後の単一コミットec28dd6をそのまま統合・配布した。初回の「初期化」は候補地・対象筆・範囲・除外と依存する分析を消し、地図の中心と拡大率を保持する。次の「地図位置をリセット」は既存の初期中心・拡大5に戻す。新選択で初回の段階へ戻る。条件・メモ・独立PDF・登記作業は保持し、候補地依存の出力だけを無効化する。3D投影・配置Worker・資料DBの追加変更はない。

- 運用URL：https://solar-site-precheck.pages.dev/
- Production ID：`b36c4863-78b4-4d07-9e49-4b6a278c4aec` / branch main
- 配布ソース：`ec28dd6e105a52e5f5a3d7ae6cfe9eda9c851932`
- パッケージmain反映：`88b54dada0a5977bcf060dc5d22de67d0552a7a8` / [CI 38843734546](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/38843734546)：success
- Version 1.28.2 / Build 2026-10-16 / JS：`index-Cv3tZyDV.js` / CSS：`/assets/index-CqwXBg58.css`
- Cloudflare ZIP：14,640,526 bytes / SHA-256 `cfec23257c4f7ed725e4665653790a9c02dc3cd568e6cb04d0f95462ce404303`
- Windows ZIP：15,369,800 bytes / SHA-256 `96fd719810596f6d601250e8286507af3592fcffae5699ffa8b4914b500be414`

正規パッケージ処理561/561、両build、CSP・同梱資産・Functions edge・両ZIPの照合が成功。公開dist 50/50ファイルと実CSP、GitHub mainの両ZIP・ソース・サイズ・SHA-256が一致（2026-10-16T03:07:36.913Z）。公開API6項目も成功。個別PDFのPOST送信はしていない。

公開の実Appを一時Edge・合成資料で確認した。Leafletの実行時コンテキストを読むだけで、初回の中心・拡大率不変、2回目の初期中心・拡大5、新選択後の初回復帰、同一フレームの連続クリックを確認。候補地・解析は消え、発電量入力・積雪係数・障害物高さ・メモ・20°配置条件と独立PDFは保持された。初回クリア後はPDF／発電量画面を往復しても表示位置と段階が維持され、遅延DEM・GPSの完了で選択や標高は復活しなかった。375／320pxとEnter操作、標高一行・操作領域・横はみ出しなしも通過。

既存の視点固定、角度保持の平行移動・ズーム、架台のクリック／キー除外・復元、OFF／Home、モバイルタッチ模擬も成功。詳細20°→シンプル1枚、シンプル20°→3ページがともに448枚・DC322.56kWで、全448モジュールの平面座標が一致。レポート3Dの移動量0、未適用条件の出力ブロックを維持した。pageerror 0件、検証ブラウザー・ローカル検証サーバーは終了。既存ユーザーのタブ・保存領域は操作していない。

初期化前に範囲地形を残したままPDFツールなどから戻ると、既存TerrainAreaMapOverlayの自動fitが表示位置・拡大を再設定する制限を確認した。今回の選択クリア後の保持とは別で、ec28dd6だけを反映する範囲に従い未修正。Mac/Safari・実タッチ・実GPS・実印刷は未確認。登記の保持は実資料を用いないコード確認で、遅延PDFの単独検証は TWO_STAGE_MAP_RESET_QA_2026_10_16_JA.md を参照。既存の中空範囲の報告書クリッピングと90°合成形状の停止は別問題として保持。旧production `7e1218a9-6d67-443f-8de6-9a263a54642f` とその配布物を復旧用に残した。各PCのローカル版更新とは別である。ローカル証拠：`outputs/reset-release/`、`outputs/public-reset-release/`、`outputs/public-reset-view/ui-evidence.json`。

---

# 公開更新 — 標高一行表示・3D視点固定 / 2026-10-16

既存公開main df9ee65へ、承認済みの b8322d6 を一度だけ統合した。製品変更は標高表示CSSと3Dの視点固定・平行移動で、Appの配置出力同期・計算Worker・系統DBは変更していない。ONでは方位・見下ろし角を固定し、矢印とドラッグは画面を平行移動する。ズーム・高さ2倍・架台の除外／復元を維持し、回転・キューブ・コンパスのプリセットは非活性。OFFでは移動量とズームを保持し、ホーム／Homeは固定解除・初期位置へ戻す。

- 運用URL：https://solar-site-precheck.pages.dev/
- Production ID：`7e1218a9-6d67-443f-8de6-9a263a54642f` / branch main
- 配布ソース：`bce94ccf4b3962f4a3fd5e61c6945476b4ae2dd1`（b8322d6をcherry-pick）
- パッケージmain反映：`8e8774d5d79530ae08739722ec0cd48162d0bdf9` / [CI 38840116965](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/38840116965)：success
- Version 1.28.2 / Build 2026-10-16 / JS：`index-Cw7FI5-A.js` / CSS：`/assets/index-CLPsN_WL.css`
- Cloudflare ZIP：14,639,701 bytes / SHA-256 `6713ca8481a98f8cbbd71cc81699553a13e6bcfcb2813e3774e820b7803a5b89`
- Windows ZIP：15,368,965 bytes / SHA-256 `64aedb83bf1ae970e13e0e29bc09da5a0f3d4ccb2ce9e1257a5f55475b97f279`

正規パッケージ処理の558/558、両build、CSP・同梱資産・Functions edge・両ZIPの全ファイル照合が成功。公開dist 50/50ファイルと実CSP、GitHub mainの両ZIP・ソース・サイズ・SHA-256が一致（2026-10-16T02:25:08.490Z）。公開API6項目も成功。個別PDFのPOST送信はしていない。

公開された実Appの選択範囲3Dと配置済み3Dを、一時Edge・合成DEM／外部応答で確認した。任意角25°／37°を固定して、四方向ボタン・キー・ドラッグ・ホイール・拡大ボタンで角度が不変。輪郭全点が同量だけ移動し、Canvas/SVGの表示矩形も一致。平行移動とズーム後の実架台クリック・Enter／Spaceによる除外／復元、架台上ドラッグの誤選択なし、OFF後の回転再開、ボタン／キーHomeの初期化が通過した。375／320pxのCDPタッチ模擬も角度を保って移動。1280／375／320pxで標高ラベルと数値は一行、地図下操作44px・3D操作36px（モバイル44px）と横はみ出しなしを確認した。

固定ON・移動・ズームした画面から詳細20°→シンプル1枚を確認し、別経路のシンプル20°→3ページも再確認。両経路とも448枚・DC322.56kW、全448モジュールの平面パスが一致し、実角約20°。レポートの3Dは固定解除・移動量0を維持し、未適用条件のPDFは無効。地図下操作も通過した。pageerror 0件、検証ブラウザー・サーバー終了。既存ユーザーの入力・タブ・原資料は変更していない。

Mac/Safari・実タッチ端末・実印刷は未確認。特定の中空範囲の全体報告書クリッピングと90°合成形状の停止は既存の別問題として残る。旧production `3d15219f-3614-41f1-816a-cb185baafca0` と最初の復旧履歴を保全した。各PCのローカル版更新とは別である。ローカル証拠：`outputs/fixed-release/`、`outputs/public-fixed-release/`、`outputs/public-fixed-view/ui-evidence.json`。

---

# 公開復旧 — 配置条件とPDF出力の同期・地点操作・3Dサイズ / 2026-10-16

利用者の当日更新・公開復旧依頼に基づき、App内の詳細とシンプルに分かれていた配置条件・適用結果を共通化して公開した。詳細20°の後のシンプル1枚、シンプル20°の後の3ページレポートが同じ配置を使う。未適用・計算中・取得版不一致の出力をブロックする。地図直下のGoogleマップ・現在地・初期化と断面を整理し、3Dのデスクトップ144pxキューブ・36px操作、モバイル44px操作を反映した。標高一行化・視点固定の後続はこの配布に含めない。

- 運用URL：https://solar-site-precheck.pages.dev/
- Production ID：`3d15219f-3614-41f1-816a-cb185baafca0` / branch main
- 配布ソース：`2833aa3869e8e814ee50313917ec4c0d77b7b946`
- パッケージmain反映：`aae3443397c27344040a6bd2680a77e878c3d33d` / [CI 38837895400](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/38837895400)：success
- Version 1.28.2 / Build 2026-10-16 / JS：`index-D6-T1RVn.js` / CSS：`/assets/index-Ck_Ul6cq.css`
- Cloudflare ZIP：14,639,096 bytes / SHA-256 `89571e9158a3e2f53bcb6b66306df9aa8ac6cb047923d36d78aa9c6a13204164`
- Windows ZIP：15,368,379 bytes / SHA-256 `a75a23e6d451a1217efa3c46f63a889988a3e4cc9160d4aa2f92c34ee9ef7308`

正規パッケージ処理の556/556、両build、CSP・同梱PDF/OCR・Functions edge検査・両ZIPの全ファイル照合が成功。公開dist 50/50ファイルと実CSP、GitHub mainの両ZIP・ソース・サイズ・SHA-256を照合した（2026-10-16T02:00:31.544Z）。公開API6項目も成功。個別PDFのPOST送信は実施していない。

公開済みの実Appを新しい一時Edgeで確認した。合成範囲・合成外部応答を使用し、詳細10→20→シンプル1枚と、詳細10→シンプル20→3ページレポートがともに20°・448枚・DC322.56kW。実モジュール角は約20°、シンプル／詳細の一枚PDFが直列化した全448モジュールの平面座標パスが一致した。3ページの実PDFも20°・448枚を確認。独立コンポーネントの六組確認だけではApp内の別状態を見落としていたため、今回は交差経路を直接確認した。

地図下のGoogleマップは住所失敗でも現在座標のhrefを保持し、位置なしは非活性。模擬位置権限の拒否・成功、初期化、50m／200mの2方向断面、320／375／1280pxを確認。キューブと操作サイズ、メニュー前後の高さ・Canvas/SVGの一致、高さ2倍と情報表示も確認した。傾斜DEM・フェンスONのPDFは右図22矢印・高→低0.05m以上、左図0矢印。画面の予期しないpageerrorは0件。検証ブラウザー・サーバーを終了し、既存ユーザーの入力・タブ・原資料を変更していない。

特定の中空範囲の全体報告書クリッピング、90°で形状確認中止となる合成エンジン例は既存の別問題として残る。実候補地・Mac/Safari・実タッチ・実印刷の検証ではない。配置Workerは従来SHA-256 `23b835d701bbfee2c36ba5cb05d731d8ec47bcdc2a785ec63203e57d64e13eb1` を維持。旧production `4795edf1-bb25-4934-b38f-87f9cd2e3175` とその配布物は復旧用に保持した。

詳細は `FOLLOWUP_RELEASE_QA_2026_10_16_JA.md`、ローカル証拠は `outputs/public-followup-release/` と `outputs/public-followup/ui-evidence.json`。公開更新と各PCのローカル版更新は別である。

---

# 公開復旧 — 3D地形と黄色境界の表示ずれ / 2026-10-16

利用者の公開復旧優先の指示に基づき、3DのCSS修正だけを既存productionへ反映しました。製品コードの差分は `terrain-area.css` の `align-self:start` 1項目です。右側の方位メニューが高くなっても地形Canvasを引き伸ばさず、SVG境界・選択点と同じ縦横比を保ちます。標高・地形・投影・選択データの計算は変更していません。

- 運用URL：https://solar-site-precheck.pages.dev/
- Production ID：`f681c6ce-70e4-45e9-b5c9-46f63bf6baa1` / branch `main`
- ソース：`44848117743cd363e34b20a9611dc89d1f12ca1b` / 配布物main反映：`6150fc2650dabc116d4360dcf6aa2edb81b0e5c1`
- Version 1.28.2 / Build 2026-10-16 / 公開JS：`index-DoPVRAK6.js` / CSS：`index-CLzgGyNN.css`
- Cloudflare ZIP：14,629,322 bytes / SHA-256 `18f45528bb49fb120f415472ea9650d179a8c6bbfcb50792c11b13fc1ac029ba`
- Windows ZIP：15,358,548 bytes / SHA-256 `e153e5f0a418667ab7650b9e409d1c828108966c29907c9f750839abd1f58661`
- [main CI 38826921371](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/38826921371)：success。

全体検査523/523、両ターゲットのビルド、CSP・同梱PDF/OCR・Functions edge依存・ZIP照合が成功しました。追加した実コンポーネント回帰では旧stretch状態の37.05pxずれを検出し、修正CSSの180条件で最大0.0019pxでした。方位メニュー開閉、回転・拡大・高さ切替とレポート用描画も確認しました。

公開distの50/50ファイルが配布manifestのSHA-256と一致し、実CSSの修正と実CSPを確認。GitHub mainの両メタデータ・両ZIPも取得して照合済みです（2026-10-16T00:02:06.702Z）。公式HTTP事前点検6項目は成功。実PDFのPOST送信は実施していません。

実際の公開JS/CSSを一時Edgeプロファイル1個で開き、合成7領域を参考から対象へ選択 → 3D → 方位メニュー開閉 → 回転・拡大 → 高さ2倍 → 範囲3D → PDF保存を確認しました。メニュー開閉・操作後もCanvas/SVGは700×385pxで一致し、領域キーを維持。アプリからA3横3ページ・各420×297mmのPDFを生成・取得し、PDF構造と寸法を確認しました。合成DEMは4タイルであり、実候補地の調査結果ではありません。画面エラー0件。終了時に検証ブラウザーを閉じ、既存タブ・保存データは操作していません。

既存の公式Wrangler認証だけを使用し、追加ログイン・権限・セキュリティ設定の変更はありません。前production `2534ccf1-4f40-429b-92c3-670f13ddf606` と旧配布物は復旧用に保持。会社PCの既存実行画面や全PCのインストール更新は実施していません。

DEM/NEDO、住所、系統表示の別改善は別worktreeに保全し、この公開復旧には含めていません。排水矢印改善も後続です。Mac/Safari・実タッチ、実案件のDEMや境界精度は未確認です。

---

# 公開・配布版 — 上部の名前入力欄を削除 / 2026-10-15

承認済みのUI整理の残りとして、地図直上の「発電所名」入力1行と専用CSS3行だけを削除しました。保存済みの名前、詳細の候補地名編集、記録の保存・復元は維持。新しい名前や初期値は追加せず、単独PDFの名前なし上部も変更していません。

- 運用URL：https://solar-site-precheck.pages.dev/
- Production ID：`2534ccf1-4f40-429b-92c3-670f13ddf606` / branch `main`
- ソース：`0399ff8532e47113502cbb85aeba0db59132963d` / 配布物main反映：`48a5a42034ee91ce372640bf58f8015e00a03979`
- 版：1.28.2 / Build 2026-10-15 / 公開JS：`index-DpAGKBg5.js`
- Cloudflare ZIP：14,629,299 bytes / SHA-256 `15841715f52d68f03ee0b823b8c56dd5ba3ae4ba476f6bf3f73e23ad8b4378f3`
- Windows ZIP：15,358,522 bytes / SHA-256 `9572603d8ed58012676bdb2bf54ea5ab08c4ad01ff0cfbfda44080dfc3cfa007`
- [main CI 38696124913](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/38696124913)：success。

名前の保存・旧schema・PDFの関連32/32、公式配布手順の全体523/523が成功。両ターゲットのビルド・CSP・資産・ZIP照合が通過しました。運用の公開dist **50/50ファイル**がmanifestと一致、不一致0件（2026-10-15T07:04:30.994Z）。実配信JSで上部入力の不在と詳細編集の残存、CSSで専用スタイルの不在も確認しました。

既存の公式Wranglerと既存認証で配布し、アクセス・認証・セキュリティ設定は変更していません。ブラウザーを追加起動せず、ユーザーの既存画面は再読込していません。実プリンター・ブラウザーUI操作は未確認です。前のproduction `3315e400-a557-4de5-ada6-b6e881551e76` と過去の検証記録は保持します。

---

# 公開・配布版 — 固定縮尺・案内整理 / 2026-10-15

利用者のGitHub・公開サイト更新承認に基づき、検証済みソースと配布物をmainへ反映し、既存productionを更新しました。

- 運用URL：https://solar-site-precheck.pages.dev/
- 配布URL：https://3315e400.solar-site-precheck.pages.dev/
- Production ID：`3315e400-a557-4de5-ada6-b6e881551e76` / branch `main`
- ソース：`4d743b04c3da324e3d3eb79f76d4d09589364a55` / 配布物main反映：`3718591b47ea4d5541c688ca9dd8fb1bdf62603e`
- 版：1.28.2 / Build 2026-10-15 / 公開JS：`index-BvnoYC3m.js`
- Cloudflare ZIP：14,629,423 bytes / SHA-256 `21022762aa4ed93c2fad88300941da373e5f354798bf91caf2351a683d3e1a4e`
- Windows ZIP：15,358,666 bytes / SHA-256 `355fab930a37f23bab2744fde00cc1b856d0738dd81ec70c78c0d7b98202e11d`
- [main CI 38692056737](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/38692056737)：success。

## 今回の変更

- 単独A3配置図を左右同じ固定平面縮尺に対応。初期1:1000・50m＝50mm。1:2000等と従来の自動モードを明示選択でき、収まらない範囲は切らずに縮尺変更を案内します。A3横・実際のサイズ100%で印刷してください。
- 最近の更新を3項目にまとめ、保存・印刷の重複説明を短縮。参考境界・DEM推定値・未確認事項・参考排水方向の注意は維持しました。
- 固定縮尺2図の同じ勾配色経路を共有。合成例の勾配配列参照は1024回から512回へ半減。全アプリの速度が2倍という意味ではありません。
- PNGで置換済み・参照なしの旧SVG2点（5967bytes）だけをGitで復元可能に削除。調査記録・合成検証資料・ユーザーデータは保持。排水候補・衝突除外規則と3Dカメラは変更していません。

## 確認と限界

関連25/25、全体523/523を同時実行1で確認。クリーンなソースから両ターゲットのビルド・CSP・同梱資産・Functions edge依存・ZIP全項目ハッシュが成功しました。既存の公式Wranglerと既存認証だけで配布しました。

単独PDFは実装のSVG・PDF描画・writerから合成例を生成し、Popplerで全1ページを描画確認。420×297mm、左右の目盛は座標上50.000mm。左右それぞれの水平・垂直50m線はPDF再描画で49.953〜50.059mm（インク端の許容0.25mm）でした。緯度25°・35°・45°でWGS84距離も独立照合。範囲超過、両ビュー、明示自動モード、縮尺別背景キャッシュを確認しました。

運用URLの公開dist **50/50ファイル**がmanifestのSHA-256と一致、不一致・未照合0件。HTTP確認：2026-10-15T06:25:08.788Z。実CSP、固定縮尺・100%印刷・短い更新案内・平面距離の注記も確認しました。ソース・配布物・実際のproduction識別は別々に記録しています。

ブラウザーUIでのクリック・保存、実プリンター、実案件の境界精度・排水計画は未確認です。今回のPDFは縮尺の合成検証で、実案件の数量ではありません。既存画面の再読込や各PCのインストール更新は行っていません。

---

# 公開・配布版の状態 — 航空写真PDF修正 / 2026-10-14

利用者の再開・公開承認に基づき、右図の外周を国土地理院の実航空写真へ更新しました。左図は標準地図、両図は同じ北上・縮尺・範囲・外側最低10mを維持します。内部は実DEMの勾配・地番・等高線で、標高表示を18px太字・濃色・白縁にしました。等高線間隔2m・太線10mは変更していません。取得失敗を空白や標準地図で完成扱いにせず、再試行と以前の結果保持を確認しました。

- 運用URL：https://solar-site-precheck.pages.dev/
- 配布URL：https://a0f8d5f6.solar-site-precheck.pages.dev/
- Production ID：`a0f8d5f6-fd8e-4083-88b5-8002329bfef7` / branch `main`
- ソース：`ed00926b015f54fc42613c59c09a9814341b30cb` / パッケージ保存：`fd5d412e64fa1681860580215ad68058674c9830`
- 版：1.28.2 / Build 2026-10-14 / 公開JS：`index-BNHFobc2.js`
- Cloudflare ZIP：14,623,832 bytes / SHA-256 `cee8f266cbf8921ea22661eba8931e72c810a673e65d426cb4810bffa99ec597`
- Windows ZIP：15,353,096 bytes / SHA-256 `d74f0d4b579c91d81efc85bfc1c0ff6ab570b4ba5d84ffef5d9f2fbdd8dd2ecf` / JS `index--yU3qG4H.js`

コミット済みクリーンソースから494/494、両ビルド、CSP・資産・パッケージ照合が成功。再起動後は同じ確認済みパッケージを再ビルドせず公式Wranglerで配布しました。既存認証を再利用し、新ログイン・権限付与・キー発行は行っていません。運用の52/52公開distファイルがmanifestと一致し、不一致0件、実CSPも確認（2026-10-14 07:31:50 UTC）。

独立Edgeを1セッションだけ起動し、公開3区域の実クリック、同じ図形の3D、一括解析、2種のPDF保存、390px幅、取消後の前回PDF保持を確認しました。運用から取得した配置図1ページ・報告書4ページを全ページ描画して実画像を確認し、右外周の航空写真・実218mラベル、左地図、表・注記の読める配置を確認しました。ブラウザーのPIDと開始時刻を記録し、finallyでcontext/browser/serverを閉じ、残留0件を確認。メモリは検証前63.9%、ピーク78.4%、終了後71.1%で停止しました。

これは公開データの代表例によるWindows検証です。利用者の実案件・Mac/Safari・実タッチの検証とは区別します。方向キューブはこの配布にはまだ含まれません。旧production `939a74b3-7620-43f1-b895-89eecda6584a` を保持しています。

---

# 以前の公開・配布版の状態 — v1.28.2 / 2026-10-14

利用者が承認した既存サイト更新として、検証済みパッケージを既存Cloudflare Pagesのproductionへ配布しました。地図参考領域から3D・一括解析・2種類のPDFへ接続し、A3横1枚2図、等高線標高ラベル、面積加重の勾配分布、正南固定比較、15°・前後空き3.3mを追加しました。自宅Macの未保存バイトの回収ではなく、履歴からの再実装です。

- 運用URL：https://solar-site-precheck.pages.dev/
- 配布URL：https://939a74b3.solar-site-precheck.pages.dev/
- Production ID：`939a74b3-7620-43f1-b895-89eecda6584a` / branch `main`
- ソース：`45e305c4e6a3e7c28e9d3f322d9993a6daf293d9` / パッケージ保存：`efd619a5ffb97ae6eff92cd5c0a7207e7b7f1837`
- 版：1.28.2 / Build 2026-10-14 / 公開JS：`index-CqpSJyZ2.js`
- Cloudflare ZIP：14,622,927 bytes / SHA-256 `bc3ec65b22e20c18a8aeadb15666d2a816dd3bb787b26facaeb932d12352ed4d`
- Windows ZIP：15,352,134 bytes / SHA-256 `cdf5fb5796f039ea0ad409dfb113cc270e31ff7ad33b3f092c49c72e6718e8f2` / JS `index-DUoREfzz.js`
- [ソースmain CI 38513831347](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/38513831347)、[配布物main CI 38514351820](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/38514351820)：success。

公式npmのWrangler 4.150.0を、利用者の別承認後に会社PCのリポジトリ外へローカルインストールしました。既存認証を公式whoamiで確認して再利用し、新ログイン・OAuth許可操作・キー発行は行っていません。パッケージルートからWranglerがWorkerをコンパイルし、52資産とFunctions bundleを配布しました。大域的なインストール設定・会社のセキュリティ設定・Git Providerは変更していません。

クリーンなソースから全体テスト491/491、両ターゲットのビルド、CSP、資産、Functionsのedge依存、全ZIP項目ハッシュと配布メタデータが成功。GitHubから再取得したCloudflare ZIPも同じSHA-256でした。運用URLから52公開distファイルを実取得し、全件がmanifestと一致、未照合・不一致は0件（2026-10-14 05:39:28 UTC / 14:39:28 JST）。_headersはHTTPファイル対象外として実CSPを確認。API等6件で、main HTML、操作PDF、power-grid不正入力400 JSON、NEDO正常200・異常400、inheritance-pdf GET 405が成功しました。PDF APIのPOSTは未実行です。

実運用URLの独立Edgeセッションで、公開3区域7005-7・7023-4・7025-2を実クリックし、選択取消・再適用、同じgeometry keyの3D、内部代表点から一括解析、配置図1ページ・報告書4ページの実保存、390px幅、再解析取消後の前回PDF保持を確認しました。実案件の結果とは区別します。公開JSと実PDFの標高ラベルも確認済み。Mac/Safari実機・実タッチ・ユーザーの現在の3地番の操作は未確認です。

隣接表示境界の一部の組合せは投影後の接触する中抜きが検証に通らず、確定前に停止して前回の結果を保持します。修復・凸包・拡張は行いません。原本全筆の保証と全国原本整備は今回の完成範囲に含めません。詳細は `MAP_REFERENCE_DRAWING_2026_10_14_JA.md`。旧production `8d946c82-89f9-4e6d-99a6-0ffa283c0295` と10/13のZIPを復旧用に保持しています。配布後の確認文書はソースコミット・配布物とは別です。

---

# 以前の公開・配布版の状態 — v1.28.2 / 2026-10-13

利用者のGitHub・オンライン版更新依頼に基づき、[PR #6](https://github.com/Sonikim1743/Solar-site-precheck/pull/6)をmainへ反映し、既存Cloudflare Pagesに公開しました。公開画面は **Version 1.28.2 / Build 2026-10-13**。実寸の参考配置、勾配条件比較、架台の選択・復元、配置を囲む仮フェンス、地番・地図切替と説明ウィンドウを更新しています。

## 公開の根拠

- 運用URL：https://solar-site-precheck.pages.dev/
- 配布URL：https://8d946c82.solar-site-precheck.pages.dev/
- Cloudflare Production ID：`8d946c82-89f9-4e6d-99a6-0ffa283c0295` / branch `main`
- 両パッケージのソース：`a7211cbaf4c7a862c4a1a6ef3e4dc9594e38f13e`
- 配布物コミット：`293f5465970e67cd440d2a122e204c2db1bb9a67`
- PR #6のmainマージ：`0388ad9906c2a93c786ca6304ce7ddb7b9416eb9`
- 公開JS：`index-uI2HMLn0.js` / portable JS：`index-10S0EM18.js`
- [PR CI 38372495155](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/38372495155)：success
- [main CI 38372751513](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/38372751513)：success

後続の公開確認文書のコミットは、配布物のソースコミットとは別です。GitHub pushでは自動配布されないため、検証したCloudflareパッケージのルートからdist・Functions・sharedをそろえて配布しました。

## 配布物と検証

| 対象 | ファイル | サイズ（bytes） | SHA-256 |
|---|---|---:|---|
| Cloudflare | SolarSitePrecheck_v1.28.2_2026-10-13_cloudflare.zip | 14,336,660 | 6155d240b4804624d7311c43cd6f38b653bffabbddd2cdf8f55cf79884bc93a1 |
| Windows更新 | SolarSitePrecheck_v1.28.2_release_light.zip | 15,065,892 | e81d0e5dba9ad75f3d8bdbf40e996667db007bc15d27d095012f1ca5d80edab4 |

- パッケージ生成時の自動検査 **443/443**、両ターゲットのビルド、CSP、同梱PDF/OCR、Functionsのedge依存検査が通過。
- 両ZIPのmanifest対象は各60ファイル。ZIPのSHA-256・サイズ・版・日付・target・ソース・bundleと、全同梱ファイルのハッシュを独立照合しました。個別案件・認証情報・私用CAD・.sptを含みません。
- 運用URLの公開distファイル **47/47** が配布manifestのハッシュと一致。`_headers`はHTTP配布対象外として、実応答のCSPと基本ヘッダーを別に確認。HTMLの正規化は同一originの308で、`/index.html`→`/`、`/404.html`→`/404`の各1回を経て本文ハッシュを照合しました。
- 初回の一部大容量取得はタイムアウトしたため、その対象だけを再取得して確認。最終の未照合ファイル・ハッシュ不一致は0件です。最終HTTP照合：2026-10-13 **21:13:16 JST**。先に一致した本文・ヘッダーの証拠日時は別に保持しています。
- GitHub mainから二つのメタデータと二つのZIPを実取得し、ソース・版・日付・target・bundle・サイズ・ハッシュと各60ファイルのmanifestをローカル配布物に照合しました。
- 公開API確認6項目：main HTML、操作PDFのContent-TypeとPDFシグネチャ、power-grid不正入力400 JSON、NEDO正常200、異常メッシュ400、inheritance-pdf GET 405。実PDFのPOST検証は今回実行していません。

## 公開画面で確認した範囲

Windowsの独立した配布URLで、業務案件ではない検証用地点・手描き範囲を使用しました。開始点の再クリックで範囲を閉じ、GSIの範囲DEMを取得し、3Dと参考配置のWorker計算を実行しました。急な任意地形の10°未満では0架台、20°未満では1架台・20枚となり、除外／復元・図下の減らす／増やすで数量とDC/ACが一致すること、配置に対するフェンス表示、説明ウィンドウの開閉、高さ2倍によって数量が変わらないことを確認しました。これは当該土地の事業性・設置可否の判断ではありません。

密集地番、平面・3D選択、取消・範囲変更ガード、390px幅の確認は `TERRAIN_LAYOUT_QA_2026_10_13_JA.md` の合成検証を参照します。公開画面の全機能・OCR・PDF POST・Mac/Safari・実タッチを今回確認したとは扱いません。独立OSMの収録状況・電圧・接続先は現地・電力会社での確認が必要です。

参考配置の条件・結果・個別除外・フェンスは画面内の検討用であり、JSON記録・PDFの保存対象ではありません。A3地形図面はDEMの固定視点・高さ1:1を維持します。複数タブの保存競合と異なる実行環境のgeometry key互換は既存の未解決事項です。会社PCの5290作業画面は初期化せず、全PCのインストール置換完了とも扱いません。

以前の本番 `08da02c2-1263-4fba-94e0-ae6a20a85817` とv1.28.1のZIPを復旧用に保管しています。

---

# 以前の公開・配布版 — v1.28.1 / 2026-10-08

利用者のGitHub・オンライン版更新依頼に基づき、[PR #4](https://github.com/Sonikim1743/Solar-site-precheck/pull/4) をmainへ反映し、既存Cloudflare Pagesへ公開しました。公開サイトは **Version 1.28.1 / Build 2026-10-08**。アプリ・両ZIP・manifestの版表記も1.28.1です。

## 公開の根拠

- 運用URL：https://solar-site-precheck.pages.dev/
- 配布URL：https://08da02c2.solar-site-precheck.pages.dev/
- Cloudflare Production ID：`08da02c2-1263-4fba-94e0-ae6a20a85817` / branch `main`
- 両パッケージのソース：`f05864141c2f7d0ca769574654b917d3e3eb7cb5`
- 配布物コミット：`ca2cff621f22e45f065416eb5d614fa64bc02feb`
- PR #4のmainマージ：`ea3399f9b3f666b8e117f995ea214878dc646258`
- 公開JS：`index-DzqmE1sk.js` / portable JS：`index-CZBb-LXf.js`
- [PR CI 37739808959](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/37739808959)：success
- [main CI 37740059209](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/37740059209)：success

後続の確認文書のコミットは、配布物のソースコミットとは異なります。GitHub pushだけではこのPagesプロジェクトは更新されません。検証したCloudflareパッケージのルートから、Functions・sharedとともに直接配布しました。

## 配布ファイルと実確認

| 対象 | ファイル | サイズ（bytes） | SHA-256 |
|---|---|---:|---|
| Cloudflare | SolarSitePrecheck_v1.28.1_2026-10-08_cloudflare.zip | 14,295,372 | 5794e9b736e4349caad3fc0ce6a11db03e5c08ee64b37b112005710f63ef2ff1 |
| Windows更新 | SolarSitePrecheck_v1.28.1_release_light.zip | 15,024,624 | 36ad74c029c1473c425c563bb9e776b748cc7a32ac2bed8a9ec2ddc29deedba0 |

- 自動テスト **320/320**、両ターゲットのビルド、CSP、同梱PDF/OCR、Functionsのedge依存検査が通過。
- 両ZIPで、それぞれ58個のmanifest対象ファイル、ZIP内ハッシュ、ソース・対象・版・日付・bundle・サイズを独立照合。地図描画ソフトウェアのライセンスを含み、.git・認証情報・個別CAD・社内.sptは含みません。
- 運用URLから取得した **45個の公開distファイル** がmanifestのSHA-256と一致。`_headers`はHTTP対象外とし、実応答のCSP・キャッシュ等とローカルファイルで確認。mainルート、配布URLのHTML/JS、PWA設定、版・日付・Cloudflare対象、欠落PDFの404も確認。HTTP照合完了：2026-10-08 15:53:52 JST。
- API確認6項目：main HTML、操作PDFのContent-Type/シグネチャ、power-gridの不正入力400 JSON、NEDO正常200、異常メッシュ400、inheritance-pdf GET 405。
- GitHub mainの二つのメタデータと公開ZIPを実取得し、ローカルとの差 **59/59照合通過**。ソース・target・bundle・版・日付・ハッシュ・サイズが一致。確認：2026-10-08 15:55:09 JST。
- GitHubのAboutに現行の地図・地番・等高線・勾配・3Dの紹介とオンラインURLを追加し、公開APIとブラウザで読み返して確認。README、更新履歴、配布・共有・レビュー・引継ぎ案内も現行版へ整理。

## 公開画面で確認した範囲

Windowsの独立した配布URLを使い、個別案件ではない合成テスト位置・範囲で確認しました。地名ON・公開地番OFFの初期値、地番ONでの参考筆界表示、作図中の3mスケールまでの追加拡大、開始点で範囲を完成して通常15mスケール上限へ戻る動作を確認。地点の北緯・東経の度分表示、地域名、標高、同じ範囲のDEM、3Dの高さ2倍と勾配別推定面積、中心固定の回り込み・上方向ドラッグ・ホイールズーム、背景地図付き範囲レポートの実描画を確認しました。

発電量画面への往復で選択地点・範囲面積・取得済み地形結果を保持。今回、新しい発電量の計算は実行していません。公開検証タブで警告・エラーのログはありませんでした。公開画像・座標の表示を実案件の筆界精度確認とは扱いません。ローカルの狭い画面、除外取消、A3生成等の確認範囲と履歴は `TERRAIN_AREA_V1_28_KO.md`、公開画面の補足は `V1_28_1_BROWSER_CHECK_JA.md` に記録しています。

## 未完了と復旧先

作業中のローカル5284/5285の地点・範囲は初期化していません。配布ZIPの公開と全PCのインストール置換は別です。Mac/Safari実機、複数タブの保存競合、異なる実行環境のgeometry key互換、最大範囲PDFは未確認または未解決のままです。

前回の本番 `8610274a-0872-4a11-9f2e-928558b17dee` とv1.28 ZIPを復旧用履歴として保持します。以下は以前の公開記録です。

---

# 以前の公開・配布版 — v1.28.0 / 2026-10-08

利用者の明示依頼とPR #3のmainへのマージ承認に基づき、GitHub mainと既存Cloudflare Pagesを更新しました。公開サイトは **Version 1.28.0 / Build 2026-10-08** です。ZIP・manifestの版表記は `1.28` です。

## 今回の公開根拠

- 運用URL: https://solar-site-precheck.pages.dev/
- 配布URL: https://8610274a.solar-site-precheck.pages.dev/
- Cloudflare Production ID: `8610274a-0872-4a11-9f2e-928558b17dee` / branch `main`
- パッケージのソース: `91191eec5c9a4c525d4f05b3b0a014eff1e644ed`
- 配布物コミット: `27cfedd225fe98842a105cc69ecff49fe3d226c4`
- [PR #3](https://github.com/Sonikim1743/Solar-site-precheck/pull/3) のmainマージ: `1755f86dd8978b17a6fd94658503c9926af33fba`
- 公開JS: `index-BdaWY2P2.js` / portable JS: `index-BT65KsBw.js`
- [main CI 37715794437](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/37715794437): success

## 検証と配布ファイル

自動テスト273件、Cloudflare/portableのビルド、CSP、同梱OCR・マニュアルPDF、Functionsのedge依存、ZIP内ハッシュと配布メタデータが通過しました。公開後に44個の公開distファイルのHTTP SHA-256を検証済みmanifestと照合。版・日付・対象、PWA、応答ポリシー、API6項目、欠落PDFの404を含む100項目が通過しました。`_headers`は公開URLではないためHTTP対象外とし、ローカルハッシュと実応答のCSPを確認しました。完了時刻は2026-10-08 11:03:06 JSTです。

GitHub mainの公開メタデータと二つのZIPを実際に取得し、ソース・サイズ・SHA-256がローカルと一致することを確認しました。他PCからオンライン更新が受け取るportableファイルも今日の版です。

| 対象 | ファイル | SHA-256 |
|---|---|---|
| Cloudflare | SolarSitePrecheck_v1.28_2026-10-08_cloudflare.zip | a8ffbe6f0927fb0776e1fc8cd4149e8cda239ebd2059013c24b190f4bd34730a |
| Windows更新用 | SolarSitePrecheck_v1.28_release_light.zip | 4536bdd3a5a62f800fa2dc5475746a4f796f2f82a8aad58eba6ba4b7c4eaa6c8 |

公開のメニュー、発電量画面、系統画面、地平線・積雪、範囲地形、レポート、Solar Proガイド、活用例・資料、PDF補助画面を確認しました。系統画面の往復で地点・標高が維持され、375×844の一時表示で公開メインの横はみ出しがないことを確認しました。詳細・未確認範囲は `V1_28_BROWSER_CHECK_JA.md` と `PRODUCER_REVIEW_2026_10_08_JA.md` に記録しています。

配布用ZIPの公開と、各Windowsの既存インストールの置換は別です。作業中のローカル5279は維持しましたが、既存の全PCや5173をこの作業で更新したとは扱いません。旧実行版と利用中の候補地は初期化していません。Mac/Safari実機、最大範囲PDF、複数タブの保存衝突、異なる実行環境の記録互換は未確認または未解決です。個別資料のPDF送信は行っていません。

前回の本番 `eb931a58-23fd-4337-8760-d866c068e9ed` は復旧用に記録を保持します。以下は前回の公開・Windows切替の履歴です。

# 以前の公開・Windows実行版 — v1.27.2

2026-09-24にGitHub、既存Cloudflare Pages、Windowsのローカル5173を更新した。

## 公開の根拠

- 運用URL: https://solar-site-precheck.pages.dev/
- 配布URL: https://eb931a58.solar-site-precheck.pages.dev/
- Cloudflare Production ID: `eb931a58-23fd-4337-8760-d866c068e9ed` / branch `main`
- ソースコミット: `dfe7bb70a784acff1527856bc971e6d0f857e150`
- 配布物を含むGitHubコミット: `48e1b06fc6666a7d2725b0645363c5690d9b6a99`
- 公開JS: `index-C0Scqynr.js` / Windows JS: `index-nqk826i9.js`
- Version 1.27.2 / Build 2026-09-24

後続の記録だけのコミットは、上記ソースと配布物のコミットとは異なる。GitHub pushだけではPagesは更新されない。認証済みWranglerで既存プロジェクトに直接公開した。

## 確認結果

- 自動テスト171件、Cloudflare/portableビルド、CSP、マニュアルPDF・OCR資産、Functions、ZIP内ハッシュ、配布メタデータの確認が通過。
- 公開HTML・主要JS・PWA manifestのハッシュが検証済みパッケージと一致。バージョン・API・配布ID・ソース・GitHubを含む公開確認12項目が15:16:23 JSTに通過。
- [GitHub CI 35963451498](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/35963451498)、job `107516759512` が成功。
- Windows新規フォルダーの56ファイルがmanifestのハッシュと一致。試験用5275で6項目、切替後の5173でも6項目が通過。公開・ローカルの個人PDF送信試験は実行していない。
- 5173は新しいv1.27.2の実行版に切替済み。旧実行版・開発ソース・ブラウザ資料は保持した。ローカルJSのHTTP取得SHA-256は `025bcf2ac957a9059b4dd461353fd4e60e8a58f6f96824c5b562955274cd7ea8` でmanifestと一致。
- 次のWindows起動には `SolarSitePrecheck-Local-v1.27.2/START_LOCAL_ONLY.cmd` を使う。既存のpreview 5273も維持した。
- 実画面で1558×950と390×844を確認。公開サイト再読込後も利用者の選択地点と取得済み断面を保ち、全幅配置とv1.27.2を確認した。詳細と未確認範囲は `V1_27_2_BROWSER_CHECK_JA.md` を参照。

## 配布物

| 対象 | ファイル | SHA-256 |
|---|---|---|
| Cloudflare | SolarSitePrecheck_v1.27.2_2026-09-24_cloudflare.zip | 68b9ae012aa66c3d948e24617030fd041df1ab946358adb1bc03a4c49eb050fc |
| Windows | SolarSitePrecheck_v1.27.2_release_light.zip | 50db4ad9ae4a882fb305ef81492eddebd52b6abfdf8f81dbbcafab6057bb5f5b |

## 今回の状態と引継ぎ

地点・座標・標高・コピーを地図直下の上段へまとめ、断面をその下の全幅に配置した。断面ボタンは余分な開閉なしで使える。発電量だけを上部ツールメニューの別画面へ移し、地平線・積雪・レポート・資料・Solar Proガイドはメインの折りたたみ構成を維持した。

利用者への会話は韓国語、提出文書・図表は日本語。個別案件のPDF・座標・検討書は公開GitHubや配布物に含めていない。今後のコード開発はMac OpenClaw中心とし、`MAC_OPENCLAW_START_KO.md` で引き継ぐ。Mac実機でのclone・設定・起動は未実施。

## 以前の配布

- v1.27.1: 2026-09-24、deployment `40c9c8a3-10e7-4e91-9e4b-b813387223fb`、source `655eec45e03a57d0560bae03335e5957d9933bbf`。
- v1.27: 2026-09-24、deployment `69ea5bef-3ac3-4897-9aa1-2c9eeaa66a35`、source `f6fb2e245a4955f7171f7b864f950fa8eaffa616`。
- v1.25: 利用者の2026-09-11配布報告、deployment `cb0731e4-2f06-4b67-ae7a-e3e20a0e7e6d`。
