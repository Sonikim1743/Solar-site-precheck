# Mac OpenClaw에서 작업 이어받기

## 역할
**Mac OpenClaw에서 코드 수정 → GitHub에 검증된 이력 보관 → 기존 Cloudflare Pages와 Windows 실행판에 같은 릴리스 반영**을 기준으로 한다. Mac에 대한 설정은 이 문서만으로 실행되지 않는다.

코드는 공개 저장소 `https://github.com/Sonikim1743/Solar-site-precheck`를 기준으로 한다. 2026-10-08 PR #4를main에 병합하고 기존 Cloudflare 공개 사이트를v1.28.1로 갱신했다. 패키지 소스f058641, main 병합ea3399f, 공개 배포08da02c2-1263-4fba-94e0-ae6a20a85817의 근거는 `docs/DEPLOYED_VERSION.md`에 있다. 새 작업은 main의 실제 최신 커밋과 미커밋 변경을 확인해서 시작한다. `package.json`의 버전, 받은 커밋, 실제 배포 ID를 구분한다. 각Windows 기존 설치와 Mac 설치는 별도이며 모두 갱신됐다고 해석하지 않는다.

**이번 인계 대상은 v1.28.2 / 2026-10-13 릴리스 준비본**이다. GitHub·공개 사이트의 실제 반영 완료는 `docs/DEPLOYED_VERSION.md`의 새 커밋·배포 ID로 확인한다. 위v1.28.1 기록을 이번 배포 증거로 사용하지 않는다. Windows용 파일명은 `SolarSitePrecheck_v1.28.2_release_light.zip`이며, Mac에서는 해당ZIP의 Windows 실행파일 대신 검증한 Git 커밋과 고정 의존성을 사용한다.

이번 기능은 **4단 고정 × 4~8열**의 720W 가대 참고 배치, 10°·15°·20° 미만 경사 비교, 선택 장수의 DC·AC 참고값이다. 개별 가대를 클릭하면 제외하고 점선 클릭으로 복원한다. 활성 가대 외형을 하나의 볼록 껍질로 감싸 `setbackM`만큼 실제 미터 여유를 둔 뒤 유효 범위와 교차해 임시 펜스를 만든다. 제외 가대는 둘레 계산에서 빼며 빈 배치에는 펜스가 없다. 상단 조작은 배치·비교·경사, 상세는 `?` 대화상자, 가대 증감은 그림 바로 아래에 둔다. 지도 직접 지번·지도 종류 전환과 실자료 지번의3D 표시를 유지하며, 상단 `ツール → 系統確認`의 전주·철탑은 독립 OSM 조회다.

**참고 배치 조건·결과·개별 제외·임시 펜스는 JSON 기록이나 PDF에 저장되지 않는다.** 새로고침·다른PC 인계 후에는 재계산이 필요하다. 기존 A3 지형 보고서는 같은DEM의 고정 시점·높이1:1을 유지한다. Mac에서는 계산 Worker 시작/중지, 조건 변경, 가대 제외/복원, 펜스, 도움말 열기/닫기와 기존 기록 읽기를 실제 확인한다. 세부 설명은 `docs/GROUNDY_TERRAIN_LAYOUT_2026_10_13_JA.md`를 따른다.

이번 범위 지형·3D·보고서 작업은 사용자가 Windows에서 코드 작업을 진행하도록 명시 승인한 예외다. 이후 개발은 Mac OpenClaw 중심이라는 기본 방향을 유지한다. Mac의 실제 작업 폴더·브랜치·의존성·화면을 확인한 뒤 인계받으며, 이번 Windows 검증으로 Mac 동작을 확인했다고 기록하지 않는다.

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
最初にこのリポジトリの `AGENTS.md` → `docs/PROJECT_CONTEXT_KO.md` → `docs/DEPLOYED_VERSION.md` → `docs/TERRAIN_AREA_V1_28_KO.md` → `docs/NEXT_TASKS_KO.md` の順に読むよう依頼する。OpenClawの実際のworkspaceと作業フォルダはMac上で確認する。既存設定を上書きせず、コード作業先と参照文書を既存の運用指示に追加する。

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
