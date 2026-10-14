import test from 'node:test'
import assert from 'node:assert/strict'
import polygonClipping from 'polygon-clipping'
import { buildTerrainLayout, buildAutomaticTerrainLayout, buildOptimizedTerrainLayout, getTerrainCellSlope, normalizeTerrainLayoutOptions, estimateTerrainLayoutAc } from '../src/utils/terrainLayout.js'

// Local-metre synthetic terrain only. No actual land, parcel or downloaded DEM.
const ring = (west, south, east, north) => [[west, south], [east, south], [east, north], [west, north], [west, south]]
const close = (actual, expected, epsilon = 1e-7) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)
const area = polygons => polygons.reduce((sum, polygon) => sum + polygon.reduce((a, r, i) => {
  const value = Math.abs(r.slice(0, -1).reduce((total, p, index) => total + p[0] * r[index + 1][1] - r[index + 1][0] * p[1], 0)) / 2
  return a + (i ? -value : value)
}, 0), 0)

function fixture({ width = 100, height = width, step = 5, slope = 0, elevation = (x, y) => 100 + .01 * x + .02 * y, holes = [] } = {}) {
  const cols = width / step + 1, rows = height / step + 1
  return { grid: { width: cols, height: rows, step, xMin: 0, yMin: 0,
    boundary: [[ring(0, 0, width, height), ...holes]],
    elevations: Array.from({ length: cols * rows }, (_, i) => elevation(i % cols * step, Math.floor(i / cols) * step)),
    slopes: Array.from({ length: cols * rows }, (_, i) => typeof slope === 'function' ? slope(i % cols, Math.floor(i / cols)) : slope),
  } }
}

function expandedFootprint(rack, setback) {
  const [a, b, , d] = rack.footprint, u = b.map((value, i) => (value - a[i]) / rack.widthM), v = d.map((value, i) => (value - a[i]) / rack.depthM)
  const p = (x, y) => a.map((value, i) => value + u[i] * x + v[i] * y)
  return [p(-setback, -setback), p(rack.widthM + setback, -setback), p(rack.widthM + setback, rack.depthM + setback), p(-setback, rack.depthM + setback), p(-setback, -setback)]
}

test('defaults expose the landscape 720W preset and normalize bounded editable layout conditions', () => {
  const options = normalizeTerrainLayoutOptions()
  assert.equal(options.rows, 4); assert.equal(options.minColumns, 4); assert.equal(options.maxColumns, 8)
  assert.equal(options.moduleWidthM, 2.384); assert.equal(options.moduleHeightM, 1.303); assert.equal(options.modulePowerW, 720)
  assert.equal(options.moduleGapM, .02); assert.equal(options.tiltDeg, 15); assert.equal(options.slopeLimitDeg, 10)
  assert.equal(options.rackGapM, 1); assert.equal(options.rowGapM, 3.3); assert.equal(options.setbackM, 1); assert.equal(options.azimuthDeg, 180)
  const bounded = normalizeTerrainLayoutOptions({ minColumns: 8, maxColumns: 4, tiltDeg: 100, setbackM: -2, maxRacks: Infinity, maxCandidates: 1e9, azimuthDeg: -180, modulePowerW: 655 })
  assert.equal(bounded.maxColumns, 8); assert.equal(bounded.tiltDeg, 60); assert.equal(bounded.setbackM, 0)
  assert.equal(bounded.maxRacks, 200); assert.equal(bounded.maxCandidates, 12000); assert.equal(bounded.azimuthDeg, 180); assert.equal(bounded.modulePowerW, 720)
})

test('green criterion is the average of four finite slope and DEM values with a strict 10-degree boundary', () => {
  const analysis = fixture({ width: 20, step: 20 }), grid = analysis.grid
  grid.slopes = [0, 0, 0, 40]
  assert.equal(getTerrainCellSlope(grid, 0, 0), 10)
  assert.equal(buildTerrainLayout(analysis).rackCount, 0)
  grid.slopes[3] = 39.996
  close(getTerrainCellSlope(grid, 0, 0), 9.999)
  assert.ok(buildTerrainLayout(analysis).rackCount > 0)
  grid.elevations[0] = null
  assert.equal(getTerrainCellSlope(grid, 0, 0), null)
  grid.elevations[0] = 100; grid.slopes[0] = NaN
  assert.equal(getTerrainCellSlope(grid, 0, 0), null)
  for (const [row, col] of [[-1, 0], [0, -1], [1, 0], [0, 1], [0.5, 0]]) assert.equal(getTerrainCellSlope(grid, row, col), null)
})

