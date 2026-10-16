import { terrainReportTitleLines } from '../utils/terrainReportTitle.js'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import polygonClipping from 'polygon-clipping'
import { terrainPointToLocal, pointInTerrainBoundary } from '../utils/terrainArea.js'
import { createTerrainProjection, dragTerrainView, normalizeTerrainView, orbitTerrainView, zoomTerrainView, terrainFaceVisible, stepTerrainView } from '../utils/terrainView.js'
import { terrainElevationLabel } from '../utils/terrainElevationLabel.js'
import { buildTerrainSolid } from '../utils/terrainSolid.js'
import { TERRAIN_SLOPE_LABELS, terrainSlopeIndex } from '../utils/terrainSlopeClasses.js'
import { terrainSlopeDistribution, formatTerrainSlopeArea, TERRAIN_SLOPE_COLORS } from '../utils/terrainSlopeDistribution.js'
import { getTerrainCellSlope } from '../utils/terrainLayout.js'
import { createTerrainOverlayVisibility, visibleTerrainLineParts } from '../utils/terrainOverlayVisibility.js'
import { layoutTerrainLabels } from '../utils/terrainLabelLayout.js'
import { hitTestTerrainRack } from '../utils/terrainRackHitTest.js'
import TerrainViewNavigation from './TerrainViewNavigation.jsx'
import TerrainHelpDialog from './TerrainHelpDialog.jsx'
import { interpolateTerrainNavigation, terrainNavigationTarget } from '../utils/terrainNavigation.js'
import './terrain-area.css'

const COLORS = TERRAIN_SLOPE_COLORS
const LABELS = TERRAIN_SLOPE_LABELS
const W = 800, H = 520
const finite = Number.isFinite
const colorIndex = terrainSlopeIndex
const n = (value) => Number(value.toFixed(2))

function gridBounds(grid) {
  return { west: grid.xMin, south: grid.yMin, east: grid.xMin + (grid.width - 1) * grid.step, north: grid.yMin + (grid.height - 1) * grid.step }
}

function ringsOf(grid) {
  return (grid.boundary || []).flat()
}

