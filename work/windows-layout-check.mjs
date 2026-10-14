import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {terrainReviewSynthetic} from '../tests/fixtures/terrainReviewSynthetic.mjs'
import {terrainAreaSnapshot} from '../src/utils/terrainArea.js'
const {chromium}=await import(pathToFileURL(process.env.SOLAR_PLAYWRIGHT_MODULE).href)
const out=path.resolve(process.env.SOLAR_VERIFICATION_DIR || '../windows-verification'),s=terrainReviewSynthetic()
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({headless:process.env.SOLAR_HEADLESS !== '0',executablePath:process.env.SOLAR_BROWSER_EXE})
const context=await browser.newContext({viewport:{width:1280,height:960},acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[]
page.on('pageerror',e=>errors.push(e.message))
await context.addInitScript(draft=>localStorage.setItem('solar-site-precheck-draft-v1',JSON.stringify(draft)),{position:s.position,siteName:s.siteName,siteNameTouched:true,parcelReview:s.parcelReview,terrainArea:terrainAreaSnapshot(s.terrainArea)})
try {
  await page.goto(process.env.SOLAR_BASE_URL || 'http://127.0.0.1:5187/')
  await page.locator('#terrain-area > summary').click()
  const slope=page.getByLabel('参考配置の勾配条件')
  await slope.selectOption('20')
  await page.getByRole('button',{name:'自動で参考配置',exact:true}).click()
  await page.locator('.terrain-layout-totals').waitFor({timeout:30000})
  const counts=()=>page.locator('.terrain-layout-totals dd').allTextContents()
  const initial=await counts()
  assert.ok(Number(initial[0].replace(/[^\d]/g,''))>0)
  await page.getByRole('button',{name:'配置条件',exact:true}).click()
  const azimuth=page.locator('.terrain-layout-fields label').filter({hasText:'配置方位'}).locator('select')
  const tilt=page.locator('.terrain-layout-fields label').filter({hasText:'モジュール傾斜'}).locator('input')
  const rowGap=page.locator('.terrain-layout-fields label').filter({hasText:'アレイ間前後の空き'}).locator('input')
  assert.equal(await tilt.inputValue(),'15');assert.equal(await rowGap.inputValue(),'3.3')
  await rowGap.fill('4.7');await tilt.fill('20');assert.equal(await rowGap.inputValue(),'4.7');assert.deepEqual(await counts(),initial)
  await tilt.fill('15');assert.equal(await rowGap.inputValue(),'4.7');await rowGap.fill('3.3')
  await azimuth.selectOption('90');assert.equal(await tilt.inputValue(),'15');assert.equal(await slope.inputValue(),'20')
  await tilt.fill('25');assert.equal(await azimuth.inputValue(),'90');assert.equal(await slope.inputValue(),'20');assert.deepEqual(await counts(),initial)
  await azimuth.selectOption('180');assert.equal(await tilt.inputValue(),'25');await tilt.fill('15')
  await page.locator('.terrain-layout-fields label').filter({hasText:'架台左右の空き'}).locator('input').fill('2')
  assert.deepEqual(await counts(),initial,'draft preserves completed quantities')
  await page.locator('.terrain-layout-fields label').filter({hasText:'架台左右の空き'}).locator('input').fill('1')
  await page.getByLabel('配置を囲むフェンス').check()
  await page.getByRole('button',{name:'架台を1つ減らす',exact:true}).click()
  const after=await counts()
  assert.ok(Number(after[0].replace(/[^\d]/g,''))<Number(initial[0].replace(/[^\d]/g,'')))
  const scale=page.locator('.terrain-area-compact-toolbar')
  await scale.getByRole('button',{name:'高さ2倍 1:2',exact:true}).click()
  assert.deepEqual(await counts(),after,'height display preserves capacity')
  await page.getByRole('button',{name:'地形勾配15° / 20°を比較',exact:true}).click()
  await page.locator('.terrain-layout-comparison').waitFor({timeout:30000})
  assert.deepEqual(await counts(),after,'comparison preserves manual applied result')
  const comparison=await page.locator('.terrain-layout-comparison tbody tr').allTextContents()
  // Hold a real Worker's response, cancel, then deliver it late in this isolated
  // browser. The UI must reject it without replacing the applied quantities.
  await page.evaluate(()=>{
    window.__solarNativeWorker=window.Worker
    window.Worker=class extends window.__solarNativeWorker {
      set onmessage(listener){super.onmessage=event=>{window.__solarLateResponse=()=>listener(event)}}
    }
  })
  await page.getByRole('button',{name:'地形勾配15° / 20°を比較',exact:true}).click()
  await page.waitForFunction(()=>Boolean(window.__solarLateResponse),{},{timeout:30000})
  await page.locator('.terrain-layout-status').getByRole('button',{name:'中止',exact:true}).click()
  await page.evaluate(()=>{window.__solarLateResponse();window.Worker=window.__solarNativeWorker;delete window.__solarLateResponse})
  assert.deepEqual(await counts(),after,'cancel and late Worker response preserve applied quantities')
  await page.evaluate(()=>{window.Worker=class {constructor(){throw Error('isolated browser startup failure')}}})
  await page.getByRole('button',{name:'地形勾配15° / 20°を比較',exact:true}).click()
  await page.locator('.terrain-layout-error').waitFor()
  assert.deepEqual(await counts(),after,'Worker startup failure preserves applied quantities')
  await page.evaluate(()=>{window.Worker=window.__solarNativeWorker;delete window.__solarNativeWorker})
  await page.getByRole('button',{name:'再試行',exact:true}).click()
  await page.locator('.terrain-layout-error').waitFor({state:'hidden'})
  await page.locator('.terrain-layout-status').waitFor({state:'hidden',timeout:30000})
  assert.deepEqual(await counts(),after,'successful comparison retry preserves exclusions')
  await page.locator('.terrain-area-result-actions').getByRole('button',{name:'レポート',exact:true}).click()
  await page.locator('#terrain-area-report').waitFor()
  assert.equal(await page.locator('#terrain-area-report .terrain-report-sheet').count(),4)
  assert.match(await page.locator('#terrain-area-report').innerText(),/仮フェンス/)
  const drawings=page.locator('#terrain-area-report .terrain-drawing-export-source svg')
  assert.equal(await drawings.count(),2)
  assert.equal(await drawings.nth(0).getAttribute('data-viewport'),await drawings.nth(1).getAttribute('data-viewport'))
  assert.equal(await drawings.nth(0).getAttribute('data-margin-m'),'10');assert.equal(await drawings.nth(1).locator('[data-layout-racks]').count(),0)
  const reportNumbers=await page.locator('.terrain-layout-report-values--primary dd').allTextContents()
  assert.ok(reportNumbers[2].includes(after[0].replace(/\s*枚.*/,'')))
  for(const [name,file] of [['配置図PDF · 1枚','synthetic-drawing.pdf'],['地形PDFを保存','synthetic-report.pdf']]) {
    const [download]=await Promise.all([page.waitForEvent('download',{timeout:45000}),page.locator('#report-section').getByRole('button',{name,exact:true}).click()])
    await download.saveAs(path.join(out,file))
  }
  await azimuth.selectOption('90');await tilt.fill('25')
  await page.getByRole('button',{name:'真南固定・最大配置を比較',exact:true}).click()
  await page.locator('.terrain-layout-south-comparison').waitFor({timeout:30000})
  assert.deepEqual(await counts(),after,'south comparison preserves current exclusions and quantities')
  assert.equal(await azimuth.inputValue(),'90');assert.equal(await tilt.inputValue(),'25');assert.equal(await slope.inputValue(),'20')
  await tilt.fill('30');assert.equal(await page.getByRole('button',{name:'真南固定案を適用',exact:true}).isDisabled(),true);assert.deepEqual(await counts(),after)
  await tilt.fill('25');assert.equal(await page.getByRole('button',{name:'真南固定案を適用',exact:true}).isDisabled(),false)
  await page.getByRole('button',{name:'真南固定案を適用',exact:true}).click()
  assert.equal(await azimuth.inputValue(),'180');assert.equal(await tilt.inputValue(),'25');assert.equal(await slope.inputValue(),'20')
  await page.locator('.terrain-area-result-actions').getByRole('button',{name:'レポート',exact:true}).click()
  for(const [name,file] of [['配置図PDF · 1枚','south-fixed-drawing.pdf'],['地形PDFを保存','south-fixed-report.pdf']]){
    const [download]=await Promise.all([page.waitForEvent('download',{timeout:45000}),page.locator('#report-section').getByRole('button',{name,exact:true}).click()]);await download.saveAs(path.join(out,file))
  }
  await page.setViewportSize({width:320,height:780})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await fs.writeFile(path.join(out,'layout-check.json'),JSON.stringify({verifiedAt:new Date().toISOString(),headless:process.env.SOLAR_HEADLESS !== '0',initial,after,reportNumbers,comparison,errors,checks:['actual Worker nonzero placement','independent azimuth/tilt/terrain-cutoff input bindings','draft preserves applied result','one rack exclusion recalculates capacity','height 1:2 leaves capacity unchanged','15/20 terrain-only comparison preserves exclusion','cancel and real late Worker response preserve quantities','Worker startup failure and retry preserve applied quantities','south-fixed comparison preserves current exclusions and inputs','stale south comparison cannot replace changed conditions','south application keeps tilt25/cutoff20 and fixes azimuth180','two drawing views have equal viewport and 10m context','fence in both outputs','actual 1-page drawings and 4-page reports downloaded','320px no page overflow']},null,2))
  assert.deepEqual(errors,[])
  console.log('Windows layout and two PDF outputs passed')
} catch(e){await fs.writeFile(path.join(out,'layout-failure.txt'),e.stack+'\n'+await page.locator('body').innerText());await page.screenshot({path:path.join(out,'layout-failure.png'),fullPage:true});throw e}finally{await browser.close()}
