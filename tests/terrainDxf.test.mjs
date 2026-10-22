import test from 'node:test'
import assert from 'node:assert/strict'
import { createTerrainDxf, dxfText, downloadTerrainDxf, TERRAIN_DXF_LAYERS } from '../src/utils/terrainDxf.js'
import { terrainDxfSynthetic } from './fixtures/terrainDxfSynthetic.mjs'
import { terrainReportLayouts } from '../src/utils/terrainLayoutReport.js'
import { terrainPointToLocal } from '../src/utils/terrainArea.js'

const near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`)
// Read serialized groups, rather than reusing writer internals/model objects.
export function readDxf(bytes) {
  const lines=new TextDecoder().decode(bytes).trimEnd().split(/\r?\n/), groups=[]
  assert.equal(lines.length%2,0)
  for(let i=0;i<lines.length;i+=2)groups.push([Number(lines[i]),lines[i+1]])
  const entities=[],header={},layers=[];let section='',entity=null,variable=''
  for(let i=0;i<groups.length;i++){
    const [code,value]=groups[i]
    if(code===0&&value==='SECTION'){section=groups[++i][1];continue}
    if(code===0&&value==='ENDSEC'){section='';entity=null;continue}
    if(section==='HEADER'){if(code===9)variable=value;else if(variable)header[variable]=value}
    if(section==='TABLES'&&code===0&&value==='LAYER'){const entry=groups.slice(i+1).find(g=>g[0]===2);layers.push(entry[1])}
    if(section!=='ENTITIES')continue
    if(code===0){entity={type:value,groups:[],points:[]};entities.push(entity);continue}
    entity.groups.push([code,value])
    if(code===8)entity.layer=value
    if(code===70)entity.closed=Number(value)===1
    if(code===10)entity.points.push([Number(value)])
    if(code===20)entity.points.at(-1).push(Number(value))
    if(code===1)entity.text=value.replace(/\\U\+([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)))
  }
  return {header,entities,layers,groups}
}

test('DXF metres, zero elevation, editable types and separate layers survive serialized read-back',()=>{
  const report=terrainDxfSynthetic(),result=createTerrainDxf(report),dxf=readDxf(result.bytes)
  assert.equal(dxf.header.$ACADVER,'AC1021');assert.equal(dxf.header.$INSUNITS,'6');assert.equal(dxf.header.$MEASUREMENT,'1')
  assert.deepEqual(dxf.layers,['0',...Object.keys(TERRAIN_DXF_LAYERS)])
  assert.ok(dxf.entities.every(e=>['LWPOLYLINE','TEXT'].includes(e.type)))
  assert.ok(dxf.entities.flatMap(e=>e.groups).filter(([c])=>[30,38].includes(c)).every(([,v])=>Number(v)===0))
  assert.doesNotMatch(new TextDecoder().decode(result.bytes),/\bIMAGE\b|PDFUNDERLAY|3DFACE|INSERT|javascript:/i)
  const bar=dxf.entities.find(e=>e.layer==='REFERENCE'&&e.type==='LWPOLYLINE');near(Math.hypot(bar.points[1][0]-bar.points[0][0],bar.points[1][1]-bar.points[0][1]),50)
  near(50*1000/1000,50);near(50*1000/500,100);near(50*1000/2000,25)
  assert.equal(dxf.entities.filter(e=>e.layer==='MODULES').length,result.moduleCount)
})

for(const tiltDeg of [10,15,20])test(`true south 180 and ${tiltDeg} degree module plan projection use applied 3D corners`,()=>{
  const report=terrainDxfSynthetic({tiltDeg}),selected=terrainReportLayouts(report.terrainArea,report.terrainPreview).current
  const modules=readDxf(createTerrainDxf(report).bytes).entities.filter(e=>e.layer==='MODULES')
  assert.equal(modules.length,selected.moduleCount);assert.ok(selected.rackCount>1)
  const expected=selected.racks.flatMap(r=>r.modules)
  modules.forEach((entity,i)=>{assert.equal(entity.closed,true);assert.equal(entity.points.length,4);entity.points.forEach((p,j)=>p.forEach((v,k)=>near(v,expected[i].corners[j][k])))})
  const [a,b,,d]=modules[0].points
  near(Math.hypot(b[0]-a[0],b[1]-a[1]),selected.options.moduleWidthM)
  near(Math.hypot(d[0]-a[0],d[1]-a[1]),selected.options.moduleHeightM*Math.cos(tiltDeg*Math.PI/180))
  near(d[0]-a[0],0);assert.ok(d[1]>a[1],'raised rear edge is north: front faces south')
})

test('all disjoint outlines, the concave notch and hole rings retain their source vertices',()=>{
  const r=terrainDxfSynthetic(),out=readDxf(createTerrainDxf(r).bytes)
  const outer=out.entities.filter(e=>e.layer==='BOUNDARY'),holes=out.entities.filter(e=>e.layer==='BOUNDARY_HOLES')
  assert.equal(outer.length,2);assert.equal(holes.length,1);assert.ok(outer.some(e=>e.points.length===6))
  let a=0,b=0
  r.terrainArea.grid.boundary.forEach(p=>p.forEach((ring,i)=>{const actual=(i?holes[b++]:outer[a++]);assert.equal(actual.closed,true);assert.equal(actual.points.length,ring.length-1);actual.points.forEach((xy,j)=>xy.forEach((v,k)=>near(v,ring[j][k])))}))
})

test('individual exclusions, all-off, fence ON/OFF and arbitrary bearing share the PDF applied result',()=>{
  const report=terrainDxfSynthetic({azimuthDeg:135}),preview=report.terrainPreview,pool=preview.layout
  for(const fence of [true,false])for(const disabledRackIds of [[],[pool.racks[0].id],pool.racks.map(r=>r.id)]){
    const r={...report,terrainPreview:{...preview,fence,disabledRackIds}},pdf=terrainReportLayouts(r.terrainArea,r.terrainPreview),dxf=readDxf(createTerrainDxf(r).bytes)
    assert.equal(dxf.entities.filter(e=>e.layer==='MODULES').length,pdf.current.moduleCount)
    const rails=dxf.entities.filter(e=>e.layer==='FENCE');assert.equal(rails.length,pdf.fence?.rails.length||0)
    rails.forEach((e,i)=>e.points.forEach((p,j)=>p.forEach((v,k)=>near(v,pdf.fence.rails[i].points[j][k]))))
  }
})

test('camera rotation, screen exaggeration and zoom have no effect on bytes',()=>{
  const report=terrainDxfSynthetic(),original=createTerrainDxf(report).bytes
  assert.deepEqual(createTerrainDxf({...report,terrainPreview:{...report.terrainPreview,viewAzimuth:312,heightScale:2,zoom:8,pan:{x:90,y:70}}}).bytes,original)
})

test('stale drafts, direction changes, busy output, changed acquisition and changed geometry are refused',()=>{
  const report=terrainDxfSynthetic(),p=report.terrainPreview
  for(const terrainPreview of [{...p,options:{...p.options,tiltDeg:20}},{...p,layoutMode:'optimized'},{...p,calculating:true},{...p,outputBlocked:true},{...p,layout:null}])assert.throws(()=>createTerrainDxf({...report,terrainPreview}),/DXF/)
  assert.throws(()=>createTerrainDxf({...report,terrainArea:{...report.terrainArea}}),/DXF/)
  assert.throws(()=>createTerrainDxf({...report,parcelReview:{...report.parcelReview,boundary:null,parcels:[]}}),/DXF/)
})

test('Japanese source parcel text and DEM elevations survive escaping; no source is guessed',()=>{
  const r=terrainDxfSynthetic(),out=readDxf(createTerrainDxf(r).bytes)
  assert.equal(out.entities.find(e=>e.layer==='PARCEL_TEXT').text,'試験地番１２３－４・山林')
  assert.ok(out.entities.filter(e=>e.layer==='ELEVATION_TEXT').length)
  assert.ok(out.entities.some(e=>e.layer==='NOTES'&&e.text.includes('測量成果・施工図ではありません')))
  assert.equal(out.entities.filter(e=>e.layer==='CONTOUR'||e.layer==='CONTOUR_MAJOR').length,r.terrainArea.contours.reduce((n,c)=>n+c.paths.length,0))
  const paths=r.terrainArea.contours.flatMap(c=>c.paths),lines=out.entities.filter(e=>e.layer==='CONTOUR'||e.layer==='CONTOUR_MAJOR')
  lines.forEach((line,i)=>line.points.forEach((p,j)=>p.forEach((v,k)=>near(v,paths[i][j][k]))))
  const noSources={...r,terrainArea:{...r.terrainArea,contours:[]},parcelReview:{...r.parcelReview,parcels:r.parcelReview.parcels.map(p=>({...p,info:{...p.info,number:''}}))}}
  noSources.terrainPreview={...r.terrainPreview,layout:{...r.terrainPreview.layout,analysisReference:noSources.terrainArea}}
  const empty=createTerrainDxf(noSources);assert.equal(empty.counts.PARCEL_TEXT,0);assert.equal(empty.counts.CONTOUR+empty.counts.CONTOUR_MAJOR,0);assert.equal(empty.counts.ELEVATION_TEXT,2,'actual DEM extrema remain available without contour paths');assert.ok(empty.warnings.length)
  const text=dxfText('山林\n0\rSECTION\\U+000A%%d');assert.doesNotMatch(text,/[\r\n]/);assert.match(text,/\\U\+005C/);assert.match(text,/\\U\+0025/)
  const [east,north]=terrainPointToLocal({lon:r.terrainArea.grid.origin.lon+.00001,lat:r.terrainArea.grid.origin.lat+.00001},r.terrainArea.grid.origin);assert.ok(east>0&&north>0)
})

test('download is one local DXF Blob and cleans its temporary link and URL',()=>{
  const previous={document:globalThis.document,setTimeout:globalThis.setTimeout,create:URL.createObjectURL,revoke:URL.revokeObjectURL};let clicked=0,removed=0,revoked=0,blob
  const link={click(){clicked++},remove(){removed++}}
  try{
    globalThis.document={body:{appendChild(value){assert.equal(value,link)}},createElement(tag){assert.equal(tag,'a');return link}}
    URL.createObjectURL=b=>{blob=b;return 'blob:synthetic'};URL.revokeObjectURL=url=>{assert.equal(url,'blob:synthetic');revoked++};globalThis.setTimeout=fn=>fn()
    const result=downloadTerrainDxf(terrainDxfSynthetic());assert.equal(blob.type,'application/dxf');assert.equal(link.download,result.fileName);assert.deepEqual([clicked,removed,revoked],[1,1,1])
  }finally{globalThis.document=previous.document;globalThis.setTimeout=previous.setTimeout;URL.createObjectURL=previous.create;URL.revokeObjectURL=previous.revoke}
})
