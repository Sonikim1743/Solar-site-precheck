import { generationInputs, parseGeneration, generationUrl } from '../../shared/generation.js'
import { buildGenerationScenario } from '../../shared/generationScenario.js'
import { isConfirmedSnowStation, thirdMeshCode } from '../services/nedo.js'
import { validateRateSummaries } from '../services/nedoValidation.js'

import { normalizeParcelReview } from './parcelReview.js'

export const REVIEW_FORMAT = 'solar-site-precheck-review'
export const REVIEW_SCHEMA_VERSION = 2
export const MAX_REVIEW_BYTES = 2 * 1024 * 1024
const fail = label => { throw new Error(`検討記録の${label}が不正です。元のファイルを確認してください。`) }
const object = (value, label) => value && typeof value === 'object' && !Array.isArray(value) ? value : fail(label)
const number = (value, label, min = -1e8, max = 1e8) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fail(label)
const nullable = (value, label, min, max) => value == null ? null : number(value, label, min, max)
const text = (value, label, max = 500) => value == null ? '' : typeof value === 'string' && value.length <= max ? value : fail(label)
const list = (value, label, min, max) => Array.isArray(value) && value.length >= min && value.length <= max ? value : fail(label)
const date = (value, label) => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fail(label)
export const reviewPositionKey = point => point ? `${point.lat.toFixed(7)},${point.lon.toFixed(7)}` : ''
const point = (value, label) => { object(value, label); return { lat: number(value.lat, label, 20, 50), lon: number(value.lon, label, 120, 155) } }
const optionalTextFields = (value, keys) => Object.fromEntries(keys.map(key => [key, text(value?.[key], key)]))

function normalizeDraftInputs(value) {
  object(value, '発電条件')
  return Object.fromEntries(['peakpower', 'angle', 'aspect', 'loss'].map(key => {
    if (value[key] === '') return [key, '']
    const validated = generationInputs({ lat: 34, lon: 133, peakpower: 50, angle: 20, aspect: 0, loss: 14, [key]: value[key] })
    return [key, validated[key]]
  }))
}

function normalizeGeneration(value, position, draft) {
  if (value == null) return null
  object(value, '発電量')
  const inputs = generationInputs(object(value.inputs, '発電量の条件'))
  if (inputs.userhorizon !== undefined) fail('基準発電量の地形地平線')
  if (inputs.lat !== position.lat || inputs.lon !== position.lon) fail('発電量の候補地')
  if (['peakpower', 'angle', 'aspect', 'loss'].some(key => inputs[key] !== draft[key])) fail('発電量と入力条件の一致')
  const monthly = list(value.monthly, '月別発電量', 12, 12)
  const normalized = parseGeneration({ outputs: { totals: { fixed: { E_y: value.annualKwh } }, monthly: { fixed: monthly.map(row => ({ month: row.month, E_m: row.kwh })) } } }, inputs)
  if (Math.abs(monthly.reduce((total, row) => total + row.kwh, 0) - value.annualKwh) > Math.max(1, value.annualKwh * .001)) fail('年間・月別発電量の整合性')
  const base = { ...normalized, source: text(value.source, '発電量の出典'), sourceUrl: generationUrl(inputs), period: text(value.period, '対象期間', 80), fetchedAt: date(value.fetchedAt, '発電量の取得日時') }
  if (value.scenario != null) base.scenario = normalizeGenerationScenario(value.scenario, base, position)
  return base
}

function normalizeGenerationScenario(value, base, position) {
  object(value, '試験比較')
  if (value.version !== 1) fail('試験比較の形式')
  let snow = null
  if (value.snow != null) {
    object(value.snow, '試験比較の積雪条件')
    const mesh = text(value.snow.mesh, '試験比較の積雪メッシュ', 8)
    if (!/^\d{8}$/.test(mesh) || mesh !== thirdMeshCode(position.lat, position.lon)) fail('試験比較の積雪メッシュ')
    snow = {
      rates: list(value.snow.rates, '試験比較の月別積雪出現率', 12, 12).map(rate => number(rate, '試験比較の積雪出現率', 0, 1)),
      weight: number(value.snow.weight, '試験比較の積雪影響係数', 0, 100),
      mesh,
      source: text(value.snow.source, '試験比較の積雪出典'),
    }
  }
  const terrain = value.terrain == null ? null : object(value.terrain, '試験比較の地平線計算')
  if (terrain) text(terrain.period, '試験比較の地平線計算期間', 80)
  // Derived totals in a file are not authoritative. The helper validates the
  // terrain calculation, reconstructs source URLs, and recalculates this view.
  return buildGenerationScenario(base, { snow, terrain, calculatedAt: date(value.calculatedAt, '試験比較の計算日時') })
}

