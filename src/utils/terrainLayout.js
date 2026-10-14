import polygonClipping from 'polygon-clipping'

const finite = Number.isFinite
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const EPS = 1e-7
const MAX_GRID_NODES = 45000
const MAX_GREEN_RUNS = 4000
const clock = () => globalThis.performance?.now?.() ?? Date.now()
const DEFAULTS = Object.freeze({ rows: 4, minColumns: 4, maxColumns: 8, moduleWidthM: 2.384, moduleHeightM: 1.303,
  modulePowerW: 720, moduleGapM: .02, tiltDeg: 15, slopeLimitDeg: 10, rackGapM: 1, rowGapM: 3.3, setbackM: 1,
  azimuthDeg: 180, minClearanceM: .8, maxRacks: 200, maxCandidates: 12000, scanOffsetUM: 0, scanOffsetVM: 0 })

const option = (options, key, min, max, integer = false) => {
  const value = finite(options?.[key]) ? options[key] : DEFAULTS[key]
  return clamp(integer ? Math.floor(value) : value, min, max)
}

export function normalizeTerrainLayoutOptions(options = {}) {
  const minColumns = option(options, 'minColumns', 4, 8, true)
  const azimuth = finite(options?.azimuthDeg) ? options.azimuthDeg : DEFAULTS.azimuthDeg
  const normalized = {
    // Latest layout direction is FOUR ROWS, with four through eight columns.
    // Old columns/minRows/maxRows were unsaved preview options, not a schema;
    // deliberately ignore them rather than silently retaining the old mapping.
    rows: 4, minColumns,
    maxColumns: Math.max(minColumns, option(options, 'maxColumns', 4, 8, true)),
    moduleWidthM: option(options, 'moduleWidthM', .2, 4), moduleHeightM: option(options, 'moduleHeightM', .2, 4),
    // The current reference preset is 720 W. A different electrical preset must
    // be introduced together with its actual dimensions, not a W-only override.
    modulePowerW: 720, moduleGapM: option(options, 'moduleGapM', 0, .5),
    tiltDeg: option(options, 'tiltDeg', 0, 60),
    // Only the offered reference thresholds are valid. Missing/old preview
    // settings keep the original below-10-degree condition.
    slopeLimitDeg: [10, 15, 20].includes(options?.slopeLimitDeg) ? options.slopeLimitDeg : DEFAULTS.slopeLimitDeg,
    rackGapM: option(options, 'rackGapM', 0, 30),
    rowGapM: option(options, 'rowGapM', 0, 30), setbackM: option(options, 'setbackM', 0, 30),
    azimuthDeg: ((azimuth % 360) + 360) % 360, minClearanceM: option(options, 'minClearanceM', .05, 5),
    maxRacks: option(options, 'maxRacks', 1, 200, true), maxCandidates: option(options, 'maxCandidates', 1, 12000, true),
  }
  const width = normalized.maxColumns * normalized.moduleWidthM + (normalized.maxColumns - 1) * normalized.moduleGapM
  const depth = (normalized.rows * normalized.moduleHeightM + (normalized.rows - 1) * normalized.moduleGapM) * Math.cos(normalized.tiltDeg * Math.PI / 180)
  return { ...normalized, scanOffsetUM: option(options, 'scanOffsetUM', 0, width + normalized.rackGapM),
    scanOffsetVM: option(options, 'scanOffsetVM', 0, depth + normalized.rowGapM) }
}

// Shared with the terrain renderer: four finite DEM heights AND four finite
// slopes, averaged per surface cell. The renderer's green category stays below
// 10°; layout eligibility applies the selected strict threshold to this mean.
export function getTerrainCellSlope(grid, row, col) {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= grid?.height - 1 || col >= grid?.width - 1) return null
  const index = row * grid.width + col
  const indexes = [index, index + 1, index + grid.width + 1, index + grid.width]
  if (!indexes.every(i => finite(grid.elevations?.[i]) && finite(grid.slopes?.[i]))) return null
  return indexes.reduce((sum, i) => sum + grid.slopes[i], 0) / 4
}

