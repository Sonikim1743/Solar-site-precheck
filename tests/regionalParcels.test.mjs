import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRegionalParcelLoader,validateRegionalIndex,validateRegionalChunk,parcelCandidates,REGIONAL_PARCEL_SOURCE} from '../src/services/regionalParcels.js'
import {createEmptyParcelReview,setReviewParcel,measureParcelReview} from '../src/utils/parcelReview.js'
const root=new URL('../public/parcels/2024-takahashi/',import.meta.url)
const index=JSON.parse(await fs.readFile(new URL('index.json',root),'utf8'))
const bounds=[133.367,34.865,133.369,34.867]
const response=x=>new Response(JSON.stringify(x))
test('prepared public 2024 cells match hashes, counts and whole-feature part/hole manifests',async()=>{
 let invalid=new Set(),ids=new Set()
 validateRegionalIndex(index)
 for(const cell of index.cells){const bytes=await fs.readFile(new URL(cell.url,root));assert.equal(bytes.length,cell.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),cell.sha256);const data=JSON.parse(bytes);const loaded=validateRegionalChunk(data,index,cell);for(let n=0;n<loaded.length;n++){const f=loaded[n];assert.deepEqual(f.geometry,data.features[n].geometry);ids.add(f.id);if(f.selectionError)invalid.add(f.id)}}
 assert.equal(ids.size,925);assert.ok(invalid.size>0);assert.equal(index.source.totalRecords,358670)
})
test('regional small-file cache avoids repeated network and persists across loader recreation',async()=>{
 let requests=0;const stored=new Map(),storage={open:async()=>({match:async key=>stored.get(key)?.clone(),put:async(key,value)=>stored.set(key,value.clone())})}
 const fetchImpl=async url=>{requests++;return url.endsWith('index.json')?response(index):new Response(await fs.readFile(new URL(url.split('/').at(-1).split('?')[0],root)))}
 const loader=createRegionalParcelLoader({fetchImpl,storage}),a=await loader.load(bounds),first=requests
 assert.ok(a.features.length>0);await loader.load(bounds);assert.equal(requests,first)
 const b=await createRegionalParcelLoader({fetchImpl,storage}).load(bounds);assert.equal(requests,first+1);assert.deepEqual(a.features,b.features)
 const outside=await loader.load([135,35,136,36]);assert.equal(outside.coverage,false);assert.equal(requests,first+1)
})
test('abort and corrupt data never become a successful cached selection',async()=>{
 let bad=true,requests=0
 const fetchImpl=async url=>{requests++;return url.endsWith('index.json')?response(index):new Response(bad?'{}':await fs.readFile(new URL(url.split('/').at(-1).split('?')[0],root)))}
 const loader=createRegionalParcelLoader({fetchImpl,storage:null})
 await assert.rejects(loader.load(bounds),/ハッシュ/);bad=false;assert.ok((await loader.load(bounds)).features.length)
 const before=requests,c=new AbortController();c.abort();await assert.rejects(loader.load(bounds,{signal:c.signal}),e=>e.name==='AbortError');assert.equal(requests,before)
})
test('different year or feature membership cannot masquerade as prepared original',async()=>{
 assert.throws(()=>validateRegionalIndex({...index,year:2026}),/全筆/)
 const cell=index.cells[0],data=JSON.parse(await fs.readFile(new URL(cell.url,root)))
 data.features[0].properties.__sourceYear=2026;assert.throws(()=>validateRegionalChunk(data,index,cell),/年/)
})
test('overlapping candidates are returned explicitly; holes and separated concave parts survive review',()=>{
 const outer=[[135,35],[135.01,35],[135.01,35.01],[135,35.01],[135,35]],hole=[[135.002,35.002],[135.002,35.004],[135.004,35.004],[135.004,35.002],[135.002,35.002]],concave=[[135.02,35],[135.03,35],[135.03,35.003],[135.024,35.003],[135.024,35.01],[135.02,35.01],[135.02,35]]
 const f={type:'Feature',id:'synthetic',properties:{__parcelId:'synthetic',__parcelSourceName:REGIONAL_PARCEL_SOURCE},geometry:{type:'MultiPolygon',coordinates:[[outer,hole],[concave]]}}
 assert.equal(parcelCandidates([f,{...f,id:'other'}],{lon:135.001,lat:35.001}).length,2);assert.equal(parcelCandidates([f],{lon:135.003,lat:35.003}).length,0)
 const r=setReviewParcel(createEmptyParcelReview(),f,'target',{fileName:REGIONAL_PARCEL_SOURCE,importedAt:'2026-10-13T00:00:00.000Z'}),g=measureParcelReview(r).geometry
 assert.equal(g.type,'MultiPolygon');assert.equal(g.coordinates.length,2);assert.equal(g.coordinates.reduce((n,p)=>n+p.length-1,0),1)
})