test('layout slope limits accept only the three offered numeric thresholds and retain the old default', () => {
  for (const slopeLimitDeg of [10, 15, 20]) assert.equal(normalizeTerrainLayoutOptions({ slopeLimitDeg }).slopeLimitDeg, slopeLimitDeg)
  for (const slopeLimitDeg of [undefined, null, NaN, Infinity, -1, 0, 12, 15.1, 21, '15', '20', true, {}, []]) {
    assert.equal(normalizeTerrainLayoutOptions({ slopeLimitDeg }).slopeLimitDeg, 10)
  }
  assert.equal(normalizeTerrainLayoutOptions({ columns: 8, minRows: 8 }).slopeLimitDeg, 10)
  const analysis = fixture({ width: 35, height: 30, slope: 12 })
  assert.equal(buildTerrainLayout(analysis).moduleCount, 0, 'old options do not silently admit steeper terrain')
})

test('selected 10, 15 and 20-degree limits admit 12 and 17-degree fields only below that limit', () => {
  for (const slope of [12, 17]) for (const slopeLimitDeg of [10, 15, 20]) {
    const layout = buildTerrainLayout(fixture({ width: 35, height: 30, slope }), { slopeLimitDeg })
    assert.equal(layout.options.slopeLimitDeg, slopeLimitDeg)
    assert.equal(layout.stats.slopeLimitDeg, slopeLimitDeg)
    if (slope < slopeLimitDeg) {
      assert.ok(layout.rackCount > 0, `${slope}° should be eligible below ${slopeLimitDeg}°`)
      close(layout.eligibleAreaM2, 1050)
    } else {
      assert.equal(layout.rackCount, 0)
      assert.equal(layout.eligibleAreaM2, 0)
      assert.ok(layout.warnings.some(warning => warning.includes(`${slopeLimitDeg}°未満`)))
    }
  }
})

test('each offered threshold remains strictly below the four-corner mean, not a single corner', () => {
  for (const slopeLimitDeg of [10, 15, 20]) {
    const analysis = fixture({ width: 20, step: 20 })
    analysis.grid.slopes = [0, 0, 0, slopeLimitDeg * 4]
    assert.equal(getTerrainCellSlope(analysis.grid, 0, 0), slopeLimitDeg)
    assert.equal(buildTerrainLayout(analysis, { slopeLimitDeg }).rackCount, 0, 'the exact limit is excluded')
    analysis.grid.slopes[3] -= .004
    const below = buildTerrainLayout(analysis, { slopeLimitDeg })
    assert.ok(below.rackCount > 0, 'a mean just below the limit remains eligible even with one steep corner')
    close(getTerrainCellSlope(analysis.grid, 0, 0), slopeLimitDeg - .001)
  }
})

test('raised slope thresholds still reject NoData and preserve full-footprint, setback and hole exclusion', () => {
  for (const slopeLimitDeg of [15, 20]) for (const missingField of ['elevations', 'slopes']) {
    const hole = ring(10, 10, 15, 15), noData = ring(20, 20, 30, 30)
    const analysis = fixture({ width: 40, slope: 12, holes: [hole] })
    analysis.grid[missingField][5 * analysis.grid.width + 5] = null
    const layout = buildTerrainLayout(analysis, { slopeLimitDeg })
    assert.ok(layout.rackCount > 0)
    close(layout.eligibleAreaM2, 1475)
    for (const rack of layout.racks) {
      const envelope = expandedFootprint(rack, 1)
      close(area(polygonClipping.difference([envelope], analysis.grid.boundary)), 0)
      close(area(polygonClipping.intersection([envelope], [hole])), 0)
      close(area(polygonClipping.intersection([envelope], [noData])), 0)
    }
  }
})

test('automatic comparison carries the chosen slope limit through every reference and timeout result', () => {
  const analysis = fixture({ width: 35, height: 30, slope: 17 })
  const accepted = buildAutomaticTerrainLayout(analysis, { slopeLimitDeg: 20, autoMaxTrials: 6 })
  assert.equal(accepted.options.slopeLimitDeg, 20)
  assert.equal(accepted.stats.slopeLimitDeg, 20)
  assert.equal(accepted.stats.autoSearch.trials, 6)
  assert.ok(accepted.stats.autoSearch.candidates.every(candidate => candidate.moduleCount > 0), 'all tested bearings/offsets retain the chosen condition')
  assert.ok(accepted.rackCount > 0)
  const rejected = buildAutomaticTerrainLayout(analysis, { slopeLimitDeg: 15, autoMaxTrials: 6 })
  assert.equal(rejected.moduleCount, 0)
  assert.equal(rejected.stats.slopeLimitDeg, 15)
  assert.ok(rejected.stats.autoSearch.candidates.every(candidate => candidate.moduleCount === 0))
  const timedOut = buildAutomaticTerrainLayout(analysis, { slopeLimitDeg: 20, autoTimeLimitMs: 0 })
  assert.equal(timedOut.options.slopeLimitDeg, 20)
  assert.equal(timedOut.stats.slopeLimitDeg, 20)
  assert.equal(timedOut.stats.autoSearch.trials, 0)
})

