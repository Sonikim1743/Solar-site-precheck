import proj4 from 'proj4'
import { terrainDrawingViewport } from '../utils/terrainDrawingViewport.js'

const cache=new WeakMap()
const toTile=([lon,lat],z)=>[(lon+180)/360*2**z,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z]
const toPoint=(x,y,z)=>[x/2**z*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/2**z)))*180/Math.PI]
const dataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('地図画像を読み込めません。'));reader.readAsDataURL(blob)})

// Small bounded requests to the existing public GSI basemap. The map context
// supplies roads/labels, never elevations or an enlarged calculation boundary.
export function loadTerrainDrawingContext(analysis,kind='map') {
  if(!['map','photo'].includes(kind))throw Error('周辺画像の種類が不正です。')
  const cached=cache.get(analysis)||new Map()
  if(cached.has(kind))return cached.get(kind)
  const task=(async()=>{
    const g=analysis.grid,v=terrainDrawingViewport(g),projection=proj4('EPSG:4326',`+proj=aeqd +lat_0=${g.origin.lat} +lon_0=${g.origin.lon} +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs`)
    const corners=[[v.west,v.south],[v.east,v.south],[v.east,v.north],[v.west,v.north]].map(p=>projection.inverse(p))
    if(!corners.flat().every(Number.isFinite))throw Error('周辺地図の投影座標が不正です。')
    let z=18,b
    do{const t=corners.map(p=>toTile(p,z));b={x0:Math.floor(Math.min(...t.map(p=>p[0]))),x1:Math.floor(Math.max(...t.map(p=>p[0]))),y0:Math.floor(Math.min(...t.map(p=>p[1]))),y1:Math.floor(Math.max(...t.map(p=>p[1])))};if((b.x1-b.x0+1)*(b.y1-b.y0+1)<=16)break;z--}while(z>10)
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000),requests=[]
    try{
      for(let y=b.y0;y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++)requests.push((async()=>{
        const layer=kind==='photo'?'seamlessphoto':'std',extension=kind==='photo'?'jpg':'png',mime=kind==='photo'?'image/jpeg':'image/png'
        const url=`https://cyberjapandata.gsi.go.jp/xyz/${layer}/${z}/${x}/${y}.${extension}`,response=await fetch(url,{signal:controller.signal})
        if(!response.ok||!response.headers.get('content-type')?.includes(mime))throw Error(kind==='photo'?'周辺航空写真未取得':'周辺地図未取得')
        const blob=await response.blob();if(blob.size>2*1024*1024)throw Error('周辺地図の画像上限')
        return {href:await dataUrl(blob),layer,points:[[x,y],[x+1,y],[x,y+1]].map(([tx,ty])=>projection.forward(toPoint(tx,ty,z)))}
      })())
      if(!requests.length)throw Error('周辺地図の照会範囲を確認できません。')
      const results=await Promise.allSettled(requests),tiles=results.filter(r=>r.status==='fulfilled').map(r=>r.value)
      return {tiles,status:tiles.length===requests.length?'ready':tiles.length?'partial':'unavailable'}
    }finally{clearTimeout(timer);controller.abort()}
  })().catch(()=>({tiles:[],status:'unavailable'})).then(result=>{if(result.status!=='ready'&&cached.get(kind)===task)cached.delete(kind);return result})
  cached.set(kind,task);cache.set(analysis,cached);return task
}
