import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {terrainReviewSynthetic} from '../fixtures/terrainReviewSynthetic.mjs'
import {normalizeTerrainArea} from '../../src/utils/terrainArea.js'
import {buildTerrainLayout} from '../../src/utils/terrainLayout.js'
import {simpleReviewDefaults} from '../../src/services/simpleReview.js'
import {setReviewParcel,createEmptyParcelReview,measureParcelReview} from '../../src/utils/parcelReview.js'
import {featureInteriorPoint} from '../../src/services/parcelGeometry.js'
let dom,server,React,createRoot,Panel,root,state,changeReview,runner,exporter,snapshot,fixture
const runBridge=(...args)=>runner(...args),exportBridge=(...args)=>exporter(...args)
before(async()=>{
 dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 React=await import('react');({createRoot}=await import('react-dom/client'))
 server=await createServer({configFile:false,root:process.cwd(),plugins:[react()],server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',logLevel:'error',optimizeDeps:{disabled:true}})
 Panel=(await server.ssrLoadModule('/src/components/SimpleReviewPanel.jsx')).default
},{timeout:30000})
after(async()=>{await server?.close();dom?.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT})
async function setup(){
 fixture=terrainReviewSynthetic();const area=normalizeTerrainArea({...fixture.terrainArea,grid:{...fixture.terrainArea.grid,elevations:fixture.terrainArea.grid.elevations.map(()=>100)}}),defaults=simpleReviewDefaults()
 snapshot={position:featureInteriorPoint({geometry:area.geometry}),defaults,results:{area,layout:buildTerrainLayout(area,defaults.layout),elevation:{value:100,dataSource:'合成'},section:null,horizon:null,snow:null},steps:[],status:'complete',review:fixture.parcelReview,areaM2:area.summary.polygonAreaM2,acquiredAt:'2026-10-13T00:00:00.000Z'}
 runner=async()=>snapshot;exporter=async({drawingOnly})=>({blob:new Blob(['test']),fileName:drawingOnly?'drawing.pdf':'report.pdf',pageCount:drawingOnly?1:4})
 function Harness(){const [value,setValue]=React.useState({status:'idle',pending:null,result:null,error:'',progress:null});const [review,setReview]=React.useState(fixture.parcelReview);state=value;changeReview=setReview;return React.createElement(Panel,{review,siteName:'合成',appVersion:'test',state:value,onChange:setValue,run:runBridge,exporter:exportBridge})}
 root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(Harness)))
}
async function click(text){const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);await React.act(async()=>b.click())}
async function clean(){await React.act(async()=>root.unmount())}
test('completion waits for both independent PDFs and records the applied snapshot',async()=>{await setup();await click('基本値でまとめて解析');assert.equal(state.status,'complete');assert.equal(state.result.pdfs.length,2);assert.equal(state.result.snapshot.defaults.layout.rowGapM,4);assert.equal(document.querySelectorAll('.simple-batch-downloads a').length,2);await clean()})
test('cancel and late old response retain the previous applied result and download links',async()=>{
 await setup();await click('基本値でまとめて解析');const previous=state.result;let resolve;runner=()=>new Promise(r=>{resolve=r});await click('同じ範囲を再解析');await click('一括解析を中止');await React.act(async()=>resolve(snapshot));assert.equal(state.status,'cancelled');assert.equal(state.result,previous);assert.equal(document.querySelectorAll('.simple-batch-downloads a').length,2);await clean()
})
test('PDF failure keeps prior result and does not expose the partially generated new pair',async()=>{
 await setup();await click('基本値でまとめて解析');const previous=state.result;let calls=0;exporter=async()=>{if(++calls===2)throw Error('合成PDF失敗');return {blob:new Blob(['test']),fileName:'partial.pdf',pageCount:1}};await click('同じ範囲を再解析');assert.equal(state.status,'error');assert.equal(state.result,previous);assert.match(state.error,/PDFは未完成/);assert.equal(state.result.pdfs[0].fileName,'drawing.pdf');await clean()
})
test('confirmed geometry changes discard old links and block delayed completion',async()=>{
 await setup();await click('基本値でまとめて解析');let resolve;runner=()=>new Promise(r=>{resolve=r});await click('同じ範囲を再解析');const review=structuredClone(fixture.parcelReview);review.boundary.coordinates=review.boundary.coordinates.map(r=>r.map(([x,y])=>[x+.01,y]));await React.act(async()=>changeReview(review));await React.act(async()=>resolve(snapshot));assert.equal(state.result,null);assert.equal(state.pending,null);assert.equal(document.querySelectorAll('.simple-batch-downloads a').length,0);await clean()
})
test('unconfirmed 2024 reference selections cannot enable the batch action without a confirmed range',async()=>{
 await setup();await React.act(async()=>changeReview({version:1,parcels:[],boundary:null,exclusions:[]}));const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='基本値でまとめて解析');assert.equal(b.disabled,true);assert.match(document.querySelector('.simple-batch').textContent,/範囲を確定/);assert.equal(state.result,null);await clean()
})

test('verified selected parcels send the exact multipolygon union with holes to DEM, without drawn clipping or convex hull',async()=>{
 const module=await server.ssrLoadModule('/src/components/SelectedParcel3D.jsx'),s=terrainReviewSynthetic(),stamp={fileName:'synthetic-full',importedAt:'2026-10-13T00:00:00.000Z'}
 let review=setReviewParcel(createEmptyParcelReview(),{type:'Feature',id:'A',properties:{地番:'合成A'},geometry:s.parcelReview.boundary},'target',stamp)
 const geometry={type:'Polygon',coordinates:[[[135.003,35],[135.005,35],[135.005,35.001],[135.004,35.001],[135.004,35.002],[135.003,35.002],[135.003,35]]]}
 review=setReviewParcel(review,{type:'Feature',id:'B',properties:{地番:'合成B'},geometry},'target',stamp);review={...review,boundary:geometry,exclusions:[s.parcelReview.boundary]}
 const expected=measureParcelReview(module.selectedParcelUnionReview(review)).geometry;assert.equal(expected.type,'MultiPolygon');assert.equal(expected.coordinates.length,2);assert.ok(expected.coordinates.some(p=>p.length===2))
 let seen;root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(module.default,{review,analyze:async g=>{seen=g;return new Promise(()=>{})}})));await click('確認済み2筆を3Dで見る');assert.deepEqual(seen,expected);await clean()
})
