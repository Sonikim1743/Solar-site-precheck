import { useId, useState } from 'react'
import { FOLLOW_UP_STATUSES, followUpContact, followUpPointKey, createFollowUpRecord, parseFollowUpRecord } from '../utils/regulatoryFollowUp.js'

export function PrecheckOverview({ groups }) {
  const regions = groups.filter(group => ['culture', 'agriculture-region', 'agricultural-use'].includes(group.id))
  const hazards = groups.filter(group => ['soil', 'flood'].includes(group.id))
  const count = rows => rows.reduce((total, row) => total + row.count, 0)
  const summary = rows => count(rows) ? `重なり${count(rows)}件・未確認あり` : !rows.length || rows.some(row => row.kind !== 'none') ? '未確認あり' : '収録資料で未検出'
  return <div className="point-zone-precheck" aria-label="発電量検討前の確認">
    <h4>発電量検討の前に</h4>
    <dl><div><dt>用途地域・用途制限</dt><dd>未確認</dd></div><div><dt>計画設備の設置可否</dt><dd>未確認</dd></div><div><dt>農地・農振区分</dt><dd>未確認</dd></div><div><dt>参考区域</dt><dd>{summary(regions)}</dd></div><div><dt>洪水・土砂</dt><dd>{summary(hazards)}</dd></div></dl>
    <p>用途地域の資料は未取得、計画用途の適合性は未判定です。未確認のまま候補地の推奨・設置可能の判断はできません。</p>
    <p>選択地点のみの確認です。該当条件と未確認事項を整理してから、発電量・配置の検討へ進めてください。</p>
    <details><summary>未確認の条件</summary><p>筆ごとの農地・青地・白地、保安林・国有林、盛土・砂防等、都市計画、津波・高潮はこの照合では未確認です。表示のない項目も規制なしとは限りません。</p></details>
  </div>
}

export function RegulatoryFollowUpTopic({ topic, result, notes = {}, onNotesChange }) {
  const id = useId()
  const contact = followUpContact(topic, result)
  const note = notes[topic] || { status: 'unreviewed', checkedOn: '', department: '', answer: '' }
  const disabled = !followUpPointKey(result?.point) || !onNotesChange
  const update = patch => onNotesChange?.({ ...notes, [topic]: { ...note, ...patch } })
  return <details className="point-zone-follow-up"><summary>次の確認・窓口・回答メモ{note.status !== 'unreviewed' && ` · ${FOLLOW_UP_STATUSES[note.status]}`}</summary>
    <p className="point-zone-question">確認すること：{contact.question}</p>
    <p><strong>{contact.office}</strong>{contact.phone && <> / <a href={`tel:${contact.phone}`}>{contact.phone}</a></>}</p>
    <p><a href={contact.url} target="_blank" rel="noopener noreferrer">{contact.linkLabel} ↗</a>{contact.verifiedOn && <small> 窓口情報確認 {contact.verifiedOn}</small>}</p>
    <small>{contact.note}</small>
    <fieldset disabled={disabled}><legend>この地点の回答メモ</legend>
      <label htmlFor={`${id}-status`}>状態<select id={`${id}-status`} value={note.status} onChange={event => update({status:event.target.value})}>{Object.entries(FOLLOW_UP_STATUSES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label htmlFor={`${id}-date`}>確認日<input id={`${id}-date`} type="date" value={note.checkedOn} onInput={event=>update({checkedOn:event.currentTarget.value})} onChange={event=>update({checkedOn:event.target.value})}/></label>
      <label htmlFor={`${id}-department`}>確認した窓口<input id={`${id}-department`} maxLength={200} value={note.department} onChange={event=>update({department:event.target.value})}/></label>
      <label htmlFor={`${id}-answer`}>回答・残る条件<textarea id={`${id}-answer`} rows={3} maxLength={4000} value={note.answer} onChange={event=>update({answer:event.target.value})}/></label>
    </fieldset>
    <small>利用者の記録です。「回答記録済み」は許可取得や条件解消の自動判定ではありません。</small>
  </details>
}

export function RegulatoryFollowUpFiles({ result, notes = {}, onNotesChange }) {
  const [notice, setNotice] = useState(null)
  const [pending, setPending] = useState(null)
  const pointKey = followUpPointKey(result?.point)
  const disabled = !pointKey || !onNotesChange
  function save() {
    try {
      const record = createFollowUpRecord(result.point, notes, result.checkedAt)
      const url = URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}))
      const link = document.createElement('a'); link.href=url; link.download='regulatory-follow-up.json'; link.click()
      setTimeout(()=>URL.revokeObjectURL(url),1000)
      setNotice({text:'確認メモのダウンロードを開始しました。保存先を確認してください。',key:pointKey})
    } catch(error) { setNotice({text:error.message,error:true,key:pointKey}) }
  }
  async function read(event) {
    const input=event.currentTarget, file=input.files?.[0], targetKey=pointKey
    if(!file)return
    try {
      if(file.size>64*1024)throw Error('確認メモは64KB以下のJSONを指定してください。')
      const parsed=parseFollowUpRecord(await file.text(),result.point)
      setPending({notes:parsed,key:targetKey});setNotice(null)
    } catch(error) {setPending(null);setNotice({text:error.message,error:true,key:targetKey})}
    finally {input.value=''}
  }
  return <div className="point-zone-follow-up-files">
    <div className="point-zone-follow-up-actions"><button type="button" className="secondary-button" disabled={disabled||!Object.keys(notes).length} onClick={save}>確認メモを保存</button><label className="point-zone-file-button">確認メモを開く<input type="file" accept=".json,application/json" disabled={disabled} onChange={read} aria-label="この地点の確認メモを開く"/></label></div>
    <small>メモは画面内で保持します。再読み込み前に保存してください。通常の検討記録とは別ファイルで、外部へ送信しません。</small>
    {pending?.key===pointKey&&<div className="point-zone-note-preview"><p>この地点の確認メモを置き換えます。地点・作図・計算結果は変更しません。</p><button type="button" onClick={()=>{onNotesChange(pending.notes);setPending(null);setNotice({text:'この地点の確認メモを反映しました。現行条件との再照合は行っていません。',key:pointKey})}}>この地点のメモに反映</button><button type="button" onClick={()=>setPending(null)}>やめる</button></div>}
    {notice?.key===pointKey&&<p role={notice.error?'alert':'status'}>{notice.text}</p>}
  </div>
}