function normalizeTerrain(value, position, height) {
  if (value == null) return null
  object(value, '地平線')
  const origin = value.position ? point(value.position, '地平線の位置') : position
  if (reviewPositionKey(origin) !== reviewPositionKey(position) || (value.positionKey && value.positionKey !== reviewPositionKey(position))) fail('地平線の候補地')
  const samples = list(value.samples, '地平線の方位', 1, 360).map(sample => {
    object(sample, '地平線の値')
    const result = { bearing: number(sample.bearing, '方位角', 0, 359.999), direction: text(sample.direction, '方位名', 30), angle: nullable(sample.angle, '地平線角', 0, 90), terrainAngle: nullable(sample.terrainAngle, '地形角', 0, 90), elevation: nullable(sample.elevation, '周辺標高', -500, 10000), distance: nullable(sample.distance, '地平線距離', 0, 100000), terrainDistance: nullable(sample.terrainDistance, '地形距離', 0, 100000), missing: sample.missing === true, missingCount: nullable(sample.missingCount, '欠測数', 0, 500), obstructionHeight: height }
    if (sample.profile != null) result.profile = list(sample.profile, '地平線断面', 0, 500).map(row => ({ distance: number(row.distance, '断面距離', .01, 100000), elevation: nullable(row.elevation, '断面標高', -500, 10000), source: text(row.source, '標高の出典'), obstructionHeight: nullable(row.obstructionHeight, '断面の樹高', 0, 100), effectiveElevation: nullable(row.effectiveElevation, '補正標高', -500, 10100), terrainAngle: nullable(row.terrainAngle, '地形角', 0, 90), angle: nullable(row.angle, '地平線角', 0, 90), missing: row.missing === true }))
    return result
  }).sort((a, b) => a.bearing - b.bearing)
  if (new Set(samples.map(row => row.bearing)).size !== samples.length) fail('重複した地平線方位')
  const valid = samples.filter(row => row.angle !== null && !row.missing)
  const highest = valid.reduce((best, row) => !best || row.angle > best.angle ? row : best, null)
  return { samples, maxAngle: highest?.angle ?? null, direction: highest?.direction || '', risk: (highest?.angle || 0) >= 5 ? '高' : (highest?.angle || 0) >= 2 ? '中' : '低', radius: text(value.radius, '分析範囲'), obstructionHeight: height, position: origin, positionKey: reviewPositionKey(position) }
}

function profileSummary(points) {
  const valid = points.filter(row => row.elevation !== null)
  let totalRise = 0, totalFall = 0, maxSlopePercent = 0
  for (let i = 1; i < valid.length; i++) {
    const delta = valid[i].elevation - valid[i - 1].elevation
    const distance = valid[i].distance - valid[i - 1].distance
    if (distance <= 0) fail('断面の距離順')
    totalRise += Math.max(0, delta); totalFall += Math.max(0, -delta)
    maxSlopePercent = Math.max(maxSlopePercent, Math.abs(delta / distance) * 100)
  }
  const elevationDiff = valid.length ? valid.at(-1).elevation - valid[0].elevation : null
  return { minElevation: valid.length ? Math.min(...valid.map(row => row.elevation)) : null, maxElevation: valid.length ? Math.max(...valid.map(row => row.elevation)) : null, elevationDiff, totalRise, totalFall, averageSlopePercent: valid.length > 1 ? Math.abs(elevationDiff / (valid.at(-1).distance - valid[0].distance)) * 100 : null, maxSlopePercent }
}

