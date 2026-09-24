# Mac OpenClaw에서 작업 이어받기

## 역할
**Mac OpenClaw에서 코드 수정 → GitHub에 검증된 이력 보관 → 기존 Cloudflare Pages와 Windows 실행판에 같은 릴리스 반영**을 기준으로 한다. Mac에 대한 설정은 이 문서만으로 실행되지 않는다.

코드는 현재 공개 저장소 `https://github.com/Sonikim1743/Solar-site-precheck`를 기준으로 한다. 최초 인수 때 `package.json`, `git log -1`, `docs/DEPLOYED_VERSION.md`를 함께 읽어 소스와 운영 버전을 확인한다. v1.27이 원격에 반영됐는지 확인하기 전에는 옛 main을 최신 작업으로 판단하지 않는다.

## 첫 실행
기존 Mac 폴더가 있다면 원격과 미커밋 변경부터 확인하고 보존한다. 없을 때만 다음 새 폴더 예시를 사용한다.

```sh
mkdir -p "$HOME/Projects"
git clone https://github.com/Sonikim1743/Solar-site-precheck.git "$HOME/Projects/Solar-site-precheck"
cd "$HOME/Projects/Solar-site-precheck"
git status --short
git log -1 --oneline
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm verify:csp
pnpm verify:assets
pnpm develop --host 127.0.0.1 --port 5173
```

Nodeは依存パッケージの要求を満たす版を使う。今回のWindows実測はNode24.19.0/pnpm11.19.0、既存GitHub CIはNode22/pnpm9。Macの実際の版を記録し、固定lockfileで検証する。Windowsのnode_modulesをコピーしない。MacとWindowsの127.0.0.1は別々の実行先だ。

## OpenClawに読ませるもの
最初にこのリポジトリの `AGENTS.md` → `docs/PROJECT_CONTEXT_KO.md` → `docs/DEPLOYED_VERSION.md` → `docs/NEXT_TASKS_KO.md` の順に読むよう依頼する。OpenClawの実際のworkspaceと作業フォルダはMac上で確認する。既存設定を上書きせず、コード作業先と参照文書を既存の運用指示に追加する。

OpenClawの `MEMORY.md` は主要な決定、`memory/YYYY-MM-DD.md` は作業結果・コミット・残作業の記録に使う。これらの非公開の記憶と、公開アプリのソースは別々に保管する。文書を参照する仕組みであり、全会話をモデルに再学習させる操作ではない。[公式workspace説明](https://docs.openclaw.ai/concepts/agent-workspace)、[公式memory説明](https://docs.openclaw.ai/concepts/memory)。

## 毎回の進め方
1. 現在のブランチ・未完了変更を確認し、GitHubの最新状態を取得する。
2. 目的ごとの作業ブランチでコードと必要な文書を更新する。
3. 自動テスト、ビルド、変更した画面の実操作を確認し、結果と限界を記録する。
4. PRで差分を確認し、承認された内容をmainに反映する。
5. 同じコミットから公開・portableの配布物を作り、公開URLとWindowsのバージョンを確認する。
6. 完了・未完了・次の作業を日付付きで残す。Windows側は不具合や希望を記録してMacへ渡す。

## 既存URLを維持する配布
現在の `solar-site-precheck` はCLIで **Git Provider: No** と確認した。GitHubへのpushで自動公開される構成ではない。

最初はMacで公式Wranglerにログインして既存プロジェクトへ配布する。配布元は `dist` だけでなく、Functionsとsharedを含む検証済みCloudflareパッケージのルート。既存の `docs/DEPLOYMENT_PACKAGE.md` に従う。

その後、必要ならGitHub Actionsから同じPagesに配布する。Pages Edit権限の認証情報をGitHub Secretsに設定し、まず手動起動の配布処理で確認する。現在のGitHub CIはテスト/ビルド用で、配布自動化は未実装。認証情報をソースに書かない。[公式CI配布手順](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)。

Direct Uploadで作成されたPagesプロジェクトは同じプロジェクトのままGit integrationへ変更できないため、既存URLを維持するならWrangler/CI経由を使う。[公式制約](https://developers.cloudflare.com/pages/get-started/direct-upload/)。

## 会社資料・候補地データ
候補地JSON、登記、現場写真、CAD/SolarPro原本、過去の非公開引継ぎZIPを公開GitHubへ入れない。共有先は別途、会社で利用できる非公開ストレージを選ぶ。共有先とMac上のフォルダが決まるまでは自動同期を設定しない。ブラウザのローカル保存はGit同期に含まれないため、別PCで開くには検討記録を保存して渡す。

**移行完了の判定**：Macの取得コミットとGitHubが一致し、固定依存関係のテスト/ビルドが通り、OpenClawが目的・現状・次の作業を文書から説明できること。Mac実機のこの確認はまだ行っていない。