export function estimateTerrainLayoutAc(dcKw) {
  if (!finite(dcKw) || dcKw <= 0) return { acKw: 0, acRangeKw: [0, 0], acTargetKw: 0, acStepKw: 10 }
  const acTargetKw = dcKw / 1.5, acStepKw = acTargetKw <= 100 ? 10 : 50
  const standard = value => Math.max(10, value)
  return { acKw: standard(Math.round(acTargetKw / acStepKw) * acStepKw),
    acRangeKw: [standard(Math.floor(acTargetKw / acStepKw) * acStepKw), standard(Math.ceil(acTargetKw / acStepKw) * acStepKw)],
    acTargetKw, acStepKw }
}

function ringArea(ring) {
  if (ring.length < 3) return 0
  const [ox, oy] = ring[0]
  return Math.abs(ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length]
    return sum + (p[0] - ox) * (q[1] - oy) - (q[0] - ox) * (p[1] - oy)
  }, 0)) / 2
}
const polygonArea = polygons => polygons.reduce((sum, polygon) => sum + ringArea(polygon[0]) - polygon.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0), 0)
const rectangle = (west, south, east, north) => [[west, south], [east, south], [east, north], [west, north], [west, south]]
const boundsOf = points => ({ west: Math.min(...points.map(p => p[0])), east: Math.max(...points.map(p => p[0])),
  south: Math.min(...points.map(p => p[1])), north: Math.max(...points.map(p => p[1])) })

// Positive-area intersection of an oriented rectangle and a grid cell. Shared
// edges have no area and must not count the next NoData cell as occupied.
function overlapsCell(ring, west, south, east, north) {
  const a = ring.slice(0, 4), b = rectangle(west, south, east, north).slice(0, 4)
  const first = [a[1][0] - a[0][0], a[1][1] - a[0][1]], second = [a[3][0] - a[0][0], a[3][1] - a[0][1]]
  for (const vector of [[1, 0], [0, 1], first, second]) {
    const length = Math.hypot(...vector), axis = vector.map(value => value / length)
    const pa = a.map(p => p[0] * axis[0] + p[1] * axis[1]), pb = b.map(p => p[0] * axis[0] + p[1] * axis[1])
    if (Math.max(...pa) <= Math.min(...pb) + EPS || Math.max(...pb) <= Math.min(...pa) + EPS) return false
  }
  return true
}

function cellsUnder(grid, ring) {
  const bounds = boundsOf(ring), step = grid.step
  const firstCol = Math.max(0, Math.floor((bounds.west - grid.xMin) / step))
  const lastCol = Math.min(grid.width - 2, Math.ceil((bounds.east - grid.xMin) / step) - 1)
  const firstRow = Math.max(0, Math.floor((bounds.south - grid.yMin) / step))
  const lastRow = Math.min(grid.height - 2, Math.ceil((bounds.north - grid.yMin) / step) - 1)
  const cells = []
  for (let row = firstRow; row <= lastRow; row++) for (let col = firstCol; col <= lastCol; col++) {
    const west = grid.xMin + col * step, south = grid.yMin + row * step
    if (overlapsCell(ring, west, south, west + step, south + step)) cells.push({ row, col })
  }
  return cells
}

