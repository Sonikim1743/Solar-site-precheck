import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeTerrainLayoutOptions,buildTerrainLayout,buildAutomaticTerrainLayout,buildSouthTerrainLayout} from '../src/utils/terrainLayout.js'
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`)
const fixture=()=>({grid:{width:17,height:17,step:5,xMin:0,yMin:0,boundary:[[[[0,0],[80,0],[80,80],[0,80],[0,0]]]],elevations:Array(289).fill(100),slopes:Array(289).fill(0)}})
test('fresh defaults use tilt15 and a3.3m clear row gap, leaving 20mm module gaps and terrain cutoff separate',()=>{
 const d=normalizeTerrainLayoutOptions();assert.equal(d.tiltDeg,15);assert.equal(d.rowGapM,3.3);assert.equal(d.moduleGapM,.02);assert.equal(d.slopeLimitDeg,10)
 const edited=normalizeTerrainLayoutOptions({...d,tiltDeg:20,rowGapM:4.7}),rotated=normalizeTerrainLayoutOptions({...edited,azimuthDeg:90,tiltDeg:30})
 assert.equal(rotated.rowGapM,4.7);assert.equal(rotated.tiltDeg,30);assert.equal(rotated.azimuthDeg,90);assert.equal(normalizeTerrainLayoutOptions().rowGapM,3.3)
})
test('row pitch adds horizontal projected rack depth to the clear3.3m gap instead of treating3.3 as pitch',()=>{
 const l=buildTerrainLayout(fixture(),{minColumns:4,maxColumns:4}),rows=[...new Set(l.racks.map(r=>r.footprint[0][1]))].sort((a,b)=>a-b)
 assert.ok(rows.length>=2);const r=l.racks[0],back=Math.max(...r.footprint.map(p=>p[1]))
 close(r.depthM,(4*1.303+3*.02)*Math.cos(15*Math.PI/180));close(rows[1]-rows[0],r.depthM+3.3);close(rows[1]-back,3.3)
 for(const result of [buildAutomaticTerrainLayout(fixture(),{autoTimeLimitMs:1000}),buildSouthTerrainLayout(fixture(),{autoTimeLimitMs:1000})]){assert.equal(result.options.tiltDeg,15);assert.equal(result.options.rowGapM,3.3)}
})
