import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createEmptyParcelReview, measureParcelReview } from '../src/utils/parcelReview.js'
import { createTerrainPlan, normalizeTerrainArea, terrainTilePoint } from '../src/utils/terrainArea.js'

let viteServer, ParcelReviewReport
before(async()=>{
  viteServer=await createServer({configFile:false,root:process.cwd(),plugins:[react()],server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',logLevel:'error',optimizeDeps:{disabled:true}})
  ParcelReviewReport=(await viteServer.ssrLoadModule('/src/components/ParcelReviewReport.jsx')).default
},{timeout:30000})
after(async()=>{await viteServer?.close()})
const ring=(x,y,size)=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]
const render=props=>renderToStaticMarkup(React.createElement(ParcelReviewReport,props))

// These are synthetic points and a generated planar elevation grid, not a site record.
function fixture({missing=false}={}) {
  const review={...createEmptyParcelReview(),boundary:{type:'Polygon',coordinates:[ring(135,35,.0004)]}}
  const metrics=measureParcelReview(review),plan=createTerrainPlan(metrics.geometry),grid=plan.grid,urls=new Set()
  const elevations=Array.from({length:grid.width*grid.height},(_,i)=>100+(i%grid.width)*.5)
  if(missing) elevations[Math.floor(grid.height/2)*grid.width+Math.floor(grid.width/2)]=null
  for(let i=0;i<elevations.length;i++) {
    const [lon,lat]=plan.positionAt(i),[x,y]=terrainTilePoint(lon,lat,15)
    urls.add(`https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/15/${Math.floor(x/256)}/${Math.floor(y/256)}.png`)
  }
  const terrainArea=normalizeTerrainArea({version:1,geometryKey:plan.geometryKey,geometry:plan.geometry,fetchedAt:'2026-10-01T00:00:00.000Z',source:{urls:[...urls]},grid:{...grid,elevations,sourceIds:elevations.map(z=>z===null?null:'dem5b_png')}})
  return {review,metrics,terrainArea,position:{lat:35.0002,lon:135.0002},mapRegionLabel:'合成確認地域'}
}

test('range report uses a real standard-map background, same-range terrain facts and next actions on one page',()=>{
  const props=fixture(),original=structuredClone(props),html=render(props)
  assert.match(html,/国土地理院 標準地図/);assert.match(html,/\/xyz\/std\/\d+\/\d+\/\d+\.png/)
  assert.match(html,/地域：合成確認地域/);assert.match(html,/検討範囲・地形と次の確認/)
  const displayed=[...html.matchAll(/<dd>([^<]+) <small>/g)].map(match=>match[1])
  const format=n=>n.toLocaleString('ja-JP',{maximumFractionDigits:1})
  assert.deepEqual(displayed,[format(props.metrics.usableAreaM2),format(props.terrainArea.summary.heightRange),format(props.terrainArea.summary.medianSlope)])
  assert.match(html,/原資料5m級/);assert.match(html,/10m幅/);assert.match(html,/取得 2026\/10\/01 09:00/)
  assert.match(html,/範囲を照合/);assert.match(html,/現地で確認/);assert.match(html,/設計へ引継ぎ/)
  assert.match(html,/造成量・設備容量・施工可否は未判定/)
  assert.equal((html.match(/class="report-print-page /g)||[]).length,1)
  assert.doesNotMatch(html,/背景地図は省略|NaN|undefined/)
  assert.deepEqual(props,original)
})

test('missing terrain and changed geometry never show stale terrain numbers',()=>{
  const props=fixture(),stale={...props.terrainArea,geometryKey:'different-range',summary:{...props.terrainArea.summary,heightRange:9876,medianSlope:54.3}}
  const missing=render({...props,terrainArea:null}),changed=render({...props,terrainArea:stale})
  assert.match(missing,/範囲の地形は未取得/)
  assert.match(changed,/現在の範囲で地形を再取得/)
  assert.doesNotMatch(changed,/9,876|54\.3|同じ有効範囲のDEM参考値/)
  assert.equal((changed.match(/<dd>— <small>/g)||[]).length,2)
  assert.match(changed,/\/xyz\/std\//,'current reference map remains visible')
  const changedReview={...props.review,exclusions:[{type:'Polygon',coordinates:[ring(135.0001,35.0001,.0001)]}]}
  const actualGeometryChange=render({...props,review:changedReview})
  assert.match(actualGeometryChange,/現在の範囲で地形を再取得/)
  assert.doesNotMatch(actualGeometryChange,/同じ有効範囲のDEM参考値/,'an actual exclusion edit invalidates the saved terrain result')
})

test('partial data, original area conditions and long untrusted field notes remain explicit',()=>{
  const props=fixture({missing:true}),memo='<script>not executable</script>'+ '確認事項'.repeat(70)
  const html=render({...props,fieldMemo:memo,mapRegionLabel:'<script>region</script>'})
  assert.match(html,/欠測を除いた値/);assert.match(html,/参考の筆は面積に含みません/)
  assert.match(html,/登記面積・確定境界・設置可能面積を保証しません/)
  assert.match(html,/現地メモ（抜粋）/);assert.match(html,/全文は1ページ目・検討記録/)
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/)
  assert.doesNotMatch(html,new RegExp('確認事項'.repeat(40)))
})
