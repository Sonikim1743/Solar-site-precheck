# Solar Site Precheck

太陽光発電候補地をSolar Proへ入力する前に、候補地情報・NEDO積雪データ・地平線影響・図面変換・相続登記資料の整理を行うための社内向け入力支援ツールです。

Solar Pro本体を置き換えるものではありません。発電量の最終計算はSolar ProやPVsystなどの専用ソフトで行い、本ツールはその前段階の調査・入力準備・チーム共有を短時間で行うことを目的にしています。

## 現在の位置づけ

- 対象：日本国内の太陽光発電候補地の初期検討
- 想定利用者：Solar Proで発電量シミュレーションを行う担当者、候補地調査担当者
- 運用段階：チーム内検証・業務改善ツール
- 現行バージョン：v1.2 系列
- 最終更新：2026-07-07

## 主な機能

### 1. 太陽光候補地チェック

- 国土地理院タイルを使った地図表示
- 住所・地名検索と緯度経度検索の統合入力
- 地図クリックまたはGPS現在地による候補地選択
- 緯度経度をSolar Proで入力しやすい度・分形式で表示
- 国土地理院DEMによる補助標高取得
- 候補地の3次メッシュ番号を計算
- NEDO MONSOLA-11 Web値・PDF値の取得補助
- 積雪深10cm以上出現率の月別表示
- `0.95 − 積雪出現率` による月別発電量係数の算出
- 3次メッシュ境界が近い場合の隣接メッシュ比較
- 250m〜5km範囲のDEMサンプリングによる地平線影響の概算
- 通常8方位分析と、詳細10度間隔・36方位分析
- 冬至10〜14時の太陽高度と地平線角の比較
- Solar Proで読み込めるSunEye形式 `ObstructionElevations.csv` の出力
- 候補地を中心にした周辺100mの東西・南北断面表示
- 地図上への100m確認範囲、断面線、平均勾配オーバーレイ表示
- 地平線グラフ、断面図、積雪表をまとめた1枚の簡易分析レポート表示

### 2. Solar Pro入力補助・教育メモ

- 設置場所、地平線、積雪補正の入力画面スクリーンショット表示
- Solar Pro内でどのメニューを開くかの説明
- Solar Proへ入力・読込する値を確認しやすい形で整理
- 入力マニュアル・作業メモを追加していける折りたたみ式セクション

### 3. 地番・図面補助

- 法務省の登記所備付地図XML / ZIP / GeoJSONの読込
- 地図上への筆界表示と候補地付近の確認
- PDF図面をJPGへ変換
- 複数ページPDFのページプレビューと必要ページのみ保存
- 対応ブラウザでは保存先・ファイル名を指定して保存

### 4. 相続登記資料チェック

- 法務局・相続関連PDFから土地の単独相続候補を抽出
- `第○号 / ○月○日受付 / 単独 / 所有権移転・相続 / 土地 / 所在 / 外○件` のような受付ブロックを解析
- 受付番号、受付日、土地、住所、外記載数を一覧表示
- 外記載が多い順、住所順、受付順の並び替え
- 行単位コピーとExcel用CSV出力
- 受付番号の最初・最後・読取件数・抜け番候補を確認
- モバイルSafariでPDF.jsが失敗する場合は、ローカルサーバー側解析へフォールバック

### 5. チーム共有・更新

- 社内LAN共有用のローカルサーバー起動
- ngrok等を使った短期デモ共有
- Node.js同梱のポータブルZIP作成
- 25MB制限に対応した軽量更新ZIP作成
- GitHub上の `release/latest` から最新ZIPを取得する更新スクリプト
- private repository向けの `github-token.txt` 読込

## すぐ使う方法

### 開発・検証用に起動

Node.js 20.19以上、または22.12以上を用意してください。

```bash
npm install
npm run dev
```

通常は `http://127.0.0.1:5173/` で開きます。

`npm run dev` は本番ビルドを作成してから表示します。コード変更を即時反映したい場合は次を使います。

```bash
npm run develop
```

### テスト

```bash
npm run test
```

3次メッシュ、座標パーサー、NEDO積雪値検証、発電量係数、CSV出力補助などの主要な純粋関数を確認します。

### 社内LANで共有

```bash
npm run share
```

または `start-team-server.cmd` を実行します。

詳細は [TEAM_SHARING.md](TEAM_SHARING.md) を参照してください。

## 別PCへ配布する方法

### 初回配布用：Node.js同梱ポータブルZIP

作業PCで次を実行します。

```text
MAKE_PORTABLE_PACKAGE.cmd
```

作成されるファイル：

```text
outputs/SolarSitePrecheck_v1.2_portable.zip
```

ZIPを展開し、`RUN_PORTABLE.cmd` を実行すると、Node.jsを別途インストールしていないPCでも起動できます。

### 更新用：軽量ZIP

