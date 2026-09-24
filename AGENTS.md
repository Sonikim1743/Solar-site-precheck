# Solar Site Precheck — project working context

Read `docs/PROJECT_CONTEXT_KO.md`, `docs/MAC_OPENCLAW_START_KO.md`, and
`docs/NEXT_TASKS_KO.md` before starting a new task. Read `docs/DEPLOYED_VERSION.md`
for deployment evidence, rather than assuming package.json is the live version.

- The preferred development machine after the v1.27 handoff is the user's Mac
  running OpenClaw. Windows is used for field work, SolarPro/CAD, and the portable app.
- Report in Korean. User-facing application copy is Japanese. Keep the interface
  compact, place detailed explanations in contextual disclosures, and preserve inputs.
- Latest explicit user change for planned v1.27.2: generation alone leaves the
  initial main page and opens in a separate screen from the upper menu. This is
  the exception to the v1.27.1 same-page rule; do not split other existing tools.
  Keep horizon, snow, parcel review, report, reference and SolarPro manual in
  the main page's established collapsible sections.
- Keep the terrain cross-section buttons directly visible without an extra
  disclosure. Clarify spacing between the location, elevation and copy controls.
- Use short section titles and brief summaries; keep detailed controls and
  explanations collapsed by default. Preserve selected locations and inputs.
- Simplicity must not hide existing core functions. Opening the tools menu once
  must reveal named direct entries for 地平線・日影を計算, 積雪データを見る,
  and レポート. Navigation must open the relevant destination/disclosure.
- Preserve the selected location, inputs, parcel review and calculated results
  when opening/closing sections or following menu links. These actions alone
  are not candidate changes and must not reset the user's work.
- GEONEX confirmation tabs, buttons and external links were rejected by the user
  and are removed from the v1.27.1 scope. Do not revive them as a follow-up task.
- Verify the changed main-page controls and the generation screen round trip,
  including preservation of the location, inputs and results. Record actual
  desktop/mobile coverage and limits. Passing code tests alone does not establish
  that a screen is simple or usable; do not imply unchecked workflows passed.
- GitHub `Sonikim1743/Solar-site-precheck` is the public code repository. Do not put
  candidate records, land registry documents, private CAD files, OpenClaw memory,
  authentication state, or full private conversation/handoff archives in it.
- Do not overwrite a dirty checkout or force-push to resolve divergence. Preserve
  changes, inspect the branch/remote, and work on a focused branch for new changes.
- Install dependencies from pnpm-lock.yaml. Run `pnpm test`, `pnpm build`,
  `pnpm verify:csp`, and `pnpm verify:assets`; validate changed browser workflows.
  Release packaging uses `pnpm package:deployment` from committed, clean source.
- Existing Pages project `solar-site-precheck` has Git Provider **No** (checked
  2026-09-24). A GitHub push alone does not deploy it. Deploy a verified Cloudflare
  package root that includes dist, functions, shared and wrangler.toml.
- Keep source commit, app version, package checksum, deployment ID, and actual live
  verification separate in the completion report. Do not mark unfinished work done.
- Review geometry is an approximate map measurement. Reference parcels do not add
  area. Do not derive installable kW, ownership, connection approval, or investment
  returns automatically from parcel area or nearby public equipment.
- Preserve schema 1 record loading; schema 2 additionally stores selected parcel
  geometry, roles, review boundary and exclusions. Imported strings remain plain text.

These project defaults do not replace the user's current task instructions.
