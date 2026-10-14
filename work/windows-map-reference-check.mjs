import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {featureInteriorPoint} from '../src/services/parcelGeometry.js'
import {terrainGeometryKey} from '../src/utils/terrainArea.js'
import {measureParcelReview} from '../src/utils/parcelReview.js'
import {isPublicParcelFeature,publicParcelLabelAnchor} from '../src/utils/publicParcelLayer.js'
const req=createRequire(await fs.realpath('node_modules/protomaps-leaflet/package.json'))
const {PMTiles}=req('pmtiles'),{VectorTile}=req('@mapbox/vector-tile'),pbfModule=req('pbf'),Pbf=pbfModule.default||pbfModule
const nativeFetch=globalThis.fetch
globalThis.fetch=async(url,init={})=>{const r=await nativeFetch(url,{...init,signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(12000)])});if(r.status!==206){await r.body?.cancel();throw Error('Public tile archive must use a bounded206 Range response')};return r}
const archive=new PMTiles('https://data.source.coop/smartmaps/amx-2024-04/MojMap_amx_2024.pmtiles')
let sample
for(const [lat,lon] of [[34.796,133.616],[34.426,132.7204],[34.865604,133.368782]]){
 const z=16,x=Math.floor((lon+180)/360*2**z),y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z),tile=await archive.getZxy(z,x,y)
 if(!tile)continue
 const layer=new VectorTile(new Pbf(new Uint8Array(tile.data))).layers.fude,candidates=[]
 for(let i=0;i<Math.min(layer.length,500);i++){
  const f=layer.feature(i);if(!isPublicParcelFeature({geomType:f.type,props:f.properties})||!f.properties['地番'])continue
  try{
   const rings=f.loadGeometry().map(r=>r.map(p=>({x:p.x*256/f.extent,y:p.y*256/f.extent}))),anchor=publicParcelLabelAnchor(rings)
   if(rings.reduce((n,r)=>n+r.length,0)>500)continue
   if(!anchor)continue
   const distance=(a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((anchor.x-a.x)*dx+(anchor.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(anchor.x-a.x-t*dx,anchor.y-a.y-t*dy)}
   if(Math.min(...rings.flatMap(r=>r.slice(1).map((p,j)=>distance(r[j],p))))<2)continue
   if(!featureInteriorPoint(f.toGeoJSON(x,y,z)))continue
   // Native mouse events round to CSS pixels. Choose a point with clearance
   // from source edges, rather than a wide scanline extremely near a corner.
   const world=256*2**z,px=x*256+anchor.x,py=y*256+anchor.y,p={lon:px/world*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*py/world)))*180/Math.PI}
   if(candidates.length){const first=candidates[0].point,fx=(first.lon+180)/360*world,fy=(1-Math.asinh(Math.tan(first.lat*Math.PI/180))/Math.PI)/2*world;if(Math.hypot(px-fx,py-fy)>100)continue}
   candidates.push({number:String(f.properties['地番']),point:p,id:f.id,crs:f.properties['座標系']});if(candidates.length===3)break
  }catch{}
 }
 if(candidates.length>2){sample={position:{lat,lon},candidates:candidates.slice(0,3)};break}
}
assert.ok(sample,'public map sample must exist')
globalThis.fetch=nativeFetch
const {chromium}=await import(pathToFileURL(process.env.SOLAR_PLAYWRIGHT_MODULE).href)
const out=path.resolve(process.env.SOLAR_VERIFICATION_DIR||'../map-reference-verification'),base=process.env.SOLAR_BASE_URL||'http://127.0.0.1:5188'
await fs.mkdir(out,{recursive:true})
await fs.writeFile(path.join(out,'public-sample.json'),JSON.stringify(sample,null,2))
const browser=await chromium.launch({executablePath:process.env.SOLAR_BROWSER_EXE,headless:true}),context=await browser.newContext({viewport:{width:1280,height:960},acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[],ranges=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('response',r=>{if(r.url().includes('MojMap_amx_2024.pmtiles'))ranges.push({status:r.status(),range:r.request().headers().range,bytes:r.headers()['content-length']})})
const center=sample.candidates[0].point
// Place the location marker away from the selected geometry's interior click.
const position={lat:center.lat+.0003,lon:center.lon-.0004}
await context.addInitScript(p=>localStorage.setItem('solar-site-precheck-draft-v1',JSON.stringify({position:p,siteName:'公開地図の参考領域検証（実候補地ではありません）',siteNameTouched:true})),position)
const selection=page.locator('.regional-parcel-selection strong')
const click=async candidate=>{
 const hit=await page.locator('img.leaflet-tile-loaded').evaluateAll((imgs,p)=>{
  for(const img of [...imgs].sort((a,b)=>Number(b.src.match(/\/xyz\/[^/]+\/(\d+)\//)?.[1]||0)-Number(a.src.match(/\/xyz\/[^/]+\/(\d+)\//)?.[1]||0))){const m=img.src.match(/\/xyz\/(?:seamlessphoto|std)\/(\d+)\/(\d+)\/(\d+)\./);if(!m||Number(m[1])<16)continue
   const z=Number(m[1]),w=256*2**z,x=(p.lon+180)/360*w-Number(m[2])*256,y=(1-Math.asinh(Math.tan(p.lat*Math.PI/180))/Math.PI)/2*w-Number(m[3])*256,b=img.getBoundingClientRect()
   if(x>=0&&x<256&&y>=0&&y<256&&b.width>0)return {x:b.x+x*b.width/256,y:b.y+y*b.height/256,z,width:b.width}
  }
 },candidate.point)
 assert.ok(hit,'clicked public feature must be inside a displayed basemap tile');assert.ok(hit.z>=16)
 await page.mouse.click(hit.x,hit.y)
 await page.waitForTimeout(100)
 const overlap=page.getByRole('group',{name:'重なる地図境界の候補'})
 if(await overlap.count())await overlap.getByRole('button').filter({hasText:candidate.number+' /'}).first().click()
 await page.waitForFunction(()=>!document.querySelector('.regional-parcel-selection')?.textContent.includes('選択境界を取得中'))
}
try{
 await page.goto(base+'/?design=simple')
 await page.waitForFunction(()=>[...document.querySelectorAll('img.leaflet-tile-loaded')].some(img=>img.src.includes('/14/')&&Math.abs(img.getBoundingClientRect().width-256)<1))
 await page.waitForTimeout(700)
 await page.getByRole('button',{name:'地番選択',exact:true}).click()
 for(let i=0;i<2;i++){await page.locator('.leaflet-control-zoom-in').click();await page.waitForTimeout(600);await page.waitForFunction(()=>!document.querySelector('.leaflet-container').classList.contains('leaflet-zoom-anim'))}
 await page.waitForFunction(()=>document.querySelectorAll('.public-parcel-reference-pane canvas').length>0)
 await page.waitForFunction(()=>document.querySelector('.public-parcel-overlay-status')?.textContent.includes('公開地番／参考境界'))
 for(let i=0;i<sample.candidates.length;i++){await click(sample.candidates[i]);await page.waitForFunction(n=>document.querySelector('.regional-parcel-selection strong')?.textContent.includes(`選択中 ${n}区域`),i+1)}
 assert.match(await selection.textContent(),/適用済み 0区域/)
 await page.getByRole('button',{name:'選択を中止',exact:true}).click();assert.match(await selection.textContent(),/選択中 0区域/)
 for(let i=0;i<sample.candidates.length;i++){await click(sample.candidates[i]);await page.waitForFunction(n=>document.querySelector('.regional-parcel-selection strong')?.textContent.includes(`選択中 ${n}区域`),i+1)}
 await page.getByRole('button',{name:'選択完了 → 3D',exact:true}).click()
 await page.locator('[data-selected-parcel-geometry-key]').waitFor({timeout:60000})
 const draft=JSON.parse(await page.evaluate(()=>localStorage.getItem('solar-site-precheck-draft-v1'))),review=draft.parcelReview
 assert.equal(review.parcels.filter(p=>p.role==='target').length,3);assert.deepEqual(review.parcels.map(p=>p.info.number).sort(),sample.candidates.map(c=>c.number).sort())
 assert.match(review.parcels[0].source.fileName,/地図表示境界の参考領域/)
 const expected=terrainGeometryKey(measureParcelReview({...review,boundary:null,exclusions:[]}).geometry)
 assert.equal(await page.locator('[data-selected-parcel-geometry-key]').getAttribute('data-selected-parcel-geometry-key'),expected)
 await page.locator('.regional-parcel-selection').getByRole('button',{name:sample.candidates[0].number+' ×',exact:true}).click();assert.match(await selection.textContent(),/選択中 2区域 \/ 適用済み 3区域/)
 await page.getByRole('button',{name:'選択を中止',exact:true}).click();assert.match(await selection.textContent(),/選択中 3区域 \/ 適用済み 3区域/)
 await page.setViewportSize({width:390,height:844});await page.locator('.regional-parcel-selection').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'mobile-selection.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
 await page.getByRole('button',{name:'基本値でまとめて解析',exact:true}).click();await page.locator('.simple-batch-complete').waitFor({timeout:180000})
 assert.equal(await page.locator('.simple-batch-complete').getAttribute('data-simple-result-key'),expected)
 const links=page.locator('.simple-batch-downloads a[download]');assert.equal(await links.count(),2)
 for(let i=0;i<2;i++){const [d]=await Promise.all([page.waitForEvent('download'),links.nth(i).click()]);await d.saveAs(path.join(out,i?'map-reference-report.pdf':'map-reference-drawing.pdf'))}
 await page.locator('.simple-batch-complete').screenshot({path:path.join(out,'simple-complete.png')})
 const before=await links.evaluateAll(ns=>ns.map(n=>n.href));await page.getByRole('button',{name:'同じ範囲を再解析',exact:true}).click();await page.getByRole('button',{name:'一括解析を中止',exact:true}).click();assert.deepEqual(await links.evaluateAll(ns=>ns.map(n=>n.href)),before)
 assert.deepEqual(errors,[]);assert.ok(ranges.every(r=>r.status===206),'PMTiles uses bounded Range requests')
 await fs.writeFile(path.join(out,'check.json'),JSON.stringify({at:new Date().toISOString(),base,sample,expected,review,ranges,errors,checks:['actual map-vector click outside original prepared region','reference draft/cancel preserves applied selection','same map geometry to 3D and simple batch','390px without page overflow','two actual PDF downloads','cancel retains completed PDFs']},null,2))
 console.log('Actual Windows map-reference flow passed')
}catch(e){await fs.writeFile(path.join(out,'failure.txt'),e.stack+'\n'+await page.locator('body').innerText());await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw e}finally{await browser.close()}