function rigidRack(grid, options, u, v, columns, axes, number) {
  const rows = options.rows
  const tilt = options.tiltDeg * Math.PI / 180, cos = Math.cos(tilt), sin = Math.sin(tilt)
  const width = columns * options.moduleWidthM + (columns - 1) * options.moduleGapM
  const length = rows * options.moduleHeightM + (rows - 1) * options.moduleGapM
  const xy = (x, y) => [x * axes[0][0] + y * axes[1][0], x * axes[0][1] + y * axes[1][1]]
  const footprint = rectangle(u, v, u + width, v + length * cos).map(p => xy(...p))
  let terrainMinM = Infinity, terrainMaxM = -Infinity
  for (const { row, col } of cellsUnder(grid, footprint)) {
    const index = row * grid.width + col
    for (const i of [index, index + 1, index + grid.width, index + grid.width + 1]) {
      terrainMinM = Math.min(terrainMinM, grid.elevations[i]); terrainMaxM = Math.max(terrainMaxM, grid.elevations[i])
    }
  }
  if (!finite(terrainMinM) || !finite(terrainMaxM)) return null
  // A single reference plane for the whole rack: panels never bend to the DEM.
  // Cell corner maxima conservatively bound bilinear terrain even at rotated
  // edges. This is a clearance assumption, not a foundation/earthworks design.
  const baseElevationM = terrainMaxM + options.minClearanceM
  const xyz = (x, along) => [...xy(u + x, v + along * cos), baseElevationM + along * sin]
  const id = `R${String(number).padStart(3, '0')}`, modules = []
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const x = col * (options.moduleWidthM + options.moduleGapM), along = row * (options.moduleHeightM + options.moduleGapM)
    modules.push({ id: `${id}-${row + 1}-${col + 1}`, corners: [xyz(x, along), xyz(x + options.moduleWidthM, along),
      xyz(x + options.moduleWidthM, along + options.moduleHeightM), xyz(x, along + options.moduleHeightM)] })
  }
  return { id, columns, rows, footprint, corners: [xyz(0, 0), xyz(width, 0), xyz(width, length), xyz(0, length)],
    widthM: width, depthM: length * cos, moduleCount: modules.length, modules, baseElevationM, terrainMinM, terrainMaxM,
    supportHeightRangeM: [options.minClearanceM, baseElevationM + length * sin - terrainMinM] }
}

