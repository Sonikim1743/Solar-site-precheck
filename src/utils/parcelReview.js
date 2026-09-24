import { parcelInfo } from '../services/cadastre.js'
import { validatePolygonGeometry, geometryVertexCount, geometryBounds, MAX_REVIEW_SPAN_DEGREES, measureGeometryReview } from '../services/parcelGeometry.js'

export const MAX_REVIEW_PARCELS = 100
export const MAX_REVIEW_VERTICES = 10000
export const MAX_REVIEW_EXCLUSIONS = 50
// Leave at least half of the existing 2 MiB record envelope for other analyses.
export const MAX_PARCEL_REVIEW_BYTES = 1024 * 1024
const fail = label => { throw new Error('筆界検討の' + label + 'が不正です。元の資料を確認してください。') }
const object = (value, label) => value && typeof value === 'object' && !Array.isArray(value) ? value : fail(label)
const text = (value, label, max = 500) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ? value : fail(label)
const list = (value, label, max) => Array.isArray(value) && value.length <= max ? value : fail(label)
const roleValue = role => ['target', 'reference'].includes(role) ? role : fail('選択区分')
const cloneGeometry = geometry => validatePolygonGeometry(geometry)

export function createEmptyParcelReview() {
  return { version: 1, parcels: [], boundary: null, exclusions: [] }
}

function normalizedSource(value) {
  object(value, '出典')
  const fileName = text(value.fileName, '出典ファイル名', 260)
  const importedAt = text(value.importedAt, '読込日時', 40)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(importedAt) ||
      !Number.isFinite(Date.parse(importedAt)) || new Date(importedAt).toISOString() !== importedAt) fail('読込日時')
  return { fileName, importedAt }
}

function geometryFingerprint(geometry) {
  // Two independent 32-bit accumulators keep missing-id keys short. Cadastre
  // imports normally supply __parcelId; file name always remains in the key.
  const serialized = JSON.stringify(geometry)
  let a = 2166136261, b = 2246822507
  for (let i = 0; i < serialized.length; i++) {
    const n = serialized.charCodeAt(i)
    a = Math.imul(a ^ n, 16777619)
    b = Math.imul(b ^ n, 3266489909)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}

export function getParcelKey(feature, sourceName = '') {
  object(feature, '地番データ')
  text(sourceName, '出典ファイル名', 260)
  const originalId = parcelInfo(feature).id
  text(originalId, '元の筆ID', 200)
  const identity = originalId ? ['id', originalId] : ['geometry', geometryFingerprint(cloneGeometry(feature.geometry))]
  // JSON tuple encoding cannot confuse file/id delimiter characters.
  return JSON.stringify([sourceName, ...identity])
}

function normalizeInfo(value) {
  object(value, '地番情報')
  return Object.fromEntries(['id', 'number', 'municipality', 'area', 'mapType', 'label']
    .map(key => [key, text(value[key], '地番情報（' + key + '）', key === 'id' ? 200 : 500)]))
}

function enforceEnvelope(review) {
  const geometries = [...review.parcels.map(parcel => parcel.geometry), ...(review.boundary ? [review.boundary] : []), ...review.exclusions]
  const vertices = geometries.reduce((count, geometry) => count + geometryVertexCount(geometry), 0)
  if (vertices > MAX_REVIEW_VERTICES) fail('頂点数（閉合点を含め全体10,000点まで）')
  if (geometries.length) {
    const b = geometryBounds(geometries)
    if (b.east - b.west > MAX_REVIEW_SPAN_DEGREES || b.north - b.south > MAX_REVIEW_SPAN_DEGREES) fail('検討範囲（経緯度各2度以内）')
  }
  if (new TextEncoder().encode(JSON.stringify(review)).byteLength > MAX_PARCEL_REVIEW_BYTES) fail('容量（筆界検討は1MiBまで）')
  return review
}

export function normalizeParcelReview(value) {
  if (value == null) return createEmptyParcelReview()
  object(value, '形式')
  if (value.version !== 1) fail('バージョン')
  // Reject oversized/cyclic input before geometric work; do not silently strip a
  // huge unknown payload and then accept it as a valid saved parcel review.
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_PARCEL_REVIEW_BYTES) fail('容量（筆界検討は1MiBまで）')
  } catch (error) {
    if (error?.message?.startsWith('筆界検討')) throw error
    fail('JSON形式')
  }
  const parcels = Array.from(list(value.parcels, '選択筆数（100筆まで）', MAX_REVIEW_PARCELS), parcel => {
    object(parcel, '選択筆')
    const info = normalizeInfo(parcel.info), source = normalizedSource(parcel.source), geometry = cloneGeometry(parcel.geometry)
    const id = text(parcel.id, '筆キー', 1600)
    const expected = getParcelKey({ type: 'Feature', id: info.id, properties: {}, geometry }, source.fileName)
    if (id !== expected) fail('筆キーと出典の対応')
    return { id, role: roleValue(parcel.role), info, geometry, source }
  })
  if (new Set(parcels.map(parcel => parcel.id)).size !== parcels.length) fail('重複した筆キー')
  const boundary = value.boundary == null ? null : cloneGeometry(value.boundary)
  if (boundary && boundary.type !== 'Polygon') fail('手描き検討範囲（Polygonのみ）')
  const exclusions = Array.from(list(value.exclusions, '除外範囲（50個まで）', MAX_REVIEW_EXCLUSIONS), value => {
    const geometry = cloneGeometry(value)
    if (geometry.type !== 'Polygon') fail('除外範囲（Polygonのみ）')
    return geometry
  })
  return enforceEnvelope({ version: 1, parcels, boundary, exclusions })
}

export function setReviewParcel(review, feature, role, source = { fileName: '', importedAt: new Date().toISOString() }) {
  const normalized = normalizeParcelReview(review)
  object(feature, '地番データ')
  const parcelSource = normalizedSource(source)
  const parcel = {
    id: getParcelKey(feature, parcelSource.fileName),
    role: roleValue(role),
    info: normalizeInfo(parcelInfo(feature)),
    geometry: cloneGeometry(feature.geometry),
    source: parcelSource,
  }
  const index = normalized.parcels.findIndex(row => row.id === parcel.id)
  if (index === -1) normalized.parcels.push(parcel)
  else normalized.parcels[index] = parcel
  // Revalidate all combined bounds/count/size limits after the immutable edit.
  return normalizeParcelReview(normalized)
}

export function removeReviewParcel(review, id) {
  const normalized = normalizeParcelReview(review)
  text(id, '筆キー', 1600)
  return { ...normalized, parcels: normalized.parcels.filter(parcel => parcel.id !== id) }
}

export function measureParcelReview(review) {
  const normalized = normalizeParcelReview(review)
  const targets = normalized.parcels.filter(parcel => parcel.role === 'target')
  const references = normalized.parcels.filter(parcel => parcel.role === 'reference')
  return {
    ...measureGeometryReview(targets.map(parcel => parcel.geometry), normalized.boundary, normalized.exclusions),
    targetCount: targets.length,
    referenceCount: references.length,
  }
}

