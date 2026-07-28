# 更新履歴

GitHub上では最新版をすぐ確認できるよう、詳細な作業メモではなく運用上必要な変更点だけを残します。

## 現行版: Version 1.23 — 2026-07-28

現在の配布基準です。

- 最新オンライン版: https://solar-site-precheck.pages.dev
- 軽量更新ZIP: `release/latest/SolarSitePrecheck_v1.23_release_light.zip`
- 最新メタデータ: `release/latest/latest-version.json`

### 主な内容

- Solar Pro入力メニューを追加し、入力マニュアル内の作業補助機能へすぐ移動できるように整理。
- Huawei `SUN2000-50KTL-JPM0` / `SUN2000-125KTL-JPH0` とJINKOモジュール枚数から、Solar Proの電気回路構成に入力するPCS台数・最大並列・最大直列の候補を計算する「PCS・モジュール結線アシスト」を追加。
- 「I-Vカーブ → 電気回路構成」から入力画面へ入る場所を、PCSアシスト横のヘルプ画像で確認できるように追加。
- Solar Pro上の「全アレイ自動結線」後に確認するPV設備容量、PCS比率、設置モジュール枚数・実モジュール枚数の確認手順を追加。
- PCS詳細設定で「詳細設定 → PCS詳細設定 → 全選択 → 設定 → Huawei Japan / 対象PCS選択」へ進む操作をスクリーンショット付きで案内。
- PCS比率が低い場合に注意しやすいよう、計算結果の表示を改善。
- Solar Pro入力マニュアルの順序を見直し、結線アシストを最初に確認できる構成へ変更。

### 配布前検証

- `npm test`
- `npm run build`
- `work/preflight-release.mjs`

## Version 1.22 — 2026-07-27

前回の配布基準です。

- 最新オンライン版: https://solar-site-precheck.pages.dev
- 軽量更新ZIP: `release/latest/SolarSitePrecheck_v1.22_release_light.zip`
- 最新メタデータ: `release/latest/latest-version.json`
- JS bundle: `index-BRiIWtE0.js`
- SHA-256: `d98beb371fd7e51ecdfd4275a1dab36fb304ea604465375f1d74e0470da78363`
- サイズ: `2051261` bytes

### 主な内容

- Solar Site Precheck v1.22の軽量更新パッケージを配布基準へ更新。
- Cloudflare Pages、ローカルPortable、ngrok共有の各経路で同じv1.22 bundleを確認。
- NEDO Web API、bad mesh検証、`/api/inheritance-pdf` の誤フォールバック防止を確認。
- 更新メタデータの `buildDate`、`buildId`、`sha256`、`etag`、`bundleName`、`sizeBytes` をv1.22基準へ更新。
- PDFツール画面を `PdfToolsPage` コンポーネントへ分離し、App本体の肥大化を抑える第一段階のリファクタリングを実施。
- PDFの文字・画像貼り付け、画像比率維持リサイズ、透明度調整、JPG/PDF保存反映を改善。
- 候補地レポートに一次判定、印刷用ページ構成、地平線グラフ、断面レポート、NEDO出典・計算条件を整理。
- 判定ロジックを `src/utils/verdict.js` へ分離し、テスト対象に追加。
- リリース作成前に未コミット変更を検出して停止する安全装置を追加。
- 住所表示の全角スペースを正規化し、候補地名・地図ポップアップの表示崩れを軽減。
- 地図ポップアップとレポート中心点の透過表示を調整し、航空写真上の視認性を改善。
- 断面レポートの勾配表現を角度中心に統一し、`%`値の誤読を防止。
- Solar Pro用地平線CSVの案内文を「DEMから作成した参考用の地平線データ」へ整理。
- 印刷時の背景色保持、robots非公開設定、Service Worker / HTML / dataキャッシュ方針を見直し、Cloudflare運用時の更新安定性を改善。

### 配布前検証

- `npm test`: 40件通過
- `work/preflight-release.mjs`: main HTML / NEDO API / bad mesh / PDF API GET guard 通過
- GitHub raw ZIP再取得後のSHA-256一致を確認

## Version 1.21 — 2026-07-08

- Solar Pro地平線CSV出力時に、分析地点と現在地点の不一致を止める安全確認を追加。
- Solar Pro入力マニュアルを、地平線分析からCSV読込までの作業順に整理。
- JINKO SOLAR `.MD0W` データ保存とSolar Pro取込手順を追加。
- Cloudflare Pages向けAPI整理と、`/api/inheritance-pdf` の未対応応答を明示。
- PDFツール、相続登記チェック、GSI標高取得の安定性を改善。
- GitHub Actions CIを追加。

## Version 1.2 — 2026-07-07

- 地図、地形断面、地平線CSV、積雪、簡易レポートを一体で確認できる構成へ拡張。
- Solar Proで読み込めるSunEye形式 `ObstructionElevations.csv` 出力を追加。
- NEDO 3次メッシュ境界確認、DEM精度表示、周辺断面表示を改善。
- Cloudflare Pages配布用のFunctions、`wrangler.pages.toml`、配布ガイドを軽量ZIPに同梱。
- 配布前確認スクリプト `work/preflight-release.mjs` を追加。

## Version 1.1 — 2026-06-30

- 法務局・相続関連PDFから土地の単独相続候補を抽出する実験機能を追加。
- 受付番号、受付日、土地、住所、外記載数の一覧表示とCSV出力を追加。
- PDF読取結果の並び替え、行単位コピー、受付番号範囲チェックを追加。

## Version 1.01 — 2026-06-29

- 住所検索と緯度経度検索を統合し、候補地入力を簡略化。
- NEDO 3次メッシュ境界確認、地平線分析、積雪表示、モバイル表示を改善。
- Solar Pro入力前の補助リンク、説明、表示レイアウトを整理。

## Version 1.00 — 初期版

- 太陽光候補地をSolar Proへ入力する前の候補地情報、NEDO積雪、地平線影響を確認する初期版。
