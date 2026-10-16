// Optional real-browser composition check. Uses an existing isolated Playwright/Edge runtime.
// No package/browser installation, real profile, localStorage import, or deployment.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { terrainAzimuthLabel } from '../../src/utils/terrainAzimuthLabel.js'
if (!process.env.SOLAR_PLAYWRIGHT_MODULE || !process.env.SOLAR_BROWSER_EXE) throw Error('Set SOLAR_PLAYWRIGHT_MODULE and SOLAR_BROWSER_EXE to an existing runtime')
const { chromium } = await import(pathToFileURL(process.env.SOLAR_PLAYWRIGHT_MODULE).href)
const out = path.resolve(process.env.SOLAR_VERIFICATION_DIR || 'outputs/simple-options')
const temp = path.resolve('tmp/simple-options-qa')
await fs.mkdir(out, { recursive: true }); await fs.mkdir(temp, { recursive: true })
const baseline = execFileSync('git', ['show', '3b3734d:src/components/SimpleReviewPanel.jsx'], { encoding: 'utf8' })
 .replaceAll("'../", "'../../src/").replaceAll("'./Terrain", "'../../src/components/Terrain").replace("'./HorizonGraphPreview.jsx'", "'../../src/components/HorizonGraphPreview.jsx'").replace("'./simple-review.css'", "'./before.css'")
