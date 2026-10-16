import React from 'react'
import {selectedTerrainLayout} from '../../src/utils/terrainLayoutSelection.js'
import { createRoot } from 'react-dom/client'
import {terrainReviewSynthetic} from '../../tests/fixtures/terrainReviewSynthetic.mjs'
import {measureParcelReview} from '../../src/utils/parcelReview.js'
import {normalizeTerrainArea,createTerrainPlan,terrainAreaSnapshot} from '../../src/utils/terrainArea.js'
import '../../src/styles.css'
import 'leaflet/dist/leaflet.css'
const f=terrainReviewSynthetic();f.parcelReview.boundary.coordinates=f.parcelReview.boundary.coordinates.map(r=>r.map(([x,y])=>[135+(x-135)/2,35+(y-35)/2]))
const plan=createTerrainPlan(measureParcelReview(f.parcelReview).geometry),area=normalizeTerrainArea({...f.terrainArea,geometry:plan.geometry,geometryKey:plan.geometryKey,source:{urls:f.terrainArea.source.urls},grid:{...plan.grid,elevations:Array(plan.grid.width*plan.grid.height).fill(100),sourceIds:Array(plan.grid.width*plan.grid.height).fill('dem5b_png')}})
localStorage.setItem('solar-site-precheck-draft-v1',JSON.stringify({parcelReview:f.parcelReview,terrainArea:terrainAreaSnapshot(area),position:{lat:35.000325,lon:135.000325},siteName:'合成・App経路検証',siteNameTouched:true,elevation:{value:100,status:'success',source:'合成'}}))
globalThis.__qaAreaCurrent=area;globalThis.__qaNextArea=null;globalThis.__qaAcquireArea=async()=>globalThis.__qaAreaCurrent=globalThis.__qaNextArea||globalThis.__qaAreaCurrent;
globalThis.__qaPrepareArea=()=>globalThis.__qaNextArea=normalizeTerrainArea({...area,fetchedAt:new Date().toISOString(),grid:{...area.grid,elevations:area.grid.elevations.map(v=>v===null?null:100.4)}});
globalThis.__qaExternalDeps={fetchElevation:async()=>({value:100,dataSource:'合成'}),section:async()=>({lines:[]}),horizon:async()=>({samples:[]}),snow:async id=>({id,mode:'nedo-web',verified:true,validationVersion:2,snow10cm:{annual:10,winter:10,monthly:Array(12).fill(10)},source:{statisticalPeriod:'合成'}}),area:async()=>globalThis.__qaAreaCurrent}
globalThis.__selectedLayout=selectedTerrainLayout;globalThis.__workerRequests=[];globalThis.__pendingWorker=[];globalThis.__holdWorkers=false;
const NativeWorker=globalThis.Worker;globalThis.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{if(globalThis.__holdWorkers&&event.data?.result){event.stopImmediatePropagation();__pendingWorker.push({worker:this,data:event.data})}})}postMessage(data,...args){__workerRequests.push({options:data.options,optimized:data.optimized,fixedSouth:data.fixedSouth});return super.postMessage(data,...args)}};
globalThis.__pdfExports=[];globalThis.__drawn=[]
const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,...args){__drawn.push(String(t));return fill.call(this,t,...args)}
const App=(await import('../../src/App.jsx')).default
createRoot(document.getElementById('root')).render(<App/>);
