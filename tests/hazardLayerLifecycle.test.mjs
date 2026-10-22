import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { createHazardLayerClass } from '../src/services/hazardLayer.js'
import { createHazardTileTracker } from '../src/services/hazardTiles.js'
import { hazardStatus } from '../src/utils/regulatoryLayers.js'

class Element {
  constructor(tag) { this.tagName=tag; this.style={}; this.attributes={}; this.children=[]; this.complete=true; this.naturalWidth=0 }
  setAttribute(key,value) { this.attributes[key]=value; if(key==='src') this.src=value }
  getAttribute(key) { return this.attributes[key] ?? null }
  appendChild(child) { child.parentNode=this; this.children.push(child) }
  removeChild(child) { child.parentNode=null; this.children=this.children.filter(item=>item!==child) }
  set src(value) { this.attributes.src=value; this.complete=false }
  get src() { return this.attributes.src || '' }
  loaded() { this.complete=true; this.naturalWidth=256; this.onload?.() }
}
const document={documentElement:new Element('html'),createElement:tag=>new Element(tag),addEventListener(){},removeEventListener(){}}
const window={document,screen:{deviceXDPI:96,logicalXDPI:96},devicePixelRatio:1,addEventListener(){},removeEventListener(){},setTimeout,clearTimeout}
const exports={}
const context=vm.createContext({window,document,navigator:{userAgent:'node',platform:'Win32'},exports,module:{exports},console,setTimeout,clearTimeout})
const leafletPath=createRequire(import.meta.url).resolve('leaflet')
vm.runInContext(fs.readFileSync(leafletPath,'utf8'),context,{filename:leafletPath})
const L=exports, HazardLayer=createHazardLayerClass(L)
const coords={x:28575,y:13017,z:15}, newer={x:57150,y:26034,z:16}
const flush=()=>new Promise(resolve=>setImmediate(resolve))

async function setup(fn) {
  const previous={fetch:globalThis.fetch,document:globalThis.document}
  const reports=[],signals=[],pending=[]
  globalThis.document=document
  globalThis.fetch=(url,{signal})=>{ signals.push(signal); return new Promise((resolve,reject)=>{pending.push({url,signal,resolve,reject});signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true})}) }
  const map={_removeZoomLimit(){}}, layer=new HazardLayer({id:'flood',opacity:.5,onStatus:s=>reports.push(s)})
  layer._tiles={}; layer._tileZoom=15; layer._map=map; layer._container=new Element('div')
  layer.tracker=createHazardTileTracker(states=>layer.callback(hazardStatus(states)))
  const add=position=>{
    const key=layer._tileCoordsToKey(position), completed=[]
    const image=layer.createTile(position,(error,tile)=>{completed.push(error); if(layer._tiles[key])layer._tiles[key].loaded=1})
    layer._tiles[key]={el:image,coords:position,loaded:0}
    return {key,image,completed,request:pending.at(-1)}
  }
  try { await fn({layer,map,reports,signals,pending,add}) }
  finally {if(layer._container)layer.onRemove(map);globalThis.fetch=previous.fetch;globalThis.document=previous.document}
}
const png=()=>new Response(new Uint8Array([1]),{headers:{'content-type':'image/png'}})

test('200 reaches ready only after image decode; unavailable never becomes safe',()=>setup(async({add,reports})=>{
  const tile=add(coords);tile.request.resolve(png());await flush()
  assert.equal(reports.at(-1).state,'loading')
  tile.image.loaded();assert.equal(reports.at(-1).state,'ready');assert.equal(tile.completed.length,1)
  assert.match(reports.at(-1).message,/安全性は未確認/)
}))
test('404 completes without an image callback and remains unavailable',()=>setup(async({add,reports})=>{
  const tile=add(coords);tile.request.resolve(new Response(null,{status:404}));await flush()
  assert.equal(reports.at(-1).state,'unavailable');assert.equal(tile.image.style.visibility,'hidden');assert.equal(tile.completed.length,1)
}))
test('network and PNG decode failures end loading as errors',()=>setup(async({add,reports})=>{
  const first=add(coords);first.request.reject(Error('network'));await flush();assert.equal(reports.at(-1).state,'error')
  const second=add({...coords,x:coords.x+1});second.request.resolve(png());await flush();second.image.onerror()
  assert.equal(reports.at(-1).loading,0);assert.equal(second.completed.length,1)
}))
test('zoom during blob decode retires the job before Leaflet replaces its callbacks',()=>setup(async({layer,add,reports})=>{
  const old=add(coords);old.request.resolve(png());await flush();assert.equal(layer.urls.size,1)
  layer._tileZoom=16
  if(process.env.HAZARD_BASELINE_REPRO==='1')layer._abortLoading=L.TileLayer.prototype._abortLoading
  layer._abortLoading()
  assert.equal(layer._tiles[old.key],undefined)
  assert.equal(reports.at(-1).loading,0);assert.equal(layer.urls.size,0)
  const current=add(newer);current.request.resolve(png());await flush();current.image.loaded()
  assert.equal(reports.at(-1).state,'ready');assert.equal(old.completed.length,0)
}))
test('zoom during fetch ignores late responses; pan removes old jobs and URLs',()=>setup(async({layer,add,reports})=>{
  const old=add(coords);layer._tileZoom=16;layer._abortLoading();old.request.resolve(png());await flush()
  assert.equal(old.image.src.includes('blob:'),false);assert.equal(reports.at(-1).loading,0)
  const current=add(newer);current.request.resolve(png());await flush();current.image.loaded();layer._removeTile(current.key)
  assert.equal(reports.at(-1).state,'idle');assert.equal(layer.urls.size,0)
}))
test('completed cached zoom tiles survive and cannot leave a loading job',()=>setup(async({layer,add,reports})=>{
  const old=add(coords);old.request.resolve(png());await flush();old.image.loaded();layer._tileZoom=16;layer._abortLoading()
  assert.equal(reports.at(-1).loading,0);assert.equal(reports.at(-1).state,'ready');assert.ok(layer._tiles[old.key])
}))
test('OFF suppresses late callbacks and releases all object URLs',()=>setup(async({layer,map,add,reports})=>{
  const old=add(coords);layer.onRemove(map);const count=reports.length
  old.request.resolve(png());await flush();assert.equal(old.request.signal.aborted,true);assert.equal(reports.length,count);assert.equal(layer.urls.size,0)
}))

