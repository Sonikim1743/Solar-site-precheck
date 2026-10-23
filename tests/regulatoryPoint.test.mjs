import test from 'node:test'
import assert from 'node:assert/strict'
import { locateReferencePoint, hazardPointTile, classifyHazardPixel, activeReferenceSources, inspectionPointKey } from '../src/utils/regulatoryPoint.js'
import { inspectReferencePoint, inspectHazardPoint, inspectRegulatoryPoint, lookupPointPrefecture } from '../src/services/regulatoryPointQuery.js'

// Generic synthetic geometry. No candidate/site records or private coordinates.
const point = { lat: 35, lon: 130 }
const ring = [[129,34],[131,34],[131,36],[129,36],[129,34]]
const hole = [[129.5,34.5],[130.5,34.5],[130.5,35.5],[129.5,35.5],[129.5,34.5]]
const polygon = coordinates => ({ type: 'Polygon', coordinates })
const file = { url: '/data/regulatory/synthetic/1_1.geojson', bbox: [129,34,131,36] }
const source = { id: 'synthetic', category: 'culture', label: '合成資料', bbox: [128,33,132,37], files: [file] }
const feature = (id, geometry=polygon([ring]), props={}) => ({ type:'Feature',id,bbox:file.bbox,geometry,properties:{sourceRecordId:id,name:`合成${id}`,kind:'合成区分',...props} })
const collection = features => new Response(JSON.stringify({type:'FeatureCollection',features}), {headers:{'content-type':'application/geo+json'}})
const png = () => new Response(new Uint8Array([1]), {headers:{'content-type':'image/png'}})
const region = async () => ({state:'ready',code:'33',name:'岡山県'})

