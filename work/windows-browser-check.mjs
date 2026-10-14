import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createEmptyParcelReview, setReviewParcel, measureParcelReview } from '../src/utils/parcelReview.js'
import { featureInteriorPoint } from '../src/services/parcelGeometry.js'
import { terrainGeometryKey } from '../src/utils/terrainArea.js'
import { REGIONAL_PARCEL_SOURCE } from '../src/services/regionalParcels.js'
if(!process.env.SOLAR_PLAYWRIGHT_MODULE || !process.env.SOLAR_BROWSER_EXE)throw Error('Set SOLAR_PLAYWRIGHT_MODULE and SOLAR_BROWSER_EXE to an existing isolated browser test runtime; no installation is performed')
const {chromium}=await import(pathToFileURL(path.resolve(process.env.SOLAR_PLAYWRIGHT_MODULE)).href)
const out=path.resolve(process.env.SOLAR_VERIFICATION_DIR || '../windows-verification'),base=process.env.SOLAR_BASE_URL || 'http://127.0.0.1:5187'
await fs.mkdir(out,{recursive:true})
const index=JSON.parse(await fs.readFile('public/parcels/2024-takahashi/index.json','utf8')),features=[]
for(const cell of index.cells)features.push(...JSON.parse(await fs.readFile('public/parcels/2024-takahashi/'+cell.url,'utf8')).features)
const selected=['3243','道-184'].map(number=>features.find(f=>f.properties['地番']===number))
assert.ok(selected.every(Boolean))
let review=createEmptyParcelReview()
for(const f of selected)review=setReviewParcel(review,f,'target',{fileName:REGIONAL_PARCEL_SOURCE,importedAt:new Date().toISOString()})
const geometry=measureParcelReview(review).geometry,expected=terrainGeometryKey(geometry)
const browser=await chromium.launch({executablePath:process.env.SOLAR_BROWSER_EXE,headless:process.env.SOLAR_HEADLESS !== '0'})
const context=await browser.newContext({viewport:{width:1280,height:960},acceptDownloads:true,serviceWorkers:'block'})
const page=await context.newPage(),errors=[],transfers=[],downloads=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('response',async r=>{if(r.url().includes('/parcels/'))transfers.push({url:r.url().split('?')[0],bytes:await r.body().then(b=>b.length).catch(()=>0)})})
page.on('download',d=>downloads.push(d))
await context.addInitScript(()=>{localStorage.setItem('solar-site-precheck-draft-v1',JSON.stringify({position:{lat:34.865604,lon:133.368782},siteName:'公開原本検証（実候補地ではありません）',siteNameTouched:true}))})
try {
  await page.goto(base+'/?design=simple')
  await page.waitForFunction(()=>document.querySelector('.leaflet-control-scale-line')?.textContent==='1 km')
  await page.waitForFunction(()=>!document.querySelector('.leaflet-container').classList.contains('leaflet-zoom-anim'))
  await page.getByRole('button',{name:'地番選択',exact:true}).click()
  for(let i=0;i<4;i++){const before=await page.locator('.leaflet-control-scale-line').textContent();await page.locator('.leaflet-control-zoom-in').click();await page.waitForFunction(before=>document.querySelector('.leaflet-control-scale-line')?.textContent!==before,before);await page.waitForFunction(()=>!document.querySelector('.leaflet-container').classList.contains('leaflet-zoom-anim'))}
  const parcelPaths=selected.map(f=>page.locator(`[data-regional-parcel-id="${f.id}"]`))
  for(const locator of parcelPaths){await locator.waitFor({timeout:30000});await locator.focus();await locator.press('Enter')}
  const selection=page.locator('.regional-parcel-selection strong')
  assert.match(await selection.textContent(),/選択中 2筆 \/ 確定済み 0筆/)
  await page.getByRole('button',{name:'選択を中止',exact:true}).click()
  assert.match(await selection.textContent(),/選択中 0筆 \/ 確定済み 0筆/)
  assert.equal(await page.locator('[data-selected-parcel-geometry-key]').count(),0)
  for(const locator of parcelPaths){await locator.focus();await locator.press('Enter')}
  await page.getByRole('button',{name:'選択完了 → 3D',exact:true}).click()
  await page.locator('[data-selected-parcel-geometry-key]').waitFor({timeout:60000})
  assert.equal(await page.locator('[data-selected-parcel-geometry-key]').getAttribute('data-selected-parcel-geometry-key'),expected)
  await parcelPaths[0].focus();await parcelPaths[0].press('Enter')
  assert.match(await selection.textContent(),/選択中 1筆 \/ 確定済み 2筆/)
  assert.equal(await page.locator('[data-selected-parcel-geometry-key]').getAttribute('data-selected-parcel-geometry-key'),expected)
  await page.getByRole('button',{name:'選択を中止',exact:true}).click()
  assert.match(await selection.textContent(),/選択中 2筆 \/ 確定済み 2筆/)
  assert.equal(await page.locator('[data-selected-parcel-geometry-key]').getAttribute('data-selected-parcel-geometry-key'),expected)
  await page.locator('.selected-parcel-3d').screenshot({path:path.join(out,'selected-parcel-3d.png')})
  await page.setViewportSize({width:390,height:844})
  await page.locator('.regional-parcel-selection').scrollIntoViewIfNeeded()
  await page.screenshot({path:path.join(out,'mobile-selection.png')})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  const resetBox=await page.getByRole('button',{name:'初期化',exact:true}).boundingBox()
  const gsiBox=await page.locator('.leaflet-control-attribution a[href="https://maps.gsi.go.jp/development/ichiran.html"]').boundingBox()
  assert.ok(resetBox && gsiBox)
  assert.ok(resetBox.x+resetBox.width<=gsiBox.x || gsiBox.x+gsiBox.width<=resetBox.x || resetBox.y+resetBox.height<=gsiBox.y || gsiBox.y+gsiBox.height<=resetBox.y,'GSI attribution and reset do not overlap')
  const before=transfers.length
  await page.getByRole('button',{name:'地番選択',exact:true}).click()
  await page.getByRole('button',{name:'地番選択',exact:true}).click()
  await parcelPaths[0].waitFor({timeout:30000})
  assert.equal(transfers.length,before,'same region reuses validated cache')
  await page.getByRole('button',{name:'基本値でまとめて解析',exact:true}).click()
  await page.locator('.simple-batch-complete').waitFor({timeout:180000})
  assert.equal(await page.locator('.simple-batch-complete').getAttribute('data-simple-result-key'),expected)
  await page.locator('.simple-batch-complete').screenshot({path:path.join(out,'simple-complete.png')})
  const links=page.locator('.simple-batch-downloads a')
  assert.equal(await links.count(),2)
  for(let i=0;i<2;i++) {
    const [download]=await Promise.all([page.waitForEvent('download'),links.nth(i).click()])
    await download.saveAs(path.join(out,i===0?'public-original-drawing.pdf':'public-original-report.pdf'))
  }
  // In-progress retry/cancel must leave the previous two downloads intact.
  const prior=await links.evaluateAll(nodes=>nodes.map(n=>n.href))
  await page.getByRole('button',{name:'同じ範囲を再解析',exact:true}).click()
  await page.getByRole('button',{name:'一括解析を中止',exact:true}).click()
  assert.deepEqual(await links.evaluateAll(nodes=>nodes.map(n=>n.href)),prior)
  await page.getByRole('button',{name:'詳細',exact:true}).click()
  await page.getByRole('button',{name:'シンプル',exact:true}).click()
  assert.deepEqual(await links.evaluateAll(nodes=>nodes.map(n=>n.href)),prior)
  await fs.writeFile(path.join(out,'check.json'),JSON.stringify({verifiedAt:new Date().toISOString(),base,headless:process.env.SOLAR_HEADLESS !== '0',expected,selectedNumbers:['3243','道-184'],geometryType:geometry.type,areaM2:measureParcelReview(review).usableAreaM2,transfers,errors,checks:['multi-parcel draft cancel leaves original confirmed state','draft edits and cancel preserve confirmed original union and 3D','original union to interactive 3D','390px no page overflow and no GSI/reset overlap','validated parcel cache revisit','same geometry simple flow to two actual PDF downloads','retry cancel preserves completed PDFs','simple detail round trip preserves results']},null,2))
  assert.deepEqual(errors,[])
  console.log('Windows public-original end-to-end passed')
} catch(e) {
  await fs.writeFile(path.join(out,'draft-state.json'),await page.evaluate(()=>localStorage.getItem('solar-site-precheck-draft-v1'))||'{}')
  await fs.writeFile(path.join(out,'failure.txt'),String(e.stack)+'\n'+await page.locator('body').innerText())
  await page.screenshot({path:path.join(out,'failure.png'),fullPage:true})
  throw e
} finally {await browser.close()}