既にポータブル版を導入済みのPCへ更新だけ配布する場合は次を使います。

```text
MAKE_RELEASE_PACKAGE.cmd
```

作成・更新される主なファイル：

```text
release/latest/latest-version.json
release/latest/SolarSitePrecheck_v1.2_release_light.zip
```

GitHubへpushした後、デスクトップ側では次を実行します。

```text
UPDATE_APP_FROM_RELEASE.cmd
```

private repositoryの場合は、アプリフォルダー直下に `github-token.txt` を置くと、GitHubのrawファイルを認証付きで取得できます。詳しくは [RELEASE_UPDATE_GUIDE.md](RELEASE_UPDATE_GUIDE.md) を参照してください。

## ファイル構成

```text
.
├─ src/
│  ├─ components/          # 地図・レポートなどのUI部品
│  ├─ services/            # GSI、NEDO、PDF、図面変換などの入出力・業務ロジック
│  ├─ utils/               # 座標、3次メッシュ、CSV、積雪係数などの純粋関数
│  ├─ App.jsx              # 画面全体の状態管理
│  └─ styles.css           # 画面デザイン
├─ tests/                  # node:testによる回帰テスト
├─ work/
│  ├─ serve-dist.mjs       # ポータブル配信用ローカルサーバー
│  └─ inheritance-server.mjs
├─ release/latest/         # 軽量更新ZIPと最新版情報
├─ public/data/            # NEDO MONSOLA-11補助データ
├─ MAKE_PORTABLE_PACKAGE.cmd
├─ MAKE_RELEASE_PACKAGE.cmd
├─ UPDATE_APP_FROM_RELEASE.cmd
├─ CHANGELOG.md
├─ RELEASE_UPDATE_GUIDE.md
└─ README.md
```

## 使用データ・出典

- 背景地図・航空写真：国土地理院タイル
- 住所検索：国土地理院 住所検索API
- 標高：国土地理院DEM、およびNEDO帳票内標高
- 積雪・日射関連：NEDO 年間月別日射量データベース MONSOLA-11
- 地番・筆界：法務省 登記所備付地図データ
- 参考確認リンク：地理院地図、ハザードマップポータル、農地ナビ、文化財総覧WebGIS、自治体GIS等

公開・社外展開・商用運用へ進める場合は、各データの利用規約、出典表記、再配布可否を必ず確認してください。

## 精度と制限

- 地平線分析はDEM点サンプリングによる概算です。建物、個別樹木、造成後地形、現地障害物は反映されません。
- 想定樹高は保守的な入力補助であり、実測値ではありません。
- NEDO積雪値は3次メッシュ単位です。境界付近では隣接メッシュ確認が必要です。
- Solar Proへの直接入力は行いません。現時点では画面確認、手入力支援、Solar Pro地平線CSV出力が基本です。
- 相続登記PDFチェックは、テキスト抽出可能なPDFを対象にした業務補助です。最終判断は原本PDFと登記情報提供サービスの画面で確認してください。
- 内部用Solar Proテンプレート `.spt` は配布物に含めません。必要な場合は利用者がローカルファイルとして選択します。

## 運用上の注意

- ngrok等でインターネット公開する場合は、短期デモ用途に限定し、可能ならBasic認証やIP制限を使ってください。
- 入力内容や候補地メモはブラウザのlocalStorageに残る場合があります。共有PCでの利用には注意してください。
- `github-token.txt` はGitHubへコミットしないでください。`.gitignore` 対象です。
- ポータブル版ではService Workerを無効化し、旧キャッシュによる表示ずれを避けています。

## 関連ドキュメント

- [CHANGELOG.md](CHANGELOG.md) — 更新履歴
- [RELEASE_UPDATE_GUIDE.md](RELEASE_UPDATE_GUIDE.md) — 軽量ZIP更新運用
- [TEAM_SHARING.md](TEAM_SHARING.md) — 社内LAN共有手順
- [CADASTRE_GUIDE.md](CADASTRE_GUIDE.md) — 登記所備付地図データの取得・読込手順
- [ACCURACY_VALIDATION.md](ACCURACY_VALIDATION.md) — NEDO PDF読取・検証メモ
- [DEPLOYMENT_AND_KPI_PLAN.md](DEPLOYMENT_AND_KPI_PLAN.md) — 業務改善・KPI説明用メモ

## 今後の改善候補

- 候補地データのJSON保存・読込
- 地形断面と地平線計算根拠のさらに詳しい可視化
- 法務省XMLのproj4変換セルフテスト表示
- 相続登記PDFのOCR対応
- 案件一覧、権限管理、チーム共有DB
- Go / No-Goの初期判定メモ

本ツールは、現場担当者がSolar Pro入力前に迷いやすい情報を一箇所に集めるための実務補助ツールです。完璧な自動判定よりも、根拠を見ながら短時間で確認できることを重視しています。
