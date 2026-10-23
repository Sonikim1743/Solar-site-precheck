import { selectReferenceFiles, bboxIntersects } from '../utils/regulatoryRegistry.js'

export async function readReferenceChunk(file,{signal,fetchImpl}) {
  if(!/^\/data\/regulatory\/[a-z0-9-]+\/[0-9_]+\.geojson$/.test(file.url))throw Error('Invalid reference asset URL')
  const controller=new AbortController(),abort=()=>controller.abort()
  if(signal?.aborted)throw new DOMException('cancelled','AbortError')
  signal?.addEventListener('abort',abort,{once:true})
  const timer=setTimeout(abort,8000)
  try {
    const response=await fetchImpl(file.url,{signal:controller.signal,credentials:'omit'})
    if(!response.ok)throw Error(`参考資料 HTTP ${response.status}`)
    if(!/^application\/(?:geo\+)?json(?:;|$)/i.test(response.headers.get('content-type')||''))throw Error('参考資料の形式が不正です。')
    const text=await response.text()
    if(new TextEncoder().encode(text).length>8*1024*1024)throw Error('参考資料が大きすぎます。')
    const data=JSON.parse(text)
    if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length>400)throw Error('参考図形の形式が不正です。')
    return data.features
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}

export async function loadReferenceFeatures(bounds,{includeHistorical=false,maxFiles=32,signal,fetchImpl=fetch}={}) {
  const selected=selectReferenceFiles(bounds,{includeHistorical,maxFiles}),features=[],failures=[]
  let index=0
  async function worker() {
    while(index<selected.files.length) {
      const {source,file}=selected.files[index++]
      if(signal?.aborted)throw new DOMException('cancelled','AbortError')
      try {
        const loaded=await readReferenceChunk(file,{signal,fetchImpl})
        for(const feature of loaded) {
          if(feature.type!=='Feature'||feature.geometry?.type!=='Polygon'||!Array.isArray(feature.geometry.coordinates)||!Array.isArray(feature.bbox)||feature.bbox.length!==4||!feature.bbox.every(Number.isFinite)||feature.bbox[0]>feature.bbox[2]||feature.bbox[1]>feature.bbox[3])throw Error('参考図形の範囲が不正です。')
          if(bboxIntersects(feature.bbox,bounds))features.push({...feature,properties:{...feature.properties,sourceDatasetId:source.id}})
        }
      } catch(error) {
        if(signal?.aborted)throw error
        failures.push({source:source.id,url:file.url,message:error.message})
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(4,selected.files.length)},worker))
  if(signal?.aborted)throw new DOMException('cancelled','AbortError')
  return {features,failures,partial:selected.partial,state:failures.length?'error':selected.partial?'partial':selected.available?'ready':'outside',message:failures.length?'参考資料の一部を取得できません。範囲は未確認。':selected.partial?'表示上限により一部のみ表示。拡大して再確認してください。':selected.available?`参考図形 ${features.length}件を表示。位置精度・現行境界は未確認。`:'表示範囲の対応資料なし。区域がないことを意味しません。'}
}
