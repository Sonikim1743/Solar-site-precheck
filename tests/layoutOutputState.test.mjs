import test from 'node:test'
import assert from 'node:assert/strict'
import {terrainReviewSynthetic} from './fixtures/terrainReviewSynthetic.mjs'
import {normalizeTerrainArea} from '../src/utils/terrainArea.js'
import {buildTerrainLayout} from '../src/utils/terrainLayout.js'
import {terrainLayoutAnalysisKey} from '../src/utils/terrainLayoutComparison.js'
import {layoutOutputState,latestLayoutAnalysis} from '../src/utils/layoutOutputState.js'
import {runSimpleReview} from '../src/services/simpleReview.js'

function fixture(){const f=terrainReviewSynthetic();const area=normalizeTerrainArea({...f.terrainArea,grid:{...f.terrainArea.grid,elevations:f.terrainArea.grid.elevations.map(()=>100)}});const raw=buildTerrainLayout(area,{tiltDeg:20,azimuthDeg:135});const pool={...raw,analysisReference:area,analysisKey:terrainLayoutAnalysisKey(area)};return {...f,area,pool,preview:{layout:pool,options:pool.options,appliedOptions:pool.options,layoutMode:'manual',appliedMode:'manual',fence:true,disabledRackIds:[pool.racks[0].id]}}}

test('the latest acquisition of the exact scope wins over an older selected-parcel cache',()=>{
 const older={geometryKey:'A',fetchedAt:'2026-10-15T00:00:00Z'},newer={...older,fetchedAt:'2026-10-16T00:00:00Z'},other={...newer,geometryKey:'B'}
 assert.equal(latestLayoutAnalysis('A',newer,older,other),newer)
 assert.equal(latestLayoutAnalysis('A',older,newer),newer)
 assert.equal(latestLayoutAnalysis('A',other),null)
 assert.equal(latestLayoutAnalysis('A',newer,{...newer}),newer)
})

test('output keeps the same selected rack geometry and capacity; drafts, mode changes and acquisitions block it',()=>{
 const {area,pool,preview}=fixture(),state=layoutOutputState(area,preview)
 assert.equal(state.current,true);assert.equal(state.layout.rackCount,pool.rackCount-1)
 assert.deepEqual(state.layout.racks,pool.racks.slice(1));assert.ok(Math.abs(state.layout.dcKw-state.layout.moduleCount*.72)<1e-8)
 for(const candidate of [{...preview,options:{...preview.options,tiltDeg:10}},{...preview,layoutMode:'optimized'},{...preview,calculating:true},{...preview,outputBlocked:true}]){const out=layoutOutputState(area,candidate);assert.equal(out.current,false);assert.equal(out.layout,null);assert.equal(out.blocked,true)}
 assert.equal(layoutOutputState({...area},preview).blocked,true)
 assert.equal(layoutOutputState(undefined,undefined).blocked,false)
 assert.equal(preview.layout,pool)
})

test('simple output reuses the detailed engine result and current exclusions, bearing and real module plane',async()=>{
 const {area,pool,preview,parcelReview}=fixture();let layoutCalls=0
 const dependencies={fetchElevation:async()=>({value:100}),section:async()=>({lines:[]}),horizon:async()=>({samples:[]}),snow:async()=>null,area:async()=>area,layout:async()=>{layoutCalls++;throw Error('must reuse applied pool')}}
 const r=await runSimpleReview(parcelReview,{terrainArea:area,layoutPreview:preview,layoutOptions:preview.options,layoutSettings:{tiltDeg:20,direction:'manual'},dependencies})
 assert.equal(r.reusedLayout,true);assert.equal(layoutCalls,0);assert.equal(r.results.layout.moduleCount,pool.moduleCount-pool.racks[0].moduleCount)
 assert.equal(r.results.layout.options.azimuthDeg,135);assert.ok(Math.abs(r.results.layout.dcKw-r.results.layout.moduleCount*.72)<1e-8)
 for(const rack of r.results.layout.racks)for(const module of rack.modules){const [a,,,b]=module.corners;const angle=Math.atan2(b[2]-a[2],Math.hypot(b[0]-a[0],b[1]-a[1]))*180/Math.PI;assert.ok(Math.abs(angle-20)<1e-7)}
 assert.deepEqual(r.results.layout.racks,pool.racks.slice(1));assert.equal(preview.disabledRackIds.length,1)
})

test('a changed tilt cannot reuse the old detailed pool even if geometry and quantity look the same',async()=>{
 const {area,preview,parcelReview}=fixture();let calls=0
 const r=await runSimpleReview(parcelReview,{terrainArea:area,layoutPreview:{...preview,options:{...preview.options,tiltDeg:10}},layoutOptions:{...preview.options,tiltDeg:10},layoutSettings:{tiltDeg:10,direction:'manual'},dependencies:{fetchElevation:async()=>({value:100}),section:async()=>({lines:[]}),horizon:async()=>({samples:[]}),snow:async()=>null,layout:async(a,o)=>{calls++;return buildTerrainLayout(a,o)}}})
 assert.equal(calls,1);assert.equal(r.reusedLayout,false);assert.equal(r.results.layout.options.tiltDeg,10)
})
