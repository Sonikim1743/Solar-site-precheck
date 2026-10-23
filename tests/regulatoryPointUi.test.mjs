import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {REGULATORY_REFERENCE_SOURCES} from '../src/utils/regulatoryRegistry.js'
import {HAZARD_LAYERS} from '../src/utils/regulatoryLayers.js'
let server,Inspector,Results
before(async()=>{
  server=await createServer({configFile:false,root:process.cwd(),plugins:[react()],server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',logLevel:'error',optimizeDeps:{disabled:true}})
  const module=await server.ssrLoadModule('/src/components/RegulatoryPointInspector.jsx')
  Inspector=module.default;Results=module.RegulatoryPointResults
},{timeout:30000})
after(async()=>{await server?.close()})
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props))
const position={lat:35,lon:130}
test('closed panel is hidden; unselected point gives guidance only',()=>{
  const closed=render(Inspector,{settings:{enabled:true},position,id:'point-panel'})
  assert.match(closed,/<section[^>]*hidden=""/)
  assert.doesNotMatch(closed,/この地点の区域を確認/)
  const unselected=render(Inspector,{open:true,settings:{enabled:true},position:null})
  assert.match(unselected,/先に住所検索または地図で地点を選択/)
  assert.doesNotMatch(unselected,/<details|再確認|北緯/)
  const enabled=render(Inspector,{open:true,settings:{enabled:true},position})
  assert.doesNotMatch(enabled,/<section[^>]*hidden/);assert.match(enabled,/再確認/);assert.match(enabled,/ONの資料/);assert.match(enabled,/北緯 35度/);assert.match(enabled,/東経 130度/)
})
test('OFF and drawing remain distinct; close preserves display and values',()=>{
  const off=render(Inspector,{open:true,settings:{enabled:false},position})
  assert.match(off,/区域表示はOFF/);assert.doesNotMatch(off,/>再確認</)
  const drawing=render(Inspector,{open:true,settings:{enabled:true},position,isDrawing:true})
  assert.match(drawing,/<button[^>]*disabled=""[^>]*>再確認/)
  assert.match(drawing,/区域の説明を閉じる（区域表示は維持）/)
  assert.match(drawing,/作図を終えてから/)
})
test('enabled source list is distinct from point matches and old farmland opt in',()=>{
  const base=render(Inspector,{open:true,settings:{enabled:true},position})
  assert.match(base,/地点で重なる区域は下の照合結果と区別/);assert.match(base,/古い農用地区域：OFF/)
  assert.equal((base.match(/<li>/g)||[]).length,8)
  const historic=render(Inspector,{open:true,settings:{enabled:true},position,includeHistorical:true})
  assert.equal((historic.match(/<li>/g)||[]).length,10)
})
test('all multiple matches, plain imported attributes, uncertainty and source dates visible',()=>{
  const source=REGULATORY_REFERENCE_SOURCES[0]
  const html=render(Results,{result:{references:[{source,state:'matched',matches:[{id:'a',name:'合成遺跡A',kind:'散布地',sourceRecordId:'1',condition:'調査後一部消滅'},{id:'b',name:'<script>alert(1)</script>',kind:'石造物',era:'古墳',sourceRecordId:'2',boundary:true,remark:'元位置不明',description:'原資料概要'}]}],hazards:{region:{state:'ready',name:'岡山県'},layers:[{layer:HAZARD_LAYERS[0],state:'nodata',message:'透明画素・NoData'},{layer:HAZARD_LAYERS[1],state:'unavailable',message:'404・未確認'}]}}})
  for(const value of ['参考図形 2件','合成遺跡A','&lt;script&gt;','図形境界上','2026-04-06','2026-10-19','原本未記載・未確定','CC BY','透明画素・NoData','404・資料未提供等','開発不可の一括判定ではありません','地点の結果は敷地全体の判定ではありません','原資料の残存記載：調査後一部消滅','原資料の備考：元位置不明','原資料の概要：原資料概要','現況未確認'])assert.ok(html.includes(value),value)
  assert.doesNotMatch(html,/<script>/)
  const primary=html.slice(0,html.indexOf('<details class="point-zone-all-details"'))
  assert.match(primary,/この地点に重なる区域/);assert.match(primary,/文化財/);assert.match(primary,/重なり2件/);assert.match(primary,/次に：/)
  assert.doesNotMatch(primary,/EPSG|原本行|レコードID|zip|2026-04-06/)
  assert.match(html,/<details class="point-zone-all-details"><summary>出典・基準日・詳しい内容/)
})
test('agricultural region and historical agricultural-use retain distinct meaning and years',()=>{
  const sources=REGULATORY_REFERENCE_SOURCES.filter(s=>s.id==='okayama-agriculture'||s.id==='a12-34-06')
  const html=render(Results,{result:{references:sources.map(source=>({source,state:'matched',matches:[{id:source.id,name:'合成範囲',kind:source.category,sourceYear:source.historic?'2002':null,sourceRecordId:'1'}]})),hazards:{region:{state:'error'},layers:[]}}})
  for(const value of ['農用地区域・地目とは区別','この図形の原資料 2002年','ファイル版 2015年','JGD2000（EPSG:4612）','古い原資料','原資料年・地物更新日未確認'])assert.ok(html.includes(value),value)
})
test('failed vector/raster retrieval remains visibly different from NoData and 404',()=>{
  const source=REGULATORY_REFERENCE_SOURCES[0]
  const html=render(Results,{result:{references:[{source,state:'error',matches:[],failures:[{url:'/synthetic.json',message:'参考資料 HTTP 503'}]}],hazards:{region:{state:'error'},layers:[{layer:HAZARD_LAYERS[0],state:'error',message:'通信失敗'},{layer:HAZARD_LAYERS[1],state:'unavailable',message:'配信404'},{layer:HAZARD_LAYERS[2],state:'nodata',message:'透明画素'}]}}})
  for(const value of ['取得・判読失敗／未確認','参考資料 HTTP 503','通信失敗','404・資料未提供等','透明画素・NoData','未収録資料や現行指定の有無は未確認'])assert.ok(html.includes(value),value)
  assert.doesNotMatch(html,/安全です|規制なしです/)
})
test('stored hazard result retains original attributes, source date and unknown states',()=>{
  const source={id:'soil-34',category:'soil',sourceDate:'2025-07-24',sourceCrs:{name:'JGD2011',epsg:6668},geometryCounts:{LineString:1},recordCount:10,archive:'synthetic.zip',attribution:'土砂災害ポータルひろしま・DoboX',license:'CC BY 4.0',notes:'概略参考図・境界未確定',sourceUrl:'https://nlftp.mlit.go.jp/ksj/'}
  const html=render(Results,{result:{references:[],hazards:{mode:'stored',region:{state:'ready',name:'広島県'},collectedAt:'2026-10-23',datasets:[{source,state:'error',lineCandidates:1,failures:[{url:'synthetic.gz',message:'保存資料 HTTP 404・未確認'}],matches:[{id:'x',name:'合成区域',kind:'土石流',designation:'指定前・基礎調査公表',date:'2007-03-06',properties:{A33_005:'<script>原本</script>'}}]}]}}})
  for(const value of ['保存ハザード：地点の面照合','取得・判読失敗／未確認','2025-07-24','EPSG:6668','指定前・基礎調査公表','保存資料 HTTP 404・未確認','線から面を補間せず','土砂災害ポータルひろしま・DoboX','&lt;script&gt;原本&lt;/script&gt;','空白・重なり未検出・取得失敗は安全'])assert.ok(html.includes(value),value)
  assert.doesNotMatch(html,/<script>|地点画素の確認結果/)
})
