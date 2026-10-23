import { locateReferencePoint, pointInBounds, isInspectionPoint } from '../utils/regulatoryPoint.js'
import { bboxIntersects } from '../utils/regulatoryRegistry.js'

const caches=new WeakMap()
const stopped=signal=>{if(signal?.aborted)throw new DOMException('地点確認を中止しました。','AbortError')}
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('')
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const goodBox=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]<=b[2]&&b[1]<=b[3]
function cacheFor(fetchImpl){if(!caches.has(fetchImpl))caches.set(fetchImpl,{manifest:null,chunks:new Map()});return caches.get(fetchImpl)}
function waitFor(promise,signal){
  stopped(signal);if(!signal)return promise
  return new Promise((resolve,reject)=>{const abort=()=>reject(new DOMException('地点確認を中止しました。','AbortError'));signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort))})
}
async function jsonAsset(url,{fetchImpl,hash,maxBytes=4_100_000,encoding,decodedBytes}){
  const r=await fetchImpl(url,{credentials:'omit',signal:AbortSignal.timeout(15000)})
  if(!r.ok)throw Error(`保存資料 HTTP ${r.status}・未確認`)
  if(!(encoding==='gzip'?/^(?:application\/(?:gzip|octet-stream)|application\/x-gzip)(?:;|$)/i:/^application\/(?:geo\+)?json(?:;|$)/i).test(r.headers.get('content-type')||''))throw Error('保存資料の形式が不正です。')
  const bytes=new Uint8Array(await r.arrayBuffer())
  if(bytes.length>maxBytes)throw Error('保存資料が大きすぎます。')
  if(hash&&await sha(bytes)!==hash)throw Error('保存資料の整合性を確認できません。')
  let decoded=bytes
  if(encoding==='gzip'){
    if(typeof DecompressionStream!=='function')throw Error('このブラウザーは保存資料の展開に未対応です。')
    const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),parts=[];let count=0
    try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>decodedBytes||count>128_001_000)throw Error('保存資料の展開サイズが不正です。');parts.push(value)}}finally{await reader.cancel()}
    if(count!==decodedBytes)throw Error('保存資料の展開サイズが不正です。')
    decoded=new Uint8Array(count);let offset=0;for(const p of parts){decoded.set(p,offset);offset+=p.length}
  }
  return JSON.parse(new TextDecoder().decode(decoded))
}
export function validateStoredManifest(manifest,pointer){
  if(manifest?.schemaVersion!==1||manifest.version!==pointer.version||manifest.simplified!==false||!Array.isArray(manifest.datasets)||manifest.datasets.length!==10||manifest.prefectures?.join(',')!=='33,34,35')throw Error('保存資料の索引が不正です。')
  let count=0
  for(const d of manifest.datasets){
    if(!/^(?:soil|flood|admin)-(?:33|34|35|87)$/.test(d.id)||!['soil','flood','admin'].includes(d.category)||!goodBox(d.bbox)||!Array.isArray(d.files)||!hex(d.archiveSha256)||d.sourceCrs?.epsg!==6668)throw Error('保存資料の出典・範囲が不正です。')
    for(const f of d.files){if(!/^\d+_\d+_\d+\.geojson\.gz$/.test(f.name)||!goodBox(f.bbox)||!hex(f.sha256)||!Number.isInteger(f.count)||f.count<1||f.count>300||f.bytes>24_000_000||f.encoding!=='gzip'||!Number.isInteger(f.decodedBytes)||f.decodedBytes>128_001_000)throw Error('保存資料の分割索引が不正です。');count++}
  }
  if(count!==manifest.fileCount||count>19400)throw Error('保存資料の件数が不正です。')
  return manifest
}
export async function storedManifest({fetchImpl=fetch,signal}={}){
  stopped(signal);const cache=cacheFor(fetchImpl)
  if(!cache.manifest)cache.manifest=(async()=>{
    const p=await jsonAsset('/data/stored-hazards/current.json',{fetchImpl,maxBytes:4096})
    if(p?.schemaVersion!==1||!/^r2025-[a-f0-9]{12}$/.test(p.version)||p.url!==`/data/stored-hazards/${p.version}/manifest.json`||!hex(p.sha256))throw Error('保存資料の版情報が不正です。')
    return validateStoredManifest(await jsonAsset(p.url,{fetchImpl,hash:p.sha256,maxBytes:10_000_000}),p)
  })().catch(error=>{cache.manifest=null;throw error})
  const manifest=await waitFor(cache.manifest,signal);stopped(signal);return manifest
}
export async function storedChunk(manifest,dataset,file,{fetchImpl=fetch,signal}={}){
  stopped(signal);const cache=cacheFor(fetchImpl),url=`/data/stored-hazards/${manifest.version}/${dataset.id}/${file.name}`
  if(!dataset.files.includes(file)||!manifest.datasets.includes(dataset))throw Error('Unknown stored file')
  if(!cache.chunks.has(url)){
    if(cache.chunks.size>=12)cache.chunks.delete(cache.chunks.keys().next().value)
    cache.chunks.set(url,jsonAsset(url,{fetchImpl,hash:file.sha256,encoding:file.encoding,decodedBytes:file.decodedBytes,maxBytes:24_000_000}).then(data=>{
      if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length!==file.count)throw Error('保存図形の件数が不正です。')
      for(const f of data.features)if(f.type!=='Feature'||!goodBox(f.bbox)||!['Polygon','LineString'].includes(f.geometry?.type)||f.properties?.sourceDatasetId!==dataset.id)throw Error('保存図形の形式が不正です。')
      return data.features
    }).catch(error=>{cache.chunks.delete(url);throw error}))
  }
  const features=await waitFor(cache.chunks.get(url),signal);stopped(signal);return features
}
export async function storedPrefecture(point,{manifest,fetchImpl=fetch,signal}={}){
  if(!isInspectionPoint(point))throw Error('日本の地点を確認してください。')
  manifest ||= await storedManifest({fetchImpl,signal})
  const sources=manifest.datasets.filter(d=>d.category==='admin'&&pointInBounds(point,d.bbox)),found=new Map();let boundary=false
  for(const d of sources)for(const file of d.files.filter(f=>pointInBounds(point,f.bbox))){
    const features=await storedChunk(manifest,d,file,{fetchImpl,signal})
    for(const f of features){if(!pointInBounds(point,f.bbox))continue;const state=locateReferencePoint(point,f.geometry)
      if(state==='invalid')throw Error('行政境界の形状を判読できません。')
      if(state==='boundary')boundary=true
      if(state==='inside'||state==='boundary')found.set(d.prefecture,{code:d.prefecture,name:f.properties.N03_001,municipality:f.properties.N03_007})
    }
  }
  stopped(signal)
  if(boundary||found.size>1)return {state:'unconfirmed',stored:true,message:'行政境界上・複数県のため対象県未確定。推定しません。'}
  if(found.size===1)return {state:'ready',stored:true,...found.values().next().value,sourceDate:'2025-01-01'}
  return {state:'outside',stored:false,message:'保存型の対象3県外、海上または行政境界未収録。'}
}
export const SOIL_PHENOMENA={1:'急傾斜地の崩壊',2:'土石流',3:'地滑り'}
export const SOIL_ZONES={1:'土砂災害警戒区域（指定済）',2:'土砂災害特別警戒区域（指定済）',3:'土砂災害警戒区域（指定前・基礎調査公表）',4:'土砂災害特別警戒区域（指定前・基礎調査公表）'}
export const FLOOD_DEPTH={1:'0～0.5m未満',2:'0.5～3.0m未満',3:'3.0～5.0m未満',4:'5.0～10.0m未満',5:'10.0～20.0m未満',6:'20.0m以上'}
export function storedFeatureInfo(feature){
  const p=feature.properties
  return p.sourceDatasetId.startsWith('soil-')?{name:p.A33_005||'区域名未記載',kind:SOIL_PHENOMENA[p.A33_001]||`現象コード${p.A33_001}・要確認`,designation:SOIL_ZONES[p.A33_002]||`区域コード${p.A33_002}・要確認`,place:p.A33_006||'',date:p.A33_007||'告示日未記載',notice:p.A33_008===1?'特別警戒区域の調査・公示未実施フラグあり':''}:{name:p.A31a_202||'河川名未記載',kind:'洪水浸水想定区域・想定最大規模',designation:`浸水深 ${FLOOD_DEPTH[p.A31a_205]||`ランク${p.A31a_205}・要確認`}`,place:p.A31a_204||'',date:'原図基準日未確認',notice:'洪水シナリオの参考範囲。内水・高潮・津波を含みません。'}
}
export async function inspectStoredPoint(point,{fetchImpl=fetch,signal,maxFilesPerSource=96}={}){
  const manifest=await storedManifest({fetchImpl,signal}),region=await storedPrefecture(point,{manifest,fetchImpl,signal})
  if(region.state!=='ready')return {mode:'stored',region,datasets:[],version:manifest.version}
  const datasets=[]
  for(const d of manifest.datasets.filter(d=>d.category!=='admin'&&(d.prefecture===region.code||d.prefecture==='87'))){
    const files=d.files.filter(f=>pointInBounds(point,f.bbox)),matches=new Map(),failures=[];let lineCandidates=0
    for(const file of files.slice(0,maxFilesPerSource))try{
      for(const f of await storedChunk(manifest,d,file,{fetchImpl,signal})){
        if(!pointInBounds(point,f.bbox))continue
        if(f.geometry.type==='LineString'){lineCandidates++;continue}
        const state=locateReferencePoint(point,f.geometry)
        if(state==='invalid')throw Error('保存資料の形状を判読できません。')
        if(state==='inside'||state==='boundary'){
          const key=f.properties.sourceRecordId,old=matches.get(key)
          if(old){old.boundary ||= state==='boundary';continue}
          matches.set(key,{id:f.id,boundary:state==='boundary',properties:f.properties,...storedFeatureInfo(f)})
        }
      }
    }catch(error){stopped(signal);failures.push({url:file.name,message:error.message})}
    datasets.push({source:d,matches:[...matches.values()],lineCandidates,failures,state:failures.length?'error':files.length>maxFilesPerSource?'partial':matches.size?'matched':lineCandidates?'unconfirmed':'none'})
  }
  stopped(signal);return {mode:'stored',region,datasets,version:manifest.version,collectedAt:manifest.collectedAt}
}
export async function loadStoredViewport(bounds,{fetchImpl=fetch,signal,maxFiles=72}={}){
  const manifest=await storedManifest({fetchImpl,signal}),jobs=manifest.datasets.filter(d=>d.category!=='admin').flatMap(d=>d.files.filter(f=>bboxIntersects(f.bbox,bounds)).map(file=>({source:d,file})))
  const features=[],failures=[];let index=0
  async function worker(){while(index<Math.min(jobs.length,maxFiles)){const {source,file}=jobs[index++];stopped(signal);try{for(const f of await storedChunk(manifest,source,file,{fetchImpl,signal}))if(bboxIntersects(f.bbox,bounds))features.push(f)}catch(e){stopped(signal);failures.push({url:file.name,message:e.message})}}}
  await Promise.all(Array.from({length:Math.min(4,jobs.length)},worker));stopped(signal)
  return {features,failures,partial:jobs.length>maxFiles,version:manifest.version,state:failures.length?'error':jobs.length>maxFiles?'partial':'ready',message:failures.length?'保存ハザードの一部取得失敗・範囲未確認':jobs.length>maxFiles?'保存ハザードは表示上限で一部のみ。拡大してください。':`保存ハザード ${features.length}図形。未収録・空白は安全を意味しません。`}
}
export function storedHazardStyle(feature,opacity=.5){const p=feature.properties,soil=p.sourceDatasetId.startsWith('soil-');const color=soil?([2,4].includes(p.A33_002)?'#d93025':'#e0ad00'):({1:'#f6dd68',2:'#f3a8ad',3:'#de70a8',4:'#a44fc2',5:'#7d48a6',6:'#573378'}[p.A31a_205]||'#777');return {color,weight:soil?1:.5,opacity:.85,fillColor:color,fillOpacity:opacity*.6,dashArray:feature.geometry.type==='LineString'?'4 3':null,interactive:false}}
