import test from 'node:test'
import assert from 'node:assert/strict'
import { createTerrainProjection, dragTerrainView, elevateTerrainView, normalizeTerrainView, terrainFaceVisible, zoomTerrainView } from '../src/utils/terrainView.js'
import { buildTerrainSolid } from '../src/utils/terrainSolid.js'

const settings = { bounds: { west: -50, south: -40, east: 50, north: 40 }, base: 300, maxElevation: 360 }
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]))
const frame = { zoom: 1 }
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)

test('terrain view wraps bearings and retains the original camera pitch limits', () => {
  assert.deepEqual(normalizeTerrainView({ azimuth: -725, pitch: -100 }), { azimuth: 355, pitch: 0, ...frame })
  assert.deepEqual(normalizeTerrainView({ azimuth: 725, pitch: 200 }), { azimuth: 5, pitch: 75, ...frame })
  assert.deepEqual(normalizeTerrainView({ azimuth: NaN, pitch: Infinity }), { azimuth: 35, pitch: 32, ...frame })
})

test('drag changes direction and pitch without an unbounded vertical orbit', () => {
  assert.deepEqual(dragTerrainView({ azimuth: 35, pitch: 32 }, .25, .25), { azimuth: 350, pitch: 54.5, ...frame })
  assert.equal(dragTerrainView({ azimuth: 35, pitch: 32 }, 0, -10).pitch, 0)
  assert.equal(dragTerrainView({ azimuth: 35, pitch: 32 }, 0, 10).pitch, 75)
})

test('rotation preserves physical metres and uses one uniform display scale', () => {
  for (const azimuth of [0, 35, 145, 270, 359]) for (const pitch of [0, 0.1, 15, 32, 75]) {
    const projection = createTerrainProjection({ ...settings, azimuth, pitch })
    const a = [10, 20, 320], b = [-20, 30, 350]
    assert.ok(Math.abs(distance(projection.transform(a), projection.transform(b)) - distance(a, b)) < 1e-10)
    for (const end of [[20,20,320], [10,30,320], [10,20,330]]) {
      assert.ok(Math.abs(distance(projection.transform(a), projection.transform(end)) - 10) < 1e-10)
    }
    assert.ok(projection.scale > 0)
    assert.ok(projection.project(a).every(Number.isFinite))
  }
})

test('north and east camera bearings project cardinal axes consistently', () => {
  const north = createTerrainProjection({ ...settings, azimuth: 0, pitch: 32 })
  assert.ok(north.project([10,0,300])[0] < north.project([0,0,300])[0], 'east is to the left when viewed from north')
  assert.ok(north.transform([0,10,300])[2] > north.transform([0,0,300])[2], 'north is nearer the north camera')
  const east = createTerrainProjection({ ...settings, azimuth: 90, pitch: 32 })
  assert.ok(east.project([0,10,300])[0] > east.project([0,0,300])[0], 'north is to the right when viewed from east')
  assert.ok(east.transform([10,0,300])[2] > east.transform([0,0,300])[2], 'east is nearer the east camera')
})

test('zero pitch gives a true side view while retaining depth and equal horizontal/vertical scale', () => {
  const projection = createTerrainProjection({ ...settings, azimuth: 0, pitch: 0 })
  assert.equal(projection.pitch, 0)
  const a = [0, 0, 320], nearer = [0, 10, 320], higher = [0, 0, 330], east = [10, 0, 320]
  assert.deepEqual(projection.project(a), projection.project(nearer), 'distance toward the camera does not invent height')
  assert.equal(projection.transform(nearer)[2] - projection.transform(a)[2], 10, 'depth remains available for face ordering')
  assert.ok(projection.project(higher)[1] < projection.project(a)[1], 'higher terrain is above lower terrain')
  assert.ok(Math.abs(distance(projection.project(a), projection.project(higher)) - distance(projection.project(a), projection.project(east))) < 1e-10, 'ten metres vertically and horizontally use the same display scale')
})