test('each full rack and its setback remain in the usable boundary and outside exclusion holes', () => {
  const holes = [ring(40, 40, 60, 60), ring(5, 5, 6, 6)], analysis = fixture({ holes })
  const original = structuredClone(analysis), layout = buildTerrainLayout(analysis)
  assert.ok(layout.rackCount > 0)
  assert.equal(layout.stats.eligibleAreaCalculated, true)
  close(layout.eligibleAreaM2, 9599)
  for (const rack of layout.racks) {
    assert.deepEqual(rack.footprint[0], rack.footprint.at(-1))
    close(area(polygonClipping.difference([rack.footprint], analysis.grid.boundary)), 0)
    close(area(polygonClipping.difference([expandedFootprint(rack, 1)], analysis.grid.boundary)), 0)
    for (const hole of holes) close(area(polygonClipping.intersection([rack.footprint], [hole])), 0)
  }
  for (let i = 0; i < layout.racks.length; i++) for (let j = i + 1; j < layout.racks.length; j++) {
    close(area(polygonClipping.intersection([layout.racks[i].footprint], [layout.racks[j].footprint])), 0)
  }
  assert.deepEqual(analysis, original)
})

test('NoData removes the four surrounding surface cells and never hosts a rack', () => {
  const analysis = fixture(), grid = analysis.grid, col = 4, row = 4
  grid.elevations[row * grid.width + col] = null
  const layout = buildTerrainLayout(analysis, { setbackM: 0 })
  close(layout.eligibleAreaM2, 9900)
  const missingCells = ring(15, 15, 25, 25)
  for (const rack of layout.racks) close(area(polygonClipping.intersection([rack.footprint], [missingCells])), 0)
  grid.slopes = Array(grid.slopes.length).fill(null)
  const unknown = buildTerrainLayout(analysis)
  assert.equal(unknown.rackCount, 0); assert.equal(unknown.eligibleAreaM2, 0)
})

test('finite but non-green terrain remains out of every full rack, including a narrow high-slope stripe', () => {
  const analysis = fixture({ slope: col => col === 10 ? 80 : 0 })
  const layout = buildTerrainLayout(analysis, { setbackM: 0 })
  close(layout.eligibleAreaM2, 9000)
  const steep = ring(45, 0, 55, 100)
  assert.ok(layout.rackCount > 0)
  for (const rack of layout.racks) close(area(polygonClipping.intersection([rack.footprint], [steep])), 0)
})

test('azimuth rotates footprints and panels together while every rack remains inside the terrain', () => {
  const analysis = fixture(), options = { azimuthDeg: 135, maxRacks: 8 }, layout = buildTerrainLayout(analysis, options)
  assert.ok(layout.rackCount > 0)
  for (const rack of layout.racks) {
    const [a, b] = rack.footprint
    close(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, 45)
    close(area(polygonClipping.difference([expandedFootprint(rack, 1)], analysis.grid.boundary)), 0)
    const first = rack.modules[0].corners
    close(Math.hypot(...first[1].map((value, i) => value - first[0][i])), 2.384)
    close(Math.hypot(...first[3].map((value, i) => value - first[0][i])), 1.303)
  }
})

test('modules form one rigid rack plane on uneven ground and do not bend to individual DEM samples', () => {
  const terrain = (x, y) => 100 + .0002 * x * x + .0001 * y * y
  const layout = buildTerrainLayout(fixture({ elevation: terrain }), { maxRacks: 3, azimuthDeg: 210 })
  assert.ok(layout.rackCount > 0)
  for (const rack of layout.racks) {
    const [a, b, , d] = rack.corners, u = b.map((value, i) => value - a[i]), v = d.map((value, i) => value - a[i])
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    close(rack.baseElevationM - rack.terrainMaxM, .8)
    for (const module of rack.modules) for (const p of module.corners) {
      close(p.reduce((sum, value, i) => sum + (value - a[i]) * normal[i], 0), 0, 1e-6)
      assert.ok(p[2] >= terrain(p[0], p[1]) + .8 - 1e-7)
    }
  }
})

