import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { buildTerrainLayout } from '../src/utils/terrainLayout.js'
import { terrainLayoutErrorGuidance } from '../src/utils/terrainLayoutError.js'

let server, figures, selectedTerrainLayout, errorNotice, layoutPreview
before(async () => {
  server = await createServer({ configFile:false, root:process.cwd(), plugins:[react()], server:{middlewareMode:true,hmr:false,ws:false,watch:null}, appType:'custom',logLevel:'error',optimizeDeps:{disabled:true} })
  figures = await server.ssrLoadModule('/src/components/TerrainAreaFigures.jsx')
  selectedTerrainLayout = (await server.ssrLoadModule('/src/components/TerrainLayoutPreview.jsx')).selectedTerrainLayout
  errorNotice = (await server.ssrLoadModule('/src/components/TerrainLayoutPreview.jsx')).TerrainLayoutErrorNotice
  layoutPreview = (await server.ssrLoadModule('/src/components/TerrainLayoutPreview.jsx')).default
}, { timeout:30000 })
after(async () => { await server?.close() })
const fixture = () => {
  const width=13,height=13,step=5,xMin=-5,yMin=-5
  return {geometryKey:'synthetic-render',fetchedAt:'2026-10-13T00:00:00.000Z',contours:[],grid:{width,height,step,xMin,yMin,origin:{lat:35,lon:135},boundary:[[[[0,0],[50,0],[50,50],[0,50],[0,0]]]],inside:Array(width*height).fill(true),elevations:Array(width*height).fill(100),slopes:Array(width*height).fill(0)},summary:{minElevation:100,maxElevation:100,polygonAreaM2:2500,heightRange:0,medianSlope:0,coveragePercent:100,slopeCoveragePercent:100,slopeBins:[{min:0,max:10,percent:100},{min:10,max:20,percent:0},{min:20,max:30,percent:0},{min:30,max:90,percent:0}]}}
}

test('fence visibility is a single pressed-state control beside 3D parcel labels, outside collapsed conditions', () => {
  for (const fence of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(layoutPreview, { analysis: fixture(), preview: { options: {}, fence }, onChange: () => {}, parcelCount: 1 }))
    const control = html.match(/<button[^>]*aria-label="配置を囲むフェンス"[^>]*>[\s\S]*?<\/button>/)?.[0]
    assert.ok(control); assert.match(control, new RegExp(`aria-pressed="${fence}"`))
    assert.match(control, new RegExp(`フェンス ${fence ? 'ON' : 'OFF'}`))
    assert.ok(html.indexOf(control) > html.indexOf('3D地番'))
    assert.ok(html.indexOf(control) < html.indexOf('class="terrain-layout-conditions"'))
    assert.equal((html.match(/aria-label="配置を囲むフェンス"/g) || []).length, 1)
    assert.doesNotMatch(html, /type="checkbox"/)
  }
})
test('quantity adjustment removes and restores the same rigid racks while keeping capacity consistent', () => {
  const pool=buildTerrainLayout(fixture()), original=structuredClone(pool)
  assert.ok(pool.rackCount>1)
  const less=selectedTerrainLayout(pool,pool.rackCount-1), empty=selectedTerrainLayout(pool,0), restored=selectedTerrainLayout(pool,pool.rackCount)
  assert.deepEqual(less.racks,pool.racks.slice(0,-1))
  assert.equal(less.moduleCount,pool.moduleCount-pool.racks.at(-1).moduleCount)
  assert.equal(less.dcKw,less.moduleCount*720/1000)
  assert.deepEqual([empty.rackCount,empty.moduleCount,empty.dcKw,empty.acKw],[0,0,0,0])
  assert.deepEqual(restored.racks,pool.racks)
  assert.deepEqual(pool,original,'changing displayed quantity must not discard the automatic candidate pool')
})
test('plan and 3D show actual panel geometry, while the established A3 views remain unchanged', () => {
  const analysis=fixture(),layout=buildTerrainLayout(analysis), original=structuredClone(analysis)
  const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,{analysis,layout,...props}))
  const plan=render(figures.TerrainAreaPlan),model=render(figures.TerrainArea3D,{reportMode:false}),report=render(figures.TerrainArea3D,{reportMode:true})
  assert.equal((model.match(/data-terrain-face="module"/g)||[]).length,layout.moduleCount)
  assert.match(plan,new RegExp(`data-layout-racks="${layout.rackCount}"`))
  assert.match(model,new RegExp(`data-layout-modules="${layout.moduleCount}"`))
  assert.doesNotMatch(report,/data-terrain-face="module"/)
  assert.match(report,/data-layout-modules="0"/)
  assert.doesNotMatch(model,/NaN|Infinity|undefined/)
  assert.deepEqual(analysis,original)
})