export function buildTerrainLayout(analysis, inputOptions = {}) {
  const options = normalizeTerrainLayoutOptions(inputOptions), racks = [], warnings = []
  const stats = { greenCellCount: 0, greenRunCount: 0, candidateCount: 0, boundaryChecks: 0, capped: false,
    cappedBy: [], eligibleAreaCalculated: false, placedFootprintAreaM2: 0, slopeLimitDeg: options.slopeLimitDeg, acRatio: 1.5, acRounding: 'nearest; ties upward; positive minimum 10kW' }
  let eligibleAreaM2 = 0
  const finish = () => {
    const moduleCount = racks.reduce((sum, rack) => sum + rack.moduleCount, 0), dcKw = Math.round(moduleCount * options.modulePowerW) / 1000
    const capacity = estimateTerrainLayoutAc(dcKw)
    if (dcKw > 0 && capacity.acTargetKw < 10) warnings.push('AC換算が10kW未満のため標準表示の下限10kWです。実際のPCS容量を示しません。')
    if (racks.length) warnings.push('DEM上の概略配置です。支持高さ・基礎・造成・接道・離隔・冬季影は未設計です。')
    return { racks, rackCount: racks.length, moduleCount, dcKw, acKw: capacity.acKw, acRangeKw: capacity.acRangeKw,
      acTargetKw: capacity.acTargetKw, eligibleAreaM2, warnings, stats: { ...stats, acStepKw: capacity.acStepKw }, options }
  }
  const cap = (kind, message) => { stats.capped = true; stats.cappedBy.push(kind); warnings.push(message) }
  const timedOut = () => {
    if (!finite(inputOptions?.__deadlineAtMs) || clock() < inputOptions.__deadlineAtMs) return false
    if (!stats.cappedBy.includes('time')) cap('time', '計算時間の上限に達しました。表示された配置は途中結果です。')
    return true
  }
  const grid = analysis?.grid
  if (!grid || !Number.isInteger(grid.width) || !Number.isInteger(grid.height) || grid.width < 2 || grid.height < 2 ||
    !finite(grid.step) || grid.step <= 0 || !finite(grid.xMin) || !finite(grid.yMin) ||
    !Array.isArray(grid.elevations) || !Array.isArray(grid.slopes) || grid.elevations.length !== grid.width * grid.height ||
    grid.slopes.length !== grid.width * grid.height || !Array.isArray(grid.boundary) || !grid.boundary.length) {
    warnings.push('配置に必要な有効範囲とDEM格子がありません。地形を取得してください。'); return finish()
  }
  if (grid.width * grid.height > MAX_GRID_NODES) { cap('grid', 'DEM格子の上限45,000点を超えました。範囲を分けてください。'); return finish() }
  if (timedOut()) return finish()
  const angle = (180 - options.azimuthDeg) * Math.PI / 180, axes = [[Math.cos(angle), Math.sin(angle)], [-Math.sin(angle), Math.cos(angle)]]
  const uv = p => [p[0] * axes[0][0] + p[1] * axes[0][1], p[0] * axes[1][0] + p[1] * axes[1][1]]
  const xy = p => [p[0] * axes[0][0] + p[1] * axes[1][0], p[0] * axes[0][1] + p[1] * axes[1][1]]
  const green = new Uint8Array((grid.width - 1) * (grid.height - 1)), runs = []
  for (let row = 0; row < grid.height - 1; row++) {
    if (timedOut()) return finish()
    let start = -1
    for (let col = 0; col <= grid.width - 1; col++) {
      const slope = col < grid.width - 1 ? getTerrainCellSlope(grid, row, col) : null
      const valid = finite(slope) && slope >= 0 && slope < options.slopeLimitDeg
      if (valid) { green[row * (grid.width - 1) + col] = 1; stats.greenCellCount++; if (start < 0) start = col }
      if (!valid && start >= 0) {
        runs.push(rectangle(grid.xMin + start * grid.step, grid.yMin + row * grid.step, grid.xMin + col * grid.step, grid.yMin + (row + 1) * grid.step)); start = -1
        stats.greenRunCount = runs.length
        if (runs.length > MAX_GREEN_RUNS) { cap('green-runs', '勾配区分が複雑なため配置計算の上限に達しました。範囲を小さくしてください。'); return finish() }
      }
    }
  }
  stats.greenRunCount = runs.length
  let bounds = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity }
  try {
    // Runs have disjoint interiors, so their clipped areas add without an
    // expensive union. These are selected eligible cells clipped to the site.
    for (const run of runs) {
      if (timedOut()) return finish()
      const clipped = polygonClipping.intersection([run], grid.boundary)
      eligibleAreaM2 += polygonArea(clipped)
      for (const polygon of clipped) for (const ring of polygon) for (const p of ring) {
        const [u, v] = uv(p); bounds.west = Math.min(bounds.west, u); bounds.east = Math.max(bounds.east, u)
        bounds.south = Math.min(bounds.south, v); bounds.north = Math.max(bounds.north, v)
      }
    }
  } catch { warnings.push('有効範囲の形状を確認できません。範囲を確認して再取得してください。'); eligibleAreaM2 = 0; return finish() }
  stats.eligibleAreaCalculated = true
  if (!(eligibleAreaM2 > EPS)) { warnings.push(`局所勾配${options.slopeLimitDeg}°未満の配置候補範囲がありません。`); return finish() }
  const width = columns => columns * options.moduleWidthM + (columns - 1) * options.moduleGapM
  const cos = Math.cos(options.tiltDeg * Math.PI / 180)
  const depth = (options.rows * options.moduleHeightM + (options.rows - 1) * options.moduleGapM) * cos
  const gridBounds = { west: grid.xMin, south: grid.yMin, east: grid.xMin + (grid.width - 1) * grid.step, north: grid.yMin + (grid.height - 1) * grid.step }
  const fits = envelope => {
    const box = boundsOf(envelope)
    if (box.west < gridBounds.west - EPS || box.east > gridBounds.east + EPS || box.south < gridBounds.south - EPS || box.north > gridBounds.north + EPS) return false
    if (cellsUnder(grid, envelope).some(({ row, col }) => !green[row * (grid.width - 1) + col])) return false
    stats.boundaryChecks++
    return polygonArea(polygonClipping.difference([envelope], grid.boundary)) <= EPS
  }
  let stopped = false
  try {
    for (let v = bounds.south + options.setbackM + options.scanOffsetVM; v + depth <= bounds.north - options.setbackM + EPS && !stopped; v += depth + options.rowGapM) {
      for (let u = bounds.west + options.setbackM + options.scanOffsetUM; u + width(options.minColumns) <= bounds.east - options.setbackM + EPS && !stopped;) {
        let advanceWidth = width(options.minColumns)
        for (let columns = options.maxColumns; columns >= options.minColumns; columns--) {
          const candidateWidth = width(columns)
          if (u + candidateWidth > bounds.east - options.setbackM + EPS) continue
          if (timedOut()) { stopped = true; break }
          if (stats.candidateCount >= options.maxCandidates) { cap('candidates', '配置候補の確認上限に達しました。表示された配置は途中結果です。'); stopped = true; break }
          stats.candidateCount++
          const envelope = rectangle(u - options.setbackM, v - options.setbackM, u + candidateWidth + options.setbackM, v + depth + options.setbackM).map(xy)
          if (!fits(envelope)) continue
          const rack = rigidRack(grid, options, u, v, columns, axes, racks.length + 1)
          if (!rack) continue
          racks.push(rack); advanceWidth = rack.widthM; stats.placedFootprintAreaM2 += rack.widthM * rack.depthM
          if (racks.length >= options.maxRacks) { cap('racks', '架台数の上限に達しました。表示された配置は途中結果です。'); stopped = true }
          break
        }
        u += advanceWidth + options.rackGapM
      }
    }
  } catch { warnings.push('配置の形状確認を中止しました。表示された配置は途中結果です。'); stats.capped = true; stats.cappedBy.push('geometry') }
  if (!racks.length) warnings.push('指定寸法・離隔で架台全体が収まる配置はありません。条件と範囲を確認してください。')
  return finish()
}

