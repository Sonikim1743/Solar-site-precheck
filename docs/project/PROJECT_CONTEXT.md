# Solar Site Precheck / Solar実務Portal Project Context

最終更新：2026-10-08。現在のリリース対象は **v1.28.1** です。本書の実装説明は公開完了の記録ではありません。実際の公開版・ソース・ZIP・配布IDは [DEPLOYED_VERSION.md](../DEPLOYED_VERSION.md) を確認してください。

## 最新の読み始め

新しい作業では次の順で読みます。

1. [AGENTS.md](../../AGENTS.md)
2. [PROJECT_CONTEXT_KO.md](../PROJECT_CONTEXT_KO.md)
3. [DEPLOYED_VERSION.md](../DEPLOYED_VERSION.md)
4. [TERRAIN_AREA_V1_28_KO.md](../TERRAIN_AREA_V1_28_KO.md)
5. [NEXT_TASKS_KO.md](../NEXT_TASKS_KO.md)

Macへの引継ぎでは [MAC_OPENCLAW_START_KO.md](../MAC_OPENCLAW_START_KO.md) も確認します。会話と進捗報告は韓国語、アプリの利用者向け説明・図表・提出資料は日本語です。

## 現在の実装と操作方針

- 航空写真を主作業面とし、地点・範囲・除外を選んで同じ有効範囲の等高線・勾配・平面・3D・報告書を確認します。画面の開閉やメニュー往復だけで入力・結果を初期化しません。
- 地名は初期表示、公開地番（2024年）は初期オフの参考レイヤーです。表示した筆界を面積や検討範囲へ自動採用しません。ファイルによる筆選択と管理は「ツール → 範囲・地番の詳細」で開きます。
- 地図の「範囲を描く」「除外」で作図します。3点以上は開始点の再クリック、または「確定」で完成。通常最大ズーム19、作図中21で、追加拡大は原資料の解像度を変えません。
- 対象筆と指定範囲の共通部分から除外を引き、参考筆は面積に加えません。有効範囲の面積を地図下の凡例と同じ行に表示します。
- 局所勾配は東西・南北10m幅の差分による参考分類です。割合と推定面積を同じ有効範囲で表示し、欠測は「勾配未確認」として分けます。5mの表示・集計格子を測量精度と混同しません。
- 3Dの「回転」「視点の移動」とホイールで地形を確認します。「高さ2倍 1:2」は横1：縦2の表示強調だけで、標高・勾配・面積・割合は維持します。側面・底面は表示用で、地層や土量ではありません。A3横2ページの地形PDFは1:1・固定視点です。
- 選択地点はSolar Pro用の度・分形式で表示・コピーします。位置照会と計算には元の精密座標を維持します。
- 発電量と系統確認は上部「ツール」の別画面です。地平線・積雪・レポート・資料・Solar Proガイドはメインの折りたたみ構成を維持します。GEONEX確認タブは再導入しません。
- JSON保存・再開は実装済みです。schema 3は範囲と取得済み標高・資料・取得時刻を含み、読込時に派生値を再計算します。schema 1/2の読込も維持します。PDF原本、地番原資料全体、設計ソフトの編集状態は記録に含みません。
- 別PC・実行環境間の記録互換、複数タブの保存衝突、Mac/Safari実機は未確認または未解決です。Windowsでの確認をMac実証の代わりにしません。面積から容量・施工可否・接続承認・収益を自動確定しません。

GitHubは公開ソースです。候補地記録・登記資料・私用CAD・認証情報・会話アーカイブを追加しません。基本の開発引継ぎ先はMac OpenClawで、今回のWindows作業は利用者が認めた例外です。

パッケージ作成はコミット済みのクリーンなソースで `pnpm package:deployment` を使います。GitHub pushとCloudflare公開は別工程です。テスト・ビルド・CSP・同梱資産・変更した操作を確認し、公開後の実証は `DEPLOYED_VERSION.md` に記録します。

---

## 過去の製品・ポータル背景（2026-07-08時点）

以下は当時の背景記録です。バージョン、配布スクリプト、ポータルの「current」、スレッド開始順は現在の指示ではありません。最新の作業には上記の読み始めと方針を使用します。

Historical app version: v1.21

Historical portal preview: `solar-portal-preview-v2.1.html`

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
