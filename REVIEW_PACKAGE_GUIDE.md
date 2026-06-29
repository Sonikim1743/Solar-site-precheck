# ソースコード共有・外部レビュー用ガイド

このアプリを他のAIツール、社内レビュー、GitHub等で検証してもらう場合は、以下のファイルを共有してください。

## 共有するファイル・フォルダ

必須:

- `src/`
- `public/`
- `tests/`
- `work/serve-dist.mjs`
- `index.html`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `vite.config.js`
- `README.md`
- `CHANGELOG.md`

補足資料として共有推奨:

- `ACCURACY_VALIDATION.md`
- `CADASTRE_GUIDE.md`
- `DEPLOYMENT_AND_KPI_PLAN.md`
- `INPUT_CHECKLIST.md`
- `TEAM_SHARING.md`
- `RUN_APP.cmd`
- `start-local-server.cmd`
- `start-team-server.cmd`

## 共有しないもの

以下は環境依存・生成物・一時調査データなので、通常は共有不要です。

- `node_modules/`
- `dist/`
- `.pnpm-store/`
- `tmp/`
- `outputs/`
- `.agents/`
- `.codex/`
- `work/serve-dist.mjs` 以外の `work/` 内ファイル
- `*.zip`
- `eng.traineddata`

## 外部レビュー時に伝えるとよい観点

レビュー依頼時は、以下の観点で見てもらうと有効です。

1. Reactアプリとしての構成・保守性
2. Solar Pro入力支援ツールとしてのUI/UX
3. NEDO 3次メッシュ・積雪出現率の扱い
4. 地平線分析ロジックの妥当性と限界
5. PWA・ローカル配布・チーム共有時のセキュリティ
6. 今後正式ツール化する場合に必要な改善点

## ローカル起動方法

依存関係を入れた後、以下で確認できます。

```bash
pnpm install
pnpm test
pnpm build
pnpm serve:dist
```

ブラウザで以下を開きます。

```text
http://127.0.0.1:5173/
```

Windowsで既に依存関係が入っている環境では、`RUN_APP.cmd` を使って起動できます。

## GitHub等に公開する場合の注意

- 会社案件の住所、地番、候補地メモ、現地写真、PDF図面は入れないでください。
- NEDO、国土地理院、各GIS等のデータ出典・利用条件はREADMEに明記してください。
- 公開前に `CHANGELOG.md` と `README.md` の内容を確認してください。
- 社外公開が会社ルール上問題ないか、必要に応じて上長確認を行ってください。