// A bounded comparison near the chosen bearing (south by default), not a shadow simulation or
// proof of an optimal/constructible design. Keep the best valid fixed pool so
// subsequent quantity controls can remove and restore the exact same racks.
export function buildAutomaticTerrainLayout(analysis, inputOptions = {}) {
  return compareTerrainLayouts(analysis, inputOptions, false, null)
}

// Same racks and geometric checks as the standard search, with a finer bearing
// and start-phase comparison. The optional baseline must refer to this exact
// analysis and matching placement conditions; it is never edited or discarded
// just because the extra search times out.
export function buildOptimizedTerrainLayout(analysis, inputOptions = {}, baseline = null) {
  return compareTerrainLayouts(analysis, inputOptions, true, compatibleBaseline(analysis, normalizeTerrainLayoutOptions(inputOptions), baseline))
}

// North=0 clockwise: 180 is the module's south-facing front. Fix azimuth
// alone, retaining vertical tilt and every spacing/terrain condition.
export function buildSouthTerrainLayout(analysis, inputOptions = {}, baseline = null) {
  const options={...inputOptions,azimuthDeg:180}
  const previous=baseline?.options?.azimuthDeg===180?compatibleBaseline(analysis,normalizeTerrainLayoutOptions(options),baseline):null
  return compareTerrainLayouts(analysis,options,true,previous,'south-fixed')
}

