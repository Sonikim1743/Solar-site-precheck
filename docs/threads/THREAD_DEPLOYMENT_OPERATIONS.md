# Thread Guide: Deployment / Operations

## Purpose

This thread handles publishing, packaging, updates, and repository hygiene.

## Read first

1. `docs/project/PROJECT_CONTEXT.md`
2. `docs/project/PROJECT_WORKFLOW.md`
3. `docs/threads/THREAD_DEPLOYMENT_OPERATIONS.md`
4. `RELEASE_UPDATE_GUIDE.md`
5. `TEAM_SHARING.md`
6. `README.md`
7. `CHANGELOG.md`

## Main files

- `MAKE_RELEASE_PACKAGE.cmd`
- `MAKE_PORTABLE_PACKAGE.cmd`
- `release/latest/latest-version.json`
- `release/latest/*.zip`
- `wrangler.pages.toml`
- `functions/`
- `README.md`
- `CHANGELOG.md`
- `PUSH_TO_GITHUB.cmd`
- `UPDATE_APP_FROM_RELEASE.*`

## Responsibilities

- Keep releases reproducible.
- Keep update packages small enough for delivery constraints.
- Maintain GitHub main stability.
- Maintain Cloudflare Pages deployment readiness.
- Keep README and CHANGELOG aligned with actual features.
- Report version, build date, package name, SHA-256, and bundle name.

## Do not

- Push without explicit user request.
- Publish internal/private assets.
- Include sensitive templates accidentally.
- Treat local build success as public deployment success.
- Change app logic unless deployment requires it.

## Recommended checks

When packaging:

- `pnpm test`
- `pnpm run build`
- `MAKE_RELEASE_PACKAGE.cmd`
- Confirm `release/latest/latest-version.json`
- Confirm ZIP exists.

When publishing:

- Check `git status`.
- Commit clear scope.
- Push only after user approval/request.

## Suggested starting prompt for a new Deployment thread

```text
This is the Deployment / Operations thread.

Please read:
- docs/project/PROJECT_CONTEXT.md
- docs/project/PROJECT_WORKFLOW.md
- docs/threads/THREAD_DEPLOYMENT_OPERATIONS.md
- RELEASE_UPDATE_GUIDE.md
- README.md
- CHANGELOG.md

Then summarize the current deployment flow and identify what must be checked before the next release.
```

## Completion report format

```text
Release / deployment work:
- ...

Changed files:
- ...

Checks:
- ...

Artifacts:
- ...

GitHub / Cloudflare status:
- ...

Next operations task:
- ...
```

