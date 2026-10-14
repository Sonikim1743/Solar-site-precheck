import { validatePolygonGeometry, pointInGeometry } from './parcelGeometry.js'

export const REGIONAL_PARCEL_INDEX = '/parcels/2024-takahashi/index.json'
export const REGIONAL_PARCEL_SOURCE = '公開地番2024 高梁市 / 6e1e7334-d2ce-4b20-ac7c-85dcdf4d58f0'
export const PREPARED_PARCEL_REGION = Object.freeze({
  indexUrl: REGIONAL_PARCEL_INDEX, baseUrl: '/parcels/2024-takahashi/', sourceLabel: REGIONAL_PARCEL_SOURCE,
  resource: '6e1e7334-d2ce-4b20-ac7c-85dcdf4d58f0',
  sourceSha256: '1317873169bd31fdda886f17b7244c652ef06419ce54aa292a1ddadfa39fce85', crs: 'EPSG:6673', year: 2024,
})
const intersects = (a,b) => a[0]<=b[2] && a[2]>=b[0] && a[1]<=b[3] && a[3]>=b[1]
const checkAbort = signal => { if(signal?.aborted) throw new DOMException('Aborted','AbortError') }
const sha = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('')

export function validateRegionalIndex(index, region = PREPARED_PARCEL_REGION) {
  if(index?.schema!==1 || index.year!==region.year || index.geometryScope!=='whole-source-feature' || index.source?.simplified!==false || index.source?.clipped!==false || index.source?.resource!==region.resource || index.source?.sha256!==region.sourceSha256 || index.source?.crs!==region.crs || index.source?.outputCrs!=='EPSG:4326' || !Array.isArray(index.cells) || index.cells.length>32 || !Array.isArray(index.bounds) || index.bounds.length!==4 || !index.bounds.every(Number.isFinite)) throw Error('地域の全筆資料を確認できません。')
  if(!index.features || typeof index.features!=='object' || Array.isArray(index.features) || Object.keys(index.features).length>5000) throw Error('地域の筆索引が不正です。')
  const cellKeys=new Set()
  for(const c of index.cells) {
    if(cellKeys.has(c.key) || !/^\d+-\d+$/.test(c.key) || !/^\d+-\d+\.geojson$/.test(c.url) || !/^[a-f0-9]{64}$/.test(c.sha256) || !Number.isSafeInteger(c.bytes) || c.bytes<1 || c.bytes>1024*1024 || !Number.isSafeInteger(c.count) || c.count<1 || !Array.isArray(c.bbox) || c.bbox.length!==4 || !c.bbox.every(Number.isFinite)) throw Error('地域の空間索引が不正です。')
    cellKeys.add(c.key)
  }
  for(const f of Object.values(index.features)) if(!Array.isArray(f.bbox)||f.bbox.length!==4||!f.bbox.every(Number.isFinite)||!Array.isArray(f.cells)||!f.cells.length||f.cells.some(key=>!cellKeys.has(key))) throw Error('筆の空間索引が不正です。')
  return index
}

export function validateRegionalChunk(data,index,cell,region = PREPARED_PARCEL_REGION) {
  if(data?.type!=='FeatureCollection' || !Array.isArray(data.features) || data.features.length!==cell.count) throw Error('地域資料の件数が一致しません。')
  return data.features.map(f=>{
    const entry=index.features?.[f.id]
    if(!entry || !entry.cells.includes(cell.key) || f.properties?.__parcelSourceName!==region.sourceLabel || f.properties?.__parcelId!==f.id || f.properties?.__sourceYear!==region.year || f.properties?.__sourceRecord!==entry.record || f.properties?.['地番']!==entry.number || f.properties?.['地図名']!==entry.map || f.properties?.__geometryScope!=='whole-source-feature' || JSON.stringify(entry.bbox)!==JSON.stringify(f.bbox)) throw Error('筆の原本・年・索引が一致しません。')
    let geometry=f.geometry,selectionError=''
    try{geometry=validatePolygonGeometry(f.geometry)}catch(e){selectionError=e.message}
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates
    if(polygons.length!==entry.parts || polygons.reduce((n,p)=>n+p.length-1,0)!==entry.holes) throw Error('筆の部分数・穴が原本索引と一致しません。')
    return {...f,geometry,selectionError}
  })
}

export function parcelCandidates(features,point) {
  return features.filter(f=>!f.selectionError && pointInGeometry({lat:point.lat,lon:point.lng??point.lon},f.geometry))
}

export function createRegionalParcelLoader({fetchImpl=fetch,storage=globalThis.caches,region=PREPARED_PARCEL_REGION}={}) {
  let index, disk
  const memory=new Map()
  async function getIndex(signal) {
    checkAbort(signal)
    if(!index) { const response=await fetchImpl(region.indexUrl,{signal}); if(!response.ok) throw Error('準備済み地域の索引を取得できません。'); const next=validateRegionalIndex(await response.json(),region);checkAbort(signal);index=next }
    return index
  }
  async function chunk(cell,signal) {
    checkAbort(signal)
    if(memory.has(cell.key))return memory.get(cell.key)
    const url=`${region.baseUrl}${cell.url}?v=${cell.sha256}`
    if(storage&&!disk)try{disk=await storage.open('solar-parcel-whole-2024-v1')}catch{/* memory cache remains available */}
    let response;try{response=await disk?.match(url)}catch{}
    const fromDisk=Boolean(response)
    if(!response)response=await fetchImpl(url,{signal})
    if(!response.ok)throw Error('地域の筆を取得できません。選択済みの筆は保持しています。')
    const bytes=await response.arrayBuffer();checkAbort(signal)
    if(bytes.byteLength!==cell.bytes || await sha(bytes)!==cell.sha256) {if(fromDisk)await disk?.delete(url);throw Error('地域資料のハッシュが一致しません。再試行してください。')}
    const features=validateRegionalChunk(JSON.parse(new TextDecoder().decode(bytes)),index,cell,region);checkAbort(signal)
    if(!fromDisk)try{await disk?.put(url,new Response(bytes,{headers:{'Content-Type':'application/geo+json'}}))}catch{}
    checkAbort(signal);memory.set(cell.key,features);return features
  }
  return {getIndex,async load(bounds,{signal}={}) {
    const metadata=await getIndex(signal)
    if(!intersects(metadata.bounds,bounds))return {coverage:false,features:[],metadata}
    const wanted=new Set(Object.values(metadata.features).filter(f=>intersects(f.bbox,bounds)).flatMap(f=>f.cells))
    const cells=metadata.cells.filter(c=>wanted.has(c.key)),values=[]
    // Avoid a burst of all regional files. Four small requests at a time;
    // each returned feature still contains every original ring and part.
    for(let i=0;i<cells.length;i+=4){checkAbort(signal);values.push(...await Promise.all(cells.slice(i,i+4).map(c=>chunk(c,signal))))}
    checkAbort(signal)
    const unique=new Map(values.flat().filter(f=>intersects(f.bbox,bounds)).map(f=>[f.id,f]))
    return {coverage:true,completeCoverage:bounds[0]>=metadata.bounds[0]&&bounds[1]>=metadata.bounds[1]&&bounds[2]<=metadata.bounds[2]&&bounds[3]<=metadata.bounds[3],features:[...unique.values()],metadata,cells:cells.map(c=>c.key)}
  }}
}
