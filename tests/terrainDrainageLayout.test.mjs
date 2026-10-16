import test from 'node:test'
import assert from 'node:assert/strict'
import {terrainDrainageCandidates,terrainDrainageSymbolLength} from '../src/utils/terrainDrainage.js'
import {layoutTerrainDrainage,terrainDrainageSegmentDistance} from '../src/utils/terrainDrainageLayout.js'
import {terrainDrawingPrintViewports} from '../src/utils/terrainDrawingViewport.js'
import {drainageFixture,drainageCases,drainageRing,drainageTestFence,drainageTestLabels} from './fixtures/terrainDrainage.mjs'

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`)
function verify(analysis,viewport,result,fence) {
  const rails=(fence?.rails||[]).flatMap(r=>r.points.slice(1).map((p,i)=>[viewport.project(r.points[i]),viewport.project(p)]))
  assert.ok(result.arrows.length<=64)
  for(const a of result.arrows){
    assert.ok(a.slopeDeg>=1&&a.tailElevation-a.headElevation>=.05)
    assert.equal(a.icon.lengthPx,terrainDrainageSymbolLength(a.slopeDeg))
    const tail=viewport.project(a.tail),head=viewport.project(a.head),dx=head[0]-tail[0],dy=head[1]-tail[1],sx=a.icon.head[0]-a.icon.tail[0],sy=a.icon.head[1]-a.icon.tail[1]
    close(dx*sy-dy*sx,0);assert.ok(dx*sx+dy*sy>0)
    close(Math.hypot(sx,sy),a.icon.lengthPx)
    assert.deepEqual(a.icon.anchor,viewport.project(a.point))
    if(a.icon.leader){
      assert.deepEqual(a.icon.leader[0],a.icon.anchor)
      assert.ok(Math.hypot(a.icon.leader[1][0]-a.icon.anchor[0],a.icon.leader[1][1]-a.icon.anchor[1])<=12)
      close(terrainDrainageSegmentDistance([a.icon.leader[1],a.icon.leader[1]],a.icon.segments[0]),0)
    }else close(terrainDrainageSegmentDistance([a.icon.anchor,a.icon.anchor],a.icon.segments[0]),0)
    for(const segment of a.icon.segments){
      for(const [x,y] of segment)assert.ok(x>=37.25&&x<=762.75&&y>=27.25&&y<=682.75)
      for(const rail of rails)assert.ok(terrainDrainageSegmentDistance(segment,rail)>=5.25-1e-7)
    }
  }
  for(let i=0;i<result.arrows.length;i++)for(let j=i+1;j<result.arrows.length;j++)for(const a of result.arrows[i].icon.segments)for(const b of result.arrows[j].icon.segments)assert.ok(terrainDrainageSegmentDistance(a,b)>=6.5-1e-7)
}

test('segment distances distinguish genuine crossings, parallel strokes, disjoint bounding boxes and point segments',()=>{
  close(terrainDrainageSegmentDistance([[0,0],[10,10]],[[0,10],[10,0]]),0)
  close(terrainDrainageSegmentDistance([[0,0],[100,100]],[[0,20],[40,60]]),Math.sqrt(200))
  close(terrainDrainageSegmentDistance([[0,0],[10,0]],[[0,8],[10,8]]),8)
  close(terrainDrainageSegmentDistance([[0,0],[0,0]],[[3,4],[3,4]]),5)
  close(terrainDrainageSegmentDistance([[0,0],[10,0]],[[20,0],[30,0]]),10)
})

test('a valid constant-gradient patch survives even when the old uniform phase missed every location',()=>{
  const a=drainageCases().find(([name])=>name==='valid-patch')[1],candidates=terrainDrainageCandidates(a)
  assert.ok(candidates.some(a=>a.point[0]===25&&a.point[1]===0))
  const result=layoutTerrainDrainage(a,terrainDrawingPrintViewports(a.grid,1000)[1])
  assert.equal(result.arrows.length,1);close(result.metrics.coveragePercent,100)
})

test('nearby fence keeps all four sides represented at A3 scales, with exact DEM direction and bounded callouts',()=>{
  const a=drainageFixture(),before=structuredClone(a),fence=drainageTestFence()
  for(const scale of [1000,2000,5000,10000,'auto']){
    const v=terrainDrawingPrintViewports(a.grid,scale)[1],off=layoutTerrainDrainage(a,v),on=layoutTerrainDrainage(a,v,{fence})
    assert.ok(on.arrows.length>=Math.min(4,off.arrows.length))
    for(const side of [p=>p[0]===0,p=>p[0]===100,p=>p[1]===0,p=>p[1]===100])assert.ok(on.arrows.some(a=>side(a.point)),`${scale}: missing side`)
    assert.ok(on.metrics.coveragePercent>=off.metrics.coveragePercent-10)
    if(scale===1000){assert.ok(on.arrows.length>=28);assert.equal(on.arrows.filter(a=>a.icon.leader).length,0);assert.equal(on.metrics.maxUncoveredM,0)}
    verify(a,v,on,fence)
    for(const arrow of on.arrows){close(arrow.tailElevation,100-.2*arrow.tail[0]+.1*arrow.tail[1]);close(arrow.headElevation,100-.2*arrow.head[0]+.1*arrow.head[1]);close(arrow.tailElevation-arrow.headElevation,8*Math.hypot(.2,.1))}
  }
  assert.deepEqual(a,before)
})

test('long narrow, concave and separate regions receive balanced feasible coverage',()=>{
  for(const [name,a] of drainageCases().filter(([name])=>['long-narrow','concave','separate-parts','ten-islands'].includes(name))){
    const v=terrainDrawingPrintViewports(a.grid,'auto')[1],r=layoutTerrainDrainage(a,v)
    assert.equal(r.metrics.representedParts,r.metrics.validParts,name)
    assert.ok(r.metrics.coveragePercent>=65,name);verify(a,v,r)
    if(name==='long-narrow'){assert.ok(r.arrows.filter(a=>a.point[1]===0).length>=8);assert.ok(r.arrows.filter(a=>a.point[1]===12).length>=8)}
    if(name==='concave')assert.ok(r.arrows.some(a=>a.kind==='corner'&&a.point[0]===30&&a.point[1]===30))
  }
})

test('a fence microscopically outside the boundary cannot erase a whole side through anchor roundoff',()=>{
  const a=drainageFixture(),v=terrainDrawingPrintViewports(a.grid,1000)[1],fence={rails:[{points:drainageRing(-.00001,-.00001,100.00002,100.00002)}]},r=layoutTerrainDrainage(a,v,{fence})
  assert.ok(r.arrows.length>=28)
  for(const side of [p=>p[0]===0,p=>p[0]===100,p=>p[1]===0,p=>p[1]===100])assert.ok(r.arrows.some(a=>side(a.point)))
  assert.ok(r.arrows.some(a=>a.icon.leader));verify(a,v,r,fence)
})

test('NoData, holes, flat ground and slope transitions preserve the terrain evidence rules',()=>{
  for(const [name,a] of drainageCases().filter(([name])=>['channel-nodata','hole','flat','flat-steep','slope-change','steep'].includes(name))){
    const v=terrainDrawingPrintViewports(a.grid,1000)[1],r=layoutTerrainDrainage(a,v)
    verify(a,v,r)
    if(name==='flat'){assert.equal(r.arrows.length,0);assert.equal(r.metrics.validLengthM,0)}
    if(name==='flat-steep')assert.ok(r.arrows.every(a=>a.point[0]>=50))
    if(name==='slope-change')assert.ok(r.arrows.some(a=>a.kind==='gradient-change'))
    if(name==='channel-nodata'){
      assert.ok(r.metrics.validLengthM<400)
      for(const a of r.arrows)for(let i=0;i<=32;i++){const x=a.tail[0]+(a.head[0]-a.tail[0])*i/32;assert.ok(x<40||x>60)}
    }
    if(name==='hole')for(const arrow of r.arrows)for(let i=0;i<=32;i++){const x=arrow.tail[0]+(arrow.head[0]-arrow.tail[0])*i/32,y=arrow.tail[1]+(arrow.head[1]-arrow.tail[1])*i/32;assert.ok(!(x>38&&x<62&&y>1&&y<36))}
  }
})

test('dense label obstacles select other valid locations and a fully blocked frame stays empty',()=>{
  const a=drainageFixture(),v=terrainDrawingPrintViewports(a.grid,1000)[1],occupied=drainageTestLabels(),r=layoutTerrainDrainage(a,v,{occupied,fence:drainageTestFence()})
  assert.ok(r.arrows.length>=20);verify(a,v,r,drainageTestFence())
  for(const a of r.arrows)for(const segment of [...a.icon.segments,...(a.icon.leader?[a.icon.leader]:[])])for(let i=0;i<=100;i++){
    const p=segment[0].map((x,k)=>x+(segment[1][k]-x)*i/100)
    assert.ok(!occupied.some(b=>p[0]>=b.left-2&&p[0]<=b.right+2&&p[1]>=b.top-2&&p[1]<=b.bottom+2))
  }
  const blocked=layoutTerrainDrainage(a,v,{occupied:[{left:35,top:25,right:765,bottom:685}]})
  assert.equal(blocked.arrows.length,0);close(blocked.metrics.maxUncoveredM,400)
})

test('ring start and winding preserve coverage and actual downhill, independently of input mutation',()=>{
  const a=drainageFixture(),r=a.grid.boundary[0][0].slice(0,-1),variants=[r,[...r.slice(2),...r.slice(0,2)],[...r].reverse()]
  for(const ring of variants){const fresh=drainageFixture({boundary:[[[...ring,ring[0]]]]}),v=terrainDrawingPrintViewports(fresh.grid,1000)[1],result=layoutTerrainDrainage(fresh,v,{fence:drainageTestFence()});assert.ok(result.metrics.coveragePercent>=90);assert.ok(result.arrows.every(a=>a.head[0]>a.tail[0]&&a.head[1]<a.tail[1]));verify(fresh,v,result,drainageTestFence())}
})

test('largest supported synthetic grid has bounded scan work and output',()=>{
  const a=drainageFixture({boundary:[[drainageRing(0,0,950,950)]]}),v=terrainDrawingPrintViewports(a.grid,'auto')[1],r=layoutTerrainDrainage(a,v)
  assert.ok(a.grid.width*a.grid.height<=45000);assert.ok(r.metrics.candidateCount<=516);assert.ok(r.arrows.length<=64);verify(a,v,r)
})
