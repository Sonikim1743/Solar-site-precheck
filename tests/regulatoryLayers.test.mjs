import test from 'node:test'
import assert from 'node:assert/strict'
import { HAZARD_LAYERS, SOIL_PREFECTURES, hazardTileUrl, initialHazardSettings, changeHazardSettings, hazardStatus, hazardRegionFromAddress, hazardRegionMessage } from '../src/utils/regulatoryLayers.js'
import { loadHazardTile, createHazardTileTracker } from '../src/services/hazardTiles.js'
import { terrainDxfSynthetic } from './fixtures/terrainDxfSynthetic.mjs'
import { createTerrainDxf } from '../src/utils/terrainDxf.js'

const coords={z:10,x:900,y:400}
test('regulatory display never changes applied DXF or inserts unlicensed hazard objects',()=>{
  const report=terrainDxfSynthetic(),before=createTerrainDxf(report)
  const changed=createTerrainDxf({...report,hazardSettings:{enabled:true},hazardRegion:{prefecture:'33'},regulatoryLayers:[{type:'Polygon',coordinates:[]} ]})
  assert.deepEqual(changed.bytes,before.bytes)
})
test('master display defaults to OFF and controls only presentation',()=>{
  const original=initialHazardSettings(),on=changeHazardSettings(original,{enabled:true})
  assert.deepEqual(original,{enabled:false,opacity:.5})
  assert.deepEqual(on,{enabled:true,opacity:.5})
  assert.deepEqual(changeHazardSettings(on,{selected:[],prefecture:'34',candidate:'changed',opacity:2}),{enabled:true,opacity:1})
  assert.equal(changeHazardSettings(on,{opacity:-1}).opacity,.1)
  assert.equal(changeHazardSettings(on,{opacity:NaN}).opacity,.5)
})
test('exact official flood and three soil sources; no invented river buffer',()=>{
  assert.equal(HAZARD_LAYERS.length,4)
  assert.equal(hazardTileUrl('flood',coords),'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/10/900/400.png')
  for(const layer of HAZARD_LAYERS.filter(l=>l.soil))assert.match(hazardTileUrl(layer.id,coords,'33'),/\/05_\w+_data\/33\/10\/900\/400.png$/)
  for(const bad of [{...coords,z:18},{...coords,x:-1},{...coords,y:1024},{...coords,x:1.2},{}])assert.throws(()=>hazardTileUrl('flood',bad))
  assert.throws(()=>hazardTileUrl('unknown',coords))
})
test('only the 42 verified prefectures can request soil tiles',async()=>{
  assert.equal(SOIL_PREFECTURES.filter(p=>p.allowed).length,42)
  assert.deepEqual(SOIL_PREFECTURES.filter(p=>!p.allowed).map(p=>p.code),['14','26','30','31','42'])
  let requested=false
  for(const code of ['', '14','26','30','31','42','99','../33'])await assert.rejects(loadHazardTile('debris',coords,{prefecture:code,fetchImpl:()=>{requested=true}}))
  assert.equal(requested,false)
})
test('map center address resolves allowed, unsupported and unprovided separately',()=>{
  assert.deepEqual(hazardRegionFromAddress({muniCd:'33201'}),{state:'ready',prefecture:'33',name:'岡山県'})
  assert.equal(hazardRegionFromAddress({muniCd:'34201'}).state,'ready')
  assert.equal(hazardRegionFromAddress({muniCd:'14100'}).state,'unsupported')
  for(const id of ['debris','steep','landslide'])assert.match(hazardTileUrl(id,coords,'34'),/\/34\/10\/900\/400.png$/)
  assert.equal(hazardRegionFromAddress({muniCd:''}).state,'unavailable')
  assert.match(hazardRegionMessage({state:'wide'}),/拡大/)
  assert.match(hazardRegionMessage({state:'ready',name:'岡山県'}),/県境外は未確認/)
})
test('ready PNG including transparency never establishes safety; HTTP 404 differs from failure',async()=>{
  const ready=await loadHazardTile('flood',coords,{fetchImpl:async(url,options)=>{
    assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer')
    return new Response(new Uint8Array([1]),{headers:{'content-type':'image/png'}})
  }})
  assert.equal(ready.state,'ready');assert.match(hazardStatus(['ready']).message,/安全性は未確認/)
  assert.deepEqual(await loadHazardTile('flood',coords,{fetchImpl:async()=>new Response(null,{status:404})}),{state:'unavailable'})
  assert.equal(hazardStatus(['unavailable']).state,'unavailable')
  assert.equal(hazardStatus(['unavailable','ready']).state,'partial')
  assert.equal(hazardStatus(['error','ready']).state,'error')
  assert.equal(hazardStatus(['loading','ready']).state,'loading')
  assert.equal(hazardStatus().state,'idle')
  for(const response of [new Response(null,{status:500}),new Response('html',{headers:{'content-type':'text/html'}}),new Response('',{headers:{'content-type':'image/png'}}),new Response(new Uint8Array(2*1024*1024+1),{headers:{'content-type':'image/png'}})])await assert.rejects(loadHazardTile('flood',coords,{fetchImpl:async()=>response}))
  await assert.rejects(loadHazardTile('flood',coords,{fetchImpl:async()=>{throw Error('network')}}))
})
test('turning OFF or removing tiles aborts requests and ignores late completions',async()=>{
  const controller=new AbortController();let underlying
  const loading=loadHazardTile('flood',coords,{signal:controller.signal,fetchImpl:async(url,{signal})=>{
    underlying=signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError'))))
  }})
  controller.abort();await assert.rejects(loading,{name:'AbortError'});assert.equal(underlying.aborted,true)
  const reports=[],tracker=createHazardTileTracker(states=>reports.push(states))
  const old=tracker.begin('a'),current=tracker.begin('a')
  assert.equal(old.controller.signal.aborted,true);assert.equal(tracker.finish('a',old,'ready'),false)
  tracker.finish('a',current,'ready');assert.deepEqual(reports.at(-1),['ready'])
  tracker.remove('a');assert.equal(current.controller.signal.aborted,true)
  const pending=tracker.begin('b');tracker.stop();const count=reports.length
  assert.equal(pending.controller.signal.aborted,true);tracker.finish('b',pending,'error');assert.equal(reports.length,count)
})
