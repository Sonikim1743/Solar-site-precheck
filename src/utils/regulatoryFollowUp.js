import { isInspectionPoint } from './regulatoryPoint.js'

export const FOLLOW_UP_TOPICS = Object.freeze({
  zoning: { label: '用途地域・設置可否', question: '正式な用途地域・地区計画等と、計画設備の用途分類（建築物・工作物等）は何か。面積制限の対象と、設置の可否・必要な手続を確認したい。', office: '自治体の都市計画・建築指導担当（管轄・担当未確認）', url: 'https://www.mlit.go.jp/jutakukentiku/jutakukentiku_house_fr_000039.html', linkLabel: '計画設備の法令上の扱い・公式案内' },
  farmland: { label: '農地・農振区分', question: '農地に当たるか、農用地区域に含まれるか。計画用途で必要な事前相談と手順は何か。', office: '市町村の農業委員会・農振担当（担当未確認）', url: 'https://map.maff.go.jp/', linkLabel: 'eMAFF農地ナビで確認' },
  'agriculture-region': { label: '農業地域', question: '現在の農用地区域・農地の区分は何か。計画用途の相談先と確認手順は何か。', office: '市町村の農振担当（担当未確認）', url: 'https://map.maff.go.jp/', linkLabel: '農地の公表情報を確認' },
  'agricultural-use': { label: '農用地区域（古い資料）', question: '原資料以降に指定の変更があるか。現在の農用地区域と計画の相談手順を確認したい。', office: '市町村の農振担当（担当未確認）', url: 'https://map.maff.go.jp/', linkLabel: '農地の公表情報を確認' },
  culture: { label: '文化財', question: '現在の指定範囲と敷地の重なりはどこか。造成・掘削前の相談や届出は必要か。', office: '市町村の文化財担当（担当未確認）', url: 'https://heritagemap.nabunken.go.jp/', linkLabel: '文化財の参考地図を確認' },
  soil: { label: '土砂', question: '現行の指定と敷地の重なりを確認したい。計画用途の制限・対策と担当窓口はどこか。', office: '県の土砂・砂防担当（担当未確認）', url: 'https://disaportal.gsi.go.jp/', linkLabel: '公式ハザード情報を確認' },
  flood: { label: '洪水', question: '対象河川・想定条件と敷地の浸水想定を確認したい。計画用途で必要な対策と相談先はどこか。', office: '自治体の防災・河川担当（担当未確認）', url: 'https://disaportal.gsi.go.jp/', linkLabel: '公式ハザード情報を確認' },
})

export const FOLLOW_UP_STATUSES = Object.freeze({ unreviewed: '未相談', waiting: '回答待ち', recorded: '回答記録済み', hold: '保留', excluded: '見送り' })

// These are publicly listed institutional contacts, verified on the linked pages.
// They are offered only for an unambiguous municipality in the selected point's N03 result.
export function followUpContact(topic, result) {
  const generic = FOLLOW_UP_TOPICS[topic]
  if (!generic) throw Error('確認項目が不正です。')
  const region = result?.hazards?.region
  const known = result?.hazards?.mode === 'stored' && region?.state === 'ready' && region.municipalityState === 'ready' && region.code === '33' && region.municipality === '33210'
  if (!known) return { ...generic, verified: false, note: '担当窓口は未確認です。公式サイトで管轄と担当を確認してください。' }
  const base = { ...generic, municipality: '新見市', verified: true, verifiedOn: '2026-11-04', note: '選択地点のN03行政区域（2025年）に対応する参考窓口です。管轄・担当の現況は相談時に確認してください。' }
  if (topic === 'farmland') return { ...base, office: '新見市 農業委員会事務局', phone: '0867-72-6106', url: 'https://www.city.niimi.okayama.jp/kurashi/kurashi_detail/index/1518', linkLabel: '農地の相談窓口・公式案内' }
  if (topic === 'agriculture-region' || topic === 'agricultural-use') return { ...base, office: '新見市 農業畜産振興課 農業畜産係', phone: '0867-72-6133', url: 'https://www.city.niimi.okayama.jp/kurashi/kurashi_detail/index/164', linkLabel: '農振の相談窓口・公式案内' }
  if (topic === 'soil' || topic === 'flood') return { ...base, office: '新見市 総務課 危機管理室', phone: '0867-72-6205', url: 'https://www.city.niimi.okayama.jp/kurashi/kurashi_detail/index/101', linkLabel: '防災地図の問い合わせ先', note: '防災地図の確認窓口です。開発の許認可担当ではありません。計画用途の相談先を確認してください。' }
  return { ...generic, verified: false, note: 'この項目の担当窓口は未確認です。市町村の公式サイトで確認してください。' }
}

export const followUpPointKey = point => isInspectionPoint(point) ? `${point.lat},${point.lon}` : ''
const FORMAT = 'solar-site-precheck-regulatory-follow-up'
const MAX_BYTES = 64 * 1024
const text = (value, max) => {
  if (typeof value !== 'string' || value.length > max) throw Error('確認メモの文字数・形式が不正です。')
  return value
}
function checkedDate(value) {
  text(value, 10)
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) throw Error('確認日が不正です。')
  return value
}
export function normalizeFollowUpNotes(notes) {
  if (!notes || typeof notes !== 'object' || Array.isArray(notes) || Object.keys(notes).length > Object.keys(FOLLOW_UP_TOPICS).length) throw Error('確認メモの形式が不正です。')
  return Object.fromEntries(Object.entries(notes).map(([topic, note]) => {
    if (!Object.hasOwn(FOLLOW_UP_TOPICS, topic) || !note || typeof note !== 'object' || !Object.hasOwn(FOLLOW_UP_STATUSES, note.status)) throw Error('確認項目・状態が不正です。')
    const value = { status: note.status, checkedOn: checkedDate(note.checkedOn), department: text(note.department, 200), answer: text(note.answer, 4000) }
    if (value.status === 'recorded' && (!value.checkedOn || !value.answer.trim())) throw Error('回答記録済みにするには確認日と回答を入力してください。')
    return [topic, value]
  }))
}
export function createFollowUpRecord(point, notes, checkedAt = null) {
  if (!followUpPointKey(point)) throw Error('確認メモの対象地点が不正です。')
  const record = { format: FORMAT, schemaVersion: 1, scope: 'selected-point', position: { lat: point.lat, lon: point.lon }, savedAt: new Date().toISOString(), sourceCheckedAt: checkedAt, notes: normalizeFollowUpNotes(notes) }
  if (new TextEncoder().encode(JSON.stringify(record, null, 2)).length > MAX_BYTES) throw Error('確認メモが64KBを超えています。回答を短くして保存してください。')
  return record
}
export function parseFollowUpRecord(raw, point) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_BYTES) throw Error('確認メモは64KB以下のJSONを指定してください。')
  let record
  try { record = JSON.parse(raw) } catch { throw Error('確認メモのJSONを読み取れません。') }
  if (record?.format !== FORMAT || record.schemaVersion !== 1 || record.scope !== 'selected-point') throw Error('この確認メモの形式には対応していません。')
  if (!followUpPointKey(point) || followUpPointKey(record.position) !== followUpPointKey(point)) throw Error('対象地点が異なります。メモは反映していません。')
  return normalizeFollowUpNotes(record.notes)
}