test('four rows stay fixed, four through eight columns adapt to the site, and gaps/setback remain editable', () => {
  const analysis = fixture(), automatic = buildTerrainLayout(analysis)
  assert.ok(automatic.racks.every(rack => rack.rows === 4 && rack.columns >= 4 && rack.columns <= 8))
  const fixed = buildTerrainLayout(analysis, { minColumns: 4, maxColumns: 4 })
  assert.ok(fixed.racks.every(rack => rack.rows === 4 && rack.moduleCount === 16))
  const generous = buildTerrainLayout(analysis, { rowGapM: 12, rackGapM: 8, setbackM: 6 })
  assert.ok(generous.moduleCount < automatic.moduleCount)
  for (const rack of generous.racks) close(area(polygonClipping.difference([expandedFootprint(rack, 6)], analysis.grid.boundary)), 0)
})

test('legacy unsaved preview row/column options never retain the reversed rack mapping', () => {
  const normalized = normalizeTerrainLayoutOptions({ columns: 8, minRows: 8, maxRows: 8, rows: 8 })
  assert.equal(normalized.rows, 4); assert.equal(normalized.minColumns, 4); assert.equal(normalized.maxColumns, 8)
  assert.equal('columns' in normalized, false); assert.equal('minRows' in normalized, false); assert.equal('maxRows' in normalized, false)
  const layout = buildTerrainLayout(fixture(), { columns: 8, minRows: 8, maxRows: 8 })
  assert.ok(layout.racks.every(rack => rack.rows === 4 && rack.columns >= 4 && rack.columns <= 8))
})

test('adaptive packing advances by the selected width and fits eight then five columns in a 35m-wide strip', () => {
  const analysis = fixture({ width: 35, height: 10 }), layout = buildTerrainLayout(analysis)
  assert.deepEqual(layout.racks.map(rack => rack.columns), [8, 5])
  assert.ok(layout.racks.every(rack => rack.rows === 4))
  assert.equal(layout.moduleCount, 52)
  const [first, second] = layout.racks
  close(second.footprint[0][0] - first.footprint[1][0], 1, 1e-9)
  close(first.depthM, 5.272 * Math.cos(15 * Math.PI / 180), 1e-9)
  const fixed = buildTerrainLayout(analysis, { minColumns: 4, maxColumns: 4 })
  assert.deepEqual(fixed.racks.map(rack => rack.columns), [4, 4, 4])
  assert.equal(fixed.moduleCount, 48)
})

test('four-row landscape modules retain their exact metre dimensions, 20mm gaps and tilt on every tested bearing', () => {
  for (const azimuthDeg of [0, 90, 135, 180, 210]) for (const columns of [4, 8]) {
    const layout = buildTerrainLayout(fixture(), { azimuthDeg, minColumns: columns, maxColumns: columns, maxRacks: 1 })
    assert.equal(layout.rackCount, 1)
    const rack = layout.racks[0], distance3 = (a, b) => Math.hypot(...b.map((value, i) => value - a[i]))
    const distance2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])
    const first = rack.modules[0].corners, nextColumn = rack.modules[1].corners, nextRow = rack.modules[columns].corners
    assert.equal(rack.rows, 4); assert.equal(rack.columns, columns); assert.equal(rack.moduleCount, 4 * columns)
    close(distance3(first[0], first[1]), 2.384, 1e-9)
    close(distance3(first[0], first[3]), 1.303, 1e-9)
    close(distance2(first[0], first[3]), 1.303 * Math.cos(15 * Math.PI / 180), 1e-9)
    close(first[3][2] - first[0][2], 1.303 * Math.sin(15 * Math.PI / 180), 1e-9)
    close(distance3(first[1], nextColumn[0]), .02, 1e-9)
    close(distance3(first[3], nextRow[0]), .02, 1e-9)
    close(distance3(rack.corners[0], rack.corners[1]), columns * 2.384 + (columns - 1) * .02, 1e-9)
    close(distance3(rack.corners[0], rack.corners[3]), 4 * 1.303 + 3 * .02, 1e-9)
    close(distance2(rack.footprint[0], rack.footprint[3]), 5.272 * Math.cos(15 * Math.PI / 180), 1e-9)
    close(distance2(rack.footprint[0], rack.footprint[1]), columns === 4 ? 9.596 : 19.212, 1e-9)
  }
})

