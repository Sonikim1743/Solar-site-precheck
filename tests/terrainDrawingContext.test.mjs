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
  const invalid=await loadTerrainDrawingContext({grid:{origin:{lat:NaN,lon:135},boundary:[[ring]]}})
  assert.equal(invalid.status,'unavailable');assert.equal(invalid.tiles.length,0)
 }finally{globalThis.fetch=previousFetch;if(previousReader===undefined)delete globalThis.FileReader;else globalThis.FileReader=previousReader}
})