function pathOf(points, project, close = false) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${project(point).map(n).join(' ')}`).join(' ') + (close ? ' Z' : '')
}

function coordinateAt(grid, index) {
  return [grid.xMin + (index % grid.width) * grid.step, grid.yMin + Math.floor(index / grid.width) * grid.step]
}

function surfaceNormal(ring) {
  const origin = ring[0], normal = [0, 0, 0]
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index].map((value, axis) => value - origin[axis])
    const b = ring[(index + 1) % ring.length].map((value, axis) => value - origin[axis])
    normal[0] += a[1] * b[2] - a[2] * b[1]
    normal[1] += a[2] * b[0] - a[0] * b[2]
    normal[2] += a[0] * b[1] - a[1] * b[0]
  }
  return normal[2] < 0 ? normal.map(value => -value) : normal
}

function figurePoint(position, grid) {
  if (!finite(position?.lat) || !finite(position?.lon)) return null
  try { return terrainPointToLocal(position, grid.origin) } catch { return null }
}

const slopeShare = (analysis, index) => {
  const bin = terrainSlopeDistribution(analysis).bins[index]
  return finite(bin?.percent) ? `${bin.percent.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}%` : '未計算'
}

function Legend({ y = 469, analysis }) {
  const distribution = terrainSlopeDistribution(analysis)
  return <g className="terrain-area-svg-legend" transform={`translate(60 ${y})`}>
    {LABELS.map((label, index) => <g key={label} transform={`translate(${index * 140} 0)`}>
      <rect width="27" height="14" y="-12" fill={COLORS[index]} stroke="#8b918b" strokeWidth="0.4" />
      <text x="35" y="0">{label}</text>
      <text x="35" y="25" className="terrain-area-svg-share">{slopeShare(analysis, index)}</text>
      <text x="35" y="44" className="terrain-area-svg-area">{formatTerrainSlopeArea(distribution.bins[index].areaM2)}</text>
    </g>)}
  </g>
}

function SlopeDistribution({ analysis }) {
  const distribution = terrainSlopeDistribution(analysis)
  const unknown = distribution.unknownPercent > 0
  const unknownLabel = unknown && distribution.unknownPercent < .1 ? '0.1%未満' : `${distribution.unknownPercent.toFixed(1)}%`
  return <div className="terrain-area-slope-distribution">
    <table><caption>セル勾配 <span className="terrain-area-distribution-info">範囲面積比・推定面積 <TerrainHelpDialog title="勾配の範囲面積比・推定面積" symbol="i">
      <p className="terrain-area-distribution-unknown">未確認 / NoData {unknownLabel} · {formatTerrainSlopeArea(distribution.unknownAreaM2)} / 勾配確認 {distribution.coveragePercent.toFixed(1)}%</p>
      <p>穴・除外後の全図形面積が分母。セルと範囲の交差面積を集計し、五区分と未確認の合計100%。格子解像度に依存する推定値で、施工可否の基準ではありません。</p>
      <p>地表面と黄色線は同じDEM。樹木・建物・造成後の形状は含みません。側面・底面は表示用で、地層・土量を示しません。欠測や除外の部分を面で埋めません。</p>
    </TerrainHelpDialog></span>{unknown && <small className="terrain-area-missing-status" role="status">未確認 {unknownLabel}</small>}<span className="terrain-area-distribution-total">有効範囲 {formatTerrainSlopeArea(distribution.totalAreaM2)}（除外後）</span></caption>
      <thead><tr>{LABELS.map((label, index) => <th key={label} scope="col"><i style={{ background: COLORS[index] }} />{label}</th>)}</tr></thead>
      <tbody><tr>{LABELS.map((label, index) => <td key={label}><span>{slopeShare(analysis, index)}</span><small>{formatTerrainSlopeArea(distribution.bins[index].areaM2)}</small></td>)}</tr></tbody>
    </table>
  </div>
}

function Scale({ project, bounds }) {
  const span = bounds.east - bounds.west
  const meters = span >= 90 ? 50 : span >= 40 ? 20 : span >= 18 ? 10 : 5
  const a = project([bounds.west, bounds.south]), b = project([bounds.west + meters, bounds.south])
  const length = b[0] - a[0]
  return <g className="terrain-area-svg-scale" transform="translate(44 438)">
    <path d={`M0 -5 V5 M0 0 H${n(length)} M${n(length / 2)} -4 V4 M${n(length)} -5 V5`} />
    <text x="0" y="20">0</text><text x={length} y="20" textAnchor="middle">{meters} m</text>
  </g>
}

function ParcelLabels({ labels }) {
  return <g className="terrain-area-parcel-labels">
    {labels.filter(label => label.displaced).map((label, index) => <g key={`${label.id}-${index}`} className="terrain-area-parcel-leader">
        <line x1={label.anchorScreen[0]} y1={label.anchorScreen[1]} x2={label.screen[0]} y2={label.screen[1] - 6} />
        <circle cx={label.anchorScreen[0]} cy={label.anchorScreen[1]} r="2" />
      </g>)}
    {labels.map((label, index) => <text key={`${label.id}-${index}`} x={label.screen[0]} y={label.screen[1]} textAnchor="middle" data-parcel-number={label.number}>{label.number}</text>)}
  </g>
}

function ParcelLabelNote({ labels, unplaced = [], hidden = [] }) {
  if (!labels) return null
  return <div className="terrain-area-parcel-note">
    {labels.some(label => label.displaced) && <p>地番は重ならない位置へ表示。細い線の先が元の位置です。</p>}
    {(unplaced.length > 0 || hidden.length > 0) && <details>
      <summary>図上に収まらない地番・現在の視点で見えない地番（{unplaced.length + hidden.length}件）</summary>
      {unplaced.length > 0 && <p>重なり・表示範囲：{unplaced.map(label => label.number).join('、')}</p>}
      {hidden.length > 0 && <p>地形の裏側・画面外：{hidden.map(label => label.number).join('、')}。回転・縮小して確認できます。</p>}
    </details>}
  </div>
}

export function TerrainAreaPlan({ analysis, position, reportMode = false, compactReport = false, noteRef = '注1', reportTitle, reportLayout = false, layout, layoutCandidates, onToggleRack, fence, parcelOverlay, rackControls }) {
  const rawId = useId(), id = `terrain-plan-${rawId.replace(/:/g, '')}`
  const drawing = useMemo(() => {
    const grid = analysis?.grid
    if (!grid?.width || !grid?.height || !grid?.boundary?.length) return null
    const bounds = gridBounds(grid)
    const scale = Math.min(690 / Math.max(grid.step, bounds.east - bounds.west), 355 / Math.max(grid.step, bounds.north - bounds.south))
    const center = [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2]
    const project = ([x, y]) => [W / 2 + (x - center[0]) * scale, 218 - (y - center[1]) * scale]
    const boundaryPath = ringsOf(grid).map((ring) => pathOf(ring, project, true)).join(' ')
    const fills = Array.from({ length: COLORS.length + 1 }, () => [])
    let low = null, high = null
    for (let index = 0; index < grid.elevations.length; index++) {
      if (!grid.inside[index] || !finite(grid.elevations[index])) continue
      const [x, y] = project(coordinateAt(grid, index))
      if (!low || grid.elevations[index] < grid.elevations[low.index]) low = { index, x, y }
      if (!high || grid.elevations[index] > grid.elevations[high.index]) high = { index, x, y }
    }
    // Match the 3D surface and the layout mask: colours belong to the same
    // four-sample cells, rather than half-cell squares around single nodes.
    for (let row = 0; row < grid.height - 1; row++) for (let col = 0; col < grid.width - 1; col++) {
      const first = row * grid.width + col
      const indexes = [first, first + 1, first + grid.width + 1, first + grid.width]
      if (!indexes.every(index => finite(grid.elevations[index]))) continue
      const points = indexes.map(index => coordinateAt(grid, index))
      fills[colorIndex(getTerrainCellSlope(grid, row, col)) + 1].push(pathOf(points, project, true))
    }
    const contours = (analysis.contours || []).map(({ level, paths }) => ({
      level, major: Math.abs(level % 10) < 1e-6,
      d: (paths || []).map((points) => pathOf(points, project)).join(' '),
      labelAt: paths?.length ? project(paths.reduce((a, b) => b.length > a.length ? b : a, [])[Math.floor(paths.reduce((a, b) => b.length > a.length ? b : a, []).length / 2)] || [0, 0]) : null,
    }))
    return { grid, bounds, project, boundaryPath, fills: fills.map((paths) => paths.join(' ')), contours, low, high }
  }, [analysis])
  const parcelLabels = useMemo(() => !reportMode && parcelOverlay && drawing
    ? layoutTerrainLabels(parcelOverlay.labels.map(label => ({ ...label, screen: drawing.project(label.point) })), { left: 45, top: 45, right: 735, bottom: 410 })
    : null, [parcelOverlay, drawing, reportMode])
  if (!drawing) return <p className="terrain-area-empty">表示できる地形データがありません。</p>
  const { grid, project, boundaryPath, fills, contours, low, high, bounds } = drawing
  const localPoint = figurePoint(position, grid)
  const point = localPoint ? project(localPoint) : null
  const pointVisible = point && point[0] >= 35 && point[0] <= 765 && point[1] >= 25 && point[1] <= 413
  const partial = analysis.summary?.coveragePercent < 100 || analysis.summary?.slopeCoveragePercent < 100
  return <figure className={`terrain-area-figure${reportMode ? ' terrain-area-figure--report' : ''}`}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>参考範囲の等高線と局所勾配</title>
      <desc id={`${id}-desc`}>北を上にした図。黄色線は地形の検討範囲。{LABELS.join('、')}の五色で勾配を表示。{partial ? '斜線部分は未取得または勾配未計算です。' : ''}測量境界、施工可否の判定ではありません。</desc>
      <defs>
        <clipPath id={`${id}-clip`}><path d={boundaryPath} fillRule="evenodd" clipRule="evenodd" /></clipPath>
        <pattern id={`${id}-missing`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#eef0ed" /><path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" stroke="#aeb5af" strokeWidth="1" /></pattern>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill="#fbfcfa" />
      <path d={boundaryPath} fill={`url(#${id}-missing)`} fillRule="evenodd" />
      <g clipPath={`url(#${id}-clip)`}>
        {fills.map((d, index) => d && <path key={index} d={d} fill={index === 0 ? `url(#${id}-missing)` : COLORS[index - 1]} stroke="none" />)}
      </g>
      <g className="terrain-area-contours">
        {contours.map(({ level, major, d }) => d && <path key={level} d={d} strokeWidth={major ? 1.2 : 0.6} strokeOpacity={major ? 0.88 : 0.62} />)}
        {!reportLayout && contours.filter((entry) => {
          if(!entry.major || !entry.labelAt)return false
          if(!pointVisible)return true
          const [x,y]=entry.labelAt,width=String(entry.level).length*8+14
          return !(x+width>point[0]+4 && x<point[0]+80 && y+4>point[1]-28 && y-16<point[1]+3)
        }).slice(0, 12).map(({ level, labelAt }) => <text key={`label-${level}`} x={labelAt[0]} y={labelAt[1]}>{level}m</text>)}
      </g>
      <path d={boundaryPath} fill="none" stroke="#755a0c" strokeWidth="5.5" fillRule="evenodd" />
      <path d={boundaryPath} fill="none" stroke="#ffe073" strokeWidth="3" fillRule="evenodd" />
      {(!reportMode || reportLayout) && fence && <g className={`terrain-area-fence${reportLayout ? ' terrain-area-fence--report' : ''}`}>{fence.rails.map(rail => <path key={rail.id} data-terrain-fence="rail" d={pathOf(rail.points, project)} strokeDasharray="5 3" />)}</g>}
      {(!reportMode || reportLayout) && layout && <g clipPath={`url(#${id}-clip)`} className="terrain-area-layout-plan" data-layout-racks={layout.rackCount}>
        {layout.racks.map(rack => <g key={rack.id} role={onToggleRack ? 'button' : undefined} tabIndex={onToggleRack ? 0 : undefined} aria-label={onToggleRack ? `架台 ${rack.id} を除外` : undefined} className={onToggleRack ? 'terrain-area-plan-rack' : undefined} onClick={onToggleRack ? () => onToggleRack(rack.id) : undefined} onKeyDown={onToggleRack ? event => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); onToggleRack(rack.id) } } : undefined}>
          {rack.modules.map(module => <path key={module.id} d={pathOf(module.corners, project, true)} fill={reportLayout ? "#222" : "#315e89"} stroke="#e0edf6" strokeWidth=".55" />)}
        </g>)}
        {onToggleRack && layoutCandidates?.racks.filter(rack => !layout.racks.some(active => active.id === rack.id)).map(rack => <path key={`ghost-${rack.id}`} className="terrain-area-rack-ghost" d={pathOf(rack.corners, project, true)} role="button" tabIndex="0" aria-label={`架台 ${rack.id} を戻す`} onClick={() => onToggleRack(rack.id)} onKeyDown={event => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); onToggleRack(rack.id) } }} />)}
      </g>}
      {reportLayout && layout?.disabledRacks?.length > 0 && <g fill="none" stroke="#111" strokeWidth="1.2" strokeDasharray="5 3">{layout.disabledRacks.map(rack => <path key={rack.id} d={pathOf(rack.corners, project, true)} />)}</g>}
      {!reportMode && parcelOverlay && <g clipPath={`url(#${id}-clip)`} className="terrain-area-parcel-labels">
        {parcelOverlay.boundaries.map((boundary, index) => <path key={`${boundary.id}-${index}`} d={pathOf(boundary.points, project)} fill="none" stroke="#229da4" strokeWidth="1.5" />)}
      </g>}
      {parcelLabels && <ParcelLabels labels={parcelLabels.labels} />}
      {[low, high].filter(Boolean).map((point, index) => <g key={index} className="terrain-area-extreme">
        <circle cx={point.x} cy={point.y} r="4" fill={index ? '#9c5c30' : '#426b71'} stroke="#fff" strokeWidth="1.5" />
      </g>)}
      <g className="terrain-area-extreme-label">{reportTitle ? <text className="terrain-report-map-title" x="44" y={terrainReportTitleLines(reportTitle).length === 2 ? 16 : 24} style={{fontSize: Math.min(terrainReportTitleLines(reportTitle).length === 2 ? 14 : 19, 660 / Math.max(...terrainReportTitleLines(reportTitle).map(line=>Array.from(line).length)))}}>{terrainReportTitleLines(reportTitle).map((line,index)=><tspan key={index} x="44" dy={index ? '17' : '0'}>{line}</tspan>)}</text> : <text x="44" y="24">{terrainElevationLabel(analysis.summary)}</text>}</g>
      {pointVisible && <g className="terrain-area-selected-point" transform={`translate(${n(point[0])} ${n(point[1])})`}><circle r="5.5" fill="#197ca0" stroke="#fff" strokeWidth="2" /><text x="9" y="-8">選択地点</text></g>}
      <g transform="translate(755 49)" className="terrain-area-north"><text textAnchor="middle" y="-13">N</text><path d="M0 -5 L-6 11 L0 7 L6 11 Z" /><path d="M0 7 V27" /></g>
      <Scale project={project} bounds={bounds} />
      <text x="756" y="443" textAnchor="end" className="terrain-area-svg-note">黄色線：検討範囲{partial ? '　斜線：未取得・未計算' : ''}</text>
      <Legend analysis={analysis} />
    </svg>
    {!reportMode && rackControls}
    {parcelLabels && <ParcelLabelNote {...parcelLabels} />}
    <figcaption>{compactReport ? `${terrainElevationLabel(analysis.summary)} · 注${noteRef.replace('注','')}（最終ページ）` : <>等高線2m間隔・10mごとに太線。割合は穴・除外後の全図形面積が分母です。セル交差面積で集計し、欠測を別枠にします。色分けは施工可否の基準ではありません。{position && !pointVisible ? '選択地点は図の範囲外です。' : ''}</>}</figcaption>
  </figure>
}

