# v1.27.1 更新予定 — 2026-09-24

**v1.27.1は配布前の確認対象です。この文書は公開・PC更新の完了を示しません。** 配布予定のPC用ファイル名は `SolarSitePrecheck_v1.27.1_release_light.zip` です。実際の配布物・バージョン・チェックサムは検証済みの更新メタデータと照合してください。

今回の整理は、地図から検討・発電量・レポート・SolarPro準備までを同じページで進め、従来の折りたたみ構成を保つことです。別画面へ分ける中間案は取り下げます。発電量と筆・検討範囲も必要なときに開く項目にし、短い見出し・要約と初期状態で閉じた詳細を使います。GEONEXの確認タブ・ボタン・外部確認リンクの削除は維持します。

更新前に必要な検討記録を保存し、サーバーを止めて旧dist/workをバックアップします。既存runtime/node.exeと個人データを維持して更新してください。`docs/DEPLOYMENT_PACKAGE.md`に対象別手順があります。更新後は Version 1.27.1、同じページで項目を開閉したときの地点・入力・結果の保持、記録の読み込みを確認します。旧schema 1の記録は読み込めますが、新schema 2の記録は旧版アプリでは開けません。

開発方針は「1ページで作業を完結、短い見出しと要約、詳細は初期状態で閉じる、主要機能を隠さない、地点と入力を保持する」です。メニューを一度開けば「地平線・日影を計算」「積雪データを見る」「レポート」を直接選べるようにします。最終の単一ページQAは `docs/V1_27_1_BROWSER_CHECK_KO.md`、変更範囲は `docs/RELEASE_v1.27.1_KO.md` を確認します。今後のコード開発はMacを中心にし、`docs/MAC_OPENCLAW_START_KO.md`に従って引き継ぎます。

以下は過去の更新履歴・当時の運用例です。会社ノートPCを開発の主担当にする旧手順は、現在のMac中心の運用方針に置き換わります。
# Release更新運用メモ

## 2026-09-11: v1.25 候補地記録の保存・再開

今回のPC用ファイルは SolarSitePrecheck_v1.25_release_light.zip です。既存のruntime/node.exeを使う更新用で、Node.js本体を同梱していません。現在の検討記録をJSONへ保存し、起動中のローカルサーバーを終了、既存のdist・workをバックアップしてから同名フォルダーを更新します。runtime/node.exeと個人データを維持し、RUN_PORTABLE.cmdで起動してください。更新後は画面下部のVersion 1.25と記録ファイルの読み込みを確認します。

今回の公開先への配信は別作業です。オンライン更新は公開済みのGitHubファイルを参照するため、手元のZIPを受け取っただけではオンライン版は変わりません。以下には以前からの運用記録を残しています。


## 2026-08-31: Cloudflare / ローカル別ビルド

最新の配布物は、変更をコミットして作業ツリーをクリーンにした後、`node build/packageDeployment.js` で作成します。テスト・CSP・同梱PDF/OCR・ZIP内SHA-256を検証し、`outputs/v1.23-日付-…/` にCloudflare用とローカル更新用のZIPを別々に出力します。GitHubへのpushや本番への配布は行いません。

OpenClawには **cloudflare.zip** と [配布手順](docs/DEPLOYMENT_PACKAGE.md) を渡してください。ビルド対象によってPDFサイズ制限などが異なるため、ローカル更新版をCloudflareへ配布しないでください。`release/latest` には従来どおりローカル更新版とメタデータが配置されます。

## 2026-08-31 修正時の確認事項

- ブラウザは同一オリジンの `/api/power-grid` に座標と検索半径を送信します。ローカル/Vite/Cloudflare共通の処理がアプリ識別User-Agentを付けて取得します。通常は `overpass-api.de`、接続障害時のみ公式 `lambert.openstreetmap.de` に切り替えます。429時は切り替えず待機します。結果はメモリーに10分間（最大8検索）保持します。
- `dist` だけでなく `functions/api/power-grid.js`・`shared/` も一緒に配布してください。ローカル版には `work/power-grid-server.mjs` も必要です（配布スクリプトが依存関係を1ファイルにまとめるため、dist/workのみコピーする旧アップデーターでも起動できます）。CloudflareはプロジェクトルートからWranglerでFunctionsを含めてデプロイします。
- `public/_headers` とビルド済みJSを必ず同時に更新してください。ローカル版もサーバー再起動後にページを再読込し、古いCSPを残さないでください。
- NEDO PDF OCRのworker・LSTM core（標準/SIMD/relaxed SIMD）・英語モデルは `dist/ocr/` に同梱します。CDN例外やJavaScriptの `unsafe-eval` は不要です。WebAssembly用の `wasm-unsafe-eval` のみ許可します。
- `dist/manual/site-operation-guide-v1.23.pdf` を更新ZIPから除外しないでください。操作案内は同一サイトの `/manual/` を参照します。`public/404.html` はCloudflareの欠落ファイルがアプリHTMLに化けるのを防ぎます。
- ビルド後は `pnpm test`、`pnpm verify:csp`、`pnpm verify:assets` を実行します。配布スクリプトでもコピー後のPDF/OCRファイルを検査します。
- 配布先では `node work/preflight-release.mjs https://solar-site-precheck.pages.dev` を実行し、PDFのContent-Typeと `%PDF-` シグネチャまで確認してください。
- `bad object HEAD` が出た作業コピーではリリース作成を止め、`git rev-parse --verify HEAD` と `git fsck --connectivity-only --no-dangling` を確認してください。未保存変更を退避する前に `.git` の削除や強制リセットをしないでください。

