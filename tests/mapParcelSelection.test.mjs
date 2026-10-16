import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeMapParcelFragments, resolveMapParcelSelection, MAP_PARCEL_SOURCE, MAP_PARCEL_JOIN_NOTICE } from '../src/utils/mapParcelSelection.js'
import { pointInGeometry, geometryBounds } from '../src/services/parcelGeometry.js'
const seed={z:16,x:57344,y:25900}
const ring=(x,y,w,h=w)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h},{x,y}]
const f=(rings,id=7,number='合成-1',map='合成図')=>({id,geomType:3,props:{地番:number,地図名:map,地番区域:'合成地域',座標系:'公共座標6系'},geom:rings})
const tile=(c,features)=>({z:c.z,dataTile:c,scale:1,dim:256,origin:{x:c.x*256,y:c.y*256},data:new Map([['fude',features]])})
const ll=(x,y)=>{const world=256*2**16;return [(seed.x*256+x)/world*360-180,Math.atan(Math.sinh(Math.PI*(1-2*(seed.y*256+y)/world)))*180/Math.PI]}

test('same map id across a tile seam is unioned once, retaining a hole and detached part',async()=>{
 const left=f([ring(200,100,56,80),ring(210,110,15).reverse()]),right=f([ring(0,100,24,80),ring(45,110,10)])
 const requests=[],get=async c=>{requests.push(`${c.x}/${c.y}`);return tile(c,c.x===seed.x?[left,left]:c.x===seed.x+1?[right]:[])}
 const result=await resolveMapParcelSelection(left,seed,get)
 assert.equal(result.geometry.type,'MultiPolygon');assert.equal(result.geometry.coordinates.length,2)
 assert.equal(pointInGeometry(ll(215,115),result.geometry),false)
 assert.equal(pointInGeometry(ll(230,115),result.geometry),true)
 assert.equal(pointInGeometry(ll(260,115),result.geometry),true)
 assert.equal(pointInGeometry(ll(287,115),result.geometry),false)
 assert.equal(pointInGeometry(ll(305,115),result.geometry),true)
 assert.equal(requests.length,2);assert.equal(result.properties.__geometryScope,'map-reference-tile-union')
 assert.equal(result.properties.__parcelSourceName,MAP_PARCEL_SOURCE)
 assert.equal(result.properties.__sourceYear,2024)
 assert.equal(result.properties.__selectionWarning,MAP_PARCEL_JOIN_NOTICE)
})
test('same number with a different id or map is never used to extend the chosen shape',async()=>{
 const picked=f([ring(200,100,56,80)]),other=f([ring(0,100,60,80)],8),wrongMap=f([ring(0,100,80,80)],7,'合成-1','別図')
 const result=await resolveMapParcelSelection(picked,seed,async c=>tile(c,c.x===seed.x?[picked]:[other,wrongMap]))
 assert.equal(pointInGeometry(ll(270,120),result.geometry),false)
 assert.equal(result.properties.__selectionLimited,true)
 assert.match(result.properties.__selectionWarning,/連続は未確認/)
})
test('missing identity uses only the clicked fragment and exposes that limitation',async()=>{
 const picked=f([ring(200,100,56,80)]);delete picked.id
 let requests=0
 const result=await resolveMapParcelSelection(picked,seed,async c=>{requests++;return tile(c,[picked])})
 assert.equal(requests,1);assert.equal(result.properties.__mvtId,null)
 assert.equal(result.properties.__selectionLimited,true);assert.match(result.properties.__selectionWarning,/共通ID/)
})
test('offscreen continuation at the request bound remains explicit and is never a bbox or hull',async()=>{
 const picked=f([ring(200,100,56,80)])
 const result=await resolveMapParcelSelection(picked,seed,async c=>tile(c,[picked]),{maxTiles:1})
 assert.equal(result.properties.__selectionLimited,true);assert.match(result.properties.__selectionWarning,/上限/)
 assert.equal(pointInGeometry(ll(260,120),result.geometry),false)
 assert.equal(result.geometry.type,'Polygon')
})
test('duplicate geometry, concavity, disconnected areas and gaps preserve topology',()=>{
 const a=f([[{x:10,y:10},{x:50,y:10},{x:50,y:20},{x:20,y:20},{x:20,y:50},{x:10,y:50},{x:10,y:10}],ring(100,100,10)])
 const result=mergeMapParcelFragments([{tile:tile(seed,[a]),feature:a},{tile:tile(seed,[a]),feature:a}])
 assert.equal(result.type,'MultiPolygon');assert.equal(pointInGeometry(ll(30,30),result),false)
 assert.equal(pointInGeometry(ll(15,30),result),true);assert.equal(pointInGeometry(ll(70,70),result),false)
 assert.ok(geometryBounds([result]).east>geometryBounds([result]).west)
})
test('failure or cancelled requests do not return a guessed replacement geometry',async()=>{
 const picked=f([ring(200,100,56,80)]),controller=new AbortController();controller.abort()
 await assert.rejects(resolveMapParcelSelection(picked,seed,async c=>tile(c,[picked]),{signal:controller.signal}),{name:'AbortError'})
 await assert.rejects(resolveMapParcelSelection(picked,seed,async()=>{throw Error('synthetic tile failure')}),/tile failure/)
 assert.throws(()=>mergeMapParcelFragments([{tile:tile(seed,[picked]),feature:f([[{x:1,y:1},{x:2,y:1},{x:2,y:2},{x:1,y:2}]])}]),/形状/)
})