test('DC is exactly count times 720W and visual height exaggeration never changes layout calculations', () => {
  const analysis = fixture(), ordinary = buildTerrainLayout(analysis, { maxRacks: 6 })
  assert.equal(ordinary.moduleCount, ordinary.racks.reduce((sum, rack) => sum + rack.modules.length, 0))
  close(ordinary.dcKw, ordinary.moduleCount * .72)
  assert.deepEqual(buildTerrainLayout(analysis, { maxRacks: 6, heightScale: 2 }), ordinary)
  const source = structuredClone(analysis)
  buildTerrainLayout(analysis)
  assert.deepEqual(analysis, source)
})

test('AC uses fixed 150 percent DC/AC and nearby standard values, including 500DC to 350AC', () => {
  const large = estimateTerrainLayoutAc(500)
  close(large.acTargetKw, 500 / 1.5)
  assert.equal(large.acKw, 350); assert.deepEqual(large.acRangeKw, [300, 350]); assert.equal(large.acStepKw, 50)
  assert.deepEqual(estimateTerrainLayoutAc(150), { acKw: 100, acRangeKw: [100, 100], acTargetKw: 100, acStepKw: 10 })
  assert.equal(estimateTerrainLayoutAc(37.5).acKw, 30, 'halfway values round upward')
  for (const dc of [.72, 5, 11.52]) {
    const small = estimateTerrainLayoutAc(dc)
    assert.equal(small.acKw, 10); assert.ok(small.acRangeKw.every(value => value > 0))
  }
  for (const dc of [0, -1, null, NaN, Infinity]) assert.deepEqual(estimateTerrainLayoutAc(dc).acRangeKw, [0, 0])
})

test('candidate and rack caps stop bounded work and clearly identify partial results', () => {
  const analysis = fixture({ width: 200 })
  const candidateCap = buildTerrainLayout(analysis, { maxCandidates: 1 })
  assert.equal(candidateCap.stats.candidateCount, 1); assert.equal(candidateCap.rackCount, 1)
  assert.ok(candidateCap.stats.cappedBy.includes('candidates')); assert.ok(candidateCap.warnings.some(value => value.includes('途中結果')))
  const rackCap = buildTerrainLayout(analysis, { maxRacks: 2 })
  assert.equal(rackCap.rackCount, 2); assert.ok(rackCap.stats.cappedBy.includes('racks'))
  const hardLimit = buildTerrainLayout(analysis, { maxRacks: 10000, maxCandidates: 1000000 })
  assert.equal(hardLimit.rackCount, 200); assert.ok(hardLimit.stats.candidateCount <= 12000)
})

test('oversized or excessively fragmented grids stop before unbounded geometry work', () => {
  const oversized = buildTerrainLayout(fixture({ width: 1500 }))
  assert.equal(oversized.rackCount, 0); assert.deepEqual(oversized.stats.cappedBy, ['grid'])
  const fragmented = buildTerrainLayout(fixture({ width: 1000, slope: (col, row) => col % 3 < 2 && row % 3 < 2 ? 0 : 90 }))
  assert.equal(fragmented.rackCount, 0); assert.deepEqual(fragmented.stats.cappedBy, ['green-runs'])
  assert.equal(fragmented.stats.greenRunCount, 4001)
  assert.equal(fragmented.stats.eligibleAreaCalculated, false)
  assert.equal(fragmented.stats.candidateCount, 0)
})

test('empty, malformed and too-small available regions return zero capacity with a reason', () => {
  for (const analysis of [null, {}, { grid: { width: 2, height: 2 } }, fixture({ width: 5 })]) {
    const layout = buildTerrainLayout(analysis)
    assert.equal(layout.rackCount, 0); assert.equal(layout.moduleCount, 0); assert.equal(layout.dcKw, 0); assert.equal(layout.acKw, 0)
    assert.ok(layout.warnings.length > 0)
  }
})

test('bounded start offsets preserve the green/usable-region/setback constraints', () => {
  const analysis = fixture({ holes: [ring(30, 30, 60, 50)] })
  const options = { scanOffsetUM: 5, scanOffsetVM: 7, azimuthDeg: 165 }
  const layout = buildTerrainLayout(analysis, options)
  assert.ok(layout.rackCount > 0)
  assert.equal(layout.options.scanOffsetUM, 5); assert.equal(layout.options.scanOffsetVM, 7)
  for (const rack of layout.racks) close(area(polygonClipping.difference([expandedFootprint(rack, 1)], analysis.grid.boundary)), 0)
  const bounded = normalizeTerrainLayoutOptions({ scanOffsetUM: Infinity, scanOffsetVM: 10000 })
  assert.equal(bounded.scanOffsetUM, 0)
  assert.ok(bounded.scanOffsetVM < 20)
})

