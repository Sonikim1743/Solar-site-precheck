import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {terrainReviewSynthetic} from '../fixtures/terrainReviewSynthetic.mjs'
import {buildTerrainLayout} from '../../src/utils/terrainLayout.js'
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
 await click('最適配置を比較');await React.act(async()=>workers.at(-1).onerror({message:'synthetic'}))
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
 assert.equal(document.querySelectorAll('.terrain-area-figure svg').length,6)
 const drawing=document.querySelector('.terrain-layout-report')
 assert.equal(drawing.querySelectorAll('button,input,select,canvas').length,0)
 assert.ok(drawing.textContent.includes('71 / 1 架台'))
 assert.ok(drawing.textContent.includes('2,236 枚'))
 assert.ok(drawing.textContent.includes('1,609.92 kW'))
 assert.ok(document.querySelector('.terrain-report-footnotes').textContent.includes('パネル傾斜 10°'))
 assert.ok(!drawing.textContent.includes('55°'))
 assert.equal(Number(drawing.querySelectorAll('svg')[1].getAttribute('data-layout-modules')),2236)
 assert.equal(document.querySelector('.terrain-drawing-export-source').querySelectorAll('.terrain-area-layout-plan path').length,2236)
 assert.ok(document.querySelector('.terrain-drawing-export-source g[stroke-dasharray="5 3"] path'))
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
 assert.equal(sheets[1].querySelectorAll('[data-layout-modules="2236"]').length,1)
 assert.ok(!sheets[1].textContent.includes('原資料'))
 assert.ok(!sheets[2].textContent.includes('DC÷1.5'))
 assert.ok(sheets[3].textContent.includes('原資料'))
 assert.ok(sheets[3].textContent.includes('DC÷1.5'))
 assert.ok(sheets[3].textContent.includes('パネル傾斜 10°'))
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
