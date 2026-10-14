const GUIDANCE = Object.freeze({
  worker: Object.freeze({
    message: '計算処理を開始できませんでした。',
    hint: '更新前の画面や計算機能の読み込み失敗が考えられます。まず画面を更新して再試行してください。',
    action: 'refresh',
  }),
  data: Object.freeze({
    message: '取得済みの地形を使用できませんでした。',
    hint: '地形の「再取得」後、もう一度計算してください。',
    action: 'reacquire',
  }),
  calculation: Object.freeze({
    message: '参考配置を計算できませんでした。',
    hint: '範囲の形・地形の取得状態を確認し、配置条件の「架台左右の空き」「前後の空き」「端からの空き」を見直してください。',
    action: 'conditions',
  }),
  limit: Object.freeze({
    message: '計算の時間・処理量の上限に達しました。',
    hint: '検討範囲を分け、地形を取得してから再試行してください。',
    action: 'boundary',
  }),
  unknown: Object.freeze({
    message: '参考配置を計算できませんでした。',
    hint: '画面を更新して再試行してください。続く場合は、地形の再取得と配置条件を確認してください。',
    action: 'refresh',
  }),
})

// Caller-classified failure only: never infer a cause from exception text or
// expose stack traces, request URLs or other untrusted details in the UI.
export function terrainLayoutErrorGuidance(kind, message = '') {
  void message
  const category = kind === 'startup' ? 'worker' : kind === 'timeout' || kind === 'resource' ? 'limit' : kind
  const guidance = typeof category === 'string' && Object.hasOwn(GUIDANCE, category) ? GUIDANCE[category] : GUIDANCE.unknown
  // A new value lets UI state change without corrupting later error guidance.
  return { ...guidance }
}
export function terrainLayoutResultMatchesOptions(result, requested, allowBearingSearch = false) {
  const keys = ['rows','minColumns','maxColumns','slopeLimitDeg','moduleWidthM','moduleHeightM','modulePowerW','moduleGapM','tiltDeg','rackGapM','rowGapM','setbackM']
  if(!result?.options || !requested || !keys.every(key => Number.isFinite(requested[key]) && result.options[key] === requested[key]))return false
  const bearing=result.options.azimuthDeg,expected=requested.azimuthDeg
  if(!Number.isFinite(bearing)||!Number.isFinite(expected))return false
  if(!allowBearingSearch)return bearing===expected
  const search=result.stats?.autoSearch
  return search?.mode==='optimized' && search.baseAzimuthDeg===expected && search.selectedAzimuthDeg===bearing && Math.abs(((bearing-expected+540)%360)-180)<=30
}
