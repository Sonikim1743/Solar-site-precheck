# Codex Thread Role Index

Use this folder when splitting the project into multiple Codex threads.

Every new thread should first read:

1. `docs/project/PROJECT_CONTEXT.md`
2. `docs/project/PROJECT_WORKFLOW.md`
3. The role file for that thread

## Recommended starting set

Start with these three threads:

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
- docs/project/PROJECT_CONTEXT.md
- docs/project/PROJECT_WORKFLOW.md
- docs/threads/THREAD_XXXX.md

Then summarize:
1. your role
2. what files you may touch
3. what you should avoid
4. the next practical task you recommend

Do not modify files until the task is confirmed.
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

