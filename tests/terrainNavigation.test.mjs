import test from 'node:test'
import assert from 'node:assert/strict'
import { createTerrainProjection, terrainFaceVisible } from '../src/utils/terrainView.js'
import { TERRAIN_DIRECTIONS, terrainNavigationTarget, terrainNavigationCube, terrainCompassRotation, interpolateTerrainNavigation } from '../src/utils/terrainNavigation.js'

test('cardinal faces select the corresponding observer side and retain zoom without editing input', () => {
  const view={azimuth:359,pitch:55,zoom:1.8}, before=structuredClone(view)
  for(const face of TERRAIN_DIRECTIONS.filter(f=>f.id!=='top')){
    const next=terrainNavigationTarget(face.id,view)
    assert.equal(next.azimuth,face.azimuth);assert.equal(next.pitch,0);assert.equal(next.zoom,1.8)
    assert.equal(terrainFaceVisible(face.normal,next),true)
    assert.equal(terrainFaceVisible(face.normal.map(v=>-v),next),false)
    assert.deepEqual(terrainNavigationCube(next).map(f=>f.id),[face.id])
  }
  assert.deepEqual(view,before)
})

test('overhead is genuinely 90 degrees with north up and east right and preserves zoom',()=>{
  const view=terrainNavigationTarget('top',{azimuth:35,pitch:32,zoom:1.5})
  assert.deepEqual(view,{azimuth:180,pitch:90,zoom:1.5})
  const p=createTerrainProjection({bounds:{west:-10,east:10,south:-10,north:10},base:100,maxElevation:120,...view})
  const center=p.project([0,0,110]),n=p.project([0,10,110]),e=p.project([10,0,110])
  assert.ok(n[1]<center[1]);assert.ok(e[0]>center[0])
  assert.ok(Math.abs(p.project([0,0,120])[1]-center[1])<1e-9,'height cannot displace the plan view')
  assert.deepEqual(terrainNavigationCube(view).map(f=>f.id),['top'])
  assert.equal(terrainCompassRotation(view),0)
})

test('cube faces and compass follow the same geographic orientation as the terrain at arbitrary rotations',()=>{
  for(const azimuth of [0,35,90,145,180,270,359])for(const pitch of [0,32,75,90]){
    const view={azimuth,pitch,zoom:2.5},faces=terrainNavigationCube(view)
    assert.deepEqual(new Set(faces.map(f=>f.id)),new Set(TERRAIN_DIRECTIONS.filter(f=>terrainFaceVisible(f.normal,view)).map(f=>f.id)))
    assert.ok(faces.every(f=>f.points.flat().every(Number.isFinite)))
    assert.equal(terrainCompassRotation(view),(540-azimuth)%360)
    assert.deepEqual(terrainNavigationCube({...view,zoom:.65}),faces,'camera zoom does not change cube size')
  }
  const faces=terrainNavigationCube({azimuth:35,pitch:32})
  assert.ok(faces.find(f=>f.id==='east').center[0]<faces.find(f=>f.id==='north').center[0],'east is the left face when observing from the north east')
})

test('navigation takes the short rotation across north and converges exactly; home uses the actual initial camera',()=>{
  const from={azimuth:350,pitch:32,zoom:1.8},to={azimuth:10,pitch:90,zoom:1.8}
  assert.equal(interpolateTerrainNavigation(from,to,.5).azimuth,0)
  assert.deepEqual(interpolateTerrainNavigation(from,to,1),to)
  assert.deepEqual(interpolateTerrainNavigation(from,to,NaN),from)
  const initial={azimuth:145,pitch:32,zoom:1}
  assert.deepEqual(terrainNavigationTarget('home',from,initial),initial)
  assert.deepEqual(terrainNavigationTarget('unknown',from),from)
})
