import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {terrainReviewSynthetic} from '../fixtures/terrainReviewSynthetic.mjs'
import {createEmptyParcelReview,setReviewParcel,measureParcelReview} from '../../src/utils/parcelReview.js'
import {terrainGeometryKey} from '../../src/utils/terrainArea.js'
let dom,server,React,createRoot,Panel,root,state,request,runner,fixture,review,result
const bridge=(...args)=>runner(...args)
before(async()=>{
 dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;dom.window.HTMLElement.prototype.scrollIntoView=()=>{}
 React=await import('react');({createRoot}=await import('react-dom/client'));server=await createServer({configFile:false,root:process.cwd(),plugins:[react()],server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',logLevel:'error',optimizeDeps:{disabled:true}});Panel=(await server.ssrLoadModule('/src/components/SelectedParcel3D.jsx')).default
},{timeout:30000})
after(async()=>{await server?.close();dom?.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT})
async function setup(){
 fixture=terrainReviewSynthetic();review=setReviewParcel(createEmptyParcelReview(),{type:'Feature',id:'public-synthetic',properties:{地番:'合成'},geometry:fixture.parcelReview.boundary},'target',{fileName:'公開原本合成試験',importedAt:'2026-10-13T00:00:00.000Z'})
 const geometry=measureParcelReview(review).geometry;result={...fixture.terrainArea,geometry,geometryKey:terrainGeometryKey(geometry)};runner=async()=>result
 function Harness(){const [value,setValue]=React.useState(0);request=setValue;state=value;return React.createElement(Panel,{review,request:value,analyze:bridge})}
 root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(Harness)));await React.act(async()=>request(1))
 assert.equal(document.querySelector('[data-selected-parcel-geometry-key]').getAttribute('data-selected-parcel-geometry-key'),result.geometryKey)
}
async function clean(){await React.act(async()=>root.unmount())}
test('completion request automatically analyzes the unchanged complete selected geometry',async()=>{await setup();assert.equal(state,1);assert.ok(document.querySelector('[data-selected-parcel-geometry-key] svg'));await clean()})
test('cancel aborts work and ignores late response while retaining applied 3D',async()=>{
 await setup();let resolve,signal;runner=(_g,o)=>{signal=o.signal;return new Promise(r=>resolve=r)};await React.act(async()=>request(2));const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='筆の3D取得を中止');assert.ok(button);await React.act(async()=>button.click());assert.equal(signal.aborted,true);await React.act(async()=>resolve({...result,geometryKey:'stale'}));assert.equal(document.querySelector('[data-selected-parcel-geometry-key]').getAttribute('data-selected-parcel-geometry-key'),result.geometryKey);await clean()
})
test('fetch failure and mismatched response geometry both preserve previous same-parcel 3D',async()=>{
 await setup();runner=async()=>{throw Error('合成通信失敗')};await React.act(async()=>request(2));assert.match(document.querySelector('[role="alert"]').textContent,/通信失敗/);assert.ok(document.querySelector('[data-selected-parcel-geometry-key] svg'))
 runner=async()=>({...result,geometryKey:'wrong'});await React.act(async()=>request(3));assert.match(document.querySelector('[role="alert"]').textContent,/一致しません/);assert.equal(document.querySelector('[data-selected-parcel-geometry-key]').getAttribute('data-selected-parcel-geometry-key'),result.geometryKey);await clean()
})
