import test from 'node:test'
import assert from 'node:assert/strict'
import polygonClipping from 'polygon-clipping'
import {buildSouthTerrainLayout,buildTerrainLayout} from '../src/utils/terrainLayout.js'
const ring=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d],[a,b]]
const fixture=()=>({grid:{width:19,height:19,step:5,xMin:0,yMin:0,boundary:[[ring(0,0,90,90),ring(20,20,35,40)]],elevations:Array(361).fill(100),slopes:Array(361).fill(12)}})
test('south-fixed search changes only compass direction and phase, preserving tilt, spacing and excluded holes',()=>{
 const a=fixture(),o={azimuthDeg:90,tiltDeg:28,rackGapM:2,rowGapM:3,setbackM:2,slopeLimitDeg:15,maxRacks:40},before=structuredClone({a,o})
 const result=buildSouthTerrainLayout(a,{...o,autoTimeLimitMs:2000})
 assert.equal(result.options.azimuthDeg,180);assert.equal(result.stats.autoSearch.mode,'south-fixed');assert.ok(result.rackCount>0)
 for(const key of ['tiltDeg','rackGapM','rowGapM','setbackM','slopeLimitDeg'])assert.equal(result.options[key],o[key])
 assert.ok(result.stats.autoSearch.candidates.every(p=>p.azimuthDeg===180));assert.ok(result.stats.autoSearch.trials<=32)
 for(const rack of result.racks){assert.deepEqual(polygonClipping.difference([rack.footprint],a.grid.boundary),[]);assert.deepEqual(polygonClipping.intersection([rack.footprint],[[ring(20,20,35,40)]]),[])}
 assert.ok(result.warnings.some(w=>w.includes('全域最大の保証ではありません')));assert.deepEqual({a,o},before)
})
test('a compatible true-south applied baseline is retained through bounded/failed extra search',()=>{
 const a=fixture(),o={azimuthDeg:180,tiltDeg:25,slopeLimitDeg:15},baseline={...buildTerrainLayout(a,o),analysisReference:a}
 const r=buildSouthTerrainLayout(a,{...o,autoTimeLimitMs:0},baseline)
 assert.equal(r.moduleCount,baseline.moduleCount);assert.equal(r.stats.autoSearch.baselineRetained,true);assert.equal(r.options.tiltDeg,25);assert.equal(r.options.azimuthDeg,180)
})
test('south-fixed mode never relaxes terrain cutoff to gain capacity',()=>{
 const a=fixture(),r=buildSouthTerrainLayout(a,{tiltDeg:35,slopeLimitDeg:10,autoTimeLimitMs:1000})
 assert.equal(r.moduleCount,0);assert.equal(r.options.slopeLimitDeg,10);assert.equal(r.options.tiltDeg,35)
})