test('mixed successful and 404 tiles settle as partial rather than safe or loading',()=>setup(async({add,reports})=>{
  const ready=add(coords),missing=add({...coords,x:coords.x+1})
  missing.request.resolve(new Response(null,{status:404}));ready.request.resolve(png());await flush();ready.image.loaded()
  assert.equal(reports.at(-1).state,'partial');assert.equal(reports.at(-1).loading,0)
  assert.match(reports.at(-1).message,/範囲は未確認/)
}))

test('HTTP server and content-type failures both finish with an error',()=>setup(async({add,reports})=>{
  const failed=add(coords);failed.request.resolve(new Response(null,{status:500}));await flush()
  assert.equal(reports.at(-1).state,'error');assert.equal(failed.completed.length,1)
  const wrong=add({...coords,x:coords.x+1});wrong.request.resolve(new Response('html',{headers:{'content-type':'text/html'}}));await flush()
  assert.equal(reports.at(-1).loading,0);assert.equal(wrong.completed.length,1);assert.equal(wrong.image.style.visibility,'hidden')
}))

test('several zooms ignore all late tiles and settle on the final view',()=>setup(async({layer,add,reports})=>{
  const first=add(coords);layer._tileZoom=16;layer._abortLoading()
  const second=add(newer);layer._tileZoom=17;layer._abortLoading()
  const last=add({x:114300,y:52068,z:17});last.request.resolve(png());await flush();last.image.loaded()
  second.request.resolve(png());first.request.resolve(png());await flush()
  assert.equal(reports.at(-1).state,'ready');assert.equal(reports.at(-1).loading,0)
  assert.equal(first.completed.length+second.completed.length,0);assert.equal(layer.urls.size,1)
}))

test('a newly enabled replacement has an independent tracker',()=>setup(async({layer,map,add,reports,pending})=>{
  const old=add(coords);layer.onRemove(map)
  const replacementReports=[]
  const replacement=new HazardLayer({id:'steep',prefecture:'33',opacity:.65,onStatus:s=>replacementReports.push(s)})
  replacement._tiles={};replacement._tileZoom=15;replacement._map=map;replacement._container=new Element('div')
  replacement.tracker=createHazardTileTracker(states=>replacement.callback(hazardStatus(states)))
  try {
    const image=replacement.createTile(coords,()=>{}),request=pending.at(-1)
    // The old completion must never update the replacement layer's callback.
    const count=reports.length;old.request.resolve(png());await flush()
    assert.equal(reports.length,count);assert.equal(replacementReports.at(-1).state,'loading')
    request.resolve(png());await flush();image.loaded()
    assert.equal(replacementReports.at(-1).state,'ready')
    replacement.tracker.remove(replacement._tileCoordsToKey(coords))
    assert.equal(replacementReports.at(-1).state,'idle')
  } finally {replacement.onRemove(map)}
}))

test('the fetch deadline finishes a current tile as an error',()=>setup(async({add,reports})=>{
  const previous={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout}
  let expire,delay
  globalThis.setTimeout=(callback,ms)=>{expire=callback;delay=ms;return 1}
  globalThis.clearTimeout=()=>{}
  try {
    const tile=add(coords);assert.equal(delay,8000);expire();await flush()
    assert.equal(reports.at(-1).state,'error');assert.equal(reports.at(-1).loading,0);assert.equal(tile.completed.length,1)
  } finally {globalThis.setTimeout=previous.setTimeout;globalThis.clearTimeout=previous.clearTimeout}
}))
test('rapid same-key replacement accepts only the final request',()=>setup(async({layer,add,reports})=>{
  const old=add(coords);layer._removeTile(old.key);const current=add(coords)
  current.request.resolve(png());await flush();current.image.loaded();old.request.resolve(png());await flush()
  assert.equal(reports.at(-1).state,'ready');assert.equal(reports.at(-1).loading,0);assert.equal(old.completed.length,0);assert.equal(current.completed.length,1)
}))