function interpolateElevation(grid, x, y) {
  const col = (x - grid.xMin) / grid.step, row = (y - grid.yMin) / grid.step
  const left = Math.floor(col), bottom = Math.floor(row)
  if (left < 0 || bottom < 0 || left + 1 >= grid.width || bottom + 1 >= grid.height) return null
  const values = [grid.elevations[bottom * grid.width + left], grid.elevations[bottom * grid.width + left + 1], grid.elevations[(bottom + 1) * grid.width + left], grid.elevations[(bottom + 1) * grid.width + left + 1]]
  if (!values.every(finite)) return null
  const u = col - left, v = row - bottom
  return values[0] * (1 - u) * (1 - v) + values[1] * u * (1 - v) + values[2] * (1 - u) * v + values[3] * u * v
}

function surfaceBoundaryPoints(grid) {
  const paths = []
  for (const ring of ringsOf(grid)) {
    let current = []
    const flush = () => { if (current.length > 1) paths.push(current); current = [] }
    for (let index = 1; index < ring.length; index++) {
      const a = ring[index - 1], b = ring[index]
      const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (grid.step / 2)))
      for (let step = 0; step < count; step++) {
        const x = a[0] + (b[0] - a[0]) * step / count, y = a[1] + (b[1] - a[1]) * step / count
        const z = interpolateElevation(grid, x, y)
        if (finite(z)) current.push([x, y, z]); else flush()
      }
    }
    const last = ring.at(-1), z = last && interpolateElevation(grid, last[0], last[1])
    if (finite(z)) current.push([last[0], last[1], z])
    flush()
  }
  return paths
}