function normalizeSection(value, position) {
  if (value == null) return null
  object(value, '地形断面')
  const rangeMeters = number(value.rangeMeters, '断面範囲', 1, 1000)
  const intervalMeters = number(value.intervalMeters, '断面間隔', 1, 1000)
  const lines = list(value.lines, '断面方向', 2, 2).map(line => {
    const points = list(line.points, '断面点', 2, 501).map(row => {
      const location = point(row, '断面点の座標')
      const distance = number(row.distance, '断面点の距離', -rangeMeters, rangeMeters)
      if (Math.abs(location.lat - position.lat) > .02 || Math.abs(location.lon - position.lon) > .03) fail('断面点の候補地')
      if (distance === 0 && reviewPositionKey(location) !== reviewPositionKey(position)) fail('断面中心の候補地')
      return { ...location, distance, elevation: nullable(row.elevation, '断面標高', -500, 10000), source: text(row.source, '断面の出典') }
    }).sort((a, b) => a.distance - b.distance)
    if (!points.some(row => row.distance === 0)) fail('断面の中心点')
    return { ...optionalTextFields(line, ['label', 'negativeDirection', 'positiveDirection']), rangeMeters, intervalMeters, points, summary: profileSummary(points) }
  })
  const elevations = lines.flatMap(line => line.points).filter(row => row.elevation !== null).map(row => row.elevation)
  return { rangeMeters, intervalMeters, lines, summary: { minElevation: elevations.length ? Math.min(...elevations) : null, maxElevation: elevations.length ? Math.max(...elevations) : null, sampleCount: elevations.length } }
}

function normalizeSnow(value, position) {
  if (value == null) return null
  object(value, '積雪資料')
  const mesh = thirdMeshCode(position.lat, position.lon)
  if (!isConfirmedSnowStation(value) || value.id !== mesh) fail('積雪のメッシュ・検証情報')
  const snow = object(value.snow10cm, '積雪出現率')
  const monthly = list(snow.monthly, '月別積雪出現率', 12, 12).map(rate => number(rate, '積雪出現率', 0, 1))
  const totals = Object.fromEntries(['annual', 'winter', 'spring', 'summer', 'autumn'].map(key => [key, number(snow[key], '積雪集計値', 0, 1)]))
  if (value.mode !== 'manual-corrected') validateRateSummaries([...monthly, ...Object.values(totals)])
  const source = object(value.source, '積雪の出典')
  return { ...point(value, '積雪資料の座標'), ...optionalTextFields(value, ['name', 'placeName']), id: mesh, expectedMesh: mesh, latDeg: number(value.latDeg, '緯度', 20, 50), lonDeg: number(value.lonDeg, '経度', 120, 155), latMin: number(value.latMin, '緯度の分', 0, 60), lonMin: number(value.lonMin, '経度の分', 0, 60), elevation: nullable(value.elevation, 'NEDO標高', -500, 10000), distanceKm: 0, mode: value.mode, verified: true, validationVersion: 2, snow10cm: { monthly, ...totals }, source: { ...optionalTextFields(source, ['name', 'statisticalPeriod', 'field']), url: `https://domessolar.infop.nedo.go.jp/appww/cgi-bin/monsola.cgi?m=${mesh}` }, verification: { method: text(value.verification?.method, '積雪検証方法'), correctedColumns: list(value.verification?.correctedColumns || [], '補正列', 0, 17).map(item => number(item, '補正列', 0, 17)), disagreementColumns: list(value.verification?.disagreementColumns || [], '読取差異', 0, 17).map(item => number(item, '読取差異', 0, 17)) } }
}

