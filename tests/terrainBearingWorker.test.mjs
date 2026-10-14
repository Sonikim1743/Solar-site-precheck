import test from 'node:test'
import assert from 'node:assert/strict'
import {buildAutomaticTerrainLayout} from '../src/utils/terrainLayout.js'
const ring=[[15,35],[85,35],[85,65],[15,65],[15,35]],angle=15*Math.PI/180
const boundary=ring.map(([x,y])=>[50+(x-50)*Math.cos(angle)-(y-50)*Math.sin(angle),50+(x-50)*Math.sin(angle)+(y-50)*Math.cos(angle)])
const analysis={grid:{width:21,height:21,step:5,xMin:0,yMin:0,boundary:[[boundary]],elevations:Array(441).fill(100),slopes:Array(441).fill(0)}}
globalThis.self={};await import('../src/workers/terrainLayoutWorker.js');const handler=self.onmessage;delete globalThis.self
function run(options,flags={}){let response;globalThis.self={postMessage:value=>{response=value}};try{handler({data:{analysis,options,...flags}})}finally{delete globalThis.self}assert.ok(!response.error,response.error);return response.result}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≠ ${b}`)
test('manual worker keeps 0/90/180/270 and every actual panel front normal matches the geographic bearing',()=>{
 for(const azimuthDeg of [0,90,180,270]){
  const result=run({azimuthDeg});assert.equal(result.options.azimuthDeg,azimuthDeg);assert.ok(result.moduleCount>0)
  for(const rack of result.racks)for(const {corners:p} of rack.modules){
   const u=p[1].map((n,i)=>n-p[0][i]),v=p[3].map((n,i)=>n-p[0][i]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
   const bearing=(Math.atan2(n[0],n[1])*180/Math.PI+360)%360
   close(Math.abs(((bearing-azimuthDeg+540)%360)-180),0);close(Math.atan2(Math.hypot(n[0],n[1]),n[2])*180/Math.PI,15)
  }
  assert.equal(result.options.rowGapM,3.3)
 }
})
test('oblique boundary previously changes manual south to another bearing; fixed worker does not',()=>{
 const old=buildAutomaticTerrainLayout(analysis,{azimuthDeg:180})
 assert.notEqual(old.options.azimuthDeg,180)
 const south=run({azimuthDeg:180});assert.equal(south.options.azimuthDeg,180)
 for(const azimuthDeg of [180,90,180])assert.equal(run({azimuthDeg}).options.azimuthDeg,azimuthDeg)
})
test('south-only comparison fixes 180 even when the current input is east; explicit optimization discloses its basis',()=>{
 const south=run({azimuthDeg:90},{fixedSouth:true});assert.equal(south.options.azimuthDeg,180);assert.ok(south.stats.autoSearch.candidates.every(c=>c.azimuthDeg===180))
 const optimized=run({azimuthDeg:180},{optimized:true});assert.equal(optimized.stats.autoSearch.baseAzimuthDeg,180);assert.equal(optimized.stats.autoSearch.mode,'optimized')
 assert.equal(optimized.options.azimuthDeg,optimized.stats.autoSearch.selectedAzimuthDeg)
})
