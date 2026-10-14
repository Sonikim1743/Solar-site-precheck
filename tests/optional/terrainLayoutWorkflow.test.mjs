import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {terrainReviewSynthetic} from '../fixtures/terrainReviewSynthetic.mjs'
import {buildTerrainLayout,buildSouthTerrainLayout} from '../../src/utils/terrainLayout.js'
import {buildTerrainSlopeComparison,terrainLayoutAnalysisKey} from '../../src/utils/terrainLayoutComparison.js'
import {terrainReportTitle} from '../../src/utils/terrainReportTitle.js'
import {terrainReportLayouts} from '../../src/utils/terrainLayoutReport.js'
let dom,server,React,createRoot,Component,root,state,analysis,workers=[]
class WorkerStub {constructor(){workers.push(this)}postMessage(message){this.message=message}terminate(){this.terminated=true}}
before(async()=>{
 dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'})
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.Worker=WorkerStub
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 React=await import('react');({createRoot}=await import('react-dom/client'))
 server=await createServer({configFile:false,root:process.cwd(),plugins:[react()],server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',logLevel:'error',optimizeDeps:{disabled:true}})
 Component=(await server.ssrLoadModule('/src/components/TerrainLayoutPreview.jsx')).default
},{timeout:30000})
after(async()=>{await server?.close();dom?.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.Worker;delete globalThis.IS_REACT_ACT_ENVIRONMENT})
async function setup(){
 workers=[];analysis=terrainReviewSynthetic().terrainArea
 const pool={...buildTerrainLayout(analysis,{slopeLimitDeg:20}),analysisKey:terrainLayoutAnalysisKey(analysis),analysisReference:analysis}
 const initial={options:pool.options,layout:pool,disabledRackIds:[pool.racks[0].id],enabled:true,fence:true}
 function Harness(){const [preview,setPreview]=React.useState(initial);state=preview;return React.createElement(Component,{analysis,preview,onChange:setPreview})}
 root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(Harness)));return initial
}
async function click(label){const button=[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);assert.ok(button,label);await React.act(async()=>button.click())}
async function selectSlope(value){const select=document.querySelector('select[aria-label="参考配置の勾配条件"]');await React.act(async()=>{select.value=String(value);select.dispatchEvent(new window.Event('change',{bubbles:true}))})}
async function clean(){await React.act(async()=>root.unmount())}

async function selectBearing(value){const select=[...document.querySelectorAll('label')].find(x=>x.textContent.startsWith('モジュール正面の方位')).querySelector('select');await React.act(async()=>{select.value=String(value);select.dispatchEvent(new window.Event('change',{bubbles:true}))})}

test('180→90→180 drafts, calculation and late replies preserve exact applied bearings',async()=>{
 await setup();await click('▸ 配置条件');let stale
 for(const bearing of [180,90,180]){
  await selectBearing(bearing);await click('この条件で再計算');const worker=workers.at(-1)
  assert.equal(worker.message.options.azimuthDeg,bearing);assert.equal(worker.message.optimized,false)
  if(stale)await React.act(async()=>stale.onmessage({data:{result:buildTerrainLayout(analysis,stale.message.options)}}))
  await React.act(async()=>worker.onmessage({data:{result:buildTerrainLayout(analysis,worker.message.options)}}))
  assert.equal(state.options.azimuthDeg,bearing);assert.equal(state.appliedOptions.azimuthDeg,bearing);assert.equal(state.layout.options.azimuthDeg,bearing);stale=worker
 }
 const applied=state.layout;await selectBearing(90);await click('この条件で再計算');await click('中止');assert.equal(state.layout,applied);assert.equal(state.layout.options.azimuthDeg,180)
 await clean()
})

test('explicit optimized fractional angle is selectable and synchronized; wrong manual worker bearing is rejected',async()=>{
 await setup();await click('方位も最適化して適用（±30°）');const worker=workers.at(-1),o=worker.message.options
 const result=buildTerrainLayout(analysis,{...o,azimuthDeg:172.5});result.stats.autoSearch={mode:'optimized',baseAzimuthDeg:o.azimuthDeg,selectedAzimuthDeg:172.5}
 await React.act(async()=>worker.onmessage({data:{result}}))
 assert.equal(state.options.azimuthDeg,172.5);assert.equal(state.appliedOptions.azimuthDeg,172.5);assert.equal(state.layout.options.azimuthDeg,172.5)
 await click('▸ 配置条件');const select=[...document.querySelectorAll('label')].find(x=>x.textContent.startsWith('モジュール正面の方位')).querySelector('select');assert.equal(select.value,'172.5')
 const applied=state.layout;await selectBearing(180);await click('この条件で再計算');await React.act(async()=>workers.at(-1).onmessage({data:{result}}));assert.equal(state.layout,applied);assert.ok(document.querySelector('[role="alert"]'))
 await clean()
})