test('zero pitch fits both flat and uneven terrain into a finite viewport at every bearing', () => {
  for (const azimuth of [0, 35, 90, 145, 180, 270, 359]) {
    for (const maxElevation of [settings.base, settings.base + 0.01, settings.maxElevation]) {
      const projection = createTerrainProjection({ ...settings, maxElevation, azimuth, pitch: 0 })
      assert.ok(Number.isFinite(projection.scale) && projection.scale > 0)
      for (const x of [settings.bounds.west, settings.bounds.east]) {
        for (const y of [settings.bounds.south, settings.bounds.north]) {
          for (const z of [settings.base, maxElevation]) {
            const screen = projection.project([x, y, z])
            assert.ok(screen.every(Number.isFinite), 'flat terrain does not create a zero-height division')
            assert.ok(screen[0] >= 0 && screen[0] <= 800 && screen[1] >= 0 && screen[1] <= 450, 'all bounding corners fit on screen')
            assert.ok(Number.isFinite(projection.transform([x, y, z])[2]))
          }
        }
      }
    }
  }
})

test('outward walls face the camera consistently at side and overhead views, while the bottom stays hidden', () => {
  for (const pitch of [0, 32, 75]) {
    assert.equal(terrainFaceVisible([0, 1, 0], { azimuth: 0, pitch }), true)
    assert.equal(terrainFaceVisible([0, -1, 0], { azimuth: 0, pitch }), false)
    assert.equal(terrainFaceVisible([1, 0, 0], { azimuth: 90, pitch }), true)
    assert.equal(terrainFaceVisible([-1, 0, 0], { azimuth: 90, pitch }), false)
    assert.equal(terrainFaceVisible([0, 1, 0], { azimuth: 180, pitch }), false)
    assert.equal(terrainFaceVisible([0, -1, 0], { azimuth: 180, pitch }), true)
    for (const azimuth of [0, 35, 90, 145, 180, 270, 359]) {
      assert.equal(terrainFaceVisible([0, 0, -1], { azimuth, pitch }), false, 'the display bottom is never viewed from below')
    }
  }
  assert.equal(terrainFaceVisible([1, 0, 0], { azimuth: 0, pitch: 0 }), false, 'edge-on walls do not leave an artificial stripe')
  assert.equal(terrainFaceVisible([0, 0, 1], { azimuth: 0, pitch: 0 }), false)
  assert.equal(terrainFaceVisible([0, 0, 1], { azimuth: 0, pitch: 75 }), true)
})

test('unknown surface normals stay visible and visibility uses the same normalized camera as projection', () => {
  for (const normal of [null, undefined, [], [0, 0, 0], [NaN, 0, 0]]) {
    assert.equal(terrainFaceVisible(normal, { azimuth: 180, pitch: 32 }), true)
  }
  assert.equal(terrainFaceVisible([0, 7, 0], { azimuth: -360, pitch: -20 }), true)
  assert.equal(terrainFaceVisible([0, -7, 0], { azimuth: 360, pitch: 100 }), false)
  assert.equal(terrainFaceVisible([0, 1, 0], { azimuth: NaN, pitch: Infinity }), terrainFaceVisible([0, 1, 0], { azimuth: 35, pitch: 32 }))
})

