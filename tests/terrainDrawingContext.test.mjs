import test from 'node:test'
import assert from 'node:assert/strict'
import {loadTerrainDrawingContext} from '../src/services/terrainDrawingContext.js'
const ring=[[-100,-100],[100,-100],[100,100],[-100,100],[-100,-100]]
test('surrounding map uses finite local projection coordinates, bounded GSI tiles and a shared cache',async()=>{
 const previousFetch=globalThis.fetch,previousReader=globalThis.FileReader,requests=[]
 globalThis.FileReader=class {readAsDataURL(){this.result='data:image/png;base64,AA==';queueMicrotask(()=>this.onload())}}
 globalThis.fetch=async url=>{requests.push(url);return new Response(new Uint8Array([0]),{headers:{'content-type':'image/png'}})}
 try{
  const a={grid:{origin:{lat:35,lon:135},boundary:[[ring]]}},p=loadTerrainDrawingContext(a),r=await p
  assert.equal(r.status,'ready');assert.ok(r.tiles.length>0&&r.tiles.length<=16)
  assert.equal(loadTerrainDrawingContext(a),p)
  for(const tile of r.tiles){assert.ok(tile.points.flat().every(Number.isFinite));assert.equal(tile.points.length,3);assert.ok(Math.hypot(tile.points[1][0]-tile.points[0][0],tile.points[1][1]-tile.points[0][1])>10)}
  assert.ok(requests.every(u=>/^https:\/\/cyberjapandata.gsi.go.jp\/xyz\/std\/\d+\/\d+\/\d+\.png$/.test(u)))
  assert.ok(requests.every(u=>Number(u.split('/')[5])<=18))
  const invalid=await loadTerrainDrawingContext({grid:{origin:{lat:NaN,lon:135},boundary:[[ring]]}})
  assert.equal(invalid.status,'unavailable');assert.equal(invalid.tiles.length,0)
 }finally{globalThis.fetch=previousFetch;if(previousReader===undefined)delete globalThis.FileReader;else globalThis.FileReader=previousReader}
})

test('standard map and real aerial JPEG use separate bounded caches with exactly the same projected viewport',async()=>{
 const previousFetch=globalThis.fetch,previousReader=globalThis.FileReader,requests=[]
 globalThis.FileReader=class {readAsDataURL(blob){this.result=`data:${blob.type};base64,AA==`;queueMicrotask(()=>this.onload())}}
 globalThis.fetch=async url=>{requests.push(url);return new Response(new Uint8Array([0]),{headers:{'content-type':url.includes('/seamlessphoto/')?'image/jpeg':'image/png'}})}
 try{
  const a={grid:{origin:{lat:35,lon:135},boundary:[[ring]]}},map=loadTerrainDrawingContext(a),photo=loadTerrainDrawingContext(a,'photo'),[m,p]=await Promise.all([map,photo])
  assert.notEqual(map,photo);assert.equal(p.status,'ready');assert.equal(loadTerrainDrawingContext(a,'photo'),photo)
  assert.ok(p.tiles.length>0&&p.tiles.length<=16);assert.ok(p.tiles.every(t=>t.layer==='seamlessphoto'&&t.href.startsWith('data:image/jpeg;base64,')))
  assert.ok(m.tiles.every(t=>t.layer==='std'&&t.href.startsWith('data:image/png;base64,')))
  assert.deepEqual(m.tiles.map(t=>t.points),p.tiles.map(t=>t.points));assert.equal(requests.filter(u=>u.includes('/seamlessphoto/')&&u.endsWith('.jpg')).length,p.tiles.length)
 }finally{globalThis.fetch=previousFetch;if(previousReader===undefined)delete globalThis.FileReader;else globalThis.FileReader=previousReader}
})

test('failed aerial coverage cannot be cached as ready or substituted with a standard map, and can retry',async()=>{
 const previousFetch=globalThis.fetch,previousReader=globalThis.FileReader;let available=false;const requests=[]
 globalThis.FileReader=class {readAsDataURL(blob){this.result=`data:${blob.type};base64,AA==`;queueMicrotask(()=>this.onload())}}
 globalThis.fetch=async url=>{requests.push(url);return available?new Response(new Uint8Array([0]),{headers:{'content-type':'image/jpeg'}}):new Response('',{status:404})}
 try{
  const a={grid:{origin:{lat:35,lon:135},boundary:[[ring]]}},failed=loadTerrainDrawingContext(a,'photo'),r=await failed
  assert.equal(r.status,'unavailable');assert.equal(r.tiles.length,0);available=true
  const retry=loadTerrainDrawingContext(a,'photo');assert.notEqual(retry,failed);assert.equal((await retry).status,'ready')
  assert.ok(requests.every(u=>u.includes('/seamlessphoto/')))
 }finally{globalThis.fetch=previousFetch;if(previousReader===undefined)delete globalThis.FileReader;else globalThis.FileReader=previousReader}
})