test('bearing-only draft edits block old slope and south comparison application',async()=>{
 await setup();await click('地形勾配15° / 20°を比較');let worker=workers.at(-1)
 await React.act(async()=>worker.onmessage({data:{comparison:buildTerrainSlopeComparison(analysis,worker.message.options)}}))
 await click('▸ 配置条件');await selectBearing(90)
 assert.ok([...document.querySelectorAll('button')].filter(b=>b.textContent==='この案を見る').every(b=>b.disabled))
 await click('真南固定・最大配置を比較');worker=workers.at(-1);const south=buildSouthTerrainLayout(analysis,worker.message.options)
 await React.act(async()=>worker.onmessage({data:{result:south}}))
 const apply=[...document.querySelectorAll('button')].find(b=>b.textContent==='真南固定案を適用');assert.equal(apply.disabled,false)
 await selectBearing(180);assert.equal(apply.disabled,true)
 await clean()
})

test('single-character spacing draft preserves the applied rack pool, exclusions, quantities and report snapshot',async()=>{
 const prior=await setup();await click('▸ 配置条件')
 const input=[...document.querySelectorAll('label')].find(x=>x.textContent.startsWith('架台左右')).querySelector('input')
 await React.act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'2');input.dispatchEvent(new window.Event('input',{bubbles:true}))})
 assert.equal(state.options.rackGapM,2);assert.equal(state.layout,prior.layout);assert.deepEqual(state.disabledRackIds,prior.disabledRackIds)
 assert.ok(Math.abs(terrainReportLayouts(analysis,state).current.dcKw-(prior.layout.moduleCount-prior.layout.racks[0].moduleCount)*.72)<1e-8)
 await clean()
})

test('slope change then cancel, late success, startup failure and worker error all preserve the completed result',async()=>{
 const prior=await setup();await selectSlope(15);assert.equal(state.calculating,true);const cancelled=workers.at(-1)
 await click('中止');assert.equal(state.layout,prior.layout);assert.deepEqual(state.disabledRackIds,prior.disabledRackIds)
 await React.act(async()=>cancelled.onmessage({data:{result:buildTerrainLayout(analysis,cancelled.message.options)}}))
 assert.equal(state.layout,prior.layout)
 await click('方位も最適化して適用（±30°）');await React.act(async()=>workers.at(-1).onerror({message:'synthetic'}))
 assert.equal(state.layout,prior.layout);assert.deepEqual(state.disabledRackIds,prior.disabledRackIds);assert.equal(state.fence,true)
 globalThis.Worker=class {constructor(){throw Error('synthetic startup')}};await click('再試行');assert.equal(state.layout,prior.layout);assert.equal(state.calculating,false);globalThis.Worker=WorkerStub
 await clean()
})

test('comparison is atomic, changes only the terrain cutoff, and switching a candidate resets only its exclusions',async()=>{
 const prior=await setup();await click('地形勾配15° / 20°を比較');const worker=workers.at(-1),comparison=buildTerrainSlopeComparison(analysis,worker.message.options)
 const [a,b]=comparison.layouts
 assert.notEqual(a.rackCount,b.rackCount)
 assert.deepEqual({...a.options,slopeLimitDeg:20},b.options)
 assert.equal(a.dcKw,a.moduleCount*.72);assert.equal(b.dcKw,b.moduleCount*.72)
 await React.act(async()=>worker.onmessage({data:{comparison}}))
 assert.equal(state.layout,prior.layout);assert.deepEqual(state.disabledRackIds,prior.disabledRackIds)
 const buttons=[...document.querySelectorAll('button')].filter(x=>x.textContent==='この案を見る');await React.act(async()=>buttons[1].click())
 assert.equal(state.layout.rackCount,b.rackCount);assert.deepEqual(state.disabledRackIds,[]);assert.equal(terrainReportLayouts(analysis,state).totalPages,4)
 assert.equal(terrainReportLayouts({...analysis},state).totalPages,3)
 await clean()
})

