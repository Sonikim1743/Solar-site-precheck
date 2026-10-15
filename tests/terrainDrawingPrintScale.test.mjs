import test from 'node:test'
import assert from 'node:assert/strict'
import {after,before} from 'node:test'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import proj4 from 'proj4'
import {terrainDrawingPrintViewports,terrainDrawingPrintFit,terrainDrawingPrintScaleBar,terrainDrawingViewport,normalizeTerrainDrawingScale,TERRAIN_DRAWING_PRINT_WIDTH_MM} from '../src/utils/terrainDrawingViewport.js'
import {loadTerrainDrawingContext} from '../src/services/terrainDrawingContext.js'
import {TERRAIN_SLOPE_COLORS} from '../src/utils/terrainSlopeDistribution.js'
import {TERRAIN_LAYOUT_SAVE,TERRAIN_LAYOUT_LIMIT} from '../src/utils/terrainLayoutReport.js'

const grid=(width=100,height=120)=>({origin:{lat:35,lon:135},boundary:[[[[0,0],[width,0],[width,height],[0,height],[0,0]]]]})
const close=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`)
let server,Pair,Control,Guide
before(async()=>{
 server=await createServer({configFile:false,root:process.cwd(),plugins:[react()],server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',logLevel:'error',optimizeDeps:{disabled:true}})
 Pair=(await server.ssrLoadModule('/src/components/TerrainDrawingPair.jsx')).default
 Control=(await server.ssrLoadModule('/src/components/TerrainDrawingScaleControl.jsx')).default
 Guide=(await server.ssrLoadModule('/src/components/UseCasesGuide.jsx')).default
})
after(async()=>{await server?.close()})

test('fixed print scale maps real local metres to exact paper millimetres in BOTH axes and views',()=>{
 for(const d of [1000,2000,5000,10000]){
  const views=terrainDrawingPrintViewports(grid(),d)
  for(const v of views){
   const p=v.project([0,0]),east=v.project([50,0]),north=v.project([0,50]),bar=terrainDrawingPrintScaleBar(v,d)
   close((east[0]-p[0])*TERRAIN_DRAWING_PRINT_WIDTH_MM/800,50000/d)
   close((p[1]-north[1])*TERRAIN_DRAWING_PRINT_WIDTH_MM/800,50000/d)
   close(bar.meters,50);close(bar.pixelLength*TERRAIN_DRAWING_PRINT_WIDTH_MM/800,50000/d)
  }
  assert.deepEqual(views[0].project([31,47]),views[1].project([31,47]))
 }
})
test('large sites fail at the selected scale without clipping or silently changing the scale',()=>{
 assert.equal(terrainDrawingPrintFit(grid(160,140),1000).fits,true)
 assert.equal(terrainDrawingPrintFit(grid(161,140),1000).fits,false)
 assert.throws(()=>terrainDrawingPrintViewports(grid(200,150),1000),/1:2000.*自動縮小・切り取りは行いません/)
 assert.equal(terrainDrawingPrintFit(grid(200,150),2000).fits,true)
 assert.equal(terrainDrawingPrintFit(grid(1000,1000),5000).fits,false)
 assert.equal(terrainDrawingPrintFit(grid(1000,1000),10000).fits,true)
 close(terrainDrawingPrintFit(grid(),1000).availableWidthM,180.675)
 close(terrainDrawingPrintFit(grid(),1000).availableHeightM,163.35)
 assert.throws(()=>normalizeTerrainDrawingScale('1000'),/縮尺/)
 assert.throws(()=>normalizeTerrainDrawingScale(1234),/縮尺/)
})
test('explicit auto mode preserves the old left fit and right 1.25 extent',()=>{
 const g=grid(500,600),[l,r]=terrainDrawingPrintViewports(g,'auto'),old=terrainDrawingViewport(g)
 close(l.scale,old.scale);close(l.scale/r.scale,1.25)
 const lb=terrainDrawingPrintScaleBar(l,'auto',l),rb=terrainDrawingPrintScaleBar(r,'auto',l)
 close(lb.pixelLength,rb.pixelLength);close(rb.meters/lb.meters,1.25)
})

// Independent WGS84 inverse Vincenty distance, so latitude validation does not
// reuse the projection or mistake Mercator map pixels for ground metres.
function distance([lon1,lat1],[lon2,lat2]){
 const rad=Math.PI/180,a=6378137,f=1/298.257223563,b=(1-f)*a,L=(lon2-lon1)*rad,U1=Math.atan((1-f)*Math.tan(lat1*rad)),U2=Math.atan((1-f)*Math.tan(lat2*rad))
 let lambda=L,ss,cs,sigma,sa,c2a,c2sm
 for(let i=0;i<100;i++){
  const sl=Math.sin(lambda),cl=Math.cos(lambda)
  ss=Math.hypot(Math.cos(U2)*sl,Math.cos(U1)*Math.sin(U2)-Math.sin(U1)*Math.cos(U2)*cl)
  if(!ss)return 0
  cs=Math.sin(U1)*Math.sin(U2)+Math.cos(U1)*Math.cos(U2)*cl;sigma=Math.atan2(ss,cs)
  sa=Math.cos(U1)*Math.cos(U2)*sl/ss;c2a=1-sa*sa;c2sm=c2a?cs-2*Math.sin(U1)*Math.sin(U2)/c2a:0
  const C=f/16*c2a*(4+f*(4-3*c2a)),previous=lambda
  lambda=L+(1-C)*f*sa*(sigma+C*ss*(c2sm+C*cs*(-1+2*c2sm*c2sm)))
  if(Math.abs(lambda-previous)<1e-14)break
  if(i===99)throw Error('Vincenty did not converge')
 }
 const u2=c2a*(a*a-b*b)/(b*b),A=1+u2/16384*(4096+u2*(-768+u2*(320-175*u2))),B=u2/1024*(256+u2*(-128+u2*(74-47*u2)))
 const delta=B*ss*(c2sm+B/4*(cs*(-1+2*c2sm*c2sm)-B/6*c2sm*(-3+4*ss*ss)*(-3+4*c2sm*c2sm)))
 return b*A*(sigma-delta)
}
test('50 local metres correspond to 50 WGS84 ground metres at Japanese latitudes',()=>{
 for(const lat of [25,35,45]){
  const p=proj4('EPSG:4326',`+proj=aeqd +lat_0=${lat} +lon_0=135 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs`)
  for(const end of [[50,0],[0,50],[30,40]])close(distance(p.inverse([0,0]),p.inverse(end)),50,.001)
 }
})
test('SSR drawing uses the same 50m bar and extent in both views; overflow emits no cropped SVG',()=>{
 const a={grid:{...grid(),width:3,height:3,step:5,xMin:0,yMin:0,slopes:Array(9).fill(0),elevations:Array(9).fill(100)},geometryKey:'synthetic',contours:[]},props={analysis:a,layout:{rackCount:0,racks:[]},parcels:[],drawingScale:1000}
 const html=renderToStaticMarkup(React.createElement(Pair,props)),svgs=[...html.matchAll(/<svg[\s\S]*?<\/svg>/g)].map(m=>m[0])
 assert.equal(svgs.length,2)
 for(const svg of svgs){assert.match(svg,/data-scale-m="50"/);assert.match(svg,/data-context-factor="1"/);assert.match(svg,/data-drawing-scale="1000"/);close(Number(svg.match(/data-scale-px="([\d.]+)"/)[1])*198/800,50)}
 assert.equal(svgs[0].match(/data-viewport="([^"]*)"/)[1],svgs[1].match(/data-viewport="([^"]*)"/)[1])
 const overflow=renderToStaticMarkup(React.createElement(Pair,{...props,analysis:{...a,grid:{...a.grid,...grid(250,200)}}}))
 assert.match(overflow,/data-scale-error=/);assert.doesNotMatch(overflow,/<svg/)
 const control=renderToStaticMarkup(React.createElement(Control,{value:1000,grid:grid(250,200)}))
 assert.match(control,/role="alert"/);assert.match(control,/100%/);assert.match(control,/50m = 50mm/)
})
test('context caches separate scales, keep both fixed viewports equal and request nothing for overflow',async()=>{
 const oldFetch=globalThis.fetch,oldReader=globalThis.FileReader,requests=[]
 globalThis.FileReader=class{readAsDataURL(blob){this.result=`data:${blob.type};base64,AA==`;queueMicrotask(()=>this.onload())}}
 globalThis.fetch=async url=>{requests.push(url);return new Response(new Uint8Array([0]),{headers:{'content-type':url.includes('seamlessphoto')?'image/jpeg':'image/png'}})}
 try{
  const a={grid:grid()},m1=loadTerrainDrawingContext(a,'map',{drawingScale:1000}),p1=loadTerrainDrawingContext(a,'photo',{drawingScale:1000}),[m,p]=await Promise.all([m1,p1])
  assert.equal(m.status,'ready');assert.deepEqual(m.viewport,p.viewport);assert.equal(loadTerrainDrawingContext(a,'map',{drawingScale:1000}),m1)
  const m2=loadTerrainDrawingContext(a,'map',{drawingScale:2000});assert.notEqual(m1,m2);assert.equal((await m2).status,'ready')
  const count=requests.length,bad=await loadTerrainDrawingContext({grid:grid(250,200)},'photo',{drawingScale:1000})
  assert.equal(bad.status,'unavailable');assert.equal(requests.length,count)
 }finally{globalThis.fetch=oldFetch;if(oldReader===undefined)delete globalThis.FileReader;else globalThis.FileReader=oldReader}
})
test('fixed views share colour paths and halve slope reads while auto keeps independent projections',t=>{
 let reads=0
 const slopes=Array(81).fill(0),g={...grid(20,20),width:9,height:9,step:5,xMin:-10,yMin:-10,elevations:Array(81).fill(100)}
 Object.defineProperty(g,'slopes',{get(){reads++;return slopes}})
 const analysis={grid:g,geometryKey:'synthetic-colour-reuse',contours:[]},render=drawingScale=>renderToStaticMarkup(React.createElement(Pair,{analysis,layout:{rackCount:0,racks:[]},parcels:[],drawingScale}))
 render(1000) // Prime only the existing DEM-arrow cache, independent of view.
 reads=0;const fixed=render(1000),fixedReads=reads
 reads=0;render('auto');const independentReads=reads
 assert.ok(fixedReads>0);assert.equal(independentReads,fixedReads*2)
 const svgs=[...fixed.matchAll(/<svg[\s\S]*?<\/svg>/g)].map(m=>m[0])
 for(const colour of TERRAIN_SLOPE_COLORS){const pattern=new RegExp(`<path d="([^"]*)" fill="${colour}"`);assert.equal(svgs[0].match(pattern)[1],svgs[1].match(pattern)[1])}
 t.diagnostic(`slope array reads: independent=${independentReads}, shared=${fixedReads} (50% reduction)`)
})
test('short help keeps print settings, DEM/boundary limits and applied-data saving conditions',()=>{
 const html=renderToStaticMarkup(React.createElement(Guide))
 assert.match(html,/最近の更新/);assert.match(html,/50m＝50mm/);assert.match(html,/A3横100%/);assert.match(html,/参考境界・DEM/);assert.match(html,/排水計画は未確認/)
 for(const word of ['適用済み','ON時のみ','未適用','JSON','再計算'])assert.ok(TERRAIN_LAYOUT_SAVE.includes(word))
 assert.match(TERRAIN_LAYOUT_LIMIT,/施工可否は未確認/);assert.match(TERRAIN_LAYOUT_LIMIT,/機器選定値ではありません/)
})
