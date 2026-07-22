# 更新履歴

GitHub上では最新版をすぐ確認できるよう、詳細な作業メモではなく運用上必要な変更点だけを残します。

## 現行版: Version 1.22 — 2026-07-22

現在の配布基準です。

- 最新オンライン版: https://solar-site-precheck.pages.dev
- 軽量更新ZIP: `release/latest/SolarSitePrecheck_v1.22_release_light.zip`
- 最新メタデータ: `release/latest/latest-version.json`
- JS bundle: `index-CJ9u7FlP.js`
- SHA-256: `cbe1ae523a2308dac3e725462bec84780e4ce0a5708338645d2e1fb92ef63d6c`
- サイズ: `2046129` bytes

### 主な内容

- Solar Site Precheck v1.22の軽量更新パッケージを配布基準へ更新。
- Cloudflare Pages、ローカルPortable、ngrok共有の各経路で同じv1.22 bundleを確認。
- NEDO Web API、bad mesh検証、`/api/inheritance-pdf` の誤フォールバック防止を確認。
- 更新メタデータの `buildDate`、`buildId`、`sha256`、`etag`、`bundleName`、`sizeBytes` をv1.22基準へ更新。

### 配布前検証

- `npm test`: 32件通過
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
