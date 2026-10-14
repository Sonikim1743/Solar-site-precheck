// Offline regional compiler. Uses only the app's already pinned fflate/proj4.
// ESRI SHP record layout: https://www.esri.com/library/whitepapers/pdfs/shapefile.pdf
// Full source rings are retained; no clipping, simplification, or repair.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import proj4 from 'proj4'

const SOURCE_SHA = '1317873169bd31fdda886f17b7244c652ef06419ce54aa292a1ddadfa39fce85'
const RESOURCE = '6e1e7334-d2ce-4b20-ac7c-85dcdf4d58f0'
const bounds = [133.362, 34.860, 133.374, 34.872]
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const intersects = (a,b) => a[0]<=b[2] && a[2]>=b[0] && a[1]<=b[3] && a[3]>=b[1]
const bboxOf = rings => rings.flat().reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity])
const ringArea = ring => ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1]},0)/2
function inside(point,ring) {
  let value=false
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j]
    if((a[1]>point[1])!==(b[1]>point[1]) && point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])value=!value
  }
  return value
}
export function shapePolygon(rings) {
  const outers=rings.filter(r=>ringArea(r)<0).map(r=>[r])
  const holes=rings.filter(r=>ringArea(r)>=0)
  if(!outers.length) throw Error('Source has no clockwise exterior; do not repair it implicitly')
  for(const hole of holes) {
    const parents=outers.filter(p=>hole.some(point=>inside(point,p[0])))
      .sort((a,b)=>Math.abs(ringArea(a[0]))-Math.abs(ringArea(b[0])))
    if(!parents.length)throw Error('Source hole has no containing exterior')
    parents[0].push(hole)
  }
  return {type:outers.length===1?'Polygon':'MultiPolygon',coordinates:outers.length===1?outers[0]:outers}
}
export function dbfReader(bytes, encoding) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder(encoding,{fatal:true})
  const count=view.getUint32(4,true),header=view.getUint16(8,true),length=view.getUint16(10,true),fields=[]
  if(header<33||header+(count*length)>bytes.length)throw Error('Truncated DBF')
  let offset=1
  for(let pos=32;pos<header-1;pos+=32) {
    const raw=bytes.subarray(pos,pos+11),end=raw.indexOf(0)
    const name=decoder.decode(end<0?raw:raw.subarray(0,end)),width=bytes[pos+16]
    fields.push({name,type:String.fromCharCode(bytes[pos+11]),offset,width});offset+=width
  }
  if(offset!==length)throw Error('DBF record width mismatch')
  return {count,record(index) {
    const start=header+index*length
    if(bytes[start]===42)throw Error('Deleted source record')
    const result={}
    for(const f of fields) {
      const value=decoder.decode(bytes.subarray(start+f.offset,start+f.offset+f.width)).trim()
      result[f.name]=f.type==='N'||f.type==='F' ? (value===''?null:Number(value)) : value
    }
    return result
  }}
}

