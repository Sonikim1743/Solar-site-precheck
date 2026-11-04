import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {googleMapsLinks} from '../src/utils/locationLinks.js'
import {parseCoordinateLink} from '../src/utils/coordinateLink.js'
let server,MapLocationBar,TerrainAreaPanel
before(async()=>{server=await createServer({configFile:false,root:process.cwd(),cacheDir:'.vite/map-location-bar-tests',plugins:[react()],server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});MapLocationBar=(await server.ssrLoadModule('/src/components/MapLocationBar.jsx')).default;TerrainAreaPanel=(await server.ssrLoadModule('/src/components/TerrainAreaPanel.jsx')).default},{timeout:30000})
after(async()=>{await server?.close()})
test('Google Maps remains an explicit enabled action for selected coordinates across address states',()=>{
 const position={lat:35.1234567,lon:135.7654321},googleMapsUrl=googleMapsLinks(position).mapUrl.replaceAll('&','&amp;')
 for(const placeStatus of ['idle','loading','success','error']){
  const html=renderToStaticMarkup(React.createElement(MapLocationBar,{position,placeStatus,placeLabel:placeStatus==='success'?'合成検証市':'',googleMapsUrl,elevation:{status:'success',value:276.9}}))
  const link=html.match(/<a\b[^>]*>[\s\S]*?<\/a>/)?.[0]||''
  assert.match(link,/Googleマップで見る/);assert.ok(link.includes(`href="${googleMapsUrl}"`));assert.match(link,/aria-disabled="false"/)
  assert.match(html,/276.9 m/);assert.match(html,/北緯/);assert.match(html,/東経/)
 }
})
test('without selected coordinates the Maps action stays visible with an explicit disabled state and no destination',()=>{
 for(const position of [null,{lat:NaN,lon:133},{lat:91,lon:133},{lat:'34',lon:133}]){
  const html=renderToStaticMarkup(React.createElement(MapLocationBar,{position,googleMapsUrl:'https://untrusted.example/'})),links=html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g)||[]
  assert.equal(links.length,3)
  for(const link of links){assert.match(link,/aria-disabled="true"/);assert.match(link,/tabindex="-1"/);assert.match(link,/先に/);assert.doesNotMatch(link,/href=/)}
 }
})

test('all three external actions use safe native new tabs, with manual MAPCODE and imagery guidance',()=>{
 const position=Object.freeze({lat:34.4089,lon:133.2049}),html=renderToStaticMarkup(React.createElement(MapLocationBar,{position,googleMapsUrl:'javascript:alert(1)'})),links=html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g)||[]
 assert.equal(links.length,3)
 for(const link of links){assert.match(link,/target="_blank"/);assert.match(link,/rel="noopener noreferrer"/);assert.match(link,/aria-disabled="false"/);assert.doesNotMatch(link,/onclick=/i)}
 assert.match(html,/Googleマップで見る/);assert.match(html,/Googleストリートビューで見る/);assert.match(html,/MAPCODE確認（Mapion）/)
 assert.match(html,/画像がない場合があります/);assert.match(html,/＋便利ツール → 地図URL/);assert.match(html,/中心点のMAPCODE/);assert.match(html,/自動変換・自動コピーは未対応/)
 assert.doesNotMatch(html,/javascript:|<iframe\b|<img\b|<link\b|<script\b/i)
})

test('degree-minute and decimal copy remain distinct actions and render success or failure feedback',()=>{
 const props={position:{lat:34.4089,lon:133.2049},onCopy(){},onCopyDecimal(){}}
 const html=renderToStaticMarkup(React.createElement(MapLocationBar,props))
 for(const label of ['緯度・経度（度・分）をコピー','緯度・経度（十進度）をコピー']){
  const button=html.match(new RegExp(`<button[^>]*aria-label="${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"[^>]*>`))?.[0]||''
  assert.ok(button);assert.doesNotMatch(button,/disabled/)
 }
 for(const copyStatus of ['緯度・経度（十進度）をコピーしました。','コピーできませんでした。34.4089, 133.2049']){
  const statusHtml=renderToStaticMarkup(React.createElement(MapLocationBar,{...props,copyStatus}))
  assert.ok(statusHtml.includes(copyStatus));assert.match(statusHtml,/role="status"/)
 }
})

test('MAPCODE help uses an explicit keyboard button and a hidden controlled note, with no standalone details row',()=>{
 const html=renderToStaticMarkup(React.createElement(MapLocationBar,{position:{lat:34.4089,lon:133.2049}}))
 const toggle=html.match(/<button\b[^>]*class="mapcode-help-toggle"[^>]*>/)?.[0]||''
 assert.match(toggle,/type="button"/)
 assert.match(toggle,/aria-label="MAPCODEの確認方法"/)
 assert.match(toggle,/aria-expanded="false"/)
 const controls=toggle.match(/aria-controls="([^"]+)"/)?.[1]
 assert.ok(controls)
 const note=html.match(/<p\b[^>]*class="mapcode-help"[^>]*>/)?.[0]||''
 assert.ok(note.includes(`id="${controls}"`))
 assert.match(note,/role="note"/);assert.match(note,/hidden=""/)
 assert.doesNotMatch(html,/<details\b|<summary\b/)
 assert.match(html,/role="group" aria-label="座標のコピー"/)
 assert.match(html,/role="status"/)
})

test('coordinate entry renders an empty terrain review with a drawing action, never an invented boundary or analysis',()=>{
 const entry=parseCoordinateLink('?lat=34.4089&lon=133.2049'),html=renderToStaticMarkup(React.createElement(TerrainAreaPanel,{position:entry.position,geometry:null,onDrawBoundary(){}}))
 assert.match(html,/地図で範囲を描き/);assert.match(html,/>範囲を描く<\/button>/)
 assert.doesNotMatch(html,/class="terrain-area-summary"|地形の見方|>再取得<\/button>/)
})

test('reset action distinguishes selection clearing from the explicit map reset',()=>{
 const props={onResetWorkspace:()=>{}}
 const first=renderToStaticMarkup(React.createElement(MapLocationBar,props))
 const next=renderToStaticMarkup(React.createElement(MapLocationBar,{...props,resetMapNext:true}))
 assert.match(first,/選択と分析結果をクリア（地図位置・縮尺は保持）/)
 assert.match(first,/>初期化<\/button>/)
 assert.match(next,/地図を初期位置・縮尺に戻す/)
 assert.match(next,/<span>地図位置を<span class="map-reset-label-end">リセット<\/span><\/span><\/button>/)
})
