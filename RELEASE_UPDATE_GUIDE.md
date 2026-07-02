# Release更新運用メモ

## 目的

会社ノートPCで作成した最新ビルドをGitHub Releaseへ置き、デスクトップ側では軽量ZIPだけを取得して更新する。

## 25MB制限への対応

- `SolarSitePrecheck_v1.1_latest_portable.zip`
  - node.exe同梱版。
  - 初回セットアップやNode未導入PC向け。
  - 約35MBのため、25MB制限のある添付には不向き。

- `SolarSitePrecheck_v1.1_release_light.zip`
  - node.exeを含まない更新専用ZIP。
  - 既存デスクトップの `runtime\node.exe` またはインストール済みNode.jsを使う。
  - 約1MB未満のため、GitHub ReleaseやTelegram添付に向く。

## 会社ノートPC側：Releaseファイル作成

1. 最新コードに更新する。
2. `MAKE_RELEASE_PACKAGE.cmd` を実行する。
3. `outputs` に以下が作成される。
   - `SolarSitePrecheck_v1.1_release_light.zip`
   - `latest-version.json`
4. GitHub Releaseの `latest` に上記2ファイルをアップロードする。

## デスクトップ側：更新

1. 初回だけ、node.exe同梱版またはNode.js導入済み環境を用意する。
2. 以後は `UPDATE_APP_FROM_RELEASE.cmd` を実行する。
3. スクリプトが以下を行う。
   - GitHub Releaseの `latest-version.json` を取得
   - 最新ZIPをダウンロード
   - 現在の `dist` / `work` / `RUN_PORTABLE.cmd` を `backup` に保存
   - 最新ZIPの内容で更新
   - `update-status.json` に更新結果を保存

## OpenClaw / Telegram連携の考え方

- Telegramで `/update solar` を送る。
- OpenClawまたはローカル自動化で `UPDATE_APP_FROM_RELEASE.cmd` を実行する。
- 更新後、必要に応じて古い黒いサーバー画面を閉じて `RUN_PORTABLE.cmd` を再起動する。

## 注意

- Release用ZIPには内部 `.spt` テンプレートを含めない。
- `latest-version.json` の `zipUrl` はGitHub Releaseの実際のファイル名と一致させる。
- 更新に失敗した場合は、`backup` フォルダーから前バージョンを戻す。