export async function prepareRegionalParcels(archivePath, output) {
  const archive=await fs.readFile(archivePath),sourceHash=digest(archive)
  if(archive.length>128*1024*1024||sourceHash!==SOURCE_SHA)throw Error('Expected verified official 2024 resource bytes')
  const files=unzipSync(archive,{filter:file=>/\.(shp|dbf|prj|cpg)$/i.test(file.name)})
  const part=ext=>{const matches=Object.entries(files).filter(([name])=>name.endsWith(ext));if(matches.length!==1)throw Error('Ambiguous archive member');return matches[0][1]}
  const crs=new TextDecoder().decode(part('.prj'))
  if(!crs.includes('JGD_2011_Japan_Zone_5'))throw Error('Unexpected original CRS')
  const projection=proj4(crs,'EPSG:4326'),attributes=dbfReader(part('.dbf'),new TextDecoder().decode(part('.cpg')).trim())
  const shp=part('.shp'),view=new DataView(shp.buffer,shp.byteOffset,shp.byteLength)
  if(view.getInt32(0)!==9994||view.getInt32(28,true)!==1000||view.getInt32(24)*2!==shp.length)throw Error('Invalid SHP header')
  const corners=[bounds.slice(0,2),[bounds[2],bounds[1]],bounds.slice(2),[bounds[0],bounds[3]]].map(p=>projection.inverse(p))
  const nativeBox=bboxOf([corners]).map((v,i)=>v+(i<2?-100:100))
  const selected=[]
  let count=0
  for(let offset=100;offset<shp.length;) {
    const record=view.getInt32(offset)-1,bytes=view.getInt32(offset+4)*2,start=offset+8,end=start+bytes
    if(record!==count++||bytes<4||end>shp.length)throw Error('Invalid source record sequence/length')
    offset=end
    const type=view.getInt32(start,true)
    if(type===0)continue
    if(![5,15,25].includes(type)||bytes<44)throw Error('Expected polygon source')
    const native=[0,1,2,3].map(i=>view.getFloat64(start+4+i*8,true))
    if(!intersects(native,nativeBox))continue
    const parts=view.getInt32(start+36,true),points=view.getInt32(start+40,true),data=start+44+parts*4
    if(parts<1||points<4||data+points*16>end)throw Error('Invalid polygon parts')
    const indexes=Array.from({length:parts},(_,i)=>view.getInt32(start+44+i*4,true)).concat(points),rings=[]
    for(let i=0;i<parts;i++) {
      if(indexes[i]<0||indexes[i+1]-indexes[i]<4)throw Error('Invalid source ring')
      rings.push(Array.from({length:indexes[i+1]-indexes[i]},(_,j)=>{const p=data+(indexes[i]+j)*16;return [view.getFloat64(p,true),view.getFloat64(p+8,true)]}))
    }
    const geometry=shapePolygon(rings)
    const transform=value=>typeof value[0]==='number'?projection.forward(value):value.map(transform)
    geometry.coordinates=transform(geometry.coordinates)
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates,bbox=bboxOf(polygons.flat())
    if(!intersects(bbox,bounds))continue
    const properties=attributes.record(record),id=`2024:33209:${sourceHash.slice(0,16)}:${record}`
    Object.assign(properties,{__parcelId:id,__parcelSourceName:`公開地番2024 高梁市 / ${RESOURCE}`,__geometryScope:'whole-source-feature',__sourceYear:2024,__sourceRecord:record})
    selected.push({type:'Feature',id,bbox,properties,geometry})
  }
  if(count!==attributes.count)throw Error('SHP/DBF record count mismatch')
  // Store each complete original feature once. A small per-feature spatial
  // index identifies its owning chunk even if distant parts cross many cells.
  selected.sort((a,b)=>a.bbox[0]-b.bbox[0]||a.bbox[1]-b.bbox[1]||a.id.localeCompare(b.id))
  const packs=[],features={}
  let pack=[],size=0
  for(const feature of selected) {
    const bytes=Buffer.byteLength(JSON.stringify(feature),'utf8')
    if(bytes>900*1024)throw Error('One source feature exceeds the small-file contract')
    if(pack.length&&size+bytes>512*1024){packs.push(pack);pack=[];size=0}
    pack.push(feature);size+=bytes
  }
  if(pack.length)packs.push(pack)
  if(packs.length>32)throw Error('Region is too large; partition the index first')
  await fs.mkdir(output,{recursive:true})
  const cells=[]
  for(let i=0;i<packs.length;i++) {
    const key=`${i}-0`,url=key+'.geojson',rows=packs[i],body=Buffer.from(JSON.stringify({type:'FeatureCollection',features:rows})),bbox=rows.reduce((b,f)=>[Math.min(b[0],f.bbox[0]),Math.min(b[1],f.bbox[1]),Math.max(b[2],f.bbox[2]),Math.max(b[3],f.bbox[3])],[Infinity,Infinity,-Infinity,-Infinity])
    await fs.writeFile(path.join(output,url),body)
    cells.push({key,url,bbox,count:rows.length,bytes:body.length,sha256:digest(body)})
    for(const f of rows) {const p=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;features[f.id]={record:f.properties.__sourceRecord,number:f.properties['地番'],map:f.properties['地図名'],bbox:f.bbox,cells:[key],parts:p.length,holes:p.reduce((n,x)=>n+x.length-1,0)}}
  }
  const index={schema:1,year:2024,region:'高梁市 備中町西山周辺',bounds,geometryScope:'whole-source-feature',storagePolicy:'single-copy-whole-feature',source:{resource:RESOURCE,url:`https://www.geospatial.jp/ckan/dataset/072dcb26-f97b-4a44-838e-75acb217b20d/resource/${RESOURCE}/download/33209__5_r_2024.shp.zip`,catalog:'https://www.geospatial.jp/ckan/dataset/aigid-moj-33209',license:'Creative Commons Attribution (catalog designation)',licenseUrl:'http://www.opendefinition.org/licenses/cc-by/',resourcePublishedAt:'2024-07-04',sha256:sourceHash,bytes:archive.length,crs:'EPSG:6673',outputCrs:'EPSG:4326',totalRecords:count,selectedRecords:selected.length,simplified:false,clipped:false},cells,features}
  await fs.writeFile(path.join(output,'index.json'),JSON.stringify(index))
  return {sourceBytes:archive.length,sourceRecords:count,selectedRecords:selected.length,chunks:cells.length,chunkBytes:cells.reduce((n,c)=>n+c.bytes,0),indexBytes:Buffer.byteLength(JSON.stringify(index)),parts:Object.values(features).reduce((n,f)=>n+f.parts,0),holes:Object.values(features).reduce((n,f)=>n+f.holes,0)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  if(!process.argv[2]||!process.argv[3])throw Error('Usage: node build/prepareRegionalParcels.mjs SOURCE.zip OUTPUT_DIR')
  console.log(JSON.stringify(await prepareRegionalParcels(process.argv[2],process.argv[3])))
}