test('automatic comparison selects the largest tested pool without changing input data or geometric constraints', () => {
  const analysis = fixture({ holes: [ring(30, 20, 70, 50)] }), original = structuredClone(analysis)
  const baseline = buildTerrainLayout(analysis), automatic = buildAutomaticTerrainLayout(analysis)
  assert.equal(automatic.auto, true)
  assert.ok(automatic.moduleCount >= baseline.moduleCount)
  assert.ok(automatic.stats.autoSearch.trials <= 12)
  assert.ok(automatic.stats.autoSearch.totalCandidates <= 12000)
  assert.equal(automatic.moduleCount, Math.max(...automatic.stats.autoSearch.candidates.map(candidate => candidate.moduleCount)))
  assert.ok(Math.abs(automatic.stats.autoSearch.selectedAzimuthDeg - 180) <= 30)
  for (const rack of automatic.racks) close(area(polygonClipping.difference([expandedFootprint(rack, 1)], analysis.grid.boundary)), 0)
  assert.deepEqual(analysis, original)
})

test('equal-capacity flat references prefer south and keep the maximum immutable rack pool for quantity adjustment', () => {
  const analysis = fixture({ elevation: () => 100 })
  const baseline = buildTerrainLayout(analysis, { maxRacks: 1 }), automatic = buildAutomaticTerrainLayout(analysis, { maxRacks: 1 })
  assert.equal(automatic.options.azimuthDeg, 180)
  assert.equal(automatic.moduleCount, 32)
  assert.deepEqual(automatic.racks, baseline.racks)
  assert.ok(automatic.stats.cappedBy.includes('racks'), 'the selected pool retains its actual calculation cap warning')
})

test('changing the chosen base bearing rotates the automatic references instead of silently reverting to south', () => {
  const analysis = fixture({ elevation: () => 100 })
  const east = buildAutomaticTerrainLayout(analysis, { azimuthDeg: 90, maxRacks: 1 })
  assert.equal(east.stats.autoSearch.baseAzimuthDeg, 90)
  assert.deepEqual(east.stats.autoSearch.candidates.slice(0, 5).map(candidate => candidate.azimuthDeg), [90, 75, 105, 60, 120])
  assert.equal(east.options.azimuthDeg, 90, 'equal-capacity references prefer the user-selected base direction')
  const north = buildAutomaticTerrainLayout(analysis, { azimuthDeg: 0, maxRacks: 1 })
  assert.deepEqual(north.stats.autoSearch.candidates.slice(0, 5).map(candidate => candidate.azimuthDeg), [0, 345, 15, 330, 30])
  assert.ok(north.stats.autoSearch.candidates.every(candidate => Math.abs(((candidate.azimuthDeg + 540) % 360) - 180) <= 30))
})

test('automatic comparison obeys the total candidate/trial/time budgets and transfers partial-result warnings', () => {
  const analysis = fixture()
  const candidateLimited = buildAutomaticTerrainLayout(analysis, { autoMaxCandidates: 2 })
  assert.equal(candidateLimited.stats.autoSearch.totalCandidates, 2)
  assert.equal(candidateLimited.stats.autoSearch.candidateLimited, true)
  assert.ok(candidateLimited.stats.cappedBy.includes('auto-candidates'))
  assert.ok(candidateLimited.warnings.some(message => message.includes('上限')))
  const trialLimited = buildAutomaticTerrainLayout(analysis, { autoMaxTrials: 3 })
  assert.equal(trialLimited.stats.autoSearch.trials, 3)
  const timeLimited = buildAutomaticTerrainLayout(analysis, { autoTimeLimitMs: 0 })
  assert.equal(timeLimited.stats.autoSearch.trials, 0)
  assert.equal(timeLimited.stats.autoSearch.timeLimited, true)
  assert.equal(timeLimited.moduleCount, 0)
  assert.equal(timeLimited.stats.eligibleAreaCalculated, false)
  assert.ok(timeLimited.stats.cappedBy.includes('time'))
  assert.ok(timeLimited.warnings.some(message => message.includes('時間')))
})

test('automatic geometry, quantities and DC/AC remain unchanged by display-only height exaggeration', () => {
  const analysis = fixture(), normal = buildAutomaticTerrainLayout(analysis), doubled = buildAutomaticTerrainLayout(analysis, { heightScale: 2 })
  assert.deepEqual(doubled.racks, normal.racks)
  for (const key of ['moduleCount', 'rackCount', 'dcKw', 'acKw', 'eligibleAreaM2']) assert.equal(doubled[key], normal[key])
  assert.deepEqual(doubled.acRangeKw, normal.acRangeKw)
})

