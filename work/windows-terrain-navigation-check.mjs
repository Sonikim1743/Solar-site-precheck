import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function checkTerrainNavigation(page,out) {
  const parent=page.locator('[data-selected-parcel-geometry-key]'),figure=parent.locator('.terrain-area-figure--interactive').first(),model=figure.locator('.terrain-area-stage svg[data-view-azimuth]'),widget=figure.locator('.terrain-view-navigation')
  await widget.waitFor();await figure.scrollIntoViewIfNeeded()
  const state=()=>model.evaluate(s=>({azimuth:Number(s.dataset.viewAzimuth),pitch:Number(s.dataset.viewPitch),zoom:Number(s.dataset.viewZoom),height:Number(s.dataset.heightScale),modules:Number(s.dataset.layoutModules)}))
  const sync=async()=>{const s=await state();assert.equal(Number(await widget.getAttribute('data-navigation-azimuth')),s.azimuth);assert.equal(Number(await widget.getAttribute('data-navigation-pitch')),s.pitch);const angle=(540-s.azimuth)%360;assert.equal(await widget.locator('.terrain-navigation-compass g').getAttribute('transform'),`rotate(${angle} 22 22)`);return s}
  const wait=async(azimuth,pitch)=>page.waitForFunction(({azimuth,pitch})=>{const s=document.querySelector('[data-selected-parcel-geometry-key] .terrain-area-stage svg[data-view-azimuth]');return Number(s?.dataset.viewAzimuth)===azimuth&&Number(s?.dataset.viewPitch)===pitch},{azimuth,pitch})
  const choose=async(label,azimuth,pitch)=>{await widget.getByRole('button',{name:'方位を選ぶ',exact:true}).click();await widget.locator('.terrain-navigation-menu').getByRole('button',{name:label+'から見る',exact:true}).click();await wait(azimuth,pitch);return sync()}
  const geometry=await parent.getAttribute('data-selected-parcel-geometry-key'),initial=await state(),checks=[]
  await widget.getByRole('button',{name:'東から見る',exact:true}).click();await wait(90,0);assert.equal((await sync()).zoom,initial.zoom)
  await choose('北',0,0);await choose('南',180,0);await choose('西',270,0)
  await choose('上',180,90);checks.push('all cardinal sides and exact north-up 90 degree overhead')
  await widget.getByRole('button',{name:'最初の視点に戻す'}).click();await wait(initial.azimuth,initial.pitch)
  await figure.getByRole('button',{name:'3Dを拡大',exact:true}).click();assert.equal((await sync()).zoom,1.2)
  await choose('東',90,0);assert.equal((await sync()).zoom,1.2)
  await figure.getByRole('button',{name:'高さ2倍 1:2',exact:true}).click();assert.equal((await sync()).height,2)
  assert.equal((await state()).zoom,1.2);checks.push('face navigation retains zoom and height; numerical geometry remains unchanged')
  await widget.getByRole('button',{name:'最初の視点に戻す'}).click();await wait(initial.azimuth,initial.pitch);assert.equal((await sync()).zoom,1)
  await figure.getByRole('button',{name:'視点の移動',exact:true}).click()
  const target=figure.locator('.terrain-area-drag-target');await target.scrollIntoViewIfNeeded();const b=await target.boundingBox(),x=b.x+b.width*.5,y=b.y+b.height*.5
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y-15,{steps:3});await page.mouse.up()
  const dragged=await sync();assert.notEqual(dragged.azimuth,initial.azimuth);assert.ok(dragged.pitch>initial.pitch)
  await model.focus();await model.press('ArrowRight');const keyed=await sync();assert.notEqual(keyed.azimuth,dragged.azimuth)
  await target.hover();await page.mouse.wheel(0,-100);await page.waitForTimeout(50);assert.ok((await sync()).zoom>keyed.zoom)
  checks.push('drag, arrow keys, orbit and wheel update the same cube/compass camera')
  await widget.getByRole('button',{name:'最初の視点に戻す'}).click();await wait(initial.azimuth,initial.pitch)
  await widget.getByRole('button',{name:'東から見る',exact:true}).click();await page.waitForTimeout(50);await model.focus();await model.press('ArrowLeft');const interrupted=await state();await page.waitForTimeout(350);assert.deepEqual(await sync(),interrupted)
  checks.push('an input interrupts navigation without a delayed animation overwriting it')
  await page.emulateMedia({reducedMotion:'reduce'});await choose('上',180,90);await widget.getByRole('button',{name:'最初の視点に戻す'}).click();await wait(initial.azimuth,initial.pitch);checks.push('reduced motion applies exact camera without animation')
  await figure.getByRole('button',{name:'実寸 1:1',exact:true}).click()
  await widget.getByRole('button',{name:'東から見る',exact:true}).focus();await widget.getByRole('button',{name:'東から見る',exact:true}).press('Enter');await wait(90,0)
  await widget.getByRole('button',{name:'最初の視点に戻す'}).click();await wait(initial.azimuth,initial.pitch)
  await figure.screenshot({path:path.join(out,'viewcube-desktop.png')})
  await page.setViewportSize({width:390,height:844});await widget.scrollIntoViewIfNeeded()
  const wb=await widget.boundingBox(),sb=await figure.locator('.terrain-area-stage').boundingBox()
  assert.ok(wb.y+wb.height<=sb.y+1,'mobile cube reserves a separate row above the terrain')
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  for(const button of await widget.locator('button').all()){const r=await button.boundingBox();assert.ok(r.width>=44&&r.height>=44)}
  for(const face of await widget.locator('[data-cube-face]').all()){const r=await face.boundingBox();assert.ok(r.width>=44&&r.height>=44,'initial cube face touch areas are at least 44px')}
  await widget.getByRole('button',{name:'方位を選ぶ',exact:true}).click()
  for(const button of await widget.locator('.terrain-navigation-menu button').all()){const r=await button.boundingBox();assert.ok(r.width>=44&&r.height>=44)}
  await widget.locator('.terrain-navigation-menu button').first().focus();await page.keyboard.press('Escape');assert.equal(await widget.getByRole('button',{name:'方位を選ぶ',exact:true}).getAttribute('aria-expanded'),'false')
  await widget.screenshot({path:path.join(out,'viewcube-mobile-widget.png')});await figure.screenshot({path:path.join(out,'viewcube-mobile.png')})
  assert.equal(await parent.getAttribute('data-selected-parcel-geometry-key'),geometry);assert.equal((await state()).modules,initial.modules)
  checks.push('390px no overlap/overflow, 44px touch targets and keyboard face/menu operation')
  await fs.writeFile(path.join(out,'navigation-check.json'),JSON.stringify({at:new Date().toISOString(),base:page.url(),initial,final:await state(),geometry,checks},null,2))
  await page.setViewportSize({width:1280,height:960});await page.emulateMedia({reducedMotion:'no-preference'})
  console.log('Terrain navigation checks passed')
}