test('a steep far wall cannot cover a nearer slope even when centroid depth would paint the wall last', () => {
  const topFaces = []
  for (let y = 0; y < 50; y += 5) for (let x = 0; x < 50; x += 5) {
    const ring = [[x, y], [x + 5, y], [x + 5, y + 5], [x, y + 5]].map(([x, y]) => [x, y, 100 + 5 * y])
    const centroid = ring.reduce((sum, point) => sum.map((v, axis) => v + point[axis] / ring.length), [0, 0, 0])
    topFaces.push({ rings: [ring], centroid, kind: 'surface' })
  }
  const view = { azimuth: 180, pitch: 32 }, base = 95
  const projection = createTerrainProjection({ bounds: { west: 0, east: 50, south: 0, north: 50 }, base, maxElevation: 350, ...view })
  const { walls } = buildTerrainSolid(topFaces, base)
  const farWall = walls.find(face => face.centroid[0] === 2.5 && face.centroid[1] === 50)
  const nearerSlope = topFaces.find(face => face.centroid[0] === 2.5 && face.centroid[1] === 7.5)
  assert.ok(projection.transform(farWall.centroid)[2] > projection.transform(nearerSlope.centroid)[2], 'the previous painter ordering would draw this far wall after the slope')
  const surfacePoint = [4.5, 9, 145], surfaceRay = projection.transform(surfacePoint)
  const wallAtBase = projection.transform([4.5, 50, base])
  const zUnit = projection.transform([4.5, 50, base + 1])[1] - wallAtBase[1]
  const wallZ = base + (surfaceRay[1] - wallAtBase[1]) / zUnit
  assert.ok(wallZ > base && wallZ < 350, 'the two projected faces genuinely overlap')
  assert.ok(projection.transform([4.5, 50, wallZ])[2] < surfaceRay[2], 'at the overlap the wall is physically behind the slope')
  assert.equal(terrainFaceVisible(farWall.normal, view), false)
  assert.equal(terrainFaceVisible(null, view), true, 'the real DEM surface remains visible')
})

test('view normalization retains only direction, elevation angle and bounded zoom', () => {
  assert.deepEqual(normalizeTerrainView(), { azimuth: 35, pitch: 32, ...frame })
  assert.deepEqual(normalizeTerrainView(null), { azimuth: 35, pitch: 32, ...frame })
  assert.deepEqual(normalizeTerrainView({ azimuth: 145, pitch: 0, zoom: 12 }), { azimuth: 145, pitch: 0, zoom: 2.5 })
  assert.equal(normalizeTerrainView({ zoom: -1 }).zoom, .65)
  assert.deepEqual(normalizeTerrainView({ zoom: Infinity }), { azimuth: 35, pitch: 32, ...frame })
})

test('upward dragging elevates the viewpoint while keeping object bearing, zoom and actual metres', () => {
  const view = { azimuth: 145, pitch: 32, zoom: 1.5 }, raised = elevateTerrainView(view, -.25)
  assert.deepEqual(raised, { azimuth: 145, pitch: 54.5, zoom: 1.5 })
  assert.deepEqual(elevateTerrainView(view, .25), { ...view, pitch: 9.5 })
  const before = createTerrainProjection({ ...settings, ...view }), after = createTerrainProjection({ ...settings, ...raised })
  const origin = [10, 20, 320], points = [[20, 20, 320], [10, 30, 320], [10, 20, 330]], snapshot = structuredClone(points)
  for (const point of points) {
    close(after.transform(point)[0], before.transform(point)[0])
    close(distance(after.transform(origin), after.transform(point)), 10)
  }
  assert.deepEqual(points, snapshot, 'elevations and terrain coordinates are not edited')
  assert.notEqual(after.transform(origin)[1], before.transform(origin)[1], 'the camera changes elevation rather than translating the screen')
  const corners = [settings.bounds.west, settings.bounds.east].flatMap(x => [settings.bounds.south, settings.bounds.north].flatMap(y => [settings.base, settings.maxElevation].map(z => after.project([x, y, z]))))
  close((Math.min(...corners.map(p => p[0])) + Math.max(...corners.map(p => p[0]))) / 2, 400)
  close((Math.min(...corners.map(p => p[1])) + Math.max(...corners.map(p => p[1]))) / 2, 225)
  assert.equal(terrainFaceVisible([1, 0, 0], raised), terrainFaceVisible([1, 0, 0], view), 'the same side of the object faces the viewer')
})