test('optimized comparison adds 7.5-degree bearings and quarter phases while standard comparison remains bounded at 12', () => {
  const analysis = fixture({ width: 50, elevation: () => 100 }), options = { azimuthDeg: 0, maxRacks: 1 }
  const normal = buildAutomaticTerrainLayout(analysis, options), optimized = buildOptimizedTerrainLayout(analysis, options)
  assert.equal(normal.stats.autoSearch.mode, 'standard')
  assert.equal(normal.stats.autoSearch.trials, 12)
  assert.deepEqual(normal.stats.autoSearch.candidates.slice(0, 5).map(candidate => candidate.azimuthDeg), [0, 345, 15, 330, 30])
  const search = optimized.stats.autoSearch
  assert.equal(search.mode, 'optimized'); assert.equal(search.trials, 32)
  assert.deepEqual(search.candidates.slice(0, 9).map(candidate => candidate.azimuthDeg), [0, 352.5, 7.5, 345, 15, 337.5, 22.5, 330, 30])
  assert.equal(search.baseAzimuthDeg, 0)
  const pitchU = 8 * 2.384 + 7 * .02 + 1, pitchV = 5.272 * Math.cos(15 * Math.PI / 180) + 3.3
  for (const phase of [.25, .5, .75]) {
    assert.ok(search.candidates.some(candidate => Math.abs(candidate.scanOffsetUM - pitchU * phase) < 1e-9))
    assert.ok(search.candidates.some(candidate => Math.abs(candidate.scanOffsetVM - pitchV * phase) < 1e-9))
  }
  assert.ok(optimized.racks.every(rack => rack.rows === 4 && rack.columns >= 4 && rack.columns <= 8))
})

test('finer comparison can fit more actual modules in an oblique synthetic site without changing their dimensions', () => {
  const analysis = fixture({ elevation: () => 100 }), angle = 7.5 * Math.PI / 180
  analysis.grid.boundary = [[ring(-32.5, -12.5, 32.5, 12.5).map(([x, y]) => [50 + x * Math.cos(angle) - y * Math.sin(angle), 50 + x * Math.sin(angle) + y * Math.cos(angle)])]]
  const normal = buildAutomaticTerrainLayout(analysis), baseline = { ...normal, analysisReference: analysis }
  const optimized = buildOptimizedTerrainLayout(analysis, {}, baseline)
  assert.ok(optimized.moduleCount > normal.moduleCount, 'the new bearings/phases perform a real denser comparison')
  assert.equal(optimized.options.azimuthDeg, 172.5)
  for (const rack of optimized.racks) {
    close(area(polygonClipping.difference([expandedFootprint(rack, 1)], analysis.grid.boundary)), 0)
    const panel = rack.modules[0].corners
    close(Math.hypot(...panel[1].map((value, i) => value - panel[0][i])), 2.384)
    close(Math.hypot(...panel[3].map((value, i) => value - panel[0][i])), 1.303)
  }
})

test('a matching baseline survives an immediate optimized timeout unchanged and never loses modules', () => {
  const analysis = fixture({ width: 50, elevation: () => 100 }), options = { maxRacks: 3, slopeLimitDeg: 20 }
  const baseline = { ...buildAutomaticTerrainLayout(analysis, options), analysisReference: analysis }
  const snapshot = structuredClone(baseline)
  const timedOut = buildOptimizedTerrainLayout(analysis, { ...options, autoTimeLimitMs: 0 }, baseline)
  assert.equal(timedOut.stats.autoSearch.mode, 'optimized')
  assert.equal(timedOut.stats.autoSearch.trials, 0)
  assert.equal(timedOut.stats.autoSearch.timeLimited, true)
  assert.equal(timedOut.stats.autoSearch.baselineRetained, true)
  assert.equal(timedOut.stats.autoSearch.baselineModuleCount, baseline.moduleCount)
  assert.deepEqual(timedOut.racks, baseline.racks)
  assert.equal(timedOut.moduleCount, baseline.moduleCount)
  assert.equal(timedOut.dcKw, baseline.dcKw); assert.equal(timedOut.acKw, baseline.acKw)
  assert.equal(timedOut.options.slopeLimitDeg, 20)
  assert.ok(timedOut.warnings.some(warning => warning.includes('時間上限')))
  assert.deepEqual(baseline, snapshot)
  const optimized = buildOptimizedTerrainLayout(analysis, options, baseline)
  assert.ok(optimized.moduleCount >= baseline.moduleCount)
  assert.deepEqual(baseline, snapshot)
  const transferred = structuredClone({ analysis, baseline })
  assert.strictEqual(transferred.baseline.analysisReference, transferred.analysis, 'the Worker message retains the shared analysis identity')
  assert.equal(buildOptimizedTerrainLayout(transferred.analysis, { ...options, autoTimeLimitMs: 0 }, transferred.baseline).moduleCount, baseline.moduleCount)
})

