import { terrainLayoutReportConditions, TERRAIN_LAYOUT_LIMIT, TERRAIN_LAYOUT_SAVE } from './terrainLayoutReport.js'

export function terrainReportNotes(report, layouts) {
  const { source, grid } = report.terrainArea
  const sources = (source.layers || []).map(layer => `${layer.label} / 原資料${layer.nativeResolutionMeters}m級`).join('、')
  const notes = [
    { id: '1', title: '範囲・標高資料・地形の計算', body: `対象筆と指定範囲の共通部分から除外分を引いた図形を、平面・3D・集計で共通使用。参考の筆は集計しません。黄色の二重線は地形の検討範囲であり、測量で確認した筆界ではありません。標高資料：国土地理院 標高タイル${source.mixed ? '（資料混在）' : ''}。${sources}。出典 https://maps.gsi.go.jp/development/ichiran.html 。表示・集計格子 ${grid.step}m / 局所勾配は東西・南北10m幅の中央差分 / 等高線2m、太線10m。割合は勾配を計算できた格子点内の分布。推定面積は除外後の図形面積と格子点の比率で換算し、未計算分を配分しません。登記面積ではありません。補間・表示間隔は測量精度ではなく、欠測・除外を埋めません。標高資料の境目には勾配差が出る可能性があります。色は施工可否の判定基準ではありません。` },
    { id: '2', title: '3D表示・詳細検討への確認', body: `3Dは同じ実DEMと有効範囲を使い、高さ強調なし（1:1）、${layouts.current ? '地形と参考配置を同じ固定視点35°で並べます' : '固定視点35°・145°で表示します'}。地表・範囲線は同じ標高データ。側面・底面は高さを見やすくする表示用で、地下構造・地層・土量を示しません。樹木・建物・擁壁・造成後の形状は含みません。境界と資料記載面積の照合、接道・入口の段差・搬入経路・局所的な法面や擁壁、地盤・排水・造成後の現況、勾配に合わせた配置・基礎・必要な造成を確認してください。造成量、設置可能容量、施工可否は未判定です。現地測量・配置検討・詳細設計の前に使う参考図です。` },
  ]
  if (layouts.current || layouts.comparison) {
    const warnings = [...new Set([layouts.current, ...(layouts.comparison?.layouts || [])].filter(Boolean).flatMap(layout => layout.warnings || []).map(warning => typeof warning === 'string' ? warning : warning.message).filter(Boolean))]
    notes.push({ id: '3', title: '参考配置・モジュール・容量', body: `${layouts.current ? `現在の適用案：${terrainLayoutReportConditions(layouts.current)} ` : ''}架台の黒い小矩形は使用モジュール、破線外形は個別除外（数量に含みません）。モジュール外形・出力はJKM720N-66HL5-BDVの参考仕様です。地形のセル4点平均の局所勾配が指定値未満で、架台全体と空きが有効範囲に収まる候補だけを数えます。欠測・除外は対象外。地形勾配のカットオフとパネル傾斜角は別です。「境界からの離隔距離」は対象勾配の端も含む配置有効範囲からの空きで、測量境界やパネルとフェンスの設計離隔ではありません。「モジュール高さ」は地表から最も低いモジュール下端までの仮の最低高さ設定値で、柱全長や上端高さではありません。AC参考帯はDC÷1.5を既存の標準刻みで切り下げ・切り上げした範囲を示し、不確実性の幅ではありません。${TERRAIN_LAYOUT_LIMIT} ${layouts.fence?.rails?.length || layouts.comparisonFences?.some(fence=>fence?.rails?.length) ? '仮フェンスは使用架台を囲む凸包に端の空き分を加え、有効範囲と交差した高さ1.2mの参考表示です。離れた架台間も囲みます。欠測・除外はつなぎません。一点鎖線で表示し、実測境界・施工線ではありません。' : ''} ${warnings.join(' ')}` })
  }
  if (layouts.comparison) notes.push({ id: '4', title: '15° / 20°の同条件比較', body: `比較案の共通条件：${terrainLayoutReportConditions(layouts.comparison.layouts[0])} 15°・20°は地形の局所勾配の厳密なカットオフのみを変更する比較です。範囲・DEM・パネル傾斜・方位・開始位置・間隔・モジュール条件・架台上限・候補上限・各案5秒の予算は同一。方位探索なし、個別除外なしの自動案です。比較成功だけで現在の手動案を置換しません。案選択・再計算成功時は個別除外を初期化します。施工可否を判定する値ではなく、計算上限に達した場合は途中結果です。` })
  const memo = report.fieldMemo?.replace(/\s+/g, ' ').slice(0,180)
  notes.push({ id: '5', title: '出力・保存と現地メモ', body: `画像形式PDFのため文字検索・選択・CAD編集はできません。${TERRAIN_LAYOUT_SAVE}${report.simpleReview ? 'シンプル一括結果（代表点・断面・地平線・NEDO・配置）はこのPDFに記録しますが、既存のJSON検討記録には保存しません。再開には再解析が必要です。' : ''}${memo ? ` 現地メモ（抜粋）：${memo}${report.fieldMemo.replace(/\s+/g,' ').length > 180 ? '…（180文字まで。全文はアプリの現地確認メモを参照）' : ''}` : ''}` })
  return notes
}
