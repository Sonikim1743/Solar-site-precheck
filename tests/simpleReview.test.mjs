import test from 'node:test'
import assert from 'node:assert/strict'
import { runSimpleReview, simpleReviewDefaults } from '../src/services/simpleReview.js'
import { terrainReviewSynthetic } from './fixtures/terrainReviewSynthetic.mjs'
import { normalizeTerrainArea } from '../src/utils/terrainArea.js'
import { buildTerrainLayout } from '../src/utils/terrainLayout.js'
import { pointInGeometry, featureInteriorPoint } from '../src/services/parcelGeometry.js'
import { thirdMeshCode } from '../src/services/nedo.js'
import { simpleReviewReportRows } from '../src/utils/simpleReviewReport.js'
import { terrainReportLayouts } from '../src/utils/terrainLayoutReport.js'
function fixture(){const s=terrainReviewSynthetic();const area=normalizeTerrainArea({...s.terrainArea,grid:{...s.terrainArea.grid,elevations:s.terrainArea.grid.elevations.map(()=>100)}});return {...s,terrainArea:area}}
function dependencies(s){return {fetchElevation:async()=>({value:100,dataSource:'合成DEM'}),section:async()=>({lines:[{label:'東西',points:[{elevation:100}],summary:{minElevation:100,maxElevation:100}}]}),horizon:async()=>({samples:Array.from({length:8},(_,i)=>({direction:String(i),angle:1,missingCount:0}))}),snow:async mesh=>({id:mesh,mode:'nedo-web',verified:true,validationVersion:2,snow10cm:{annual:10,winter:10},source:{statisticalPeriod:'合成'}}),area:async()=>s.terrainArea,layout:async(a,o)=>buildTerrainLayout(a,o)}}
test('confirmed range uses an interior representative and untouched defaults, with explicit applied snapshot',async()=>{
 const s=fixture(),original=JSON.stringify(s.parcelReview),calls=[];const result=await runSimpleReview(s.parcelReview,{dependencies:dependencies(s),onProgress:p=>calls.push(p.name)})
 assert.equal(result.status,'complete');assert.ok(pointInGeometry(result.position,s.terrainArea.geometry));assert.equal(JSON.stringify(s.parcelReview),original)
 assert.equal(result.defaults.layout.slopeLimitDeg,10);assert.equal(result.defaults.layout.tiltDeg,10);assert.equal(result.defaults.sectionRangeM,100);assert.equal(result.defaults.obstructionHeightM,20)
 assert.equal(result.steps.length,6);assert.equal(calls.length,6);assert.ok(result.results.layout.moduleCount>0);assert.equal(result.results.layout.dcKw,result.results.layout.moduleCount*.72)
 assert.ok(simpleReviewReportRows(result).some(([k,v])=>k==='配置で実際に適用した値'&&v.includes('DC')))
 assert.ok(simpleReviewReportRows(result).some(([k,v])=>k==='NEDO同一メッシュ'&&v.includes(thirdMeshCode(result.position.lat,result.position.lon))))
 assert.equal(terrainReportLayouts(s.terrainArea,{simpleReview:true}).totalPages,4)
})
test('reference-only selections never become a calculated region',async()=>{await assert.rejects(runSimpleReview({version:1,parcels:[],boundary:null,exclusions:[]}),/範囲/)} )
test('representative is inside concave, holed and multipart polygons rather than the bounds midpoint',()=>{
 const cases=[{type:'Polygon',coordinates:[[[135,35],[135.003,35],[135.003,35.001],[135.001,35.001],[135.001,35.003],[135,35.003],[135,35]]]},{type:'MultiPolygon',coordinates:[[[[135,35],[135.001,35],[135.001,35.001],[135,35.001],[135,35]]],[[[135.003,35],[135.004,35],[135.004,35.001],[135.003,35.001],[135.003,35]]]]},terrainReviewSynthetic().parcelReview.boundary]
 for(const geometry of cases){const p=featureInteriorPoint({geometry});assert.ok(p);assert.ok(pointInGeometry(p,geometry))}
})
test('failed NEDO or horizon is confirmation-needed, with null retained instead of invented zeros',async()=>{
 const s=fixture(),deps=dependencies(s);deps.snow=async()=>{throw Error('合成通信失敗')};deps.horizon=async()=>({samples:[{direction:'北',angle:null,missing:true}]})
 const r=await runSimpleReview(s.parcelReview,{dependencies:deps});assert.equal(r.status,'review');assert.equal(r.results.snow,null);assert.ok(r.results.layout.moduleCount>0)
 assert.ok(simpleReviewReportRows(r).some(([k,v])=>k==='地平線 北'&&v.includes('未取得')))
})
test('zero placements and incomplete DEM are confirmation-needed, not complete',async()=>{
 const s=fixture(),deps=dependencies(s);deps.area=async()=>({...s.terrainArea,summary:{...s.terrainArea.summary,coveragePercent:80}});deps.layout=async(a,o)=>({...buildTerrainLayout(a,o),rackCount:0,racks:[],moduleCount:0,dcKw:0})
 const r=await runSimpleReview(s.parcelReview,{dependencies:deps});assert.equal(r.status,'review');assert.equal(r.steps.find(s=>s.name==='参考配置').status,'review')
})
test('core terrain failure explicitly skips layout and cannot provide PDFs',async()=>{const s=fixture(),deps=dependencies(s);deps.area=async()=>{throw Error('地形失敗')};let called=false;deps.layout=async()=>{called=true};const r=await runSimpleReview(s.parcelReview,{dependencies:deps});assert.equal(called,false);assert.equal(r.results.area,null);assert.equal(r.results.layout,null);assert.equal(r.status,'review')})
test('cancel during a late response blocks downstream stages and completion',async()=>{
 const s=fixture(),deps=dependencies(s),c=new AbortController();let resolve,called=false;deps.section=()=>new Promise(r=>{resolve=r});deps.area=async()=>{called=true}
 const pending=runSimpleReview(s.parcelReview,{dependencies:deps,signal:c.signal});await new Promise(r=>setTimeout(r,0));c.abort();resolve({lines:[]});await assert.rejects(pending);assert.equal(called,false)
})
test('defaults return independent snapshots and never accept manual option mutation',()=>{const a=simpleReviewDefaults();a.layout.rowGapM=9;assert.equal(simpleReviewDefaults().layout.rowGapM,4)})
test('mismatched worker options or module capacity cannot be published as a PDF-ready result',async()=>{
 const s=fixture()
 for(const change of [l=>({...l,options:{...l.options,slopeLimitDeg:20}}),l=>({...l,dcKw:1}),l=>({...l,racks:[null]})]) {const deps=dependencies(s);deps.layout=async(a,o)=>change(buildTerrainLayout(a,o));const r=await runSimpleReview(s.parcelReview,{dependencies:deps});assert.equal(r.results.layout,null);assert.equal(r.steps.at(-1).status,'error');assert.equal(r.status,'review')}
})

test('the confirmed parcel 3D acquisition is reused only for the same validated geometry',async()=>{
 const s=fixture(),deps=dependencies(s);let calls=0;deps.area=async()=>{calls++;return s.terrainArea}
 const r=await runSimpleReview(s.parcelReview,{dependencies:deps,terrainArea:s.terrainArea})
 assert.equal(calls,0);assert.equal(r.results.area.geometryKey,s.terrainArea.geometryKey);assert.equal(r.status,'complete')
 await runSimpleReview(s.parcelReview,{dependencies:deps,terrainArea:{...s.terrainArea,geometryKey:'another-region'}})
 assert.equal(calls,1)
 deps.area=async()=>({...s.terrainArea,geometryKey:'wrong-response'})
 const wrong=await runSimpleReview(s.parcelReview,{dependencies:deps})
 assert.equal(wrong.results.area,null);assert.equal(wrong.results.layout,null);assert.equal(wrong.status,'review')
})
