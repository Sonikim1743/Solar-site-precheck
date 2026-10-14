import polygonClipping from 'polygon-clipping'
import { validatePolygonGeometry } from '../services/parcelGeometry.js'
import { isPublicParcelFeature, publicParcelNumber, PUBLIC_PARCEL_SOURCE } from './publicParcelLayer.js'

export const MAP_PARCEL_SOURCE = '地図表示境界の参考領域 / AMX公開2024 PMTiles（原本全筆未確認）'
export const MAP_PARCEL_NOTICE = '地図表示境界の参考領域（公開2024）。タイル化・量子化・省略・欠測・分離部分の未収録があり得るため、原本の全筆・登記・測量境界は保証しません。'
export const isMapParcel = p => p?.source?.fileName === MAP_PARCEL_SOURCE
export const mapParcelSignature = f => JSON.stringify([f?.id ?? null, publicParcelNumber(f), ...['地番区域','地図名','座標系'].map(k=>String(f?.props?.[k] || ''))])
const key = c => `${c.z}/${c.x}/${c.y}`
const hash = s => {let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(16)}
const check = signal => {if(signal?.aborted)throw new DOMException('選択を中止しました。','AbortError')}
const ringArea = ring => ring.slice(1).reduce((n,p,i)=>n+(ring[i].x-ring[0].x)*(p.y-ring[0].y)-(p.x-ring[0].x)*(ring[i].y-ring[0].y),0)
const lonLat = ([x,y],z) => {const world=256*2**z;return [x/world*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/world)))*180/Math.PI]}

// Union in the renderer's global CSS pixel grid before inverse projection.
// No bbox/convex hull, snapping, simplification or buffer expansion is used.
export function mergeMapParcelFragments(fragments) {
 if(!fragments.length)throw Error('選択した地番の表示境界を取得できません。')
 const z=fragments[0].tile.z,shapes=[]
 let vertices=0
 for(const {tile,feature} of fragments){
  if(tile.z!==z||!isPublicParcelFeature(feature)||!feature.geom?.length)throw Error('地図境界の座標・形式が一致しません。')
  const polygons=[];let outerSign
  for(const ring of feature.geom){
   if(ring.length<4||ring[0].x!==ring.at(-1).x||ring[0].y!==ring.at(-1).y||ring.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('地図表示の形状を確認できません。選択は保持しています。')
   vertices+=ring.length;if(vertices>24000)throw Error('選択境界が複雑です。範囲を分けて選択してください。')
   const sign=Math.sign(ringArea(ring));if(!sign)throw Error('面積のない地図境界は使えません。')
   outerSign??=sign
   const coords=ring.map(p=>[p.x*tile.scale+tile.origin.x,p.y*tile.scale+tile.origin.y])
   if(sign===outerSign)polygons.push([coords]);else polygons.at(-1).push(coords)
  }
  shapes.push(polygons)
 }
 const merged=polygonClipping.union(...shapes)
 const coordinates=merged.map(p=>p.map(r=>r.map(c=>lonLat(c,z))))
 return validatePolygonGeometry(coordinates.length===1?{type:'Polygon',coordinates:coordinates[0]}:{type:'MultiPolygon',coordinates})
}

export async function resolveMapParcelSelection(picked,seed,getTile,{signal,maxTiles=25}={}) {
 check(signal)
 if(!isPublicParcelFeature(picked))throw Error('この地番の地図表示境界を取得できません。')
 const signature=mapParcelSignature(picked),stable=Number.isSafeInteger(picked.id),visited=new Set(),queued=new Set([key(seed)]),queue=[seed],fragments=[]
 let limited=false,unmatched=0
 while(queue.length){
  check(signal)
  if(visited.size>=maxTiles){limited=true;break}
  const coords=queue.shift(),tile=await getTile(coords);check(signal);visited.add(key(coords))
  const matches=(tile.data.get(PUBLIC_PARCEL_SOURCE.dataLayer)||[]).filter(f=>stable?mapParcelSignature(f)===signature:f===picked)
  if(stable&&visited.size>1&&!matches.length)unmatched++
  for(const feature of matches){
   fragments.push({tile,feature})
   if(!stable)continue
   const dim=tile.dim/tile.scale,touch={left:false,right:false,top:false,bottom:false}
   for(const ring of feature.geom)for(const p of ring){touch.left ||= p.x<=0;touch.right ||= p.x>=dim;touch.top ||= p.y<=0;touch.bottom ||= p.y>=dim}
   const xs=[0,...(touch.left?[-1]:[]),...(touch.right?[1]:[])],ys=[0,...(touch.top?[-1]:[]),...(touch.bottom?[1]:[])]
   for(const dx of xs)for(const dy of ys){if(!dx&&!dy)continue;const next={z:coords.z,x:coords.x+dx,y:coords.y+dy};if(next.x<0||next.y<0||next.x>=2**next.z||next.y>=2**next.z)continue;const k=key(next);if(!queued.has(k)){queued.add(k);queue.push(next)}}
  }
 }
 if(!stable&&!fragments.length){const tile=await getTile(seed);fragments.push({tile,feature:picked})}
 const geometry=mergeMapParcelFragments(fragments),id=stable?`map:2024:${picked.id}:${hash(signature)}`:`map:2024:fragment:${key(seed)}:${hash(JSON.stringify(geometry))}`
 const warning=limited?'隣接タイル照会の上限に達した表示境界です。範囲外の欠落があり得ます。プレビューを確認してください。':!stable?'共通IDがないため、クリックした表示断片のみです。画面外の部分は確認できません。':unmatched?'隣接タイルに同じ地図IDがない部分があります。境界の連続は未確認です。プレビューした形だけを参考領域に使います。':'同じ地図IDの隣接断片を結合しました。離れた未収録部分を含む原本全筆の保証はありません。'
 return {type:'Feature',id,geometry,properties:{'地番':publicParcelNumber(picked),'地番区域':String(picked.props['地番区域']||''),'地図名':String(picked.props['地図名']||''),'座標系':String(picked.props['座標系']||''),__parcelId:id,__parcelSourceName:MAP_PARCEL_SOURCE,__sourceYear:2024,__geometryScope:'map-reference-tile-union',__mvtId:stable?picked.id:null,__tileKeys:[...visited],__selectionLimited:limited||unmatched>0||!stable,__selectionWarning:warning}}
}