function compatibleBaseline(analysis, options, baseline) {
  if (!baseline || baseline.analysisReference !== analysis || !baseline.options || !baseline.stats ||
    !Array.isArray(baseline.stats.cappedBy) || !Array.isArray(baseline.warnings) || !Array.isArray(baseline.racks) ||
    baseline.rackCount !== baseline.racks.length || baseline.racks.length > options.maxRacks || !Number.isSafeInteger(baseline.moduleCount)) return null
  const previous = normalizeTerrainLayoutOptions(baseline.options)
  const keys = ['rows', 'minColumns', 'maxColumns', 'moduleWidthM', 'moduleHeightM', 'modulePowerW', 'moduleGapM',
    'tiltDeg', 'slopeLimitDeg', 'rackGapM', 'rowGapM', 'setbackM', 'minClearanceM', 'maxRacks']
  // Auto results store the winning bearing/phase, rather than the requested
  // base. A per-trial candidate budget is not a placement-condition change.
  const bearing = baseline.stats?.autoSearch?.baseAzimuthDeg ?? previous.azimuthDeg
  if (bearing !== options.azimuthDeg || keys.some(key => previous[key] !== options[key])) return null
  if (!baseline.racks.every(rack => rack.rows === 4 && rack.columns >= options.minColumns && rack.columns <= options.maxColumns &&
    Array.isArray(rack.modules) && rack.moduleCount === rack.modules.length && rack.moduleCount === rack.rows * rack.columns &&
    finite(rack.supportHeightRangeM?.[1]))) return null
  if (baseline.moduleCount !== baseline.racks.reduce((sum, rack) => sum + rack.moduleCount, 0)) return null
  return baseline
}

