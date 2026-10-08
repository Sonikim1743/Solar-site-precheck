# 公開・配布版の状態 — v1.28.1 / 2026-10-08

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