test('point containment distinguishes interior, exterior and polygon boundary',()=>{
  assert.equal(locateReferencePoint(point,polygon([ring])),'inside')
  assert.equal(locateReferencePoint({lat:35,lon:129},polygon([ring])),'boundary')
  assert.equal(locateReferencePoint({lat:36.1,lon:130},polygon([ring])),'outside')
})
test('holes, hole boundaries and concave bounds do not become false matches',()=>{
  assert.equal(locateReferencePoint(point,polygon([ring,hole])),'outside')
  assert.equal(locateReferencePoint({lat:35,lon:129.5},polygon([ring,hole])),'boundary')
  const concave=[[129,34],[131,34],[131,35],[130,35],[130,36],[129,36],[129,34]]
  assert.equal(locateReferencePoint({lat:35.5,lon:130.5},polygon([concave])),'outside')
})
test('MultiPolygon uses every part and invalid or degenerate geometry stays unknown',()=>{
  assert.equal(locateReferencePoint(point,{type:'MultiPolygon',coordinates:[[hole],[ring]]}),'inside')
  for(const geometry of [null,{type:'LineString',coordinates:ring},polygon([ring.slice(1)]),polygon([[[130,35],[130,35],[130,35],[130,35]]]),polygon([[[0,0],[1,1],[2,2],[0,0]]])]) assert.equal(locateReferencePoint(point,geometry),'invalid')
})
test('all overlapping records retained and components of one source record deduplicated',async()=>{
  const rows=await inspectReferencePoint(point,{sources:[source],fetchImpl:async()=>collection([feature('a'),feature('b'),feature('part',{type:'MultiPolygon',coordinates:[[ring]]},{sourceRecordId:'a'})])})
  assert.equal(rows[0].state,'matched');assert.deepEqual(rows[0].matches.map(x=>x.sourceRecordId),['a','b']);assert.equal(rows[0].matches[0].components.length,2)
})
test('bbox alone does not imply overlap; holes yield qualified no-match',async()=>{
  const rows=await inspectReferencePoint(point,{sources:[source],fetchImpl:async()=>collection([feature('a',polygon([ring,hole]))])})
  assert.equal(rows[0].state,'none');assert.equal(rows[0].matches.length,0)
})
test('source notes, original condition and description remain attributed values',async()=>{
  const rows=await inspectReferencePoint(point,{sources:[source],fetchImpl:async()=>collection([feature('note',polygon([ring]),{sourceCondition:'調査後一部消滅',sourceRemark:'元位置不明',sourceDescription:'原資料概要',detailKind:'石造物',sourceFinds:'出土資料'})])})
  const match=rows[0].matches[0]
  assert.equal(match.condition,'調査後一部消滅');assert.equal(match.remark,'元位置不明');assert.equal(match.description,'原資料概要');assert.equal(match.detailKind,'石造物');assert.equal(match.finds,'出土資料')
})
test('source outside bbox is unprovided, not a finding of no restrictions',async()=>{
  const rows=await inspectReferencePoint({lat:40,lon:140},{sources:[source],fetchImpl:()=>{throw Error('must not fetch')}})
  assert.equal(rows[0].state,'outside')
})
test('reference 404, wrong MIME, malformed geometry and bbox stay failed/unknown',async()=>{
  for(const fetchImpl of [async()=>new Response(null,{status:404}),async()=>new Response('<html>',{headers:{'content-type':'text/html'}}),async()=>collection([feature('bad',null)]),async()=>collection([{...feature('bad'),bbox:[131,34,129,36]}])]) {
    const rows=await inspectReferencePoint(point,{sources:[source],fetchImpl})
    assert.equal(rows[0].state,'error');assert.equal(rows[0].failures.length,1)
  }
})
test('partial chunk failure preserves confirmed matches with incomplete status',async()=>{
  const two={...source,files:[file,{...file,url:'/data/regulatory/synthetic/1_2.geojson'}]}
  const rows=await inspectReferencePoint(point,{sources:[two],fetchImpl:async url=>url===file.url?collection([feature('a')]):new Response(null,{status:404})})
  assert.equal(rows[0].state,'error');assert.equal(rows[0].matches.length,1)
  const capped=await inspectReferencePoint(point,{sources:[two],maxFilesPerSource:1,fetchImpl:async()=>collection([feature('a')])})
  assert.equal(capped[0].state,'partial')
})
test('old agricultural-use data require opt in without hiding agricultural regions',()=>{
  assert.equal(activeReferenceSources().length,4);assert.equal(activeReferenceSources(true).length,6)
  assert.ok(activeReferenceSources().some(s=>s.historic&&s.category==='agriculture-region'))
  assert.equal(activeReferenceSources().some(s=>s.category==='agricultural-use'),false)
})
test('slippy tile calculation and pixel use exact internal point',()=>{
  const {coords,pixel}=hazardPointTile(point)
  assert.equal(coords.z,17);assert.ok(pixel.x>=0&&pixel.x<256&&pixel.y>=0&&pixel.y<256)
  assert.throws(()=>hazardPointTile({lat:NaN,lon:130}));assert.throws(()=>hazardPointTile(point,18))
  assert.notEqual(inspectionPointKey(point),inspectionPointKey({...point,lat:35.000001}))
})
test('paint, transparency and white are distinct without invented hazard ranks',()=>{
  assert.equal(classifyHazardPixel([255,0,0,255]).state,'painted')
  assert.equal(classifyHazardPixel([255,0,0,0]).state,'nodata')
  assert.equal(classifyHazardPixel([255,255,255,255]).state,'unreadable')
  assert.equal(classifyHazardPixel([255,255,0,255]).rankKnown,false)
  assert.throws(()=>classifyHazardPixel([255,0,0]))
})
test('all four raster layers use the selected point prefecture and return pixel states',async()=>{
  const urls=[]
  const result=await inspectHazardPoint(point,{lookupRegion:region,fetchImpl:async url=>{urls.push(url);return png()},decodePixel:async()=>[255,0,0,255]})
  assert.equal(result.layers.length,4);assert.ok(result.layers.every(x=>x.state==='painted'))
  assert.equal(urls.filter(url=>url.includes('/33/17/')).length,3)
})
test('404 does not decode or imply no hazard',async()=>{
  const result=await inspectHazardPoint(point,{lookupRegion:region,fetchImpl:async()=>new Response(null,{status:404}),decodePixel:()=>{throw Error('no decode')}})
  assert.ok(result.layers.every(x=>x.state==='unavailable'));assert.ok(result.layers.every(x=>/安全とは判定できません/.test(x.message)))
})
test('network failures, PNG format failures and decoder failures are separate from no-data',async()=>{
  for(const fetchImpl of [async()=>{throw Error('offline')},async()=>new Response('html',{headers:{'content-type':'text/html'}})]) {
    const result=await inspectHazardPoint(point,{lookupRegion:region,fetchImpl})
    assert.ok(result.layers.every(x=>x.state==='error'))
  }
  const unreadable=await inspectHazardPoint(point,{lookupRegion:region,fetchImpl:async()=>png(),decodePixel:async()=>{throw Error('decoder unsupported')}})
  assert.ok(unreadable.layers.every(x=>x.state==='unreadable'))
  const transparent=await inspectHazardPoint(point,{lookupRegion:region,fetchImpl:async()=>png(),decodePixel:async()=>[0,0,0,0]})
  assert.ok(transparent.layers.every(x=>x.state==='nodata'))
})
test('unconfirmed or unsupported soil region never causes a guessed tile request; flood independent',async()=>{
  for(const state of ['unsupported','unconfirmed','error']) {
    const urls=[]
    const result=await inspectHazardPoint(point,{lookupRegion:async()=>({state,message:'test'}),fetchImpl:async url=>{urls.push(url);return png()},decodePixel:async()=>[0,0,0,0]})
    assert.equal(urls.length,1);assert.equal(result.layers[0].state,'nodata');assert.ok(result.layers.slice(1).every(x=>x.state===state))
  }
})
test('selected prefecture lookup validates municipality response and keeps unapproved regions blocked',async()=>{
  for(const [code,state] of [['33210','ready'],['14100','unsupported'],['unknown','unconfirmed']]) {
    const result=await lookupPointPrefecture(point,{fetchImpl:async()=>Response.json({results:{muniCd:code}})})
    assert.equal(result.state,state)
  }
  assert.equal((await lookupPointPrefecture(point,{fetchImpl:async()=>{throw Error('offline')}})).state,'error')
})
test('OFF issues no requests; enabled completes both vector and raster branches',async()=>{
  const off=await inspectRegulatoryPoint(point,{fetchImpl:()=>{throw Error('must not fetch')}})
  assert.equal(off.state,'off')
  const result=await inspectRegulatoryPoint(point,{enabled:true,useStored:false,sources:[source],lookupRegion:region,fetchImpl:async url=>url.startsWith('/data')?collection([feature('a')]):png(),decodePixel:async()=>[0,0,0,0]})
  assert.equal(result.state,'complete');assert.equal(result.references[0].matches.length,1);assert.equal(result.hazards.layers.length,4)
})
test('cancellation terminates concurrent branches without returning a stale result',async()=>{
  const controller=new AbortController()
  const fetchImpl=async(_url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true})})
  const pending=inspectRegulatoryPoint(point,{enabled:true,useStored:false,sources:[source],signal:controller.signal,fetchImpl})
  controller.abort()
  await assert.rejects(pending,{name:'AbortError'})
})
