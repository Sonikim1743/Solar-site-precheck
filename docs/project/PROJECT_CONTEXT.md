# Solar Site Precheck / Solar実務Portal Project Context

Last updated: 2026-07-08  
Current app version: v1.21  
Current portal preview: `solar-portal-preview-v2.1.html`

## 1. Project identity

This project is a practical workbench for Japanese solar PV simulation work.

The current product family has two main parts:

- **Solar Site Precheck**
  - React-based web app.
  - Supports pre-check work before entering data into Solar Pro.
  - Handles map selection, coordinates, elevation, NEDO MONSOLA data, snow correction notes, terrain/horizon analysis, Solar Pro horizon CSV output, PDF/JPG conversion, and local experimental inheritance PDF parsing.

- **Solar実務Portal**
  - Public-facing portal concept.
  - Serves as the entrance for tools, module database, practical guides, anonymous cases, regional checklists, and policy/disclaimer pages.
  - Current preview file: `solar-portal-preview-v2.1.html`.

The long-term direction is:

> 日本の太陽光シミュレーション実務者向けワークベンチ

The short-term focus is not to create a broad information site. The focus is to help actual workers finish pre-simulation tasks faster and with clearer evidence.

## 2. Core philosophy

Use this sentence as the decision rule:

> Solar Pro入力前の準備時間を減らし、入力値の根拠を説明しやすくする。

In Korean:

> Solar Pro 입력 전 준비 시간을 줄이고, 입력값의 근거를 설명하기 쉽게 한다.

Prioritize:

- Simple actions over long explanations.
- Verified data over attractive but uncertain numbers.
- Practical outputs over decorative UI.
- Clear disclaimers over official-looking claims.
- Small reliable releases over large unclear redesigns.

Avoid:

- Excessive text blocks that distract from the task.
- Marketing-style tiles that do not lead to a real action.
- Features that look official but are not official.
- Mixing public portal functions with private/personally sensitive PDF workflows.
- Unverified module/spec/regional claims.

## 3. Current important assets

### App

- Main app: `src/App.jsx`
- Styles: `src/styles.css`
- Utilities: `src/utils/`
- Services: `src/services/`
- Tests: `tests/`
- Release ZIP flow:
  - `MAKE_RELEASE_PACKAGE.cmd`
  - `MAKE_PORTABLE_PACKAGE.cmd`
  - `release/latest/latest-version.json`

### Portal preview

- Current portal mockup:
  - `solar-portal-preview-v2.1.html`
- Older comparison preview:
  - `solar-portal-preview-v2.html`

### Module data

- Public module files:
  - `public/equipment/JKM655N-66QL6-BDV-F1-JP.MD0W`
  - `public/equipment/JKM720N-66HL5-BDV.MD0W`

### Deployment / sharing

- Cloudflare Pages target exists.
- GitHub repository is used for release and review.
- Portable update flow uses `latest-version.json` and release ZIP.

## 4. App version v1.21 summary

v1.21 includes:

- Solar Pro horizon CSV output from DEM-based horizon analysis.
- JINKO SOLAR module data download support.
- Improved Solar Pro manual guidance.
- Solar Site Precheck positioned as a work support tool, not a rough MVP.
- Cloudflare/public deployment considerations.
- Updated README / CHANGELOG / release package.

Important: v1.21 was already committed and pushed to GitHub main as:

`8e0dda7 Release Solar Site Precheck v1.21`

## 5. Portal v2.1 summary

`solar-portal-preview-v2.1.html` is the current merged portal preview.

Recent design decisions:

- Removed the DATA / KNOWLEDGE / TOOLS / CASES four-tile strip from the title page.
  - Reason: visually tidy but not immediately practical.
- Removed `ツールのリクエスト`.
  - Reason: it makes the portal feel like a general request site instead of a focused workbench.
- Replaced `型番リクエスト受付` with `次回整備予定`.
  - Reason: the module database should feel curated and verified.
- Removed duplicate `公開前チェック`.
  - Reason: policy should be present, but not over-explained.
- Kept `公開運用の前提 / Policy`.
  - Reason: official/non-official positioning and data responsibility remain important.

## 6. Officiality and risk positioning

This project must not look like an official Laplace Systems or manufacturer product.

Use language such as:

- `非公式の実務者向け参考サイト`
- `Solar Pro入力前の確認と作業補助`
- `メーカー公式ファイルではありません`
- `最終判断は一次資料・正規データで確認`

Avoid language that suggests:

- Official Solar Pro plugin.
- Official module database.
- Guaranteed simulation values.
- Certified engineering judgment.

## 7. Public / Lab / Local separation

Use this separation rule:

- **Public / Portal**
  - No personal information.
  - General tools and guides.
  - Module DB, public data, candidate precheck.

- **Lab**
  - Experimental features.
  - Limited users.
  - Needs validation.

- **Local / Private**
  - Personal information.
  - Legal/inheritance PDF processing.
  - Company-specific or sensitive documents.

Inheritance PDF checking should remain Lab / Local. It should not become a public server-side feature unless privacy handling is deliberately redesigned.

## 8. Current split-thread recommendation

Use separate Codex threads for:

1. PM / Overall Coordination
2. Solar Site Precheck App Development
3. Solar実務Portal Site Development
4. Data Validation
5. Deployment / Operations
6. UX / Practical Review

Each thread should read this file first, then read its own role file under `docs/threads/`.

