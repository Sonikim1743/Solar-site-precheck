import test from 'node:test'
import assert from 'node:assert/strict'
import {terrainDrainageArrows,terrainDrainageHeight,terrainDrainageArrowPath,terrainDrainageArrowDrawing,terrainDrainageSymbolLength} from '../src/utils/terrainDrainage.js'
import {terrainSlopeIndex,TERRAIN_SLOPE_LABELS} from '../src/utils/terrainSlopeClasses.js'
import {terrainSlopeDistribution} from '../src/utils/terrainSlopeDistribution.js'
import {terrainAzimuthLabel} from '../src/utils/terrainAzimuthLabel.js'
import {terrainDrawingViewport} from '../src/utils/terrainDrawingViewport.js'
const ring=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d],[a,b]]
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`)
function plane(gx=-.2,gy=.1){
 const width=29,height=29,step=5,xMin=-20,yMin=-20,slope=Math.atan(Math.hypot(gx,gy))*180/Math.PI
 return {grid:{width,height,step,xMin,yMin,boundary:[[ring(0,0,100,100)]],elevations:Array.from({length:width*height},(_,i)=>100+gx*(xMin+i%width*step)+gy*(yMin+Math.floor(i/width)*step)),slopes:Array(width*height).fill(slope)}}
}
test('five half-open classes include exact limits once and keep invalid slopes unknown',()=>{
 assert.deepEqual(TERRAIN_SLOPE_LABELS,['0–5°未満','5–10°未満','10–15°未満','15–20°未満','20°以上'])
 for(const [s,i] of [[0,0],[4.999,0],[5,1],[9.999,1],[10,2],[15,3],[20,4],[90,4],[100,4]])assert.equal(terrainSlopeIndex(s),i)
 for(const s of [null,NaN,Infinity,-1])assert.equal(terrainSlopeIndex(s),-1)
 for(const [s,i] of [[0,0],[5,1],[10,2],[15,3],[20,4]]){
  const a=plane();a.grid.slopes.fill(s);const d=terrainSlopeDistribution(a)
  assert.equal(d.bins.length,5);close(d.bins[i].percent,100)
  close(d.bins.reduce((sum,b)=>sum+b.areaM2,0)+d.unknownAreaM2,10000)
 }
})
test('true DEM downhill points east and south even at inward and outward parcel edges',()=>{
 const a=plane(),before=structuredClone(a),arrows=terrainDrainageArrows(a)
 assert.ok(arrows.length>8&&arrows.length<=24)
 let west=false,east=false
 for(const arrow of arrows){
  close(arrow.gradient[0],-.2);close(arrow.gradient[1],.1)
  assert.ok(arrow.head[0]>arrow.tail[0]&&arrow.head[1]<arrow.tail[1])
  assert.ok(arrow.tailElevation>arrow.headElevation)
  if(arrow.point[0]===0){west=true;assert.ok(arrow.tail[0]<0&&arrow.head[0]>0)}
  if(arrow.point[0]===100){east=true;assert.ok(arrow.tail[0]<100&&arrow.head[0]>100)}
 }
 assert.ok(west&&east,'inflow at west and outflow at east follow DEM rather than edge normals')
 assert.deepEqual(a,before)
})
test('north-up projection correctly flips southward downhill screen Y and maintains the expanded viewport',()=>{
 const a=plane(),v=terrainDrawingViewport(a.grid,10,1.25)
 for(const arrow of terrainDrainageArrows(a)){
  const tail=v.project(arrow.tail),head=v.project(arrow.head)
  assert.ok(head[0]>tail[0]&&head[1]>tail[1])
  assert.match(terrainDrainageArrowPath(arrow,v.project),/^M[-\d.]+ [-\d.]+ L/)
  close(Math.hypot(head[0]-tail[0],head[1]-tail[1]),8*v.scale)
 }
})
test('flat, insufficient local slopes and missing surrounding DEM do not invent arrows',()=>{
 assert.deepEqual(terrainDrainageArrows(plane(0,0)),[])
 assert.deepEqual(terrainDrainageArrows(plane(.001,0)),[])
 const missing=plane();missing.grid.elevations.fill(null);assert.deepEqual(terrainDrainageArrows(missing),[])
 const slopeMissing=plane();slopeMissing.grid.slopes.fill(null);assert.deepEqual(terrainDrainageArrows(slopeMissing),[])
 assert.equal(terrainDrainageHeight(plane().grid,[-100,0]),null)
 assert.deepEqual(terrainDrainageArrows(plane(),{maxArrows:0}),[])
})
test('outer rings only, holes respected, ring winding does not reverse real downhill',()=>{
 const a=plane();a.grid.boundary[0].push(ring(1,1,30,30))
 for(const arrow of terrainDrainageArrows(a))assert.ok(arrow.head[0]>arrow.tail[0]&&arrow.head[1]<arrow.tail[1])
 const reversed=plane();reversed.grid.boundary[0][0].reverse()
 for(const arrow of terrainDrainageArrows(reversed))assert.ok(arrow.head[0]>arrow.tail[0]&&arrow.head[1]<arrow.tail[1])
 const thin=plane(),sample=terrainDrainageArrows(thin).find(a=>a.kind==='uniform'&&a.point[1]===0),p=sample.point
 thin.grid.boundary[0].push(ring(p[0]-.76,.30,p[0]-.66,.40))
 const fresh={grid:{...thin.grid}}
 assert.ok(!terrainDrainageArrows(fresh).some(a=>a.point[0]===p[0]&&a.point[1]===p[1]),'a thin hole between the height probes also suppresses the arrow')
})
test('azimuth annotation follows the actual compass bearing',()=>{
 assert.equal(terrainAzimuthLabel(180),'180°（南向き）')
 assert.equal(terrainAzimuthLabel(90),'90°（東向き）')
 assert.equal(terrainAzimuthLabel(315),'315°（北西向き）')
 assert.equal(terrainAzimuthLabel(360),'0°（北向き）')
 assert.equal(terrainAzimuthLabel(172.5),'172.5°（南向き）')
})

 test('glyph length uses actual DEM slope classes, bounded 18–34px, independently of zoom or flow amount',()=>{
  const a=plane(),arrow=terrainDrainageArrows(a)[0]
  for(const [s,length] of [[1,18],[5,22],[10,26],[15,30],[20,34],[89,34]]){
   assert.equal(terrainDrainageSymbolLength(s),length)
   for(const factor of [1,2,.5]){const icon=terrainDrainageArrowDrawing({...arrow,slopeDeg:s},([x,y])=>[x*factor,-y*factor],{symbolic:true});close(icon.lengthPx,length);close(Math.hypot(icon.head[0]-icon.tail[0],icon.head[1]-icon.tail[1]),length);assert.ok(icon.head[0]>icon.tail[0]&&icon.head[1]>icon.tail[1])}
  }
 })
 test('outer changes receive bounded representative samples without sub-grid precision',()=>{
  const a=plane(),g=a.grid,height=x=>100+Math.min(x,35)*Math.tan(2*Math.PI/180)+Math.max(0,Math.min(x-35,30))*Math.tan(12*Math.PI/180)+Math.max(0,x-65)*Math.tan(25*Math.PI/180)
  g.elevations=g.elevations.map((_,i)=>height(g.xMin+i%g.width*g.step))
  g.slopes=g.slopes.map((_,i)=>Math.atan((height(g.xMin+i%g.width*g.step+5)-height(g.xMin+i%g.width*g.step-5))/10)*180/Math.PI)
  const arrows=terrainDrainageArrows(a)
  assert.ok(arrows.some(a=>a.kind==='gradient-change'));assert.ok(arrows.length<=24)
  for(let i=0;i<arrows.length;i++)for(let j=i+1;j<arrows.length;j++)assert.ok(Math.hypot(arrows[i].point[0]-arrows[j].point[0],arrows[i].point[1]-arrows[j].point[1])>=g.step*2-1e-7)
  assert.ok(arrows.every(a=>a.tailElevation>a.headElevation))
 })