test('normalized elevation drags behave equally at different viewport sizes and stay within 0 to 75 degrees', () => {
  const view = { azimuth: 35, pitch: 32, zoom: 1.5 }
  const results = [130, 520, 780].map(height => elevateTerrainView(view, (-height / 4) / height))
  assert.deepEqual(results[0], { ...view, pitch: 54.5 })
  assert.deepEqual(results[1], results[0]); assert.deepEqual(results[2], results[0])
  assert.deepEqual(elevateTerrainView(view, -1e308), { ...view, pitch: 75 })
  assert.deepEqual(elevateTerrainView(view, 1e308), { ...view, pitch: 0 })
  for (const delta of [NaN, Infinity, undefined]) assert.deepEqual(elevateTerrainView(view, delta), view)
})

test('zoom scales every screen direction equally and preserves actual metres and bearing', () => {
  for (const pitch of [0, 32, 75]) {
    const view = { azimuth: 145, pitch, zoom: 1 }
    const enlarged = zoomTerrainView(view, 2), before = createTerrainProjection({ ...settings, ...view }), after = createTerrainProjection({ ...settings, ...enlarged })
    assert.deepEqual(enlarged, { ...view, zoom: 2 })
    close(after.scale, before.scale * 2)
    const origin = [10, 20, 320]
    for (const end of [[20, 20, 320], [10, 30, 320], [10, 20, 330]]) {
      assert.deepEqual(after.transform(end), before.transform(end))
      close(distance(after.transform(origin), after.transform(end)), 10)
      close(distance(after.project(origin), after.project(end)), distance(before.project(origin), before.project(end)) * 2)
    }
  }
})

test('zoom factors clamp safely and ignore invalid interactions without resetting the view', () => {
  const view = { azimuth: 145, pitch: 75, zoom: 1.4 }
  assert.deepEqual(zoomTerrainView(view, 1e308), { ...view, zoom: 2.5 })
  assert.deepEqual(zoomTerrainView(view, .00001), { ...view, zoom: .65 })
  for (const factor of [NaN, Infinity, -1, 0, undefined]) assert.deepEqual(zoomTerrainView(view, factor), view)
})

test('rotation preserves the current zoom and invalid drag input keeps the view', () => {
  const view = { azimuth: 35, pitch: 32, zoom: 1.4 }
  assert.deepEqual(dragTerrainView(view, .25, .25), { ...view, azimuth: 350, pitch: 54.5 })
  assert.deepEqual(dragTerrainView(view, NaN, Infinity), view)
  const normalized = normalizeTerrainView(view)
  assert.deepEqual(view, normalized, 'helpers leave the input camera unchanged')
})

test('height exaggeration doubles only display-space vertical distances without mutating terrain inputs', () => {
  const basePoint = [10, 20, settings.base]
  const points = [basePoint, [20, 20, settings.base], [10, 30, settings.base], [10, 20, settings.base + 10]]
  const source = { bounds: structuredClone(settings.bounds), elevations: points.map(p => p[2]), summary: { minElevation: 300, maxElevation: 360 } }
  const before = structuredClone({ source, points })
  for (const azimuth of [0, 35, 145, 270]) for (const pitch of [0, 32, 75]) {
    const actual = createTerrainProjection({ ...settings, bounds: source.bounds, azimuth, pitch })
    const doubled = createTerrainProjection({ ...settings, bounds: source.bounds, azimuth, pitch, heightScale: 2 })
    assert.equal(actual.heightScale, 1)
    assert.equal(doubled.heightScale, 2)
    assert.deepEqual(doubled.transform(basePoint), actual.transform(basePoint), 'the display base remains anchored')
    for (const horizontal of points.slice(1, 3)) {
      close(distance(doubled.transform(basePoint), doubled.transform(horizontal)), 10)
      assert.deepEqual(doubled.transform(horizontal), actual.transform(horizontal))
    }
    close(distance(doubled.transform(basePoint), doubled.transform(points[3])), 20)
    close(distance(actual.transform(basePoint), actual.transform(points[3])), 10)
    for (let axis = 0; axis < 3; axis++) {
      close(doubled.transform(points[3])[axis] - doubled.transform(basePoint)[axis],
        2 * (actual.transform(points[3])[axis] - actual.transform(basePoint)[axis]))
    }
  }
  assert.deepEqual({ source, points }, before)
})

