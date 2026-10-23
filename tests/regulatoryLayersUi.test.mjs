import test, {before,after} from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {initialHazardSettings,hazardStatus} from '../src/utils/regulatoryLayers.js'
let server,Controls,Toggle,Summary
before(async()=>{
  server=await createServer({configFile:false,root:process.cwd(),plugins:[react()],server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',logLevel:'error',optimizeDeps:{disabled:true}})
  const module=await server.ssrLoadModule('/src/components/MapRegulatoryControls.jsx')
  Controls=module.default;Toggle=module.RegulatoryToggle;Summary=module.MapHazardSummary
},{timeout:30000})
after(async()=>{await server?.close()})
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props))
test('one visible master button, details collapsed and no array of type switches',()=>{
  const button=render(Toggle,{enabled:false,onToggle(){}})
  assert.match(button,/aria-pressed="false"/);assert.match(button,/>検討区域 OFF/)
  assert.match(render(Toggle,{enabled:true,onToggle(){}}),/>検討区域 ON/)
  const html=render(Controls,{settings:initialHazardSettings(),onChange(){}})
  assert.doesNotMatch(html,/type="checkbox"|<select|<details[^>]* open/)
  assert.match(html,/OFF（未照会）/);assert.match(html,/未対応あり/)
  assert.equal((html.match(/公式凡例/g)||[]).length,4)
})
test('one compact split control keeps display toggle distinct from disclosure',()=>{
  const html=render(Toggle,{enabled:true,onToggle(){},detailsOpen:false,onDetailsToggle(){},detailsId:'point-panel'})
  assert.match(html,/aria-label="除外検討区域" aria-pressed="true"/)
  assert.match(html,/aria-label="区域の説明" aria-expanded="false" aria-controls="point-panel"/)
  assert.equal((html.match(/<button/g)||[]).length,2)
  assert.match(render(Toggle,{enabled:false,onToggle(){},detailsOpen:true,onDetailsToggle(){},detailsId:'point-panel'}),/aria-expanded="true"/)
})
test('licensing, dates and regional limits remain accessible without pretending empty data is safe',()=>{
  const html=render(Controls,{settings:{enabled:true,opacity:.5},region:{state:'ready',prefecture:'34',name:'広島県'},onChange(){}})
  for(const text of ['2015','1:50,000','農業振興地域全体と農用地区域','CC-BY-NC-ND','2025-07-24','2025-08-01','2026-08-06','原典時点は河川別','営利利用禁止','未確認','県境外','42都道府県','土砂災害ポータルひろしま','DoboX','2002年 2832件'])assert.ok(html.includes(text),text)
  assert.match(html,/岡山の正規公開図形を参考表示/);assert.match(html,/自動除外・法的判断には使いません/)
  assert.doesNotMatch(html,/規制なしです|危険なしです|安全です/)
})
test('compact summary distinguishes failures, 404 and OFF; PDF/DXF output remains explicit',()=>{
  assert.equal(render(Summary,{settings:initialHazardSettings()}),'')
  for(const state of ['error','unavailable','ready']){
    const html=render(Summary,{settings:{enabled:true},statuses:{flood:hazardStatus([state])},region:{state:'wide'}})
    assert.ok(html.includes(hazardStatus([state]).message));assert.match(html,/PDF・DXF出力対象外/);assert.match(html,/文化財は岡山/)
  }
})
test('new permitted-data candidate stays distinct from downloaded data and feature update dates',()=>{
  const html=render(Controls,{settings:initialHazardSettings(),onChange(){}})
  for(const value of ['農業振興地域_2016-2020','資源作成日2023-09-19','ポータル掲載日2025-12-02は地物更新日ではありません','PDL1.0','原本ファイルを未取得','座標系','BIKOU','農用地区域の有無','https://www.okayama-opendata.jp/datasets/2875','GISの規約を別の公開データへ一律適用しません'])assert.ok(html.includes(value),value)
  assert.doesNotMatch(html,/農用地区域の確定境界を取得済み|全県禁止/)
})