test('report uses applied geometry and excluded quantities, emits four sheets, and excludes interactive UI',async()=>{
 const report=terrainReviewSynthetic();analysis=report.terrainArea
 const pool={...buildTerrainLayout(analysis,{slopeLimitDeg:20}),analysisKey:terrainLayoutAnalysisKey(analysis),analysisReference:analysis}
 report.terrainPreview={options:{...pool.options,tiltDeg:55,rackGapM:9},layout:pool,disabledRackIds:[pool.racks[0].id],comparison:{...buildTerrainSlopeComparison(analysis,pool.options),analysisReference:analysis,analysisKey:terrainLayoutAnalysisKey(analysis)}}
 const Report=(await server.ssrLoadModule('/src/components/TerrainAreaReport.jsx')).default
 const {renderToStaticMarkup}=await import('react-dom/server')
 const html=renderToStaticMarkup(React.createElement(Report,{report})),document=new JSDOM(html).window.document
 assert.equal(document.querySelectorAll('.terrain-report-sheet').length,4)
 assert.equal(document.querySelectorAll('.terrain-area-figure svg').length,5)
 const drawing=document.querySelector('.terrain-layout-report')
 assert.equal(drawing.querySelectorAll('button,input,select,canvas').length,0)
 const activeModules=pool.moduleCount-pool.racks[0].moduleCount
 assert.ok(drawing.textContent.includes(`${pool.rackCount-1} / 1 架台`))
 assert.ok(drawing.textContent.includes(`${activeModules.toLocaleString('ja-JP')} 枚`))
 assert.ok(drawing.textContent.includes(`${(activeModules*.72).toLocaleString('ja-JP',{maximumFractionDigits:2})} kW`))
 assert.ok(document.querySelector('.terrain-report-footnotes').textContent.includes(`パネル傾斜 ${pool.options.tiltDeg}°`))
 assert.ok(!drawing.textContent.includes('55°'))
 assert.equal(Number(drawing.querySelectorAll('svg')[1].getAttribute('data-layout-modules')),activeModules)
 assert.equal(document.querySelector('.terrain-drawing-export-source').querySelectorAll('[data-layout-racks] path').length,activeModules)
 assert.ok(document.querySelector('.terrain-drawing-export-source path[stroke-dasharray="5 3"]'))
})


test('report consolidates the terrain/configuration evidence in final notes and keeps before/after views together',async()=>{
 const report=terrainReviewSynthetic(),analysis=report.terrainArea,pool={...buildTerrainLayout(analysis,{slopeLimitDeg:20}),analysisKey:terrainLayoutAnalysisKey(analysis),analysisReference:analysis}
 report.terrainPreview={layout:pool,fence:true,disabledRackIds:[pool.racks[0].id],comparison:{...buildTerrainSlopeComparison(analysis,pool.options),analysisReference:analysis,analysisKey:terrainLayoutAnalysisKey(analysis)}}
 const Report=(await server.ssrLoadModule('/src/components/TerrainAreaReport.jsx')).default
 const {renderToStaticMarkup}=await import('react-dom/server')
 const html=renderToStaticMarkup(React.createElement(Report,{report})),doc=new JSDOM(html).window.document,sheets=[...doc.querySelectorAll('.terrain-report-sheet')]
 assert.equal(sheets.length,4)
 assert.ok(sheets[1].textContent.includes('実DEM地形 · 配置前'))
 assert.ok(sheets[1].textContent.includes('参考配置3D · 適用済み'))
 assert.equal(sheets[1].querySelectorAll('svg').length,2)
 assert.equal(sheets[1].querySelectorAll(`[data-layout-modules="${pool.moduleCount-pool.racks[0].moduleCount}"]`).length,1)
 assert.ok(!sheets[1].textContent.includes('原資料'))
 assert.ok(!sheets[2].textContent.includes('DC÷1.5'))
 assert.ok(sheets[3].textContent.includes('原資料'))
 assert.ok(sheets[3].textContent.includes('DC÷1.5'))
 assert.ok(sheets[3].textContent.includes(`パネル傾斜 ${pool.options.tiltDeg}°`))
 assert.ok(sheets[3].textContent.includes('仮フェンス'))
 assert.ok(doc.querySelector('.terrain-drawing-export-source [data-terrain-fence]'))
 const projected=terrainReportLayouts(analysis,report.terrainPreview)
 const noFence=terrainReportLayouts(analysis,{...report.terrainPreview,fence:false})
 assert.equal(noFence.fence,null)
 assert.ok(projected.fence.rails.length>0)
 assert.equal(projected.current.dcKw,noFence.current.dcKw)
 assert.equal(terrainReportLayouts(analysis,{...report.terrainPreview,disabledRackIds:pool.racks.map(r=>r.id)}).fence,null)
})

test('report names prefer trimmed explicit names, then the current place, with neutral coordinate fallback',()=>{
 assert.equal(terrainReportTitle({siteName:'  合成発電所  ',placeLabel:'合成地名'}),'合成発電所')
 assert.equal(terrainReportTitle({siteName:' \t ',placeLabel:'  合成地名  '}),'合成地名')
 assert.equal(terrainReportTitle({siteName:'',placeLabel:'',position:{lat:35,lon:135}}),'候補地 · N35.000000 / E135.000000')
 assert.equal(terrainReportTitle({}),'候補地')
 assert.equal(terrainReportTitle({siteName:'合成'.repeat(100)}),'合成'.repeat(100))
})
