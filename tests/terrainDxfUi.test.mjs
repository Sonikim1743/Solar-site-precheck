import test, {before,after} from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {terrainDxfSynthetic} from './fixtures/terrainDxfSynthetic.mjs'
import {simpleReviewDefaults} from '../src/services/simpleReview.js'
import {terrainLayoutAnalysisKey} from '../src/utils/terrainLayoutComparison.js'
import {measureParcelReview} from '../src/utils/parcelReview.js'
import {terrainGeometryKey} from '../src/utils/terrainArea.js'
import {terrainReportLayouts} from '../src/utils/terrainLayoutReport.js'

let server, Button, Panel, Simple
before(async()=>{
  server=await createServer({configFile:false,root:process.cwd(),plugins:[react()],server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',logLevel:'error',optimizeDeps:{disabled:true}})
  Button=(await server.ssrLoadModule('/src/components/TerrainDxfButton.jsx')).default
  Panel=(await server.ssrLoadModule('/src/components/TerrainAreaPanel.jsx')).default
  Simple=(await server.ssrLoadModule('/src/components/SimpleReviewPanel.jsx')).default
},{timeout:30000})
after(async()=>{await server?.close()})
const button=html=>html.match(/<button[^>]*>DXFを保存<\/button>/)?.[0]
test('one compact DXF control is enabled only for an applied result',()=>{
  const report=terrainDxfSynthetic()
  const render=(r,blocked=false)=>renderToStaticMarkup(React.createElement(Button,{report:r,blocked}))
  assert.doesNotMatch(button(render(report)),/disabled/)
  for(const r of [undefined,{...report,terrainPreview:{...report.terrainPreview,calculating:true}},{...report,terrainPreview:{...report.terrainPreview,options:{...report.terrainPreview.options,tiltDeg:20}}}])assert.match(button(render(r)),/disabled/)
  assert.match(button(render(report,true)),/disabled/)
})
test('terrain toolbar puts DXF next to one-sheet PDF and blocks both during reacquisition',()=>{
  const report=terrainDxfSynthetic(),area=report.terrainArea
  const props={geometry:area.geometry,analysis:area,preview:report.terrainPreview,dxfReport:report,onOpenDrawing(){}}
  const html=renderToStaticMarkup(React.createElement(Panel,props))
  assert.equal((html.match(/>DXFを保存<\/button>/g)||[]).length,1)
  assert.match(html,/配置図PDF · 1枚<\/button><button[^>]*>DXFを保存<\/button>/)
  assert.doesNotMatch(button(html),/disabled/)
  const busy=renderToStaticMarkup(React.createElement(Panel,{...props,status:'calculating'}))
  assert.match(button(busy),/disabled/);assert.match(busy,/<button[^>]*disabled=""[^>]*>配置図PDF · 1枚/)
})
test('simple output uses the same PDF snapshot; running/reacquiring disables output and drafts hide it',()=>{
  const report=terrainDxfSynthetic(),preview=report.terrainPreview,area=report.terrainArea
  const settings={tiltDeg:15,direction:'manual'},defaults=simpleReviewDefaults(preview.options,settings),metrics=measureParcelReview(report.parcelReview),key=terrainGeometryKey(metrics.geometry)
  const analysisKey=JSON.stringify([key,defaults.layout,'manual',terrainLayoutAnalysisKey(area),preview.disabledRackIds,preview.activeRackCount??null,Boolean(preview.fence)])
  const requestKey=JSON.stringify([analysisKey,1000,report.siteName,report.appVersion])
  const snapshot={status:'review',results:{area,layout:terrainReportLayouts(area,preview).current},position:report.position,defaults,areaM2:metrics.usableAreaM2,steps:[],acquiredAt:area.fetchedAt}
  const state={status:'review',result:{key,analysisKey,requestKey,report,snapshot,pdfs:[{drawingOnly:true,kind:'配置図',fileName:'synthetic.pdf',url:'blob:synthetic'}]}}
  const props={review:report.parcelReview,siteName:report.siteName,appVersion:report.appVersion,terrainArea:area,state,onChange(){},drawingScale:1000,layoutOptions:preview.options,layoutSettings:settings,layoutPreview:preview}
  const html=renderToStaticMarkup(React.createElement(Simple,props))
  assert.doesNotMatch(button(html),/disabled/);assert.match(html,/href="blob:synthetic"/)
  for(const extra of [{state:{...state,status:'running'}},{outputBlocked:true},{layoutPreview:{...preview,calculating:true}}]){
    const busy=renderToStaticMarkup(React.createElement(Simple,{...props,...extra}))
    assert.match(button(busy),/disabled/);assert.doesNotMatch(busy,/href="blob:synthetic"/)
  }
  const draft=renderToStaticMarkup(React.createElement(Simple,{...props,layoutSettings:{...settings,tiltDeg:20}}))
  assert.equal(button(draft),undefined);assert.doesNotMatch(draft,/href="blob:synthetic"/)
})
