import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTerrainOverlayVisibility, visibleTerrainLineParts } from '../src/utils/terrainOverlayVisibility.js'

// A synthetic top-down projection lets these occlusion cases be calculated
// independently of the application's orthographic camera and DEM acquisition.
const projection = { project: ([x,y]) => [x,y], transform: ([x,y,z]) => [x,y,z] }
const rectangle = (x,y,size,z) => [[x,y,z],[x+size,y,z],[x+size,y+size,z],[x,y+size,z]]
const surface = (rings, extra = {}) => ({ rings, kind:'surface', visible:true, ...extra })

test('parcel labels need a visible real surface, and neither backfaces nor holes host labels', () => {
  const outer = rectangle(100,100,80,10), hole = rectangle(130,130,20,10)
  const visible = createTerrainOverlayVisibility([surface([outer,hole])], projection)
  assert.equal(visible([120,120,10.3]),true)
  assert.equal(visible([140,140,10.3]),false)
  assert.equal(visible([200,120,10.3]),false)
  assert.equal(createTerrainOverlayVisibility([surface([outer],{visible:false})],projection)([120,120,10.3]),false)
})

test('nearer panels hide ground labels but a hole in the nearer polygon does not', () => {
  const ground = surface([rectangle(100,100,100,10)])
  const module = surface([rectangle(120,120,50,12)],{kind:'module'})
  const visible = createTerrainOverlayVisibility([ground,module],projection)
  assert.equal(visible([140,140,10.3]),false)
  assert.equal(visible([110,110,10.3]),true)
  const withHole = createTerrainOverlayVisibility([ground,{...module,rings:[...module.rings,rectangle(135,135,10,12)]}],projection)
  assert.equal(withHole([140,140,10.3]),true)
})

test('a parcel boundary is split instead of connecting its hidden section', () => {
  const points = Array.from({length:7},(_,i)=>[100+i*10,100,10.3])
  assert.deepEqual(visibleTerrainLineParts(points,point=>point[0]<125||point[0]>135),[points.slice(0,3),points.slice(4)])
})

test('a supported elevated object may leave its ground screen bin but still respects occlusion and the viewport', () => {
  const raisedProjection = { project: ([x,y,z]) => [x,y-z*4], transform: ([x,y,z]) => [x,y-z*4,z] }
  const ground = surface([rectangle(100,180,50,10)]), roof = [120,200,30]
  assert.equal(createTerrainOverlayVisibility([ground],raisedProjection)(roof),false, 'surface annotations retain their existing ground-bin requirement')
  assert.equal(createTerrainOverlayVisibility([ground],raisedProjection,{requireSurface:false})(roof),true)
  const wall = surface([rectangle(100,230,40,40)],{kind:'wall'})
  assert.equal(createTerrainOverlayVisibility([ground,wall],raisedProjection,{requireSurface:false})(roof),false, 'a nearer wall still hides the roof')
  assert.equal(createTerrainOverlayVisibility([ground],raisedProjection,{requireSurface:false})([120,200,50]),false, 'the viewport limit still applies')
  assert.equal(createTerrainOverlayVisibility([ground],raisedProjection)([120,200,10.3]),true, 'existing ground annotations stay supported')
})
