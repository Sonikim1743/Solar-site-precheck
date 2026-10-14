import test from 'node:test'
import assert from 'node:assert/strict'
import {terrainSlopeDistribution} from '../src/utils/terrainSlopeDistribution.js'
import {terrainDrawingViewport} from '../src/utils/terrainDrawingViewport.js'
import {buildTerrainLayout} from '../src/utils/terrainLayout.js'
const ring=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d],[a,b]]
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`)
const fixture=()=>({grid:{width:3,height:2,xMin:0,yMin:0,step:10,boundary:[[ring(0,0,15,10),ring(2,2,4,4)]],elevations:[100,100,100,100,100,100],slopes:[0,0,30,0,0,30]}})
test('slope area weights partial cells and subtracts holes instead of counting grid points',()=>{
 const a=fixture(),d=terrainSlopeDistribution(a)
 close(d.totalAreaM2,146);close(d.bins[0].areaM2,96);close(d.bins[1].areaM2,50);close(d.bins[0].percent,96/146*100)
 close(d.coveragePercent,100);close(d.unknownPercent,0);assert.equal(d.method,'projected-cell-intersection')
})
test('NoData retains total denominator and receives its own area and percentage',()=>{
 const a=fixture();a.grid.elevations[2]=null;const d=terrainSlopeDistribution(a)
 close(d.unknownAreaM2,50);close(d.unknownPercent,50/146*100);close(d.coveragePercent,96/146*100)
 close(d.bins.reduce((n,b)=>n+b.percent,0)+d.unknownPercent,100)
})
test('uncovered disconnected areas remain unknown, and bin thresholds do not overlap',()=>{
 const a=fixture();a.grid.boundary.push([ring(25,0,30,10)]);a.grid.slopes.fill(20)
 const d=terrainSlopeDistribution(a);close(d.totalAreaM2,196);close(d.bins[2].areaM2,146);close(d.unknownAreaM2,50)
 for(const i of [0,1,3])close(d.bins[i].areaM2,0)
})
test('drawing adds minimum ten metre context without changing geometry or the statistical denominator',()=>{
 const a=fixture(),before=JSON.stringify(a),v=terrainDrawingViewport(a.grid)
 assert.ok(v.west<=-10&&v.east>=25&&v.south<=-10&&v.north>=20)
 close(v.project([0,0])[0]-v.project([v.west,0])[0],-v.west*v.scale)
 close(terrainSlopeDistribution(a).totalAreaM2,146);assert.equal(JSON.stringify(a),before)
 const tall={...a.grid,boundary:[[ring(0,0,20,200)]]};const t=terrainDrawingViewport(tall)
 assert.ok(t.west<=-10&&t.east>=30&&t.south<=-10&&t.north>=210)
})
test('plan rotation, vertical module tilt and terrain cutoff remain independent physical quantities',()=>{
 const g={width:17,height:17,step:5,xMin:0,yMin:0,boundary:[[ring(0,0,80,80)]],elevations:Array(289).fill(100),slopes:Array(289).fill(17)}
 const make=(azimuthDeg,tiltDeg,slopeLimitDeg=20)=>buildTerrainLayout({grid:g},{azimuthDeg,tiltDeg,slopeLimitDeg,maxRacks:2,minColumns:4,maxColumns:4,setbackM:1})
 const a=make(180,10),b=make(90,10),c=make(90,30)
 for(const l of [a,b,c]){assert.equal(l.rackCount,2);assert.equal(l.moduleCount,32);close(l.dcKw,23.04);assert.equal(l.options.slopeLimitDeg,20)}
 const physicalTilt=m=>Math.atan2(m.corners[3][2]-m.corners[0][2],Math.hypot(m.corners[3][0]-m.corners[0][0],m.corners[3][1]-m.corners[0][1]))*180/Math.PI
 close(physicalTilt(a.racks[0].modules[0]),10);close(physicalTilt(b.racks[0].modules[0]),10);close(physicalTilt(c.racks[0].modules[0]),30)
 close(a.racks[0].depthM,b.racks[0].depthM);assert.ok(c.racks[0].depthM<b.racks[0].depthM)
 assert.equal(c.options.azimuthDeg,90);assert.equal(make(90,30,15).rackCount,0)
})
