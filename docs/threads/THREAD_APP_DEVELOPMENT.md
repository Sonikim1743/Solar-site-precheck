# Thread Guide: Solar Site Precheck App Development

## Purpose

This thread works on the React app: **Solar Site Precheck**.

The app is the main working tool. It should remain practical, fast, and focused.

## Read first

1. `docs/project/PROJECT_CONTEXT.md`
2. `docs/project/PROJECT_WORKFLOW.md`
3. `docs/threads/THREAD_APP_DEVELOPMENT.md`
4. `README.md`
5. `CHANGELOG.md`

## Main files

- `src/App.jsx`
- `src/styles.css`
- `src/components/`
- `src/services/`
- `src/utils/`
- `tests/`
- `public/`

## Current app scope

The app supports:

- Map selection.
- Address / coordinate search.
- Latitude/longitude display.
- Elevation and terrain data.
- NEDO MONSOLA-11 3rd mesh information.
- Snow 10cm+ occurrence rate handling.
- Horizon analysis.
- Terrain profile preview.
- Solar Pro horizon CSV output.
- Candidate quick report.
- PDF/JPG conversion.
- Experimental inheritance PDF extraction.
- PWA / Cloudflare / portable deployment support.

## Non-negotiable rules

- Do not break Solar Pro horizon CSV output.
- Do not change NEDO mesh validation casually.
- Do not silently mix candidate coordinates and old analysis coordinates.
- Do not add large text blocks to the main UI.
- Do not make the app look like an official Solar Pro plugin.
- Keep private/legal PDF features clearly separated from public features.

## UX philosophy

The user prefers:

- Large map and easy search.
- Compact data cards.
- Buttons that clearly imply action.
- Less text, more direct workflow.
- Japanese UI labels.
- Practical field usability, including mobile.

Avoid:

- Excessive explanatory text.
- Floating buttons that overlap content.
- Decorative UI that does not help the task.
- Too many options shown by default.

## Tests and checks

Before reporting completion, run when possible:

```text
pnpm test
pnpm run build
```

If dependencies or environment prevent running these, explain it clearly.

## Suggested starting prompt for a new App Development thread

```text
This is the Solar Site Precheck app development thread.

Please read:
- docs/project/PROJECT_CONTEXT.md
- docs/project/PROJECT_WORKFLOW.md
- docs/threads/THREAD_APP_DEVELOPMENT.md
- README.md
- CHANGELOG.md

Then check git status and summarize the current app state.
Do not modify portal preview files unless explicitly asked.
```

## Good first tasks

- Review current open app issues.
- Prepare v1.22 candidate list.
- Check that current v1.21 build still passes.
- Audit mobile UI issues.
- Verify Solar Pro CSV export still uses current selected coordinates.

## Completion report format

```text
Done:
- ...

Changed files:
- ...

Checks:
- pnpm test: ...
- pnpm run build: ...

Risks / not checked:
- ...

Next app task:
- ...
```

