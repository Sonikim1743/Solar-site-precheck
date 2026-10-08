# Codex Thread Role Index

v1.28.1のリリース対象に合わせた分業案内です。実際の公開版は `docs/DEPLOYED_VERSION.md` を確認してください。利用者との会話・進捗報告は韓国語、利用者向け文書・画面・図表は日本語です。

同じ依頼の分業はエージェントを使い、担当ファイルと検証責任を先に決めます。別のチャットは利用者が作成を依頼した場合に使います。このフォルダーは役割別の参考資料です。

Every new thread should first read:

1. `AGENTS.md`
2. `docs/PROJECT_CONTEXT_KO.md`
3. `docs/DEPLOYED_VERSION.md`
4. `docs/TERRAIN_AREA_V1_28_KO.md`
5. `docs/NEXT_TASKS_KO.md`

その後、担当する役割ファイルと `docs/project/PROJECT_WORKFLOW.md` を読みます。`docs/project/PROJECT_CONTEXT.md` の旧v1.21・ポータル記録は歴史的背景です。Macへの引継ぎでは `docs/MAC_OPENCLAW_START_KO.md` も確認します。

表示倍率と実数値、地名・公開地番の参考表示と検討範囲、実装済みJSON保存と未確認の環境間再開を区別します。複数タブの保存衝突とMac/Safari実機を検証済みにしないでください。個別案件・認証情報を公開リポジトリへ追加しません。

## Recommended starting set

当初の役割案は次の三つです。今回の依頼で必要な役割だけを分担し、ポータル開発を自動的な次期課題にはしません。

1. **PM / Overall Coordination**
   - Role file: `THREAD_PM.md`
   - Use for planning, prioritization, release scope, and final decisions.

2. **Solar Site Precheck App Development**
   - Role file: `THREAD_APP_DEVELOPMENT.md`
   - Use for React app work, bugs, tests, and app releases.

3. **Solar実務Portal Site Development**
   - Role file: `THREAD_PORTAL_DEVELOPMENT.md`
   - Use for portal pages, module DB presentation, guides, cases, and policy text.

## Add later when needed

4. **Data Validation**
   - Role file: `THREAD_DATA_VALIDATION.md`
   - Use when checking NEDO, GSI, module specs, MD0W data, or Solar Pro import compatibility.

5. **Deployment / Operations**
   - Role file: `THREAD_DEPLOYMENT_OPERATIONS.md`
   - Use when preparing release ZIPs, GitHub pushes, Cloudflare deployment, README, or CHANGELOG.

6. **UX / Practical Review**
   - Role file: `THREAD_UX_REVIEW.md`
   - Use when reviewing mobile behavior, visual clutter, button placement, or practical workflow.

## Copy-paste starter instruction

When creating a new thread, paste this and replace the role file:

```text
This is a specialist thread for the Solar Site Precheck / Solar実務Portal project.

Please read:
- AGENTS.md
- docs/PROJECT_CONTEXT_KO.md
- docs/DEPLOYED_VERSION.md
- docs/TERRAIN_AREA_V1_28_KO.md
- docs/NEXT_TASKS_KO.md
- docs/project/PROJECT_WORKFLOW.md
- docs/threads/THREAD_XXXX.md

Then summarize:
1. your role
2. what files you may touch
3. what you should avoid
4. the next practical task you recommend

Work within the current user-authorized task and assigned files. Preserve other agents' changes.
Distinguish implementation, verification, packaging, GitHub merge, and live deployment.
Keep private candidate records and source documents out of the public repository.
```

## PM handoff rule

Specialist threads should report back to the PM thread using:

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
