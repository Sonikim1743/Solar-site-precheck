import { useEffect, useRef } from 'react'

export default function ReviewRecordsPanel({ position, onSave, onRead, onApply, onDismiss, pending, status, recordInfo, onUndo, canUndo, notesCount = 0 }) {
  const menu = useRef(null)
  function closeMenu() { if (menu.current) menu.current.open = false }
  useEffect(() => {
    if (pending) menu.current?.closest('.review-toolbar')?.querySelectorAll('.review-toolbar__menu[open]').forEach(element => { element.open = false })
  }, [pending])
  return <section className="review-records review-records--toolbar no-print" aria-label="検討記録の保存と再開">
    <details ref={menu} className="review-toolbar__menu review-toolbar__menu--records" name="candidate-review-tools">
      <summary>検討資料{recordInfo && <small>{recordInfo.kind === 'example' ? '練習例' : '保存記録'}</small>}</summary>
      <div className="review-toolbar__popover">
        <div className="review-records__actions"><button type="button" onClick={() => { onSave(); closeMenu() }} disabled={!position}>検討記録を保存</button><label className="review-records__file">記録ファイルを選ぶ<input type="file" accept=".json,application/json" onChange={event => { onRead(event); closeMenu() }} aria-label="検討記録ファイルを選ぶ" /></label></div>
        <p className="review-records__notice">候補地の条件・結果・メモ・選択した筆と検討範囲を保存して再開できます。PDF編集状態、結線アシストの機器設定、系統の全設備地図は含みません。{notesCount > 0 && ` 設備メモ ${notesCount}件を含みます。`}</p>
        {recordInfo && <p className="review-records__notice">{recordInfo.kind === 'example' ? '仮条件の操作例です。計算結果や接続可否を示す実案件ではありません。' : `保存日時 ${new Date(recordInfo.savedAt).toLocaleString('ja-JP')} / 元のアプリ v${recordInfo.appVersion}。ファイル内の記録を復元しました。出典の再取得・原本との照合は行っていません。`}</p>}
      </div>
    </details>
    {(status?.message || canUndo) && <div className="review-toolbar__feedback">
      {status?.message && <p role={status.error ? 'alert' : 'status'} className={`review-records__notice${status.error ? ' review-toolbar__error' : ''}`}>{status.message}</p>}
      {canUndo && <button type="button" onClick={onUndo}>開く前の記録に戻す</button>}
    </div>}
    {pending && <div className="review-records__preview" role="region" aria-label="開く記録の確認"><h2>この記録を開きますか</h2><strong>{pending.candidate.name || pending.candidate.placeLabel || '候補地'}</strong><p>{pending.candidate.position.lat}, {pending.candidate.position.lon} / {new Date(pending.savedAt).toLocaleString('ja-JP')}</p><p>参考発電量 {pending.results.generation ? `${Math.round(pending.results.generation.annualKwh).toLocaleString('ja-JP')} kWh/年` : '未計算'} ／ 地平線 {pending.results.terrain ? '記録あり' : '未分析'} ／ 積雪 {pending.results.snowStation ? '記録あり' : '未取得'} ／ 設備メモ {pending.gridNotes.length}件</p><p>現在の候補地・条件・結果を置き換えます。開いた直後は「開く前の記録に戻す」で戻せます。残しておく場合は、先に現在の検討記録を保存してください。</p><div className="review-records__actions"><button type="button" className="primary-button" onClick={onApply}>この記録を開く</button><button type="button" onClick={onDismiss}>取り消す</button></div></div>}
  </section>
}
