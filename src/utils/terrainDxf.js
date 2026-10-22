import { terrainGeometryKey, terrainPointToLocal } from './terrainArea.js'
import { measureParcelReview } from './parcelReview.js'
import { terrainReportLayouts } from './terrainLayoutReport.js'
import { terrainReportTitle } from './terrainReportTitle.js'
import { geometryPolygons, featureInteriorPoint } from '../services/parcelGeometry.js'

export const TERRAIN_DXF_LAYERS = Object.freeze({
  BOUNDARY: 2, BOUNDARY_HOLES: 1, MODULES: 5, FENCE: 3,
  CONTOUR: 8, CONTOUR_MAJOR: 32, ELEVATION_TEXT: 7,
  PARCEL_BOUNDARY: 6, PARCEL_TEXT: 7, REFERENCE: 4, NOTES: 7,
})
const fail = message => { throw new Error(`DXF：${message}`) }
const number = value => {
  if (!Number.isFinite(value) || Math.abs(value) > 1e8) fail('座標または寸法が不正です。')
  return String(Number(value.toFixed(9)))
}
// R2007 (AC1021) text is UTF-8, including Japanese parcel numbers and notes.
// Reject control/format injection; literal backslashes and percent signs must
// never become CAD formatting sequences (e.g. %%d or an injected Unicode code).
export const dxfText = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 1000)
  .replace(/[\\%]/g, c => `\\U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)

// Model coordinates already are WGS84-centred AEQD metres: +X east, +Y north.
// Use applied module XY vertices directly, never a camera, raster or re-layout.
export function createTerrainDxf(report) {
  const analysis = report?.terrainArea, grid = analysis?.grid
  const geometry = measureParcelReview(report?.parcelReview).geometry
  if (!geometry || !grid?.origin || !grid.boundary?.length || analysis.geometryKey !== terrainGeometryKey(geometry)) fail('範囲と地形が一致しません。現在の範囲で再計算してください。')
  const { current: layout, blocked, fence } = terrainReportLayouts(analysis, report.terrainPreview)
  if (blocked || !layout) fail('配置条件または地形が更新されています。現在の条件を適用してから保存してください。')
  const entities = [], counts = Object.fromEntries(Object.keys(TERRAIN_DXF_LAYERS).map(k => [k, 0]))
  let vertexCount = 0
  const xy = point => { if (!Array.isArray(point) || point.length < 2) fail('座標が不足しています。'); return point.slice(0, 2).map(v => Number(number(v))) }
  const add = entity => {
    if (entities.length >= 150000) fail('図形数が上限を超えています。範囲を小さくしてください。')
    counts[entity.layer]++; entities.push(entity)
  }
  const poly = (layer, points, closed = false) => {
    let vertices = points.map(xy)
    if (closed && vertices.length > 1 && vertices[0].every((v, i) => Math.abs(v - vertices.at(-1)[i]) < 1e-8)) vertices.pop()
    if (vertices.length < (closed ? 3 : 2)) fail('線の頂点が不足しています。')
    vertexCount += vertices.length
    if (vertexCount > 500000) fail('頂点数が上限を超えています。')
    add({ type: 'LWPOLYLINE', layer, points: vertices, closed })
  }
  const text = (layer, point, value, height = 2) => add({ type: 'TEXT', layer, point: xy(point), text: dxfText(value), height })
  for (const polygon of grid.boundary) polygon.forEach((ring, i) => poly(i ? 'BOUNDARY_HOLES' : 'BOUNDARY', ring, true))
  for (const rack of layout.racks) for (const module of rack.modules) poly('MODULES', module.corners, true)
  if (counts.MODULES !== layout.moduleCount) fail('適用済みモジュール数と図形数が一致しません。')
  for (const rail of fence?.rails || []) poly('FENCE', rail.points)
  for (const contour of analysis.contours || []) {
    number(contour.level)
    for (const points of contour.paths || []) poly(contour.level % 10 === 0 ? 'CONTOUR_MAJOR' : 'CONTOUR', points)
    const longest = [...(contour.paths || [])].sort((a, b) => b.length - a.length)[0]
    if (longest?.length) text('ELEVATION_TEXT', longest[Math.floor(longest.length / 2)], `${contour.level}m`)
  }
  const extrema = { low: null, high: null }
  for (let i = 0; i < (grid.elevations?.length || 0); i++) {
    const z = grid.elevations[i]
    if (!grid.inside?.[i] || !Number.isFinite(z)) continue
    const point = [grid.xMin + i % grid.width * grid.step, grid.yMin + Math.floor(i / grid.width) * grid.step]
    if (!extrema.low || z < extrema.low.z) extrema.low = { point, z }
    if (!extrema.high || z > extrema.high.z) extrema.high = { point, z }
  }
  if (extrema.low) text('ELEVATION_TEXT', extrema.low.point, `${extrema.low.z.toFixed(2)}m（参考DEM最低点）`)
  if (extrema.high && extrema.high.z !== extrema.low.z) text('ELEVATION_TEXT', extrema.high.point, `${extrema.high.z.toFixed(2)}m（参考DEM最高点）`)
  // Same original target parcels as the one-sheet PDF. No tile-image tracing,
  // invented parcel numbers, or filling gaps where vector sources are absent.
  let missingNumbers = 0
  for (const parcel of report.parcelReview.parcels || []) {
    if (parcel.role !== 'target') continue
    const local = ([lon, lat]) => terrainPointToLocal({ lon, lat }, grid.origin)
    for (const polygon of geometryPolygons(parcel.geometry)) for (const ring of polygon) poly('PARCEL_BOUNDARY', ring.map(local), true)
    const label = parcel.info?.number
    if (typeof label === 'string' && label.trim()) {
      const anchor = featureInteriorPoint(parcel)
      if (anchor) text('PARCEL_TEXT', terrainPointToLocal(anchor, grid.origin), label)
    } else missingNumbers++
  }
  const boundaryPoints = grid.boundary.flat(2).map(xy)
  const west = Math.min(...boundaryPoints.map(p => p[0])), south = Math.min(...boundaryPoints.map(p => p[1]))
  const north = Math.max(...boundaryPoints.map(p => p[1]))
  poly('REFERENCE', [[west, south - 8], [west + 50, south - 8]])
  poly('REFERENCE', [[west, south - 9], [west, south - 7]])
  poly('REFERENCE', [[west + 50, south - 9], [west + 50, south - 7]])
  text('REFERENCE', [west, south - 6], '50m / 1 CAD unit = 1m')
  poly('REFERENCE', [[west - 6, north - 10], [west - 6, north]])
  poly('REFERENCE', [[west - 8, north - 3], [west - 6, north], [west - 4, north - 3]])
  text('REFERENCE', [west - 7, north + 2], 'N')
  const origin = grid.origin
  const warnings = [
    ...(fence?.truncated ? ['仮フェンスは表示上限により一部です。'] : []),
    ...(!counts.CONTOUR && !counts.CONTOUR_MAJOR ? ['出力できる等高線はありません（平坦・欠測・未生成を含む）。'] : []),
    ...(missingNumbers ? [`地番未記載：${missingNumbers}筆（番号は推定していません）。`] : []),
  ]
  const notes = [terrainReportTitle(report),
    '参考図形・参考DEM。測量成果・施工図ではありません。全オブジェクトZ=0。',
    `WGS84 AEQD / origin N${origin.lat} E${origin.lon} / X=East Y=North / metres`,
    `モジュール ${layout.moduleCount}枚 / ${layout.rackCount}架台 / 個別除外 ${layout.disabledRacks?.length || 0}架台`,
    `パネル傾斜 ${layout.options.tiltDeg}度 / 方位 ${layout.options.azimuthDeg}度（北0・時計回り、真南180）/ 仮フェンス ${report.terrainPreview?.fence ? 'ON' : 'OFF'}`,
    `資料 ${analysis.source?.name || '参考DEM'} / 取得 ${analysis.fetchedAt || '未記録'} / 格子 ${grid.step}m（測量精度ではありません）`,
    '紙mm / モデルm：1:1000は1mm=1m、50m=50mm。1:500は2mm=1m。',
    '地図・航空写真は含みません。標高文字は参考DEM値。境界・地番は原資料の範囲のみ。', ...warnings]
  notes.forEach((note, i) => text('NOTES', [west, south - 14 - i * 3], note))
  const lines = [], pair = (code, value) => lines.push(String(code), String(value))
  let handle = 256
  const next = () => (++handle).toString(16).toUpperCase()
  const record = (type, owner, subclass) => { pair(0, type); pair(5, next()); pair(330, owner); pair(100, subclass) }
  const section = name => { pair(0, 'SECTION'); pair(2, name) }
  section('HEADER')
  for (const [name, code, value] of [['$ACADVER', 1, 'AC1021'], ['$DWGCODEPAGE', 3, 'ANSI_1252'], ['$INSUNITS', 70, 6], ['$MEASUREMENT', 70, 1], ['$LUNITS', 70, 2], ['$LUPREC', 70, 6], ['$AUNITS', 70, 0], ['$ANGBASE', 50, 0], ['$ANGDIR', 70, 0]]) { pair(9, name); pair(code, value) }
  pair(9, '$INSBASE'); pair(10, 0); pair(20, 0); pair(30, 0)
  pair(0, 'ENDSEC'); section('TABLES')
  const table = (name, id, size) => { pair(0, 'TABLE'); pair(2, name); pair(5, id); pair(330, 0); pair(100, 'AcDbSymbolTable'); pair(70, size) }
  table('LTYPE', '10', 1)
  record('LTYPE', '10', 'AcDbSymbolTableRecord'); pair(100, 'AcDbLinetypeTableRecord'); pair(2, 'CONTINUOUS'); pair(70, 0); pair(3, 'Solid line'); pair(72, 65); pair(73, 0); pair(40, 0); pair(0, 'ENDTAB')
  table('LAYER', '11', Object.keys(TERRAIN_DXF_LAYERS).length + 1)
  for (const [name, color] of [['0', 7], ...Object.entries(TERRAIN_DXF_LAYERS)]) {
    record('LAYER', '11', 'AcDbSymbolTableRecord'); pair(100, 'AcDbLayerTableRecord'); pair(2, name); pair(70, 0); pair(62, color); pair(6, 'CONTINUOUS')
  }
  pair(0, 'ENDTAB'); table('STYLE', '12', 1)
  record('STYLE', '12', 'AcDbSymbolTableRecord'); pair(100, 'AcDbTextStyleTableRecord'); pair(2, 'STANDARD'); pair(70, 0); pair(40, 0); pair(41, 1); pair(50, 0); pair(71, 0); pair(42, 1); pair(3, 'msgothic.ttc'); pair(4, ''); pair(0, 'ENDTAB')
  table('BLOCK_RECORD', '13', 2)
  for (const [id, name] of [['20', '*Model_Space'], ['21', '*Paper_Space']]) {
    pair(0, 'BLOCK_RECORD'); pair(5, id); pair(330, '13'); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbBlockTableRecord'); pair(2, name); pair(70, 0)
  }
  pair(0, 'ENDTAB'); pair(0, 'ENDSEC'); section('BLOCKS')
  for (const [owner, name] of [['20', '*Model_Space'], ['21', '*Paper_Space']]) {
    record('BLOCK', owner, 'AcDbEntity'); pair(8, '0'); pair(100, 'AcDbBlockBegin'); pair(2, name); pair(70, 0); pair(10, 0); pair(20, 0); pair(30, 0); pair(3, name); pair(1, '')
    record('ENDBLK', owner, 'AcDbEntity'); pair(8, '0'); pair(100, 'AcDbBlockEnd')
  }
  pair(0, 'ENDSEC'); section('ENTITIES')
  for (const entity of entities) {
    record(entity.type, '20', 'AcDbEntity'); pair(8, entity.layer)
    if (entity.type === 'LWPOLYLINE') {
      pair(100, 'AcDbPolyline'); pair(90, entity.points.length); pair(70, entity.closed ? 1 : 0); pair(38, 0)
      for (const p of entity.points) { pair(10, number(p[0])); pair(20, number(p[1])) }
    } else {
      pair(100, 'AcDbText'); pair(10, number(entity.point[0])); pair(20, number(entity.point[1])); pair(30, 0); pair(40, number(entity.height)); pair(1, entity.text); pair(50, 0); pair(7, 'STANDARD'); pair(100, 'AcDbText')
    }
  }
  pair(0, 'ENDSEC'); pair(0, 'EOF')
  const bytes = new TextEncoder().encode(lines.join('\r\n') + '\r\n')
  const title = terrainReportTitle(report).replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').slice(0, 50).replace(/[.\s]+$/g, '') || '候補地'
  return { bytes, fileName: `参考配置図_${title}.dxf`, counts, warnings,
    moduleCount: layout.moduleCount, origin: { ...origin }, units: 'm', z: 0 }
}

export function downloadTerrainDxf(report) {
  const result = createTerrainDxf(report)
  const url = URL.createObjectURL(new Blob([result.bytes], { type: 'application/dxf' }))
  const link = document.createElement('a')
  try { link.href = url; link.download = result.fileName; document.body.appendChild(link); link.click() }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000) }
  return result
}
