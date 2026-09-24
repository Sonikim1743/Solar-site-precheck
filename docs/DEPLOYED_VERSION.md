# 公開・Windows実行版の状態 — v1.27.2

2026-09-24にGitHub、既存Cloudflare Pages、Windowsのローカル5173を更新した。

## 公開の根拠

- 運用URL: https://solar-site-precheck.pages.dev/
- 配布URL: https://eb931a58.solar-site-precheck.pages.dev/
- Cloudflare Production ID: `eb931a58-23fd-4337-8760-d866c068e9ed` / branch `main`
- ソースコミット: `dfe7bb70a784acff1527856bc971e6d0f857e150`
- 配布物を含むGitHubコミット: `48e1b06fc6666a7d2725b0645363c5690d9b6a99`
- 公開JS: `index-C0Scqynr.js` / Windows JS: `index-nqk826i9.js`
- Version 1.27.2 / Build 2026-09-24

後続の記録だけのコミットは、上記ソースと配布物のコミットとは異なる。GitHub pushだけではPagesは更新されない。認証済みWranglerで既存プロジェクトに直接公開した。

## 確認結果

- 自動テスト171件、Cloudflare/portableビルド、CSP、マニュアルPDF・OCR資産、Functions、ZIP内ハッシュ、配布メタデータの確認が通過。
- 公開HTML・主要JS・PWA manifestのハッシュが検証済みパッケージと一致。バージョン・API・配布ID・ソース・GitHubを含む公開確認12項目が15:16:23 JSTに通過。
- [GitHub CI 35963451498](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/35963451498)、job `107516759512` が成功。
- Windows新規フォルダーの56ファイルがmanifestのハッシュと一致。試験用5275で6項目、切替後の5173でも6項目が通過。公開・ローカルの個人PDF送信試験は実行していない。
- 5173は新しいv1.27.2の実行版に切替済み。旧実行版・開発ソース・ブラウザ資料は保持した。ローカルJSのHTTP取得SHA-256は `025bcf2ac957a9059b4dd461353fd4e60e8a58f6f96824c5b562955274cd7ea8` でmanifestと一致。
- 次のWindows起動には `SolarSitePrecheck-Local-v1.27.2/START_LOCAL_ONLY.cmd` を使う。既存のpreview 5273も維持した。
- 実画面で1558×950と390×844を確認。公開サイト再読込後も利用者の選択地点と取得済み断面を保ち、全幅配置とv1.27.2を確認した。詳細と未確認範囲は `V1_27_2_BROWSER_CHECK_JA.md` を参照。

## 配布物

| 対象 | ファイル | SHA-256 |
|---|---|---|
| Cloudflare | SolarSitePrecheck_v1.27.2_2026-09-24_cloudflare.zip | 68b9ae012aa66c3d948e24617030fd041df1ab946358adb1bc03a4c49eb050fc |
| Windows | SolarSitePrecheck_v1.27.2_release_light.zip | 50db4ad9ae4a882fb305ef81492eddebd52b6abfdf8f81dbbcafab6057bb5f5b |

## 今回の状態と引継ぎ

地点・座標・標高・コピーを地図直下の上段へまとめ、断面をその下の全幅に配置した。断面ボタンは余分な開閉なしで使える。発電量だけを上部ツールメニューの別画面へ移し、地平線・積雪・レポート・資料・Solar Proガイドはメインの折りたたみ構成を維持した。

利用者への会話は韓国語、提出文書・図表は日本語。個別案件のPDF・座標・検討書は公開GitHubや配布物に含めていない。今後のコード開発はMac OpenClaw中心とし、`MAC_OPENCLAW_START_KO.md` で引き継ぐ。Mac実機でのclone・設定・起動は未実施。

## 以前の配布

- v1.27.1: 2026-09-24、deployment `40c9c8a3-10e7-4e91-9e4b-b813387223fb`、source `655eec45e03a57d0560bae03335e5957d9933bbf`。
- v1.27: 2026-09-24、deployment `69ea5bef-3ac3-4897-9aa1-2c9eeaa66a35`、source `f6fb2e245a4955f7171f7b864f950fa8eaffa616`。
- v1.25: 利用者の2026-09-11配布報告、deployment `cb0731e4-2f06-4b67-ae7a-e3e20a0e7e6d`。
