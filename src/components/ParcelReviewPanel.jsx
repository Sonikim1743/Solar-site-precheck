import { useId } from 'react'
import '../parcel-review.css'

const MODES = [
  ['point', '計算地点', '地図を押して計算地点を変更します。既存の計算結果は再確認が必要になります。'],
  ['target', '対象の筆', '地番ファイルを読み込み、筆を押して対象に追加。計算地点は変わりません。'],
  ['reference', '参考の筆', '地番ファイルから周辺の筆を参考に追加。参考の筆は面積集計に含みません。'],
  ['boundary', '検討範囲', '角を順に指定。対象筆があれば、描いた範囲との共通部分を検討します。'],
  ['exclusion', '除外範囲', '設置を除外する範囲の角を地図で順に指定します。複数の範囲を追加できます。'],
]

function areaLabel(value, maximumFractionDigits = 1) {
  return Number.isFinite(value) ? new Intl.NumberFormat('ja-JP', { maximumFractionDigits }).format(value) : '—'
}

export default function ParcelReviewPanel({
  review,
  metrics,
  mode = 'point',
  onModeChange,
  onRemoveParcel,
  onChangeRole,
  onClearBoundary,
  onClearExclusions,
  onClear,
  onUseParcel,
  onFocusParcel,
  status,
}) {
  const headingId = useId()
  const modeHintId = useId()
  const parcels = review?.parcels || []
  const targetCount = parcels.filter((entry) => entry.role === 'target').length
  const referenceCount = parcels.filter((entry) => entry.role === 'reference').length
  const hasReview = parcels.length > 0 || !!review?.boundary || !!review?.exclusions?.length
  const statusMessage = typeof status === 'string' ? status : status?.message
  const isError = status?.status === 'error' || status?.type === 'error'
  const modeHint = MODES.find(([value]) => value === mode)?.[2]
  const areaMetrics = [
    ['対象筆の図形', metrics?.targetAreaM2, '参考の筆は含みません'],
    ['検討範囲', metrics?.reviewAreaM2, review?.boundary ? targetCount ? '対象筆と指定範囲の共通部分' : '対象筆なし・指定範囲を採用' : '範囲未指定時は対象筆の図形'],
    ['除外分', metrics?.excludedAreaM2, '検討範囲に重なる部分'],
    ['有効範囲', metrics?.usableAreaM2, '検討範囲から除外分を控除'],
  ]

  return <section className="parcel-review-panel" aria-labelledby={headingId}>
    <div className="parcel-review-panel__heading">
      <h3 id={headingId}>筆と範囲の選択</h3>
    </div>

    <div className="parcel-mode-selector" role="group" aria-label="地図の操作" aria-describedby={modeHintId}>
      {MODES.map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} className={mode === value ? 'is-active' : ''} onClick={() => onModeChange?.(value)} disabled={!onModeChange}>{label}</button>)}
    </div>
    <p className="parcel-mode-hint" id={modeHintId} aria-live="polite">{modeHint}</p>

    {hasReview && <><p className="parcel-review-summary"><span>検討面積 <strong>{areaLabel(metrics?.usableAreaM2, 0)}</strong> m²</span><span>· 対象{targetCount}筆 / 参考{referenceCount}筆</span></p>
    <details className="parcel-review-breakdown"><summary>面積の内訳</summary><dl className="parcel-review-metrics">
      {areaMetrics.map(([label, value, description]) => <div key={label} className={label === '有効範囲' ? 'is-total' : ''}><dt>{label}</dt><dd>{areaLabel(value)}<small> m²</small></dd><span>{description}</span></div>)}
    </dl></details></>}

    {!!parcels.length && <details className="parcel-review-selection"><summary>選んだ筆 <strong>{parcels.length}筆</strong></summary><ul className="parcel-review-list" aria-label="選んだ筆">
      {parcels.map((entry) => <li key={entry.id} className={`parcel-review-item parcel-review-item--${entry.role === 'reference' ? 'reference' : 'target'}`}>
        <div className="parcel-review-item__identity"><span className="parcel-role-label">{entry.role === 'reference' ? '参考' : '対象'}</span><strong>{entry.info?.number || '地番未記載'}</strong><p>{[entry.info?.municipality, entry.info?.area].filter(Boolean).join(' ') || '所在地未記載'}</p><small>{entry.source?.fileName ? `出典：${entry.source.fileName}` : '出典ファイル未記載'}</small></div>
        <div className="parcel-review-item__actions">
          <label><span className="parcel-sr-only">{entry.info?.number || 'この筆'}の役割</span><select value={entry.role === 'reference' ? 'reference' : 'target'} onChange={(event) => onChangeRole?.(entry.id, event.target.value)} disabled={!onChangeRole}><option value="target">対象</option><option value="reference">参考</option></select></label>
          <button type="button" onClick={() => onFocusParcel?.(entry.id)} disabled={!onFocusParcel || !entry.geometry} aria-label={`${entry.info?.number || 'この筆'}を地図で見る`}>地図で見る</button>
          <button type="button" onClick={() => onUseParcel?.(entry.id)} disabled={!onUseParcel || !entry.geometry} aria-label={`${entry.info?.number || 'この筆'}で計算地点を変更`}>この筆で計算</button>
          <button type="button" className="parcel-button--quiet" onClick={() => onRemoveParcel?.(entry.id)} disabled={!onRemoveParcel} aria-label={`${entry.info?.number || 'この筆'}を選択から外す`}>外す</button>
        </div>
      </li>)}
    </ul></details>}

    {hasReview && <details className="parcel-review-management"><summary>筆・範囲の管理</summary><div className="parcel-review-cleanup">
      <button type="button" onClick={onClearBoundary} disabled={!review?.boundary || !onClearBoundary}>検討範囲を解除</button>
      <button type="button" onClick={onClearExclusions} disabled={!review?.exclusions?.length || !onClearExclusions}>除外を解除{review?.exclusions?.length ? `（${review.exclusions.length}）` : ''}</button>
      <button type="button" onClick={onClear} disabled={!hasReview || !onClear}>筆・範囲をすべて解除</button>
    </div><div className="parcel-review-notes">
      <p>面積は読み込んだ図形・描いた範囲からの概算です。登記面積や確定した境界を示すものではありません。重複する範囲は二重に数えず、範囲外の除外部分は控除しません。</p>
      <p>対象筆があり「検討範囲」も描いた場合は、対象筆と描いた範囲の共通部分を使います。範囲未指定なら対象筆の図形、対象筆なしなら描いた範囲を使います。参考の筆は面積に含めません。</p>
      <p>対象・参考の追加だけでは計算地点と発電量は変わりません。「この筆で計算」は筆内の1点に計算地点を変更します。その点が設備の予定位置に合うか確認してください。1点の結果が筆全体を代表するとは限りません。</p>
      <p>面積から設備容量・発電量は自動確定しません。配置や除外条件を確認し、発電量画面で設備容量を入力してください。</p>
    </div></details>}
    {statusMessage && <p className={`parcel-review-message${isError ? ' parcel-review-message--error' : ''}`} role={isError ? 'alert' : 'status'}>{statusMessage}</p>}
  </section>
}
