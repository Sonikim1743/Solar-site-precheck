import { useEffect, useId, useMemo, useRef, useState } from 'react'
import polygonClipping from 'polygon-clipping'
import { terrainPointToLocal } from '../utils/terrainArea.js'
import { createTerrainProjection, dragTerrainView, normalizeTerrainView, orbitTerrainView, zoomTerrainView, terrainFaceVisible } from '../utils/terrainView.js'
import { buildTerrainSolid } from '../utils/terrainSolid.js'
import { terrainSlopeDistribution, formatTerrainSlopeArea } from '../utils/terrainSlopeDistribution.js'
import './terrain-area.css'

const COLORS = ['#cfe3cd', '#efe8ad', '#eabd8d', '#df9d9b']
const LABELS = ['0–10°未満', '10–20°未満', '20–30°未満', '30°以上']
const W = 800, H = 520
const finite = Number.isFinite
const colorIndex = (slope) => !finite(slope) ? -1 : slope < 10 ? 0 : slope < 20 ? 1 : slope < 30 ? 2 : 3
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

const slopeShare = (summary, index) => {
  const bin = summary?.slopeBins?.find(bin => bin.min === index * 10 && bin.max === (index === 3 ? 90 : (index + 1) * 10))
  return finite(bin?.percent) ? `${bin.percent.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}%` : '未計算'
}

function Legend({ y = 469, summary }) {
  const distribution = terrainSlopeDistribution(summary)
  return <g className="terrain-area-svg-legend" transform={`translate(60 ${y})`}>
    {LABELS.map((label, index) => <g key={label} transform={`translate(${index * 173} 0)`}>
      <rect width="27" height="14" y="-12" fill={COLORS[index]} stroke="#8b918b" strokeWidth="0.4" />
      <text x="35" y="0">{label}</text>
      <text x="35" y="25" className="terrain-area-svg-share">{slopeShare(summary, index)}</text>
      <text x="35" y="44" className="terrain-area-svg-area">{formatTerrainSlopeArea(distribution.bins[index].areaM2)}</text>
    </g>)}
  </g>
}

