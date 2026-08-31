# 配布パッケージ v1.23 / 2026-08-31

## Cloudflare版（OpenClaw向け）

`cloudflare.zip` を新しい空フォルダーに展開してください。`dist` だけでなく、同階層の `functions`・`shared`・`wrangler.toml` も必要です。既存の壊れた `.git` はコピーしないでください。

展開先のルートで、Cloudflareに認証済みのWranglerを使用します。

```sh
npx wrangler pages deploy dist --project-name solar-site-precheck
```

ZIPをダッシュボードへドラッグする方法ではなく、Functionsを含めてWranglerで配布してください。このパッケージはビルド済みであり、`pnpm build` の再実行は不要です。配布前に現在の本番デプロイIDを控え、問題があればそのデプロイへ戻してください。既存のAccess設定・公開範囲は変更しません。

本番URLでの確認:

```sh
node work/preflight-release.mjs https://solar-site-precheck.pages.dev
```

- 系統情報取得を1地点で実行し、結果または利用制限の理由が表示されること。
- NEDO PDFの数値OCRが動作し、CSPエラーがないこと。
- `/manual/site-operation-guide-v1.23.pdf` がPDFとして開くこと。
- レポートに66・77kV候補と参考変電所の位置・距離が表示されること。

HTTP検証だけでは画面・OCRの操作確認は完了しません。配布先での最終確認をお願いします。

## ローカル更新版

`release_light.zip` は既存のローカル版の更新用です。Node.js本体は含みません。起動中のローカルサーバーを停止し、既存の `dist`・`work` をバックアップしてから、同名フォルダーをこのZIP内の内容で置き換えてください。既存の `runtime/node.exe` と個人データは維持します。`RUN_PORTABLE.cmd` で再起動します。

オンライン更新ボタンはGitHub上の公開済みZIPを読みます。今回のファイルを受け取っただけではGitHub上の版は更新されません。

## 今回の変更と検索の読み方

- 電力データを同一オリジンのAPIから取得。上流障害への切替・キャッシュ・利用制限時の停止を実装。
- OCR worker / WebAssembly / 英語モデルを同梱。CDNの許可設定に依存しません。
- 操作マニュアルPDFを同梱。存在しない資料URLは404にします。
- 5→10→20→50kmの順に、公開地図に66kVまたは77kVと記載された最寄り候補を探索。見つかった時点で停止し、変電所は取得範囲内の参考情報として表示。
- 50km上限・通信障害・利用制限では停止します。取得済み結果は残します。電圧未登録は66・77kVと推測せず、参考系統線として区別します。
- 距離は公開線形への概算直線距離で、引込経路や接続先の確定値ではありません。公開データの欠落があるため、全国の絶対的な最近接を保証しません。線が見つかっても接続可否・空容量が確定したことにはなりません。

`release-manifest.json` にビルド対象、ソースコミット、各ファイルのSHA-256を記録しています。このZIPには認証情報・`.git`・社内用`.spt`テンプレートは含めません。

Wrangler設定の形式: [Cloudflare公式ドキュメント](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