function compareTerrainLayouts(analysis, inputOptions, optimized, baseline, mode) {
  const options = normalizeTerrainLayoutOptions(inputOptions), started = clock()
  const limit = (key, fallback, max) => clamp(finite(inputOptions?.[key]) ? Math.floor(inputOptions[key]) : fallback, 0, max)
  const trialCap = optimized ? 32 : 12, candidateCap = optimized ? 24000 : 12000, timeCap = optimized ? 8000 : 5000
  const maxTrials = Math.max(1, limit('autoMaxTrials', trialCap, trialCap)), maxCandidates = Math.max(1, limit('autoMaxCandidates', candidateCap, candidateCap))
  const timeLimitMs = limit('autoTimeLimitMs', timeCap, timeCap), deadline = started + timeLimitMs
  const angles = mode==='south-fixed'?[0]:optimized ? [0, -7.5, 7.5, -15, 15, -22.5, 22.5, -30, 30] : [0, -15, 15, -30, 30]
  const trials = [], initial = angles.map(delta => ({ azimuthDeg: (options.azimuthDeg + delta + 360) % 360, scanOffsetUM: mode==='south-fixed'?options.scanOffsetUM:0, scanOffsetVM: mode==='south-fixed'?options.scanOffsetVM:0 }))
  let totalCandidates = 0, best = baseline, timeLimited = false, candidateLimited = false
  const bearingDistance = azimuth => Math.abs(((azimuth - options.azimuthDeg + 540) % 360) - 180)
  const supportScore = layout => layout.moduleCount ? layout.racks.reduce((sum, rack) => sum + Math.max(0, rack.supportHeightRangeM[1] - 2) * rack.moduleCount, 0) / layout.moduleCount : Infinity
  const compare = (a, b) => b.moduleCount - a.moduleCount || supportScore(a) - supportScore(b) || bearingDistance(a.options.azimuthDeg) - bearingDistance(b.options.azimuthDeg)
  const runTrial = placement => {
    if (trials.length >= maxTrials) return false
    if (clock() >= deadline) { timeLimited = true; return false }
    if (totalCandidates >= maxCandidates) { candidateLimited = true; return false }
    // Allocate a bounded share to each reference rather than letting the first
    // orientation consume the whole search. No trial can exceed the total cap.
    const budget = Math.min(options.maxCandidates, Math.max(1, Math.floor(maxCandidates / maxTrials)), maxCandidates - totalCandidates)
    const layout = buildTerrainLayout(analysis, { ...options, ...placement, maxCandidates: budget, __deadlineAtMs: deadline })
    totalCandidates += layout.stats.candidateCount
    trials.push(layout)
    if (!best || compare(layout, best) < 0) best = layout
    if (layout.stats.cappedBy.includes('time') || clock() >= deadline) timeLimited = true
    return !timeLimited
  }
  for (const placement of initial) if (!runTrial(placement)) break
  if (!timeLimited && trials.length < maxTrials) {
    const leaders = [...trials].sort(compare)
    const width = options.maxColumns * options.moduleWidthM + (options.maxColumns - 1) * options.moduleGapM
    const depth = (options.rows * options.moduleHeightM + (options.rows - 1) * options.moduleGapM) * Math.cos(options.tiltDeg * Math.PI / 180)
    const phases = mode==='south-fixed'?[0,.2,.4,.6,.8].flatMap(u=>[0,1/6,2/6,3/6,4/6,5/6].map(v=>[u,v])):optimized ? [[.25, 0], [.5, 0], [.75, 0], [0, .25], [0, .5], [0, .75], [.25, .25], [.5, .5], [.75, .75]]
      : [[.5, 0], [0, .5], [.5, .5]]
    const offsets = phases.map(([u, v]) => [(width + options.rackGapM) * u, (depth + options.rowGapM) * v])
    outer: for (const leader of leaders.slice(0, 3)) {
      for (const [scanOffsetUM, scanOffsetVM] of offsets) {
        if (!runTrial({ azimuthDeg: leader.options.azimuthDeg, scanOffsetUM, scanOffsetVM })) break outer
      }
    }
  }
  // An immediate timeout still returns a typed result and an explicit reason.
  if (!best) best = buildTerrainLayout(analysis, { ...options, __deadlineAtMs: deadline })
  if (totalCandidates >= maxCandidates && trials.some(layout => layout.stats.cappedBy.includes('candidates'))) candidateLimited = true
  const warnings = [...best.warnings]
  if(mode==='south-fixed')warnings.push('真南180°固定。確認した開始位置候補内の最多配置であり、数学的な全域最大の保証ではありません。')
  const cappedBy = [...best.stats.cappedBy]
  if (timeLimited && !cappedBy.includes('time')) { cappedBy.push('time'); warnings.push('自動比較の時間上限に達しました。確認できた候補案だけを表示しています。') }
  if (candidateLimited && !cappedBy.includes('auto-candidates')) { cappedBy.push('auto-candidates'); warnings.push('自動比較の候補確認上限に達しました。確認できた候補案だけを表示しています。') }
  const elapsedMs = Math.round(clock() - started)
  return { ...best, auto: true, warnings: [...new Set(warnings)], stats: { ...best.stats,
    capped: best.stats.capped || timeLimited || candidateLimited, cappedBy,
    autoSearch: { mode: mode || (optimized ? 'optimized' : 'standard'), trials: trials.length, totalCandidates, maxTrials, maxCandidates, timeLimitMs, elapsedMs, timeLimited, candidateLimited,
      baselineModuleCount: baseline?.moduleCount ?? null, baselineRetained: Boolean(baseline && best === baseline),
      baseAzimuthDeg: options.azimuthDeg, selectedAzimuthDeg: best.options.azimuthDeg, selectedOffsetUM: best.options.scanOffsetUM, selectedOffsetVM: best.options.scanOffsetVM,
      candidates: trials.map(layout => ({ azimuthDeg: layout.options.azimuthDeg, scanOffsetUM: layout.options.scanOffsetUM,
        scanOffsetVM: layout.options.scanOffsetVM, moduleCount: layout.moduleCount, rackCount: layout.rackCount,
        candidateCount: layout.stats.candidateCount, cappedBy: layout.stats.cappedBy })) } } }
}
