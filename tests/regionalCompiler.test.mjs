import test from 'node:test'
import assert from 'node:assert/strict'
import { shapePolygon, dbfReader } from '../build/prepareRegionalParcels.mjs'
import { pointInGeometry, validatePolygonGeometry } from '../src/services/parcelGeometry.js'
const outer=[[0,0],[0,10],[10,10],[10,0],[0,0]]
const hole=[[2,2],[4,2],[4,4],[2,4],[2,2]]
test('regional compiler groups original clockwise parts and counterclockwise holes without changing coordinates',()=>{
  const remote=outer.map(([x,y])=>[x+20,y]),g=shapePolygon([outer,hole,remote])
  assert.equal(g.type,'MultiPolygon');assert.deepEqual(g.coordinates,[[outer,hole],[remote]])
  assert.equal(g.coordinates[0][0],outer);assert.equal(g.coordinates[0][1],hole)
  const convert=v=>typeof v[0]==='number'?[135+v[0]/1000,35+v[1]/1000]:v.map(convert)
  const geo=validatePolygonGeometry({...g,coordinates:convert(g.coordinates)})
  assert.equal(pointInGeometry({lon:135.003,lat:35.003},geo),false)
  assert.equal(pointInGeometry({lon:135.021,lat:35.001},geo),true)
  assert.throws(()=>shapePolygon([hole]),/exterior/)
  assert.throws(()=>shapePolygon([outer,hole.map(([x,y])=>[x+30,y])]),/containing/)
})
test('DBF reader aligns fields to the original record index and refuses truncated records',()=>{
  const bytes=new Uint8Array(65+6),view=new DataView(bytes.buffer)
  bytes[0]=3;view.setUint32(4,1,true);view.setUint16(8,65,true);view.setUint16(10,6,true)
  bytes.set(new TextEncoder().encode('number'),32);bytes[43]=67;bytes[48]=5;bytes[64]=13
  bytes[65]=32;bytes.set(new TextEncoder().encode('3243 '),66)
  assert.equal(dbfReader(bytes,'utf-8').record(0).number,'3243')
  assert.throws(()=>dbfReader(bytes.slice(0,-1),'utf-8'),/Truncated/)
})