function segmentCrossesCell(a, b, west, south, east, north) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const p = [-dx, dx, -dy, dy], q = [a[0] - west, east - a[0], a[1] - south, north - a[1]]
  let start = 0, end = 1
  for (let index = 0; index < 4; index++) {
    if (Math.abs(p[index]) < 1e-12) { if (q[index] < 0) return false; continue }
    const t = q[index] / p[index]
    if (p[index] < 0) start = Math.max(start, t)
    else end = Math.min(end, t)
    if (start > end) return false
  }
  return true
}

export function TerrainArea3D({ analysis, position, reportMode = false, compactReport = false, noteRef = '注1', reportTitle, reportLayout = false, azimuth = 35, interactive = false, heightScale = 1, layout, layoutCandidates, onToggleRack, fence, parcelOverlay, rackControls }) {
  const id = `terrain-3d-${useId().replace(/:/g, '')}`
  const canRotate = interactive && !reportMode
  const initialView = normalizeTerrainView({ azimuth, pitch: 32 })
  const [view, setView] = useState(initialView)
  const [viewMode, setViewMode] = useState('rotate')
  const [displayHeightScale, setDisplayHeightScale] = useState(heightScale === 2 ? 2 : 1)
  const verticalScale = canRotate ? displayHeightScale : heightScale === 2 ? 2 : 1
  const modelHeight = canRotate ? 440 : H
  const canvasRef = useRef(null), modelRef = useRef(null), dragRef = useRef(null), frameRef = useRef(null), pendingView = useRef(null), navigationFrame = useRef(null)
  const latestView = useRef(view)
  latestView.current = view
  const releaseDrag = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.element?.hasPointerCapture?.(drag.id)) drag.element.releasePointerCapture(drag.id)
  }
  const discardFrame = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    if (navigationFrame.current !== null) cancelAnimationFrame(navigationFrame.current)
    frameRef.current = null
    navigationFrame.current = null
    pendingView.current = null
  }
  useEffect(() => {
    releaseDrag(); discardFrame(); setView(normalizeTerrainView({ azimuth, pitch: 32 })); setDisplayHeightScale(heightScale === 2 ? 2 : 1)
  }, [analysis, azimuth, canRotate, heightScale])
  useEffect(() => () => { releaseDrag(); discardFrame() }, [])
  const camera = canRotate ? view : initialView

  // Clip and lift once per analysis. Rotation changes projection only, never
  // the acquired values or the expensive boundary/hole intersections.
  const mesh = useMemo(() => {
    const grid = analysis?.grid, summary = analysis?.summary
    if (!grid?.width || !grid?.height || !finite(summary?.minElevation)) return null
    const bounds = gridBounds(grid)
    const faces = []
    const edges = ringsOf(grid).flatMap((ring) => ring.slice(1).map((point, index) => [ring[index], point]))
    for (let row = 0; row < grid.height - 1; row++) for (let col = 0; col < grid.width - 1; col++) {
      const first = row * grid.width + col
      const indexes = [first, first + 1, first + grid.width + 1, first + grid.width]
      // NoData is never filled. Boundary cells are clipped exactly, including sub-grid holes.
      if (!indexes.every((index) => finite(grid.elevations[index]))) continue
      const points = indexes.map((index) => [...coordinateAt(grid, index), grid.elevations[index]])
      const [west, south] = points[0], east = points[1][0], north = points[2][1]
      const boundaryCell = edges.some(([a, b]) => segmentCrossesCell(a, b, west, south, east, north))
      if (!boundaryCell && !indexes.every((index) => grid.inside[index])) continue
      const slope = getTerrainCellSlope(grid, row, col)
      const category = colorIndex(slope)
      const surface = boundaryCell ? polygonClipping.intersection(grid.boundary, [[...points.map(([x,y]) => [x,y]), [west,south]]]) : [[points.map(([x,y]) => [x,y])]]
      const lift = ([x,y]) => {
        const u = (x - west) / grid.step, v = (y - south) / grid.step
        const z = points[0][2] * (1-u) * (1-v) + points[1][2] * u * (1-v) + points[2][2] * u * v + points[3][2] * (1-u) * v
        return [x,y,z]
      }
      for (const polygon of surface) {
        if (!polygon.length || polygon[0].length < 3) continue
        const lifted = polygon.map((ring) => ring.map(lift))
        const centroid = lifted[0].reduce((sum, point) => sum.map((value, axis) => value + point[axis] / lifted[0].length), [0,0,0])
        faces.push({ rings: lifted, centroid, normal: surfaceNormal(lifted[0]), kind: 'surface', color: category < 0 ? '#d9dfd7' : COLORS[category] })
      }
    }
    const outlines = surfaceBoundaryPoints(grid)
    // The cut base is illustrative. It changes neither elevations nor statistics,
    // and stays below even interpolated boundary vertices, including flat terrain.
    let minimum = summary.minElevation, maximum = summary.maxElevation
    for (const face of faces) for (const ring of face.rings) for (const point of ring) {
      minimum = Math.min(minimum, point[2]); maximum = Math.max(maximum, point[2])
    }
    const base = Math.floor((minimum - 5) / 5) * 5
    const { walls, floorFaces } = buildTerrainSolid(faces, base)
    return { grid, bounds, base, maximum, faces, walls, floorFaces, outlines }
  }, [analysis])
  const drawing = useMemo(() => {
    if (!mesh) return null
    const modules = (!reportMode || reportLayout) && layout ? layout.racks.flatMap(rack => rack.modules.map(module => ({ rings: [module.corners], centroid: module.corners.reduce((sum, point) => sum.map((value, axis) => value + point[axis] / 4), [0,0,0]), normal: surfaceNormal(module.corners), kind: 'module', color: '#315e89' }))) : []
    const maximum = [...(!reportMode && layoutCandidates ? layoutCandidates.racks.flatMap(rack => rack.corners) : modules.flatMap(face => face.rings[0])), ...((!reportMode || reportLayout) && fence ? fence.posts.map(post => post.top) : [])].reduce((max, point) => Math.max(max, point[2]), mesh.maximum)
    const projection = createTerrainProjection({ bounds: mesh.bounds, base: mesh.base, maxElevation: maximum, ...camera, heightScale: verticalScale })
    const faces = [...mesh.floorFaces, ...mesh.walls, ...mesh.faces, ...modules].map((face, index) => {
      let color = face.color
      if (face.kind === 'floor') color = '#b2bcb4'
      if (face.kind === 'wall') {
        const a = face.rings[0][0], b = face.rings[0][1]
        const normal = face.normal || [b[1] - a[1], a[0] - b[0], 0]
        const length = Math.hypot(normal[0], normal[1]) || 1
        const light = .5 + .5 * (normal[0] * -.6 + normal[1] * .8) / length
        const shade = Math.round(139 + 35 * light)
        color = `rgb(${shade}, ${shade + 8}, ${shade + 2})`
      }
      return { ...face, color, index, visible: terrainFaceVisible(face.normal, camera, verticalScale), depth: projection.transform(face.centroid)[2] }
    }).sort((a,b) => a.depth - b.depth)
    return { ...mesh, ...projection, faces, faceCount: mesh.faces.length, outlinePaths: mesh.outlines.map(points => pathOf(points, projection.project)) }
  }, [mesh, camera.azimuth, camera.pitch, camera.zoom, verticalScale, layout, layoutCandidates, fence, reportMode, reportLayout])
  const projectedFence = useMemo(() => {
    if ((reportMode && !reportLayout) || !fence || !drawing) return null
    const visible = createTerrainOverlayVisibility(drawing.faces.filter(face => face.kind !== 'module'), drawing)
    return { posts: fence.posts.filter(post => visible([post.base[0],post.base[1],post.base[2]+.1])), rails: fence.rails.flatMap(rail => visibleTerrainLineParts(rail.points, visible)) }
  }, [fence, drawing, reportMode, reportLayout])
  const projectedRacks = useMemo(() => {
    if (!canRotate || !onToggleRack || !layoutCandidates || !drawing) return []
    const visible = createTerrainOverlayVisibility(drawing.faces.filter(face => face.kind !== 'module'), drawing, { requireSurface: false })
    const active = new Set(layout?.racks.map(rack => rack.id))
    return layoutCandidates.racks.map(rack => {
      const center = rack.corners.reduce((sum, point) => sum.map((value, axis) => value + point[axis] / rack.corners.length), [0,0,0])
      const ground = interpolateElevation(drawing.grid, center[0], center[1])
      // The selectable object is the rigid panel plane, which may remain in
      // view above terrain that hides the ground underneath. Module faces stay
      // out of this occlusion mask so the roof does not cover its own control.
      return { id: rack.id, active: active.has(rack.id), polygon: rack.corners.map(drawing.project), depth: drawing.transform(center)[2], visible: center.every(finite) && finite(ground) && pointInTerrainBoundary(center, drawing.grid.boundary) && visible(center) && terrainFaceVisible(surfaceNormal(rack.corners), camera, verticalScale) }
    }).filter(rack => rack.visible).sort((a,b) => a.depth - b.depth)
  }, [layoutCandidates, layout, drawing, canRotate, onToggleRack, camera.azimuth, camera.pitch, verticalScale])
  const projectedParcels = useMemo(() => {
    if (reportMode || !parcelOverlay || !drawing) return null
    // Parcel numbers are annotations, so reference panels must not erase them.
    // Terrain, walls and the current camera still determine visibility.
    const visible = createTerrainOverlayVisibility(drawing.faces.filter(face => face.kind !== 'module'), drawing)
    const lines = parcelOverlay.boundaries.flatMap(boundary => visibleTerrainLineParts(boundary.points.map(([x,y,z]) => [x,y,z+.06]), visible))
    const labels = [], hidden = []
    for (const label of parcelOverlay.labels) {
      const point = [label.point[0], label.point[1], label.point[2]+.08]
      if (!visible(point)) { hidden.push(label); continue }
      labels.push({ ...label, screen: drawing.project(point) })
    }
    return { lines, ...layoutTerrainLabels(labels), hidden }
  }, [parcelOverlay, drawing, reportMode])

  // Keep a single raster surface in the interactive view. Each clipped polygon
  // is filled separately, so overlap never cancels holes by compound evenodd.
  useEffect(() => {
    if (!canRotate || !drawing || !canvasRef.current) return
    const canvas = canvasRef.current, ratio = Math.min(2, window.devicePixelRatio || 1)
    const width = Math.round(W * ratio), height = Math.round(modelHeight * ratio)
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0,0,W,modelHeight)
    context.save(); context.beginPath(); context.rect(25,35,750,395); context.clip()
    const trace = rings => {
      context.beginPath()
      for (const ring of rings) { ring.forEach((p,index) => { const [x,y] = drawing.project(p); if (index) context.lineTo(x,y); else context.moveTo(x,y) }); context.closePath() }
    }
    for (const face of drawing.faces) {
      if (!face.visible) continue
      trace(face.rings); context.fillStyle = face.color; context.fill('evenodd'); context.strokeStyle = face.kind === 'module' ? '#dce9f3' : face.color; context.lineWidth = face.kind === 'module' ? .55 : .35; context.lineJoin = 'round'; context.stroke()
    }
    context.restore()
  }, [drawing, canRotate, modelHeight])

  const queueView = next => {
    pendingView.current = next
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => { frameRef.current = null; const nextView = pendingView.current; pendingView.current = null; if (nextView) { latestView.current = nextView; setView(nextView) } })
  }
  const pointerDown = event => {
    if (!canRotate || dragRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return
    const rect = modelRef.current?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return
    discardFrame()
    dragRef.current = { id: event.pointerId, element: event.currentTarget, x: event.clientX, y: event.clientY, view: latestView.current, mode: viewMode, width: rect.width, height: rect.height, left: rect.left, top: rect.top, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.ownerSVGElement?.focus({ preventScroll: true })
  }
  const pointerMove = event => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) drag.moved = true
    if (!drag.moved) return
    const dx = (event.clientX - drag.x) / drag.width, dy = (event.clientY - drag.y) / drag.height
    queueView(drag.mode === 'orbit' ? orbitTerrainView(drag.view, dx, dy) : dragTerrainView(drag.view, dx, dy))
  }
  const pointerEnd = event => {
    if (dragRef.current?.id !== event.pointerId) return
    const drag = dragRef.current
    const next = pendingView.current
    releaseDrag(); discardFrame()
    if (next) { latestView.current = next; setView(next) }
    if (event.type === 'pointerup' && !drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 5 && onToggleRack) {
      const screen = [event.clientX - drag.left, event.clientY - drag.top]
      const cssRacks = projectedRacks.map(rack => ({ ...rack, polygon: rack.polygon.map(([x,y]) => [(x-25)/750*drag.width, (y-35)/395*drag.height]) }))
      const rackId = hitTestTerrainRack(screen, cssRacks)
      if (rackId) onToggleRack(rackId)
    }
  }
  const keyDown = event => {
    if (!canRotate || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','+','=','-'].includes(event.key)) return
    event.preventDefault(); releaseDrag(); discardFrame()
    const current = latestView.current
    const next = event.key === 'Home' ? initialView : ['+','=','-'].includes(event.key) ? zoomTerrainView(current, event.key === '-' ? 1/1.2 : 1.2) : stepTerrainView(current,viewMode,event.key)
    latestView.current = next; setView(next)
  }
  const moveView = (mode,key) => { releaseDrag(); discardFrame(); setViewMode(mode); const next=stepTerrainView(latestView.current,mode,key); latestView.current=next; setView(next) }
  const resetView = () => { releaseDrag(); discardFrame(); latestView.current = initialView; setView(initialView) }
  const selectDirection = direction => {
    releaseDrag(); discardFrame()
    const from = latestView.current, to = terrainNavigationTarget(direction, from, initialView)
    const apply = next => { latestView.current = next; setView(next) }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(to); return }
    const started = performance.now()
    const animate = time => {
      const progress = Math.min(1, (time - started) / 280)
      apply(interpolateTerrainNavigation(from, to, progress))
      navigationFrame.current = progress < 1 ? requestAnimationFrame(animate) : null
    }
    navigationFrame.current = requestAnimationFrame(animate)
  }
  const changeViewMode = mode => { releaseDrag(); discardFrame(); setViewMode(mode) }
  const changeHeightScale = scale => { releaseDrag(); discardFrame(); setDisplayHeightScale(scale) }
  const zoomView = factor => { releaseDrag(); discardFrame(); const next = zoomTerrainView(latestView.current, factor); latestView.current = next; setView(next) }
  useEffect(() => {
    const target = modelRef.current
    if (!canRotate || !drawing || !target) return
    const wheel = event => {
      event.preventDefault()
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? H : 1)
      if (!finite(pixels) || pixels === 0) return
      releaseDrag(); discardFrame()
      const next = zoomTerrainView(latestView.current, Math.exp(-Math.max(-200, Math.min(200, pixels)) * .002))
      latestView.current = next; setView(next)
    }
    target.addEventListener('wheel', wheel, { passive: false })
    return () => target.removeEventListener('wheel', wheel)
  }, [canRotate, Boolean(drawing)])
  if (!drawing) return <p className="terrain-area-empty">3D表示に必要な標高がありません。</p>
  const { grid, bounds, base, project, faces, outlinePaths } = drawing
  const localPoint = figurePoint(position, grid), pointZ = localPoint && interpolateElevation(grid, localPoint[0], localPoint[1])
  const point = finite(pointZ) && localPoint ? project([...localPoint, pointZ]) : null
  const tickStep = Math.max(5, Math.ceil((analysis.summary.maxElevation - base) / 3 / 5) * 5)
  const axisX = bounds.west, axisY = bounds.south
  const ticks = Array.from({ length: 4 }, (_, index) => base + index * tickStep).filter((z) => {
    if(z > analysis.summary.maxElevation + tickStep)return false
    const [x,y]=project([axisX,axisY,z])
    return x>=82&&x<=770&&y>=49&&y<=426
  })
  const north = project([(bounds.west + bounds.east) / 2, bounds.north, base]), south = project([(bounds.west + bounds.east) / 2, bounds.south, base]), east = project([bounds.east, (bounds.south + bounds.north) / 2, base]), west = project([bounds.west, (bounds.south + bounds.north) / 2, base])
  return <figure className={`terrain-area-figure${reportMode ? ' terrain-area-figure--report' : ''}${canRotate ? ' terrain-area-figure--interactive' : ''}`}>
    <div className={`terrain-area-model${canRotate ? ' terrain-area-model--navigation' : ''}`}>
    {canRotate && <TerrainViewNavigation view={camera} onSelect={selectDirection} controls={<>
      <div className="terrain-area-camera-modes" role="group" aria-label="ドラッグの操作"><button type="button" aria-pressed={viewMode==='rotate'} onClick={()=>changeViewMode('rotate')}>回転</button><button type="button" aria-pressed={viewMode==='orbit'} onClick={()=>changeViewMode('orbit')}>視点の移動</button></div>
      <div className="terrain-navigation-rotate" role="group" aria-label="左右に回転"><button type="button" aria-label="地形を左へ回転" title="左へ回転" onClick={()=>moveView('rotate','ArrowLeft')}>↶ 左</button><button type="button" aria-label="地形を右へ回転" title="右へ回転" onClick={()=>moveView('rotate','ArrowRight')}>右 ↷</button></div>
      <div role="group" aria-label="中心を固定して視点を移動">{[['ArrowLeft','←','視点を左へ回す'],['ArrowUp','↑','見下ろしを増やす'],['ArrowDown','↓','見下ろしを減らす'],['ArrowRight','→','視点を右へ回す']].map(([key,label,name])=><button key={key} type="button" aria-label={name} title={name} onClick={()=>moveView('orbit',key)}>{label}</button>)}</div>
      <div className="terrain-area-camera-zoom" role="group" aria-label="3Dの拡大縮小"><button type="button" aria-label="3Dを縮小" disabled={camera.zoom<=.65} onClick={()=>zoomView(1/1.2)}>−</button><span>{camera.zoom.toFixed(1)}×</span><button type="button" aria-label="3Dを拡大" disabled={camera.zoom>=2.5} onClick={()=>zoomView(1.2)}>＋</button><button type="button" className="terrain-navigation-home" aria-label="最初の視点に戻す" title="最初の視点" onClick={resetView}><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8v10h-6v-7H9v7H3Z" /></svg></button></div>
      <div className="terrain-navigation-height" role="group" aria-label="3Dの高さ表示"><button type="button" aria-pressed={verticalScale === 2} aria-describedby={`${id}-height`} onClick={() => changeHeightScale(verticalScale === 2 ? 1 : 2)}>高さ2倍</button><span aria-hidden="true">{verticalScale === 2 ? '1:2' : '1:1'}</span></div>
    </>} />}
    <div className="terrain-area-stage">
    {canRotate && <canvas ref={canvasRef} aria-hidden="true" className="terrain-area-surface" />}
    <svg viewBox={`0 0 ${W} ${modelHeight}`} data-height-scale={verticalScale} data-view-azimuth={camera.azimuth} data-view-pitch={camera.pitch} data-view-zoom={camera.zoom} data-layout-modules={(!reportMode || reportLayout) && layout ? layout.moduleCount : 0} role={canRotate ? 'group' : 'img'} tabIndex={canRotate ? 0 : undefined} aria-roledescription={canRotate ? '地形の周囲を回って見られる立体図' : undefined} aria-labelledby={`${id}-title ${id}-desc`} aria-describedby={canRotate ? `${id}-controls` : undefined} onKeyDown={keyDown}>
      <title id={`${id}-title`}>参考範囲の実DEM地形3D</title>
      <desc id={`${id}-desc`}>等高線図と同じ標高データ・参考範囲を用いた立体図。{verticalScale === 2 ? '横1：縦2の高さ強調表示。標高・勾配の数値と色は実DEMのままです。' : '高さ強調なし、縦横同尺度。'}黄色線は地表に沿う対象範囲。側面・底面は表示用で、地層・土量を示しません。樹木、建物、擁壁、造成後の形状は含みません。欠測や除外の部分を面で埋めません。</desc>
      {!canRotate && <rect width={W} height={H} fill="#fbfcfa" />}
      <defs><clipPath id={`${id}-viewport`}><rect x="25" y="35" width="750" height="395" /></clipPath></defs>
      <text x="44" y="25" className="terrain-area-svg-caption">実DEM地形　{verticalScale === 2 ? '高さ2倍（横1：縦2）' : '高さ強調なし（1:1）'}</text>
      <text x="756" y="25" textAnchor="end" className="terrain-area-svg-note">視点：北から時計回り{Math.round(camera.azimuth)}°{canRotate ? ` ／ 見下ろし${Math.round(camera.pitch)}°` : ''}</text>
      <g clipPath={`url(#${id}-viewport)`}>
      <g className="terrain-area-3d-axis">
        <path d={pathOf([[axisX, axisY, base], [axisX, axisY, ticks.at(-1) || base + 5]], project)} />
        {ticks.map((z) => { const p = project([axisX, axisY, z]); return <g key={z}><path d={`M${p[0] - 3} ${p[1]}h6`} /><text x={p[0] - 7} y={p[1] + 4} textAnchor="end">{z}m</text></g> })}
      </g>
      {!canRotate && <g>{faces.map(({ rings, color, index, kind, visible }) => <path key={index} data-terrain-face={kind} display={visible ? undefined : 'none'} d={rings.map(ring => pathOf(ring, project, true)).join(' ')} fill={color} fillRule="evenodd" stroke={color} strokeWidth="0.35" strokeLinejoin="round" />)}</g>}
      <g fill="none" strokeLinejoin="round" strokeLinecap="round">{outlinePaths.map((d, index) => <g key={index}><path d={d} stroke="#765b10" strokeWidth="4.5" /><path d={d} stroke="#ffe073" strokeWidth="2.4" /></g>)}</g>
      {projectedFence && <g className={`terrain-area-fence${reportLayout ? ' terrain-area-fence--report' : ''}`}>{projectedFence.rails.map((points,index) => <path key={`rail-${index}`} data-terrain-fence="rail" d={pathOf(points,project)} />)}{projectedFence.posts.map(post => <path key={post.id} data-terrain-fence="post" d={pathOf([post.base,post.top],project)} />)}</g>}
      {projectedRacks.length > 0 && <g className="terrain-area-rack-controls">{projectedRacks.map(rack => <path key={rack.id} data-terrain-rack={rack.id} data-rack-active={rack.active} d={pathOf(rack.polygon, point => point, true)} className={rack.active ? 'terrain-area-rack-control' : 'terrain-area-rack-ghost'} role="button" tabIndex="0" aria-label={`架台 ${rack.id} を${rack.active ? '除外' : '戻す'}`} onKeyDown={event => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); onToggleRack(rack.id) } }} />)}</g>}
      {projectedParcels && <g className="terrain-area-parcel-labels">
        {projectedParcels.lines.map((points, index) => <path key={index} d={pathOf(points, project)} fill="none" stroke="#229da4" strokeWidth="1.5" />)}
        <ParcelLabels labels={projectedParcels.labels} />
      </g>}
      {point && point[0] > 25 && point[0] < 770 && point[1] > 32 && point[1] < 430 && <g transform={`translate(${point[0]} ${point[1]})`} className="terrain-area-selected-point"><circle r="5" fill="#197ca0" stroke="#fff" strokeWidth="2" /><text x="9" y="-8">選択地点</text></g>}
      <g className="terrain-area-3d-cardinals">{[['N', north], ['S', south], ['E', east], ['W', west]].map(([label, p]) => <text key={label} x={p[0]} y={p[1] + (label === 'N' ? -9 : 18)} textAnchor="middle">{label}</text>)}</g>
      </g>
      {!canRotate && <><text x="44" y="443" className="terrain-area-svg-note">{compactReport ? `${noteRef}（最終ページ）` : '地表面と黄色線は同じ標高データ。樹木・建物・造成後の形状は含みません。'}</text><Legend analysis={analysis} /></>}
      {canRotate && <rect ref={modelRef} className="terrain-area-drag-target" x="25" y="35" width="750" height="395" fill="transparent" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd} />}
    </svg>
    </div>
    </div>
    {projectedParcels && <ParcelLabelNote {...projectedParcels} />}
    {canRotate && <><p className="parcel-sr-only" id={`${id}-height`}>{verticalScale === 2 ? 'オン：横1：縦2の強調表示。' : 'オフ：縦横同尺度（1:1）。'}標高・勾配の数値と色は変わりません。</p><p className="parcel-sr-only" id={`${id}-controls`}>{viewMode === 'orbit' ? '地形の中心を固定。左右で周囲を回り、上へドラッグで見下ろす。' : 'ドラッグで回転。'}ホイールで拡大・縮小。矢印キーも使えます。</p></>}
    {canRotate && rackControls}
    {canRotate && <SlopeDistribution analysis={analysis} />}
    {(!canRotate || !drawing.faceCount) && <figcaption>{compactReport ? `実DEM地形 · 1:1 · ${noteRef}（最終ページ）` : <>{drawing.faceCount ? '地表面と黄色線は同じDEM。樹木・建物・造成後の形状は含みません。側面・底面は表示用で、地層・土量を示しません。' : '連続した地表面を描ける標高点が不足しています。'} {!canRotate ? '面積は有効範囲と勾配取得率からの概算。' : ''} {analysis.summary?.coveragePercent < 100 ? '未取得部分の面は表示していません。' : ''}</>}</figcaption>}
  </figure>
}
