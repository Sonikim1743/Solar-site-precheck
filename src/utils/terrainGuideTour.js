export const TERRAIN_GUIDE_STEPS = Object.freeze([
  {
    title: '地図で地番を選ぶ',
    anchor: ['parcel-map', 'parcel-select'],
    fallbackAnchor: 'site-map',
    message: '地図を拡大して、地番の境界と番号が見えるようにします。見えない間は、まだ拡大が足りません。「地番選択」をONにして、地番の内側をクリックし、黄色い選択境界を確認します。地番は複数選べます。選び終わったら「次へ」を押してください。',
    satisfiedMessage: '✓ 選べました。追加で選ぶこともできます。選び終わったら「次へ」を押してください。',
  },
  {
    title: '選択した範囲を確定する',
    anchor: 'confirm-parcels',
    fallbackAnchor: ['parcel-map', 'parcel-select', 'site-map'],
    message: '選択を確認したら「選択完了 → 3D」を押します。取得を中止した場合は「範囲の地形」で再取得できます。',
  },
  {
    title: '範囲の地形を取得する',
    anchor: ['terrain-progress', 'terrain-acquire', 'terrain-results'],
    fallbackAnchor: 'terrain-section',
    message: '「範囲の地形」が開き、標高の取得と地形分析が自動で進みます。取得が止まっている場合は「地形を確認」を押します。',
  },
  {
    title: '3Dでモジュールを確認する',
    anchor: 'layout-reveal',
    fallbackAnchor: ['layout-calculate', 'terrain-3d-view', 'terrain-section'],
    message: '未計算なら「参考配置を計算」を押します。計算後、「モジュール配置を3Dで表示」で地形にモジュールを重ねます。0枚の場合はそのまま次へ進み、次の段階で勾配条件の変更を試せます。',
  },
  {
    title: '地形の勾配条件を変更する',
    anchor: 'layout-slope',
    fallbackAnchor: 'terrain-section',
    message: '配置に使う地形勾配は、10°未満・15°未満・20°未満から選べます。勾配条件を切り替えて参考配置を比べます。',
  },
  {
    title: '結果を確認して出力する',
    anchor: ['terrain-output', 'terrain-results'],
    fallbackAnchor: ['terrain-section', 'report-nav'],
    message: '参考配置のモジュール枚数とDC容量を確認できます。「レポート」を開くと、地形や配置図の出力に進めます。',
  },
])

export function terrainGuideConditions({ parcelSelected, pendingSelection, panelOpen, analyzing, hasTerrain, modulesVisible, slopeChanged, reportOpen, layoutEmpty }) {
  return [
    Boolean(parcelSelected),
    Boolean(parcelSelected && !pendingSelection && panelOpen && (analyzing || hasTerrain)),
    Boolean(!pendingSelection && hasTerrain),
    Boolean(!pendingSelection && hasTerrain && (modulesVisible || layoutEmpty)),
    Boolean(!pendingSelection && hasTerrain && slopeChanged),
    Boolean(reportOpen),
  ]
}

export function terrainGuideStartingStep(conditions, from = 0) {
  const last = TERRAIN_GUIDE_STEPS.length - 1
  let step = from
  while (step < last && conditions[step]) step += 1
  return Math.min(step, last)
}