test('only numeric height factors 1 and 2 are supported and height is not part of camera normalization', () => {
  const view = { azimuth: 145, pitch: 50, zoom: 1.4 }
  const baseline = createTerrainProjection({ ...settings, ...view, heightScale: 1 })
  for (const heightScale of [undefined, null, NaN, Infinity, -Infinity, -1, 0, .5, 1.5, 3, '2', true, {}]) {
    const projection = createTerrainProjection({ ...settings, ...view, heightScale })
    assert.equal(projection.heightScale, 1)
    assert.deepEqual(projection.transform([15, 10, 325]), baseline.transform([15, 10, 325]))
    assert.deepEqual(projection.project([15, 10, 325]), baseline.project([15, 10, 325]))
    assert.equal(terrainFaceVisible([0, 1, 1], view, heightScale), terrainFaceVisible([0, 1, 1], view, 1))
  }
  assert.deepEqual(normalizeTerrainView({ ...view, heightScale: 2 }), view)
})

test('the exaggerated bounding box stays finite and fits without distorting x/y at default zoom', () => {
  for (const azimuth of [0, 35, 145, 270]) for (const pitch of [0, 32, 75]) {
    for (const maxElevation of [settings.base, settings.base + .01, settings.maxElevation]) {
      const projection = createTerrainProjection({ ...settings, maxElevation, azimuth, pitch, heightScale: 2 })
      assert.ok(Number.isFinite(projection.scale) && projection.scale > 0)
      for (const x of [settings.bounds.west, settings.bounds.east]) for (const y of [settings.bounds.south, settings.bounds.north]) {
        for (const z of [settings.base, maxElevation]) {
          const [u, v] = projection.project([x, y, z])
          assert.ok(Number.isFinite(u) && Number.isFinite(v) && u >= 0 && u <= 800 && v >= 0 && v <= 450)
        }
      }
    }
  }
})

test('surface culling follows the displayed slope threshold after height exaggeration', () => {
  // The synthetic surface z=-y has upward normal [0,1,1]. From the south,
  // it is visible above 45 degrees at 1:1, and above atan(2) at 2x height.
  const normal = [0, 1, 1], original = [...normal]
  for (const factor of [1, 2]) {
    const threshold = Math.atan(factor) * 180 / Math.PI
    assert.equal(terrainFaceVisible(normal, { azimuth: 180, pitch: threshold - .001 }, factor), false)
    assert.equal(terrainFaceVisible(normal, { azimuth: 180, pitch: threshold }, factor), false, 'an edge-on face is hidden')
    assert.equal(terrainFaceVisible(normal, { azimuth: 180, pitch: threshold + .001 }, factor), true)
    assert.equal(terrainFaceVisible(normal.map(v => v * 100), { azimuth: 180, pitch: threshold + .001 }, factor), true)
  }
  assert.equal(terrainFaceVisible(normal, { azimuth: 180, pitch: 50 }, 1), true)
  assert.equal(terrainFaceVisible(normal, { azimuth: 180, pitch: 50 }, 2), false)
  assert.deepEqual(normal, original)
})

test('scaled-normal culling agrees with a cross product of displayed surface tangents', () => {
  const normal = [-.4, 1.2, 1]
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
  for (const heightScale of [1, 2]) {
    const displayedNormal = cross([1, 0, .4 * heightScale], [0, 1, -1.2 * heightScale])
    for (const azimuth of [0, 35, 90, 145, 180, 270]) for (const pitch of [0, 32, 50, 75]) {
      const view = { azimuth, pitch }
      assert.equal(terrainFaceVisible(normal, view, heightScale), terrainFaceVisible(displayedNormal, view), 'culling must follow transformed geometry')
      for (const wall of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]]) {
        assert.equal(terrainFaceVisible(wall, view, heightScale), terrainFaceVisible(wall, view), 'height exaggeration does not turn a vertical wall')
      }
      assert.equal(terrainFaceVisible([0,0,-1], view, heightScale), false)
    }
  }
})