### CSP付きブラウザOCR確認（開発用）

`node build/buildBrowserSmoke.js` で独立した検証ビルドを作成し、`DIST_DIR=tmp/browser-smoke`、`PORT=5177` を環境変数に設定して `node work/serve-dist.mjs` を起動します。`http://127.0.0.1:5177/tests/browser/ocr-smoke.html` で「OCRを検証」を押し、合成画像の数値を読み取って `PASS` と `CSP violations: 0` が出ることを確認します。検証ページは通常の `dist` には入りません。

## 目的

会社ノートPCで最新ビルドを作成し、GitHub上の `release/latest` に軽量更新ZIPを置く。デスクトップ側では `UPDATE_APP_FROM_RELEASE.cmd` を実行するだけで、最新アプリへ更新できるようにする。

この方式は、TelegramやOpenClaw経由でデスクトップPCへ「更新実行だけ」を指示したい場合に向いています。

## 配布ファイルの考え方

### 初回セットアップ用

```text
outputs/SolarSitePrecheck_v1.22_portable.zip
```

- node.exe同梱版
- Node.js未導入PCでも起動しやすい
- 約30MB以上になるため、25MB制限のある添付には不向き
- 初めて使うPC、または環境を丸ごと渡す場合に使う

### 更新用

```text
release/latest/SolarSitePrecheck_v1.22_release_light.zip
release/latest/latest-version.json
```

- node.exeを含まない軽量ZIP
- 既存ポータブル版の `runtime\node.exe`、またはPCに入っているNode.jsを使う
- Telegram添付やGitHub経由の更新に向く
- 日常的な更新はこちらを使う

## 会社ノートPC側：最新更新ファイルを作る

1. 最新コードに更新する。
2. 必要なら動作確認を行う。
3. 次を実行する。

```text
MAKE_RELEASE_PACKAGE.cmd
```

4. 次の2ファイルが作成・更新される。

```text
release/latest/latest-version.json
release/latest/SolarSitePrecheck_v1.22_release_light.zip
```

5. GitHubへcommit / pushする。

```text
PUSH_TO_GITHUB.cmd
```

または通常のGit操作でcommit / pushします。

## デスクトップ側：最新へ更新する

1. 既存のポータブル版フォルダーを開く。
2. 次を実行する。

```text
UPDATE_APP_FROM_RELEASE.cmd
```

3. スクリプトが以下を行う。

- GitHub上の `latest-version.json` を取得
- 最新の軽量ZIPをダウンロード
- 現在の `dist` / `work` / `RUN_PORTABLE.cmd` / 更新スクリプトを `backup` に退避
- ZIPの内容で上書き更新
- `update-status.json` に更新結果を保存

4. 起動中の古いサーバー画面がある場合は閉じる。
5. `RUN_PORTABLE.cmd` を再起動する。

## private repository の場合

GitHub repositoryがprivateの場合、`raw.githubusercontent.com` のURLは認証なしでは404になることがあります。

この場合は、デスクトップ側のアプリフォルダー直下に次のファイルを作成します。

```text
github-token.txt
```

中身はGitHub Personal Access Tokenを1行だけ入れます。

推奨設定：

- fine-grained token
- 対象repo：`Sonikim1743/Solar-site-precheck`
- 権限：Contents read-only

`github-token.txt` は `.gitignore` 対象のため、GitHubへコミットしません。

## OpenClaw / Telegram連携例

1. 会社ノートPCで `MAKE_RELEASE_PACKAGE.cmd` を実行
2. GitHubへpush
3. Telegramでデスクトップ側のOpenClawへ更新指示

例：

```text
/update solar
```

4. OpenClaw側で `UPDATE_APP_FROM_RELEASE.cmd` を実行
5. 必要に応じて `RUN_PORTABLE.cmd` を再起動

## 更新できない時の確認

- `update-status.json` にエラー内容が残っているか確認
- private repoの場合、`github-token.txt` があるか確認
- GitHub tokenの権限がContents read-onlyになっているか確認
- `release/latest/latest-version.json` がGitHub上で更新されているか確認
- ZIPファイル名と `latest-version.json` の `zipUrl` が一致しているか確認
- 起動中の古いローカルサーバーを閉じてから再起動する

## 注意

- 軽量更新ZIPにはnode.exeを含めません。
- 内部用Solar Proテンプレート `.spt` は配布物に含めません。
- ポータブル版ではService Workerを無効化し、古いキャッシュによる表示ずれを避けます。
- 相続PDFのモバイルSafari対策として、更新ZIPには `work/inheritance-server.mjs` とPDF.jsのサーバー側解析ファイルを含めます。
- GitHub Releaseの「Releases」機能を使う方式へ変更することも可能ですが、現時点では `release/latest` フォルダーをGitHubに置く方式を採用しています。
