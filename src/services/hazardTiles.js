import { hazardTileUrl } from '../utils/regulatoryLayers.js'

// Real-time public PNGs only. No credentials, company document upload, proxy,
// scraping, vector inference, or export into PDF/DXF.
export async function loadHazardTile(id, coords, {prefecture='',signal,fetchImpl=fetch}={}) {
  const url=hazardTileUrl(id,coords,prefecture),controller=new AbortController()
  const abort=()=>controller.abort()
  if(signal?.aborted)throw new DOMException('中止','AbortError')
  signal?.addEventListener('abort',abort,{once:true})
  const timer=setTimeout(abort,8000)
  try {
  const response=await fetchImpl(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'})
  if(response.status===404)return {state:'unavailable'}
  if(!response.ok)throw new Error(`ハザード取得失敗 HTTP ${response.status}`)
  if(!/^image\/png(?:;|$)/i.test(response.headers.get('content-type')||''))throw new Error('ハザード画像の形式を確認できません。')
  const blob=await response.blob()
  if(!blob.size||blob.size>2*1024*1024)throw new Error('ハザード画像の容量が不正です。')
  return {state:'ready',blob}
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}

export function createHazardTileTracker(onStatus) {
  const jobs=new Map();let active=true,callback=onStatus
  const report=()=>{if(active)callback?.([...jobs.values()].map(j=>j.state))}
  return {
    begin(key){const previous=jobs.get(key);previous?.controller.abort();const job={state:'loading',controller:new AbortController()};jobs.set(key,job);report();return job},
    finish(key,job,state){if(active&&jobs.get(key)===job&&!job.controller.signal.aborted){job.state=state;report();return true}return false},
    remove(key){jobs.get(key)?.controller.abort();jobs.delete(key);report()},
    setCallback(value){callback=value;report()},
    stop(){active=false;for(const job of jobs.values())job.controller.abort();jobs.clear()},
  }
}