await fs.writeFile(path.join(temp, 'Before.jsx'), baseline)
await fs.writeFile(path.join(temp, 'before.css'), execFileSync('git', ['show', '3b3734d:src/components/simple-review.css']))
await fs.writeFile(path.join(temp, 'index.html'), '<html lang="ja"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="./harness.jsx"></script></html>')
await fs.writeFile(path.join(temp, 'harness.jsx'), `
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import Panel, { initialSimpleReview } from '../../src/components/SimpleReviewPanel.jsx'
import { runSimpleReview } from '../../src/services/simpleReview.js'
import { exportTerrainAreaPdf } from '../../src/utils/terrainPdf.js'
import { terrainReviewSynthetic } from '../../tests/fixtures/terrainReviewSynthetic.mjs'
import { normalizeTerrainArea, createTerrainPlan } from '../../src/utils/terrainArea.js'
import { createEmptyParcelReview, setReviewParcel, measureParcelReview } from '../../src/utils/parcelReview.js'
import '../../src/styles.css'
const qa = window.qa = { calls:0, mode:'normal', fast:false, exports:[], drawn:[], state:null }
const f = terrainReviewSynthetic(); let area = normalizeTerrainArea({...f.terrainArea,grid:{...f.terrainArea.grid,elevations:f.terrainArea.grid.elevations.map(()=>100)}})
f.parcelReview.boundary.coordinates=f.parcelReview.boundary.coordinates.map(r=>r.map(([x,y])=>[135+(x-135)/2,35+(y-35)/2]))
const square=(x0,x1)=>[[x0,35],[x1,35],[x1,35.00065],[x0,35.00065],[x0,35]]
let parcels=createEmptyParcelReview()
for(const [id,geometry] of [['A',{type:'Polygon',coordinates:[square(135,135.000325),f.parcelReview.boundary.coordinates[1]]}],['B',{type:'Polygon',coordinates:[square(135.000325,135.00065)]}]])parcels=setReviewParcel(parcels,{id,type:'Feature',properties:{地番:'合成'+id},geometry},'target',{fileName:'synthetic',importedAt:new Date().toISOString()})
// The two parcels exactly partition the synthetic holed range.
f.parcelReview={...parcels,boundary:f.parcelReview.boundary}
const plan=createTerrainPlan(measureParcelReview(f.parcelReview).geometry)
area=normalizeTerrainArea({...f.terrainArea,source:{urls:f.terrainArea.source.urls},geometry:plan.geometry,geometryKey:plan.geometryKey,grid:{...plan.grid,elevations:Array(plan.grid.width*plan.grid.height).fill(100),sourceIds:Array(plan.grid.width*plan.grid.height).fill('dem5b_png')}})
const deps={fetchElevation:async()=>({value:100,dataSource:'合成DEM（実測ではありません）'}),section:async()=>({lines:['東西','南北'].map(label=>({label,points:[{distance:-100,elevation:100},{distance:100,elevation:100}],summary:{minElevation:100,maxElevation:100}}))}),horizon:async()=>({samples:Array.from({length:8},(_,i)=>({direction:String(i),angle:1,missingCount:0}))}),snow:async id=>({id,mode:'nedo-web',verified:true,validationVersion:2,snow10cm:{annual:10,winter:10,monthly:Array(12).fill(10)},source:{statisticalPeriod:'合成'}}),area:async()=>area}
const run=async(review,options)=>{qa.calls++;if(qa.mode==='late'){await new Promise(resolve=>qa.resolveRun=resolve);return qa.lastSnapshot}if(qa.mode==='error')throw Error('合成通信失敗');const result=await runSimpleReview(review,{...options,dependencies:deps});qa.lastSnapshot=result;if(!result.results.layout)console.error(JSON.stringify(result.steps));if(qa.mode==='zero')result.results.layout={...result.results.layout,racks:[],rackCount:0,moduleCount:0,dcKw:0};return result}
const fill=CanvasRenderingContext2D.prototype.fillText
CanvasRenderingContext2D.prototype.fillText=function(t,...rest){qa.drawn.push(String(t));return fill.call(this,t,...rest)}
const exporter=async options=>{qa.exportCalls=(qa.exportCalls||0)+1;if(qa.mode==='pdf-late')await new Promise(resolve=>qa.resolvePdf=resolve);if(qa.mode==='pdf-error'&&!options.drawingOnly)throw Error('合成PDF失敗');const start=qa.drawn.length;const pdf=qa.fast?{blob:new Blob(['%PDF-test'],{type:'application/pdf'}),fileName:options.drawingOnly?'drawing.pdf':'report.pdf',pageCount:options.drawingOnly?1:4}:await exportTerrainAreaPdf(options);qa.exports.push({drawingOnly:options.drawingOnly,layout:options.report.simpleReview.results.layout,selected:options.report.simpleReview.defaults.layoutSettings,drawingScale:options.drawingScale,text:qa.drawn.slice(start),blob:pdf.blob});return pdf}
const Before = new URLSearchParams(location.search).has('before') ? (await import('./Before.jsx')).default : null
function Harness(){const [state,change]=useState(initialSimpleReview),[scale,setScale]=useState(1000),[review,setReview]=useState(f.parcelReview),[layout,setLayout]=useState({}),[visible,setVisible]=useState(true);qa.state=state;qa.setReview=setReview;qa.originalReview=f.parcelReview;qa.setLayout=setLayout;qa.layout=layout;qa.setVisible=setVisible;qa.setScale=setScale;const Component=Before||Panel;return <main style={{maxWidth:1000,margin:'24px auto',padding:'0 16px'}}><Component review={review} terrainArea={area} siteName="合成テスト（実候補地ではありません）" appVersion="QA" state={state} onChange={change} run={run} exporter={exporter} layoutOptions={layout} drawingScale={scale} onDrawingScaleChange={setScale} onDraw={()=>{}} visible={visible}/></main>}
createRoot(document.getElementById('root')).render(<Harness/>);
`)
let server, browser
const checks = [], combinations = [], errors = []
try {
 server = await createServer({ configFile:false, root:process.cwd(), plugins:[react()], server:{host:'127.0.0.1',port:5196,strictPort:true,hmr:false,watch:null},logLevel:'error',optimizeDeps:{include:['react','react-dom/client','polygon-clipping','proj4']} })
 await server.listen()
 browser = await chromium.launch({executablePath:process.env.SOLAR_BROWSER_EXE,headless:true,chromiumSandbox:true,env:{...process.env,TEMP:path.resolve('tmp/browser-temp'),TMP:path.resolve('tmp/browser-temp')}})
 const context = await browser.newContext({viewport:{width:1280,height:960},serviceWorkers:'block',acceptDownloads:true})
 const page = await context.newPage()
 page.on('pageerror', e => {errors.push(e.message);console.log('PAGE ERROR',e.message)})
 // Synthetic tiles keep the composition test deterministic and offline.
 const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+X8A1WQAAAABJRU5ErkJggg==','base64')
 const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD50ooorU/Gj//Z','base64')
 await page.route('https://cyberjapandata.gsi.go.jp/xyz/**',route=>route.fulfill({status:200,contentType:route.request().url().endsWith('.jpg')?'image/jpeg':'image/png',headers:{'access-control-allow-origin':'*'},body:route.request().url().endsWith('.jpg')?jpeg:png}))
 const base='http://127.0.0.1:5196/tmp/simple-options-qa/'
 console.log('opening baseline');await page.goto(base+'?before=1'); await page.locator('.simple-batch').waitFor();await page.locator('.simple-batch').screenshot({path:path.join(out,'before-desktop.png')})
 await page.goto(base);await page.locator('.simple-primary').waitFor()
 await page.evaluate(()=>localStorage.setItem('qa-preservation','isolated-test-only'))
 await page.locator('.simple-batch').screenshot({path:path.join(out,'after-desktop.png')})
 assert.equal(await page.getByRole('combobox',{name:'パネル傾斜'}).count(),0)
 const settings=page.getByRole('button',{name:/^条件/})
 await settings.focus();await settings.press('Enter');assert.equal(await settings.getAttribute('aria-expanded'),'true')
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('button')?.textContent),'範囲を変更')
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('label')?.textContent),'パネル傾斜 10°15°20°')
 await page.keyboard.press('Escape');assert.equal(await settings.getAttribute('aria-expanded'),'false');assert.equal(await settings.evaluate(e=>e===document.activeElement),true)
 checks.push('keyboard Enter/Tab/Escape and focus return')
 await settings.click()
 for(const tiltDeg of [10,15,20])for(const direction of ['south','optimized']){
  await page.getByRole('combobox',{name:'パネル傾斜',exact:true}).selectOption(String(tiltDeg))
  await page.getByRole('combobox',{name:'配置方向',exact:true}).selectOption(direction)
  assert.equal(await page.locator('.simple-batch-complete').count(),0,'changed conditions hide all prior output')
  await page.locator('.simple-primary').click()
  await page.waitForFunction(()=>['complete','review','error'].includes(qa.state.status),{},{timeout:90000})
  const value=await page.evaluate(()=>{const r=qa.state.result;return {status:qa.state.status,error:qa.state.error,layout:r?.snapshot.results.layout,selected:r?.snapshot.defaults.layoutSettings,pdfs:r?.pdfs.map(p=>({pageCount:p.pageCount,drawingOnly:p.drawingOnly})),exports:qa.exports.slice(-2).map(e=>({drawingOnly:e.drawingOnly,text:e.text,drawingScale:e.drawingScale,layout:e.layout}))}})
  assert.ok(value.layout,value.error);assert.equal(value.layout.options.tiltDeg,tiltDeg);assert.equal(value.layout.options.rowGapM,3.3);assert.equal(value.layout.options.slopeLimitDeg,10)
  assert.equal(value.selected.direction,direction);if(direction==='south')assert.equal(value.layout.options.azimuthDeg,180)
  else assert.ok(value.layout.options.azimuthDeg>=150&&value.layout.options.azimuthDeg<=210)
  assert.equal(value.layout.moduleCount,value.layout.racks.reduce((n,r)=>n+r.modules.length,0));assert.ok(Math.abs(value.layout.dcKw-value.layout.moduleCount*.72)<1e-7)
  assert.deepEqual(value.pdfs.map(p=>p.pageCount),[1,4]);const drawing=value.exports.find(e=>e.drawingOnly)
  assert.equal(drawing.drawingScale,1000);assert.equal(drawing.layout.options.azimuthDeg,value.layout.options.azimuthDeg)
  const text=drawing.text.join('|');assert.ok(text.includes(tiltDeg+'°（水平から）'));assert.ok(text.includes(terrainAzimuthLabel(value.layout.options.azimuthDeg)));assert.ok(text.includes(value.layout.moduleCount.toLocaleString('ja-JP')));assert.ok(text.includes(value.layout.dcKw.toLocaleString('ja-JP',{maximumFractionDigits:2})))
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'配置図PDFを保存（1枚）',exact:true}).click()])
  const file=path.join(out,tiltDeg+'-'+direction+'.pdf');await download.saveAs(file);const bytes=await fs.readFile(file),ascii=bytes.toString('latin1')
  assert.match(ascii,/^%PDF-1.4/);assert.equal([...ascii.matchAll(/\/Type \/Page\b/g)].length,1);assert.match(ascii,/1190\.551181 841\.889764/)
  const imageHeader=/\/DCTDecode \/Length (\d+) >>\nstream\n/.exec(ascii);assert.ok(imageHeader)
  const start=imageHeader.index+imageHeader[0].length;await fs.writeFile(path.join(out,tiltDeg+'-'+direction+'.jpg'),bytes.subarray(start,start+Number(imageHeader[1])))
  combinations.push({tiltDeg,direction,azimuth:value.layout.options.azimuthDeg,modules:value.layout.moduleCount,dcKw:value.layout.dcKw,search:value.layout.stats.autoSearch,pdfPages:value.pdfs.map(p=>p.pageCount),bytes:bytes.length})
  console.log('verified',tiltDeg,direction,value.layout.moduleCount,value.layout.options.azimuthDeg)
 }
 checks.push('six choices through real Panel/service/Worker/report/PDF; A3 1:1000; angle/bearing/modules/DC agree')
 await page.setViewportSize({width:375,height:844});await page.locator('.simple-batch').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'after-mobile-open.png'),fullPage:true})
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
 const controls=await page.locator('.simple-batch-actions button,.simple-setting-fields select').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}))
 for(const r of controls)assert.ok(r.x>=0&&r.x+r.w<=375&&r.h>=44)
 for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y)}
 await page.getByText('縮尺・配置条件',{exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
 await settings.click();await page.screenshot({path:path.join(out,'after-mobile-closed.png'),fullPage:true});checks.push('375px closed/open/scale controls: no overlap or horizontal overflow, 44px controls')
 await page.evaluate(()=>{qa.fast=true;qa.mode='late'})
 const before=await page.evaluate(()=>qa.calls);await page.locator('.simple-primary').evaluate(e=>{e.click();e.click()});await page.waitForFunction(()=>qa.resolveRun)
 assert.equal(await page.evaluate(()=>qa.calls),before+1);await page.getByRole('button',{name:'中止',exact:true}).click();await page.evaluate(()=>qa.resolveRun());assert.equal(await page.evaluate(()=>qa.state.status),'cancelled');assert.equal(await page.locator('.simple-batch-complete').count(),1)
 await page.evaluate(()=>{qa.mode='late';qa.resolveRun=null});await page.locator('.simple-primary').click();await page.waitForFunction(()=>qa.resolveRun);await settings.click();await page.getByRole('combobox',{name:'パネル傾斜',exact:true}).selectOption('10');await page.evaluate(()=>qa.resolveRun());assert.equal(await page.locator('.simple-batch-complete').count(),0);assert.equal(await page.evaluate(()=>qa.state.pending),null)
 checks.push('double-click guard; cancel retains same-condition result; late worker ignored after condition change')
 await page.evaluate(()=>qa.mode='normal');await page.locator('.simple-primary').click();await page.waitForFunction(()=>!!qa.state.result,{},{timeout:30000})
 await page.evaluate(()=>qa.mode='pdf-error');await page.locator('.simple-primary').click();await page.waitForFunction(()=>qa.state.status==='error',{},{timeout:30000});assert.match(await page.locator('[role=alert]').innerText(),/PDFは未完成/);assert.equal(await page.locator('.simple-batch-complete').count(),1)
 await page.evaluate(()=>qa.mode='pdf-late');await page.locator('.simple-primary').click();await page.waitForFunction(()=>qa.resolvePdf,{},{timeout:30000});await page.getByRole('combobox',{name:'配置方向',exact:true}).selectOption('south');await page.evaluate(()=>qa.resolvePdf());await page.waitForFunction(()=>qa.state.status==='idle');assert.equal(await page.locator('.simple-batch-complete').count(),0)
 checks.push('partial PDF failure preserves only prior pair; late PDF ignored after direction change')
 await page.evaluate(()=>{qa.mode='zero'});await page.locator('.simple-primary').click();await page.waitForFunction(()=>qa.state.status==='review',{},{timeout:30000});assert.match(await page.locator('[role=alert]').innerText(),/架台がありません/);assert.equal(await page.locator('.simple-batch-complete').count(),0)
 await page.evaluate(()=>{qa.mode='error'});await page.locator('.simple-primary').click();await page.waitForFunction(()=>qa.state.status==='error');assert.match(await page.locator('[role=alert]').innerText(),/合成通信失敗/)
 checks.push('zero layout and acquisition failure never expose new PDF')
 await page.evaluate(()=>{qa.mode='normal';qa.setLayout({rowGapM:4.2,rackGapM:1.5,slopeLimitDeg:20})});await page.locator('.simple-primary').click();await page.waitForFunction(()=>!!qa.state.result,{},{timeout:30000});assert.equal(await page.evaluate(()=>qa.state.result.snapshot.results.layout.options.rowGapM),4.2);assert.equal(await page.evaluate(()=>qa.layout.rowGapM),4.2)
 const calls=await page.evaluate(()=>qa.calls);await page.evaluate(()=>qa.setScale(2000));assert.equal(await page.locator('.simple-batch-complete').count(),0);await page.locator('.simple-primary').click();await page.waitForFunction(()=>qa.state.result?.report.drawingScale===2000);assert.equal(await page.evaluate(()=>qa.calls),calls)
 await page.evaluate(()=>qa.setVisible(false));await page.evaluate(()=>qa.setVisible(true));assert.equal(await page.locator('.simple-batch-complete').count(),1);assert.equal(await page.evaluate(()=>localStorage.getItem('qa-preservation')),'isolated-test-only')
 checks.push('custom spacing/cutoff preserved; scale-only re-export avoids recalculation; simple/detail visibility round trip and isolated storage unchanged')
 await page.evaluate(()=>qa.setReview({version:1,parcels:[],boundary:null,exclusions:[]}));assert.equal(await page.locator('.simple-primary').isDisabled(),true);assert.equal(await page.locator('.simple-batch-complete').count(),0)
 checks.push('empty geometry disables creation and clears prior links')
 assert.deepEqual(errors,[])
 await fs.writeFile(path.join(out,'checks.json'),JSON.stringify({verifiedAt:new Date().toISOString(),checks,combinations,errors,notes:'Synthetic DEM, NEDO and basemap tiles; native Worker and real canvas/PDF for all six choices. Fast exporter used only for additional race/failure checks. No user profile/storage used.'},null,2))
 console.log('PASS',checks.length,'browser groups')
} catch(error) {
 await fs.writeFile(path.join(out,'failure.txt'),String(error.stack)+'\n'+JSON.stringify(errors))
 if(browser){const pages=browser.contexts().flatMap(c=>c.pages());if(pages[0]){await pages[0].screenshot({path:path.join(out,'failure.png'),fullPage:true});await fs.writeFile(path.join(out,'failure-state.txt'),await pages[0].locator('body').innerText())}}
 throw error
} finally {
 await browser?.close();await server?.close()
}