test('a stale or incompatible baseline cannot bypass changed analysis or placement conditions', () => {
  const analysis = fixture({ width: 50 }), baseline = { ...buildAutomaticTerrainLayout(analysis), analysisReference: analysis }
  for (const [current, options, previous] of [
    [structuredClone(analysis), {}, baseline],
    [analysis, { slopeLimitDeg: 20 }, baseline],
    [analysis, { rowGapM: 5 }, baseline],
    [analysis, { azimuthDeg: 90 }, baseline],
    [analysis, { minColumns: 4, maxColumns: 4 }, baseline],
    [analysis, {}, { ...baseline, moduleCount: baseline.moduleCount + 1 }],
    [analysis, {}, { ...baseline, stats: null }],
  ]) {
    const result = buildOptimizedTerrainLayout(current, { ...options, autoTimeLimitMs: 0 }, previous)
    assert.equal(result.moduleCount, 0)
    assert.equal(result.stats.autoSearch.baselineModuleCount, null)
    assert.equal(result.stats.autoSearch.baselineRetained, false)
  }
})

test('optimized candidates preserve the chosen slope threshold, NoData, exclusion and full setback envelope', () => {
  const hole = ring(10, 10, 15, 15), noData = ring(20, 20, 30, 30)
  const analysis = fixture({ width: 40, slope: 17, holes: [hole] })
  analysis.grid.elevations[5 * analysis.grid.width + 5] = null
  const optimized = buildOptimizedTerrainLayout(analysis, { slopeLimitDeg: 20 })
  assert.ok(optimized.moduleCount > 0)
  assert.equal(optimized.options.slopeLimitDeg, 20); assert.equal(optimized.stats.slopeLimitDeg, 20)
  close(optimized.eligibleAreaM2, 1475)
  for (const rack of optimized.racks) {
    const envelope = expandedFootprint(rack, 1)
    close(area(polygonClipping.difference([envelope], analysis.grid.boundary)), 0)
    close(area(polygonClipping.intersection([envelope], [hole])), 0)
    close(area(polygonClipping.intersection([envelope], [noData])), 0)
  }
  assert.equal(buildOptimizedTerrainLayout(analysis, { slopeLimitDeg: 15, autoMaxTrials: 9 }).moduleCount, 0)
})

test('optimized trials, candidate work and time are bounded and disclose partial comparisons', () => {
  const analysis = fixture({ width: 50 })
  const bounded = buildOptimizedTerrainLayout(analysis, { autoMaxTrials: 100, autoMaxCandidates: 1e9, autoTimeLimitMs: 1e9, maxRacks: 1 })
  assert.equal(bounded.stats.autoSearch.maxTrials, 32)
  assert.equal(bounded.stats.autoSearch.maxCandidates, 24000)
  assert.equal(bounded.stats.autoSearch.timeLimitMs, 8000)
  assert.ok(bounded.stats.autoSearch.trials <= 32)
  assert.ok(bounded.stats.autoSearch.totalCandidates <= 24000)
  const candidateLimited = buildOptimizedTerrainLayout(analysis, { autoMaxCandidates: 2 })
  assert.equal(candidateLimited.stats.autoSearch.totalCandidates, 2)
  assert.equal(candidateLimited.stats.autoSearch.candidateLimited, true)
  assert.ok(candidateLimited.stats.cappedBy.includes('auto-candidates'))
  const trialLimited = buildOptimizedTerrainLayout(analysis, { autoMaxTrials: 3 })
  assert.equal(trialLimited.stats.autoSearch.trials, 3)
  const standard = buildAutomaticTerrainLayout(analysis, { autoMaxTrials: 100, autoMaxCandidates: 1e9, autoTimeLimitMs: 1e9, maxRacks: 1 })
  assert.equal(standard.stats.autoSearch.maxTrials, 12)
  assert.equal(standard.stats.autoSearch.maxCandidates, 12000)
  assert.equal(standard.stats.autoSearch.timeLimitMs, 5000)
})
