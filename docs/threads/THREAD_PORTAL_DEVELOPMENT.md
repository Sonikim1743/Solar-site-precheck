# Thread Guide: Solar実務Portal Site Development

## Purpose

This thread works on **Solar実務Portal**, the public-facing portal concept.

The portal is the entrance to:

- Solar Site Precheck
- Module Database
- Practical Guides
- Anonymous Cases
- Regional Checklists
- Policy / Disclaimer

## Read first

1. `docs/project/PROJECT_CONTEXT.md`
2. `docs/project/PROJECT_WORKFLOW.md`
3. `docs/threads/THREAD_PORTAL_DEVELOPMENT.md`
4. `solar-portal-preview-v2.1.html`

## Main files

- `solar-portal-preview-v2.1.html`
- Future portal files or pages if created.

## Current portal direction

The portal should be:

- Practical.
- Concise.
- Workbench-like.
- Trustworthy.
- Non-official but useful.

The portal should not be:

- A generic solar news site.
- A decorative SaaS landing page.
- A long essay page.
- A request collection site.
- An official-looking Solar Pro site.

## Recent design decisions

Keep these decisions unless the user explicitly changes direction:

- Removed the four strategy tiles from the hero.
- Removed `ツールのリクエスト`.
- Changed `型番リクエスト受付` to `次回整備予定`.
- Kept Policy, but removed duplicate readiness explanation.
- Kept the horizon profile as the signature visual.
- Kept module verification state visible.

## Portal information architecture

Current preview structure:

1. Hero
2. Tools
3. Module Database
4. Guides
5. Cases
6. Regions
7. Lab
8. Policy
9. Footer

Future real pages:

- `/`
- `/tools/site-precheck`
- `/modules/`
- `/modules/jinko/jkm720n-66hl5-bdv`
- `/modules/jinko/jkm655n-66ql6-bdv-f1-jp`
- `/guides/solarpro-md0w-import`
- `/guides/solarpro-horizon-csv`
- `/cases/`
- `/regions/`
- `/policy/`

## Writing rules

Use concise Japanese.

Prefer:

- `確認`
- `保存`
- `入力準備`
- `参考データ`
- `検証状態`
- `出典`

Avoid:

- Overly promotional copy.
- Broad claims.
- Unverified numerical examples.
- Too many explanatory tiles.
- "Request" as a primary site function.

## Officiality wording

Use:

- `非公式の実務者向け参考サイト`
- `Solar Pro入力前の確認と作業補助`
- `メーカー公式ファイルではありません`

Do not imply:

- Official Solar Pro support.
- Official manufacturer database.
- Guaranteed engineering result.

## Suggested starting prompt for a new Portal Development thread

```text
This is the Solar実務Portal site development thread.

Please read:
- docs/project/PROJECT_CONTEXT.md
- docs/project/PROJECT_WORKFLOW.md
- docs/threads/THREAD_PORTAL_DEVELOPMENT.md
- solar-portal-preview-v2.1.html

Then summarize the current portal structure and propose the next concrete site task.
Do not modify src/ app files unless explicitly asked.
```

## Good first tasks

- Polish `solar-portal-preview-v2.1.html`.
- Split portal preview into Home / Module Detail / Guide Detail mockups.
- Create one module detail page for JINKO 720.
- Create one guide detail page for `.MD0W` import.
- Draft Policy / Disclaimer page text.

## Completion report format

```text
Done:
- ...

Changed files:
- ...

Design reasoning:
- ...

Risks / not checked:
- ...

Next portal task:
- ...
```