export function validateReviewRecord(value) {
  object(value, 'ファイル形式')
  if (value.format !== REVIEW_FORMAT) fail('ファイル形式')
  if (![1, REVIEW_SCHEMA_VERSION].includes(value.schemaVersion)) throw new Error('この検討記録の形式には対応していません。対応するアプリのバージョンで開いてください。')
  const candidate = object(value.candidate, '候補地'), inputs = object(value.inputs, '条件'), results = object(value.results, '結果')
  const position = point(candidate.position, '候補地の座標')
  const draft = normalizeDraftInputs(inputs.generation)
  const obstructionHeight = number(inputs.obstructionHeight, '想定樹高', 0, 100)
  const elevation = object(results.elevation, '標高')
  const parcel = candidate.parcel == null ? null : optionalTextFields(object(candidate.parcel, '地番'), ['id', 'number', 'municipality', 'area', 'mapType', 'label', 'landCategory', 'owner'])
  const gridNotes = list(value.gridNotes || [], '設備確認メモ', 0, 20).map(note => {
    object(note, '設備確認メモ')
    if (reviewPositionKey(point(note.position, '設備確認メモの座標')) !== reviewPositionKey(position)) fail('設備確認メモの候補地')
    return { id: text(note.id, '設備確認メモID', 160), title: text(note.title, '設備名'), text: text(note.text, '設備確認メモ本文', 16000), recordedAt: date(note.recordedAt, '設備確認日時'), position }
  })
  return { format: REVIEW_FORMAT, schemaVersion: REVIEW_SCHEMA_VERSION, savedAt: date(value.savedAt, '保存日時'), appVersion: text(value.appVersion, 'アプリ版', 40), kind: value.kind === 'example' ? 'example' : 'review', candidate: { position, name: text(candidate.name, '候補地名', 200), placeLabel: text(candidate.placeLabel, '地名'), memo: text(candidate.memo, '候補地メモ', 20000), fieldMemo: text(candidate.fieldMemo, '現地メモ', 20000), parcel, parcelReview: normalizeParcelReview(value.schemaVersion >= 2 ? candidate.parcelReview : null) }, inputs: { obstructionHeight, detailedHorizon: inputs.detailedHorizon === true, snowBase: number(inputs.snowBase, '積雪補正の基準値', 0, 1), generation: draft, solarProMemo: optionalTextFields(inputs.solarProMemo, ['reportName', 'annualYield', 'capacity', 'module', 'checkedAt']) }, results: { elevation: { value: nullable(elevation.value, '標高', -500, 10000), source: text(elevation.source, '標高出典') }, terrain: normalizeTerrain(results.terrain, position, obstructionHeight), terrainSection: normalizeSection(results.terrainSection, position), snowStation: normalizeSnow(results.snowStation, position), generation: normalizeGeneration(results.generation, position, draft) }, gridNotes }
}

export function parseReviewRecord(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_REVIEW_BYTES) throw new Error('検討記録は2MB以下のJSONファイルを選んでください。')
  let value
  try { value = JSON.parse(raw.replace(/^\uFEFF/, '')) } catch { throw new Error('JSON形式の検討記録を読み込めませんでした。現在の作業は変更していません。') }
  return validateReviewRecord(value)
}

export function createReviewRecord({ report, generationDraft, detailedHorizon = false, gridNotes = [], kind = 'review' }) {
  return validateReviewRecord({ format: REVIEW_FORMAT, schemaVersion: REVIEW_SCHEMA_VERSION, appVersion: report.appVersion, savedAt: new Date().toISOString(), kind, candidate: { position: report.position, name: report.siteName, placeLabel: report.placeLabel, memo: report.memo, fieldMemo: report.fieldMemo, parcel: report.parcel, parcelReview: report.parcelReview }, inputs: { obstructionHeight: report.obstructionHeight, detailedHorizon, snowBase: report.snowBase, solarProMemo: report.solarProMemo, generation: generationDraft }, results: { elevation: { value: report.elevation, source: report.elevationSource }, terrain: report.terrain, terrainSection: report.terrainSection, snowStation: report.snowStation, generation: report.generation }, gridNotes })
}

export function reviewRecordFilename(record) {
  const name = (record.candidate.name || record.candidate.placeLabel || '候補地').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 60)
  return `${name}_${record.savedAt.slice(0, 10)}.precheck.json`
}

export function exampleReviewRecord(appVersion) {
  return createReviewRecord({ report: { appVersion, position: { lat: 34.9, lon: 133.5 }, siteName: '操作練習用の候補地（仮条件）', placeLabel: '岡山県内の練習用座標・実案件ではありません', memo: '仮条件：DC 50kWp、南向き、傾斜20°、損失14%。実際の設備条件に変更して計算してください。', fieldMemo: '接道・樹木・建物・系統接続は未確認。現地確認で追記する例です。', elevation: null, obstructionHeight: 20, snowBase: .95 }, generationDraft: { peakpower: 50, angle: 20, aspect: 0, loss: 14 }, kind: 'example' })
}