function SlopeDistribution({ summary }) {
  const distribution = terrainSlopeDistribution(summary)
  return <div className="terrain-area-slope-distribution">
    <table><caption>10m幅で見た局所勾配 <span>割合・推定面積</span><span className="terrain-area-distribution-total">有効範囲 {formatTerrainSlopeArea(distribution.totalAreaM2)}（除外後）</span></caption>
      <thead><tr>{LABELS.map((label, index) => <th key={label} scope="col"><i style={{ background: COLORS[index] }} />{label}</th>)}</tr></thead>
      <tbody><tr>{LABELS.map((label, index) => <td key={label}><span>{slopeShare(summary, index)}</span><small>{formatTerrainSlopeArea(distribution.bins[index].areaM2)}</small></td>)}</tr></tbody>
    </table>
    {distribution.unknownAreaM2 > 0 && <p className="terrain-area-distribution-unknown">勾配未確認 {formatTerrainSlopeArea(distribution.unknownAreaM2)}</p>}
    <p>割合は範囲内で勾配を計算できた格子点の分布です。面積は有効範囲と取得率からの概算。色と数値は実際のDEMによる参考値で、施工可否の基準ではありません。</p>
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

export function TerrainAreaPlan({ analysis, position, reportMode = false }) {
  const rawId = useId(), id = `terrain-plan-${rawId.replace(/:/g, '')}`
  const drawing = useMemo(() => {
    const grid = analysis?.grid
    if (!grid?.width || !grid?.height || !grid?.boundary?.length) return null
    const bounds = gridBounds(grid)
    const scale = Math.min(690 / Math.max(grid.step, bounds.east - bounds.west), 355 / Math.max(grid.step, bounds.north - bounds.south))
    const center = [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2]
    const project = ([x, y]) => [W / 2 + (x - center[0]) * scale, 218 - (y - center[1]) * scale]
    const boundaryPath = ringsOf(grid).map((ring) => pathOf(ring, project, true)).join(' ')
    const fills = Array.from({ length: 5 }, () => [])
    let low = null, high = null
    const cell = grid.step * scale
    for (let index = 0; index < grid.elevations.length; index++) {
      if (!grid.inside[index] || !finite(grid.elevations[index])) continue
      const [x, y] = project(coordinateAt(grid, index))
      const category = colorIndex(grid.slopes[index])
      fills[category + 1].push(`M${n(x - cell / 2)} ${n(y - cell / 2)}h${n(cell)}v${n(cell)}h-${n(cell)}Z`)
      if (!low || grid.elevations[index] < grid.elevations[low.index]) low = { index, x, y }
      if (!high || grid.elevations[index] > grid.elevations[high.index]) high = { index, x, y }
    }
    const contours = (analysis.contours || []).map(({ level, paths }) => ({
      level, major: Math.abs(level % 10) < 1e-6,
      d: (paths || []).map((points) => pathOf(points, project)).join(' '),
      labelAt: paths?.length ? project(paths.reduce((a, b) => b.length > a.length ? b : a, [])[Math.floor(paths.reduce((a, b) => b.length > a.length ? b : a, []).length / 2)] || [0, 0]) : null,
    }))
    return { grid, bounds, project, boundaryPath, fills: fills.map((paths) => paths.join(' ')), contours, low, high }
  }, [analysis])
  if (!drawing) return <p className="terrain-area-empty">表示できる地形データがありません。</p>
  const { grid, project, boundaryPath, fills, contours, low, high, bounds } = drawing
  const localPoint = figurePoint(position, grid)
  const point = localPoint ? project(localPoint) : null
  const pointVisible = point && point[0] >= 35 && point[0] <= 765 && point[1] >= 25 && point[1] <= 413
  const partial = analysis.summary?.coveragePercent < 100 || analysis.summary?.slopeCoveragePercent < 100
  return <figure className={`terrain-area-figure${reportMode ? ' terrain-area-figure--report' : ''}`}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>参考範囲の等高線と局所勾配</title>
      <desc id={`${id}-desc`}>北を上にした図。黄色線は地形の検討範囲。{LABELS.join('、')}の四色で勾配を表示。{partial ? '斜線部分は未取得または勾配未計算です。' : ''}測量境界、施工可否の判定ではありません。</desc>
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
        {contours.filter((entry) => entry.major && entry.labelAt).slice(0, 12).map(({ level, labelAt }) => <text key={`label-${level}`} x={labelAt[0]} y={labelAt[1]}>{level}m</text>)}
      </g>
      <path d={boundaryPath} fill="none" stroke="#755a0c" strokeWidth="5.5" fillRule="evenodd" />
      <path d={boundaryPath} fill="none" stroke="#ffe073" strokeWidth="3" fillRule="evenodd" />
      {[low, high].filter(Boolean).map((point, index) => <g key={index} className="terrain-area-extreme">
        <circle cx={point.x} cy={point.y} r="4" fill={index ? '#9c5c30' : '#426b71'} stroke="#fff" strokeWidth="1.5" />
      </g>)}
      <g className="terrain-area-extreme-label"><text x="44" y="24">DEM標高　低い側 {finite(analysis.summary?.minElevation) ? analysis.summary.minElevation.toFixed(1) : '—'}m ／ 高い側 {finite(analysis.summary?.maxElevation) ? analysis.summary.maxElevation.toFixed(1) : '—'}m</text></g>
      {pointVisible && <g className="terrain-area-selected-point" transform={`translate(${n(point[0])} ${n(point[1])})`}><circle r="5.5" fill="#197ca0" stroke="#fff" strokeWidth="2" /><text x="9" y="-8">選択地点</text></g>}
      <g transform="translate(755 49)" className="terrain-area-north"><text textAnchor="middle" y="-13">N</text><path d="M0 -5 L-6 11 L0 7 L6 11 Z" /><path d="M0 7 V27" /></g>
      <Scale project={project} bounds={bounds} />
      <text x="756" y="443" textAnchor="end" className="terrain-area-svg-note">黄色線：地形の検討範囲{partial ? '　斜線：未取得・未計算' : ''}</text>
      <Legend summary={analysis.summary} />
    </svg>
    <figcaption>等高線2m間隔・10mごとに太線。割合は勾配を計算できた範囲内の格子点が分母です。面積は有効範囲と勾配取得率からの概算。色分けは施工可否の基準ではありません。{position && !pointVisible ? '選択地点は図の範囲外です。' : ''}</figcaption>
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

export function TerrainArea3D({ analysis, position, reportMode = false, azimuth = 35, interactive = false, heightScale = 1 }) {
  const id = `terrain-3d-${useId().replace(/:/g, '')}`
  const canRotate = interactive && !reportMode
  const initialView = normalizeTerrainView({ azimuth, pitch: 32 })
  const [view, setView] = useState(initialView)
  const [viewMode, setViewMode] = useState('rotate')
  const [displayHeightScale, setDisplayHeightScale] = useState(heightScale === 2 ? 2 : 1)
  const verticalScale = canRotate ? displayHeightScale : heightScale === 2 ? 2 : 1
  const modelHeight = canRotate ? 440 : H
  const canvasRef = useRef(null), modelRef = useRef(null), dragRef = useRef(null), frameRef = useRef(null), pendingView = useRef(null)
  const latestView = useRef(view)
  latestView.current = view
  const releaseDrag = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.element?.hasPointerCapture?.(drag.id)) drag.element.releasePointerCapture(drag.id)
  }
  const discardFrame = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
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
      const slopes = indexes.map((index) => grid.slopes[index]).filter(finite)
      const slope = slopes.length === 4 ? slopes.reduce((sum, value) => sum + value, 0) / slopes.length : null
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
    const projection = createTerrainProjection({ bounds: mesh.bounds, base: mesh.base, maxElevation: mesh.maximum, ...camera, heightScale: verticalScale })
    const faces = [...mesh.floorFaces, ...mesh.walls, ...mesh.faces].map((face, index) => {
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
  }, [mesh, camera.azimuth, camera.pitch, camera.zoom, verticalScale])

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
      trace(face.rings); context.fillStyle = face.color; context.fill('evenodd'); context.strokeStyle = face.color; context.lineWidth = .35; context.lineJoin = 'round'; context.stroke()
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
    dragRef.current = { id: event.pointerId, element: event.currentTarget, x: event.clientX, y: event.clientY, view: latestView.current, mode: viewMode, width: rect.width, height: rect.height }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.ownerSVGElement?.focus({ preventScroll: true })
  }
  const pointerMove = event => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    const dx = (event.clientX - drag.x) / drag.width, dy = (event.clientY - drag.y) / drag.height
    queueView(drag.mode === 'orbit' ? orbitTerrainView(drag.view, dx, dy) : dragTerrainView(drag.view, dx, dy))
  }
  const pointerEnd = event => {
    if (dragRef.current?.id !== event.pointerId) return
    const next = pendingView.current
    releaseDrag(); discardFrame()
    if (next) { latestView.current = next; setView(next) }
  }
  const keyDown = event => {
    if (!canRotate || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','+','=','-'].includes(event.key)) return
    event.preventDefault(); releaseDrag(); discardFrame()
    const current = latestView.current
    const next = event.key === 'Home' ? initialView : ['+','=','-'].includes(event.key) ? zoomTerrainView(current, event.key === '-' ? 1/1.2 : 1.2) : viewMode === 'orbit' ? orbitTerrainView(current, event.key === 'ArrowLeft' ? -10 / 180 : event.key === 'ArrowRight' ? 10 / 180 : 0, event.key === 'ArrowUp' ? -5 / 90 : event.key === 'ArrowDown' ? 5 / 90 : 0) : normalizeTerrainView({ ...current, azimuth: current.azimuth + (event.key === 'ArrowLeft' ? 10 : event.key === 'ArrowRight' ? -10 : 0), pitch: current.pitch + (event.key === 'ArrowDown' ? 5 : event.key === 'ArrowUp' ? -5 : 0) })
    latestView.current = next; setView(next)
  }
  const resetView = () => { releaseDrag(); discardFrame(); latestView.current = initialView; setView(initialView) }
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
  const ticks = Array.from({ length: 4 }, (_, index) => base + index * tickStep).filter((z) => z <= analysis.summary.maxElevation + tickStep)
  const axisX = bounds.west, axisY = bounds.south
  const north = project([(bounds.west + bounds.east) / 2, bounds.north, base]), south = project([(bounds.west + bounds.east) / 2, bounds.south, base]), east = project([bounds.east, (bounds.south + bounds.north) / 2, base]), west = project([bounds.west, (bounds.south + bounds.north) / 2, base])
  return <figure className={`terrain-area-figure${reportMode ? ' terrain-area-figure--report' : ''}${canRotate ? ' terrain-area-figure--interactive' : ''}`}>
    {canRotate && <div className="terrain-area-height-controls" role="group" aria-label="3Dの高さ表示">
      <span>高さ表示</span><button type="button" aria-pressed={verticalScale === 1} onClick={() => changeHeightScale(1)}>実寸 1:1</button><button type="button" aria-pressed={verticalScale === 2} onClick={() => changeHeightScale(2)}>高さ2倍 1:2</button>
      <p>{verticalScale === 2 ? '横1：縦2の強調表示。標高・勾配の数値は変わりません。' : '縦横同尺度。実際の高低差のバランスを確認。'}</p>
    </div>}
    <div className="terrain-area-model">
    {canRotate && <canvas ref={canvasRef} aria-hidden="true" className="terrain-area-surface" />}
    <svg viewBox={`0 0 ${W} ${modelHeight}`} data-height-scale={verticalScale} data-view-azimuth={camera.azimuth} data-view-pitch={camera.pitch} role={canRotate ? 'group' : 'img'} tabIndex={canRotate ? 0 : undefined} aria-roledescription={canRotate ? '地形の周囲を回って見られる立体図' : undefined} aria-labelledby={`${id}-title ${id}-desc`} aria-describedby={canRotate ? `${id}-controls` : undefined} onKeyDown={keyDown}>
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
      {point && point[0] > 25 && point[0] < 770 && point[1] > 32 && point[1] < 430 && <g transform={`translate(${point[0]} ${point[1]})`} className="terrain-area-selected-point"><circle r="5" fill="#197ca0" stroke="#fff" strokeWidth="2" /><text x="9" y="-8">選択地点</text></g>}
      <g className="terrain-area-3d-cardinals">{[['N', north], ['S', south], ['E', east], ['W', west]].map(([label, p]) => <text key={label} x={p[0]} y={p[1] + (label === 'N' ? -9 : 18)} textAnchor="middle">{label}</text>)}</g>
      </g>
      {!canRotate && <><text x="44" y="443" className="terrain-area-svg-note">地表面と黄色線は同じ標高データ。樹木・建物・造成後の形状は含みません。</text><Legend summary={analysis.summary} /></>}
      {canRotate && <rect ref={modelRef} className="terrain-area-drag-target" x="25" y="35" width="750" height="395" fill="transparent" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd} />}
    </svg>
    </div>
    {canRotate && <div className="terrain-area-rotation-controls">
      <div className="terrain-area-camera-modes" role="group" aria-label="3Dの操作"><button type="button" aria-pressed={viewMode === 'rotate'} onClick={() => changeViewMode('rotate')}>回転</button><button type="button" aria-pressed={viewMode === 'orbit'} onClick={() => changeViewMode('orbit')}>視点の移動</button></div>
      <p id={`${id}-controls`}>{viewMode === 'orbit' ? '地形の中心を固定。左右で周囲を回り、上へドラッグで見下ろす。' : 'ドラッグで回転。'}ホイールで拡大・縮小。矢印キーも使えます。</p>
      <div className="terrain-area-camera-zoom" role="group" aria-label="3Dの拡大縮小"><button type="button" aria-label="3Dを縮小" disabled={camera.zoom <= .65} onClick={() => zoomView(1/1.2)}>−</button><span>{camera.zoom.toFixed(1)}×</span><button type="button" aria-label="3Dを拡大" disabled={camera.zoom >= 2.5} onClick={() => zoomView(1.2)}>＋</button></div>
      <button type="button" className="terrain-area-quiet-button" onClick={resetView}>最初の視点</button>
    </div>}
    {canRotate && <SlopeDistribution summary={analysis.summary} />}
    <figcaption>{drawing.faceCount ? '地表面と黄色線は同じDEM。樹木・建物・造成後の形状は含みません。側面・底面は表示用で、地層・土量を示しません。' : '連続した地表面を描ける標高点が不足しています。'} {!canRotate ? '面積は有効範囲と勾配取得率からの概算。' : ''} {analysis.summary?.coveragePercent < 100 ? '未取得部分の面は表示していません。' : ''}</figcaption>
  </figure>
}
