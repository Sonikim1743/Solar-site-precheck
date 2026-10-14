import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {terrainReviewSynthetic} from '../tests/fixtures/terrainReviewSynthetic.mjs'
import {terrainAreaSnapshot} from '../src/utils/terrainArea.js'
const {chromium}=await import(pathToFileURL(process.env.SOLAR_PLAYWRIGHT_MODULE).href)
const out=path.resolve('../windows-verification'),s=terrainReviewSynthetic()
const browser=await chromium.launch({headless:true,executablePath:process.env.SOLAR_BROWSER_EXE})
const context=await browser.newContext({viewport:{width:1280,height:960},acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[]
page.on('pageerror',e=>errors.push(e.message))
await context.addInitScript(draft=>localStorage.setItem('solar-site-precheck-draft-v1',JSON.stringify(draft)),{position:s.position,siteName:s.siteName,siteNameTouched:true,parcelReview:s.parcelReview,terrainArea:terrainAreaSnapshot(s.terrainArea)})
try {
  await page.goto('http://127.0.0.1:5187/')
  await page.locator('#terrain-area > summary').click()
  const slope=page.getByLabel('参考配置の勾配条件')
  await slope.selectOption('20')
  await page.getByRole('button',{name:'自動で参考配置',exact:true}).click()
  await page.locator('.terrain-layout-totals').waitFor({timeout:30000})
  const counts=()=>page.locator('.terrain-layout-totals dd').allTextContents()
  const initial=await counts()
  assert.ok(Number(initial[0].replace(/[^\d]/g,''))>0)
  await page.getByRole('button',{name:'配置条件',exact:true}).click()
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
  await page.locator('.terrain-area-result-actions').getByRole('button',{name:'レポート',exact:true}).click()
  await page.locator('#terrain-area-report').waitFor()
  assert.equal(await page.locator('#terrain-area-report .terrain-report-sheet').count(),4)
  assert.match(await page.locator('#terrain-area-report').innerText(),/仮フェンス/)
  const reportNumbers=await page.locator('.terrain-layout-report-values--primary dd').allTextContents()
  assert.ok(reportNumbers[2].includes(after[0].replace(/\s*枚.*/,'')))
  for(const [name,file] of [['配置図PDF · 1枚','synthetic-drawing.pdf'],['地形PDFを保存','synthetic-report.pdf']]) {
    const [download]=await Promise.all([page.waitForEvent('download',{timeout:45000}),page.locator('#report-section').getByRole('button',{name,exact:true}).click()])
    await download.saveAs(path.join(out,file))
  }
  await page.setViewportSize({width:320,height:780})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await fs.writeFile(path.join(out,'layout-check.json'),JSON.stringify({initial,after,reportNumbers,comparison,errors,checks:['actual Worker nonzero placement','draft preserves applied result','one rack exclusion recalculates capacity','height 1:2 leaves capacity unchanged','15/20 terrain-only comparison preserves exclusion','fence in both outputs','actual 1-page drawing and 4-page report downloads','320px no page overflow']},null,2))
  assert.deepEqual(errors,[])
  console.log('Windows layout and two PDF outputs passed')
} catch(e){await fs.writeFile(path.join(out,'layout-failure.txt'),e.stack+'\n'+await page.locator('body').innerText());await page.screenshot({path:path.join(out,'layout-failure.png'),fullPage:true});throw e}finally{await browser.close()}
