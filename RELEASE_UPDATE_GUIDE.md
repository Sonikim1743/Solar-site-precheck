# Release更新運用メモ

## 目的

会社ノートPCで最新ビルドを作成し、GitHub上の `release/latest` に軽量更新ZIPを置く。デスクトップ側では `UPDATE_APP_FROM_RELEASE.cmd` を実行するだけで、最新アプリへ更新できるようにする。

この方式は、TelegramやOpenClaw経由でデスクトップPCへ「更新実行だけ」を指示したい場合に向いています。

## 配布ファイルの考え方

### 初回セットアップ用

```text
outputs/SolarSitePrecheck_v1.1_portable.zip
```

- node.exe同梱版
- Node.js未導入PCでも起動しやすい
- 約30MB以上になるため、25MB制限のある添付には不向き
- 初めて使うPC、または環境を丸ごと渡す場合に使う

### 更新用

```text
release/latest/SolarSitePrecheck_v1.1_release_light.zip
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
release/latest/SolarSitePrecheck_v1.1_release_light.zip
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
