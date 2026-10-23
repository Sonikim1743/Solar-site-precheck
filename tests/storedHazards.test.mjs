import test from 'node:test'
import assert from 'node:assert/strict'
import {gzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {inspectStoredPoint,storedPrefecture,storedManifest,loadStoredViewport,validateStoredManifest,storedFeatureInfo} from '../src/services/storedHazards.js'
import {inspectRegulatoryPoint} from '../src/services/regulatoryPointQuery.js'
const hash=b=>createHash('sha256').update(b).digest('hex'),version='r2025-123456abcdef'
const box=[129,34,131,36],point={lat:35,lon:130}
const ring=[[129,34],[131,34],[131,36],[129,36],[129,34]]
function feature(id,category='soil',geometry={type:'Polygon',coordinates:[ring]}){return {type:'Feature',id,bbox:box,geometry,properties:{sourceDatasetId:id,sourceRecordId:'1',A33_001:2,A33_002:3,A33_005:'合成区域',A33_008:0,...(category==='admin'?{N03_001:'合成県',N03_007:id.slice(-2)+'001'}:{})}}}
function fixture({hole=false,line=false,fail=false,tamper=false}={}){
  const assets=new Map(),datasets=[]
  for(const [category,codes] of [['soil',['33','34','35']],['flood',['33','34','35','87']],['admin',['33','34','35']]])for(const code of codes){
    const id=`${category}-${code}`,d={id,category,prefecture:code,bbox:code==='33'?box:[140,40,141,41],files:[],archiveSha256:'a'.repeat(64),sourceCrs:{epsg:6668},geometryCounts:{Polygon:1}}
    if(code==='33'&&category!=='flood'){
      let f=feature(id,category)
      if(hole&&category==='soil')f.geometry.coordinates.push([[129.5,34.5],[130.5,34.5],[130.5,35.5],[129.5,35.5],[129.5,34.5]])
      if(line&&category==='soil')f.geometry={type:'LineString',coordinates:[[129,34],[131,36]]}
      const plain=Buffer.from(JSON.stringify({type:'FeatureCollection',features:[f]})),bytes=gzipSync(plain),name='1300_350_0.geojson.gz'
      d.files.push({name,bbox:box,count:1,bytes:bytes.length,decodedBytes:plain.length,encoding:'gzip',sha256:hash(bytes)})
      assets.set(`/data/stored-hazards/${version}/${id}/${name}`,{body:tamper&&category==='soil'?Buffer.from('bad'):bytes,type:'application/octet-stream',status:fail&&category==='soil'?404:200})
    }
    datasets.push(d)
  }
  const manifest={schemaVersion:1,version,simplified:false,prefectures:['33','34','35'],datasets,fileCount:2,collectedAt:'2026-10-23T00:00:00Z'}
  const bytes=Buffer.from(JSON.stringify(manifest)),pointer={schemaVersion:1,version,url:`/data/stored-hazards/${version}/manifest.json`,sha256:hash(bytes)}
  assets.set('/data/stored-hazards/current.json',{body:JSON.stringify(pointer),type:'application/json'})
  assets.set(pointer.url,{body:bytes,type:'application/json'})
  const urls=[],fetchImpl=async url=>{urls.push(url);assert.ok(url.startsWith('/data/stored-hazards/'),'must stay local');const item=assets.get(url);assert.ok(item,url);return new Response(item.body,{status:item.status||200,headers:{'content-type':item.type}})}
  return {manifest,pointer,fetchImpl,urls,assets}
}
test('stored point reads local admin and all precision overlaps with original designation',async()=>{
  const f=fixture(),r=await inspectStoredPoint(point,f)
  assert.equal(r.region.code,'33');assert.equal(r.datasets.length,3)
  assert.equal(r.datasets[0].state,'matched');assert.match(r.datasets[0].matches[0].designation,/指定前・基礎調査公表/)
  assert.equal(r.datasets[0].matches[0].properties.A33_005,'合成区域')
  await inspectStoredPoint(point,f);assert.equal(f.urls.filter(u=>u.endsWith('current.json')).length,1)
})
test('polygon holes and actual boundary are distinct from source missing',async()=>{
  const h=await inspectStoredPoint(point,fixture({hole:true}));assert.equal(h.datasets[0].state,'none')
  const b=await storedPrefecture({lat:34,lon:130},fixture());assert.equal(b.state,'unconfirmed');assert.equal(b.stored,true)
  const outside=await storedPrefecture({lat:38,lon:135},fixture());assert.equal(outside.state,'outside')
})
test('404, corrupt data and line-only candidates never become successful no-overlap',async()=>{
  for(const options of [{fail:true},{tamper:true}]){const r=await inspectStoredPoint(point,fixture(options));assert.equal(r.datasets[0].state,'error');assert.ok(r.datasets[0].failures.length)}
  const r=await inspectStoredPoint(point,fixture({line:true}));assert.equal(r.datasets[0].state,'unconfirmed');assert.equal(r.datasets[0].matches.length,0)
})
test('incomplete viewport stays partial and an aborted request cannot return cached success',async()=>{
  const f=fixture();const r=await loadStoredViewport(box,{...f,maxFiles:0});assert.equal(r.state,'partial');assert.equal(r.features.length,0)
  const c=new AbortController();c.abort();await assert.rejects(inspectStoredPoint(point,{...f,signal:c.signal}),{name:'AbortError'})
})
test('shared manifest subscriber cancellation finishes even with unresolved fetch',async()=>{
  const c=new AbortController(),pending=storedManifest({signal:c.signal,fetchImpl:()=>new Promise(()=>{})});c.abort()
  await assert.rejects(pending,{name:'AbortError'})
})
test('invalid paths, version, checksums and datum fail closed',async()=>{
  const f=fixture();const bad=structuredClone(f.manifest);bad.datasets[0].files[0].name='../secret.geojson.gz'
  assert.throws(()=>validateStoredManifest(bad,f.pointer));bad.datasets[0].files=f.manifest.datasets[0].files;bad.datasets[0].sourceCrs.epsg=4326;assert.throws(()=>validateStoredManifest(bad,f.pointer))
  const asset=f.assets.get(f.pointer.url);asset.body=Buffer.from('{}');await assert.rejects(storedManifest(f),/整合性/)
})
test('integration bypasses remote geocoding/tiles in stored area and preserves vector results on failure',async()=>{
  const f=fixture();const r=await inspectRegulatoryPoint(point,{enabled:true,sources:[],...f});assert.equal(r.hazards.mode,'stored');assert.equal(r.hazards.region.state,'ready')
  const failed=await inspectRegulatoryPoint(point,{enabled:true,sources:[],fetchImpl:async()=>new Response(null,{status:404})});assert.equal(failed.hazards.region.state,'error');assert.deepEqual(failed.references,[])
})
test('unknown ranks stay explicit instead of a fabricated depth',()=>{
  const f=feature('flood-33','flood');f.properties.A31a_205=999;assert.match(storedFeatureInfo(f).designation,/999・要確認/)
})