test('drawn panels share the terrain metre scale instead of using decorative pixel-sized symbols', () => {
  const analysis=fixture(),layout=buildTerrainLayout(analysis)
  const html=renderToStaticMarkup(React.createElement(figures.TerrainAreaPlan,{analysis,layout}))
  const group=html.match(/<g[^>]*class="terrain-area-layout-plan"[^>]*>([\s\S]*?)<\/g>/)?.[1]
  assert.ok(group)
  const first=group.match(/<path[^>]*d="([^"]*)"/)?.[1]
  const pairs=[...first.matchAll(/[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map(match=>[Number(match[1]),Number(match[2])])
  assert.equal(pairs.length,4)
  const scaleGroup=html.match(/<g[^>]*class="terrain-area-svg-scale"[^>]*>([\s\S]*?)<\/g>/)?.[1]
  const barPixels=Number(scaleGroup.match(/ H([\d.]+)/)?.[1]),barMeters=Number(scaleGroup.match(/>(\d+) m<\/text>/)?.[1])
  assert.ok(barPixels>0&&barMeters>0)
  const pixelsPerMeter=barPixels/barMeters
  assert.ok(Math.abs(Math.hypot(pairs[1][0]-pairs[0][0],pairs[1][1]-pairs[0][1])-2.384*pixelsPerMeter)<.025)
  assert.ok(Math.abs(Math.hypot(pairs[2][0]-pairs[1][0],pairs[2][1]-pairs[1][1])-1.303*Math.cos(15*Math.PI/180)*pixelsPerMeter)<.025)
  assert.ok(layout.racks.every(rack=>rack.rows===4&&rack.columns>=4&&rack.columns<=8))
})

test('crowded actual parcel numbers remain readable with leaders in plan and 3D, including over reference panels', () => {
  const analysis=fixture(),layout=buildTerrainLayout(analysis)
  const parcelOverlay={boundaries:[],labels:Array.from({length:15},(_,i)=>({id:`dense-${i}`,number:`123-${i}`,point:[25,25,100.3]}))}
  const before=structuredClone(parcelOverlay)
  for(const Component of [figures.TerrainAreaPlan,figures.TerrainArea3D]) {
    const html=renderToStaticMarkup(React.createElement(Component,{analysis,layout,parcelOverlay}))
    assert.equal((html.match(/data-parcel-number=/g)||[]).length,15)
    assert.ok((html.match(/class="terrain-area-parcel-leader"/g)||[]).length>=14)
    assert.ok(html.lastIndexOf('class="terrain-area-parcel-leader"')<html.indexOf('data-parcel-number='),'all leaders stay behind every number')
    assert.match(html,/細い線の先が元の位置/)
    for(let i=0;i<15;i++) assert.match(html,new RegExp(`data-parcel-number="123-${i}"`))
    assert.doesNotMatch(html,/NaN|Infinity|undefined/)
    const report=renderToStaticMarkup(React.createElement(Component,{analysis,layout,parcelOverlay,reportMode:true}))
    assert.doesNotMatch(report,/data-parcel-number|terrain-area-parcel-note/)
  }
  assert.deepEqual(parcelOverlay,before)
})

test('unplaced real numbers are retained in a compact list rather than silently dropped', () => {
  const analysis=fixture(),number='1234567890'.repeat(30)
  const html=renderToStaticMarkup(React.createElement(figures.TerrainAreaPlan,{analysis,parcelOverlay:{boundaries:[],labels:[{id:'long',number,point:[25,25,100.3]}]}}))
  assert.match(html,/図上に収まらない地番/)
  assert.ok(html.includes(number))
  assert.doesNotMatch(html,/data-parcel-number=/)
})

test('excluded rack retains a selectable outline while active count and report stay consistent', () => {
  const analysis=fixture(),pool=buildTerrainLayout(analysis),rack=pool.racks[1],layout=selectedTerrainLayout(pool,[rack.id])
  const original=structuredClone(pool)
  const render=(Component,extra={})=>renderToStaticMarkup(React.createElement(Component,{analysis,layout,layoutCandidates:pool,onToggleRack:()=>{},...extra}))
  const plan=render(figures.TerrainAreaPlan),model=render(figures.TerrainArea3D,{interactive:true})
  assert.match(plan,new RegExp(`aria-label="架台 ${rack.id} を戻す"`))
  assert.match(model,new RegExp(`data-terrain-rack="${rack.id}" data-rack-active="false"`))
  assert.match(model,new RegExp(`data-layout-modules="${pool.moduleCount-rack.moduleCount}"`))
  const report=render(figures.TerrainArea3D,{reportMode:true})
  assert.doesNotMatch(report,/data-terrain-rack|data-rack-active|を戻す/)
  assert.match(report,/data-layout-modules="0"/)
  assert.deepEqual(pool,original)
})

test('working fence is visible in plan and 3D without changing module geometry or fixed reports', () => {
  const analysis=fixture(),layout=buildTerrainLayout(analysis)
  const fence={heightM:1.2,truncated:false,posts:[{id:'p1',base:[5,5,100],top:[5,5,101.2]}],rails:[{id:'r1',points:[[5,5,101.2],[45,5,101.2]]}]}
  const original=structuredClone({analysis,layout,fence})
  for(const Component of [figures.TerrainAreaPlan,figures.TerrainArea3D]) {
    const html=renderToStaticMarkup(React.createElement(Component,{analysis,layout,fence}))
    assert.match(html,/data-terrain-fence="rail"/)
    if(Component===figures.TerrainArea3D) {
      assert.match(html,/data-terrain-fence="post"/)
      assert.match(html,new RegExp(`data-layout-modules="${layout.moduleCount}"`))
    }
    const report=renderToStaticMarkup(React.createElement(Component,{analysis,layout,fence,reportMode:true}))
    assert.doesNotMatch(report,/data-terrain-fence/)
  }
  assert.deepEqual({analysis,layout,fence},original)
})
test('calculation failures name the settings to review and provide the corresponding direct action', () => {
  const html=renderToStaticMarkup(React.createElement(errorNotice,{error:terrainLayoutErrorGuidance('calculation'),onConditions:()=>{},onRetry:()=>{}}))
  assert.match(html,/role="alert"/)
  assert.match(html,/架台左右の空き/)
  assert.match(html,/前後の空き/)
  assert.match(html,/端からの空き/)
  assert.match(html,/配置条件を開く/)
  assert.match(html,/再試行/)
  const load=renderToStaticMarkup(React.createElement(errorNotice,{error:terrainLayoutErrorGuidance('worker'),onRefresh:()=>{}}))
  assert.match(load,/画面を更新/)
  assert.doesNotMatch(load,/範囲を小さく/)
})
