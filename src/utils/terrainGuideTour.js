export const TERRAIN_GUIDE_STEPS = Object.freeze([
  {
    title: '地図で地番を選ぶ',
    anchor: ['parcel-map', 'parcel-select'],
    fallbackAnchor: 'site-map',
    message: '地図をズーム17以上に拡大し、「地番選択」をONにします。地番の内側をクリックして、黄色い選択境界を確認します。',
  },
  {
    title: '選択した範囲を確定する',
    anchor: 'confirm-parcels',
    fallbackAnchor: ['parcel-map', 'parcel-select', 'site-map'],
    message: '選択を確認したら「選択完了 → 3D」を押します。選んだ範囲で地形を取得します。',
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
    message: '未計算なら「参考配置を計算」を押します。計算後、「モジュール配置を3Dで表示」で地形にモジュールを重ねます。',
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

const TERRAIN_GUIDE_ACTIONS = [
  'parcel-selected', 'parcel-confirmed', 'terrain-ready', 'modules-shown', 'slope-changed', 'results-opened',
]

export function terrainGuideStartingStep({ draftSelected, confirmedSelection, analyzing, hasTerrain, hasLayout, modulesVisible }) {
  if (draftSelected) return 1
  if (hasTerrain) return hasLayout && modulesVisible ? 4 : 3
  if (confirmedSelection || analyzing) return 2
  return 0
}

export function advanceTerrainGuide(step, action) {
  return TERRAIN_GUIDE_ACTIONS[step] === action && Number.isInteger(step) && step >= 0 ? step + 1 : step
}
