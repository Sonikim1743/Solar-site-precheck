# Project Workflow for Split Codex Threads

最終確認：2026-10-08 / v1.28.1。新しい作業は `AGENTS.md`、`docs/PROJECT_CONTEXT_KO.md`、`docs/DEPLOYED_VERSION.md`、`docs/TERRAIN_AREA_V1_28_KO.md`、`docs/NEXT_TASKS_KO.md` の順に読みます。

同じ依頼の分業はエージェントで担当ファイルと検証責任を分け、別のチャットは利用者が依頼した場合に作成します。Mac OpenClaw中心の開発方針と今回のWindows作業の許可を区別します。地図・範囲・地形・資料出力の主作業を優先し、旧ポータル案を自動的な次期課題にはしません。

変更した操作、テスト、ビルド、CSP、同梱資産を確認し、コミット済みのクリーンなソースから `pnpm package:deployment` で配布物を作ります。GitHubへの反映、既存Cloudflare Pagesへの配布、公開ファイルの照合、各PCのインストール更新は別工程です。完了の証拠と未確認範囲を公開記録に残します。個別案件・認証情報を公開ソースへ入れません。

以下は2026-07-08時点の分業背景です。現在の作業順と優先順位には上記の案内を使います。

## 1. Why split the work?

The project now has two different kinds of work:

- App development: concrete functions, tests, release packages.
- Portal development: information design, public pages, module database, guides, policy.

Keeping both in one long chat makes the context heavy and mixes different decision styles.

The recommended workflow is:

> One project, multiple focused Codex threads.

## 2. Recommended thread structure

### 1. PM / Overall Coordination

Purpose:

- Keep the project direction coherent.
- Decide priority.
- Collect results from other threads.
- Decide release scope.

Main document:

- `docs/threads/THREAD_PM.md`

### 2. App Development

Purpose:

- Improve Solar Site Precheck.
- Fix bugs.
- Add functions.
- Keep tests and release packages working.

Main document:

- `docs/threads/THREAD_APP_DEVELOPMENT.md`

### 3. Portal Development

Purpose:

- Improve Solar実務Portal.
- Build Home, Module DB, Guides, Cases, Regions, Policy.
- Keep the site concise and practical.

Main document:

- `docs/threads/THREAD_PORTAL_DEVELOPMENT.md`

### 4. Data Validation

Purpose:

- Check whether data is reliable enough to use.
- Validate NEDO, GSI, module specifications, Solar Pro import files, CSV formats.

Main document:

- `docs/threads/THREAD_DATA_VALIDATION.md`

### 5. Deployment / Operations

Purpose:

- Manage GitHub, Cloudflare, release ZIP, update flow, README, CHANGELOG.

Main document:

- `docs/threads/THREAD_DEPLOYMENT_OPERATIONS.md`

### 6. UX / Practical Review

Purpose:

- Review the app/site from the actual worker's perspective.
- Reduce clutter.
- Improve mobile and field usability.

Main document:

- `docs/threads/THREAD_UX_REVIEW.md`

## 3. Basic work cycle

Use this cycle:

1. PM thread decides the next goal.
2. Specialist thread performs the work.
3. Data/UX thread reviews if needed.
4. Deployment thread packages and publishes if needed.
5. PM thread summarizes the result and updates next steps.

## 4. Git rule

Before splitting work:

- Commit stable files.
- Keep experimental files clearly named.
- Avoid leaving many untracked files without explanation.

When a thread starts:

- Read `PROJECT_CONTEXT.md`.
- Read the relevant `THREAD_*.md`.
- Check `git status`.
- Confirm whether the target files are already modified.

When a thread finishes:

- Report changed files.
- Report tests/builds run.
- Report risks or unverified assumptions.
- Do not push unless the user explicitly asks.

## 5. File ownership rule

Use these rough boundaries:

| Area | Main owner |
|---|---|
| `src/`, `tests/` | App Development |
| `solar-portal-preview-*.html` | Portal Development |
| `public/equipment/`, data specs | Data Validation + Portal |
| release scripts / `release/` | Deployment |
| README / CHANGELOG | Deployment + PM |
| policy wording | Portal + Data Validation + PM |

If a task crosses boundaries, report the cross-over clearly.

## 6. Definition of done

For app changes:

- Tests pass, or unrun tests are explained.
- Build passes, or failure is explained.
- User-facing behavior is described.

For portal changes:

- HTML parses.
- Main sections remain concise.
- Official/non-official wording is safe.
- Mobile readability is considered.

For data changes:

- Source is recorded.
- Verification state is recorded.
- Unknown values are not invented.

For deployment changes:

- Release version is clear.
- Package name is clear.
- `latest-version.json` is updated if needed.
- GitHub/Cloudflare status is reported.

## 7. Communication style for thread reports

Each thread should end with:

```text
Done:
- ...

Changed files:
- ...

Checked:
- ...

Risks / not checked:
- ...

Recommended next step:
- ...
```

## 8. Current immediate recommendation

Before creating many threads, start with three:

1. PM / Overall Coordination
2. App Development
3. Portal Development

Add Data Validation and Deployment threads when the next concrete task needs them.
