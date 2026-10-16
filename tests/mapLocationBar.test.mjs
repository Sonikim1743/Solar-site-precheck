import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
let server,MapLocationBar
before(async()=>{server=await createServer({configFile:false,root:process.cwd(),cacheDir:'.vite/map-location-bar-tests',plugins:[react()],server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});MapLocationBar=(await server.ssrLoadModule('/src/components/MapLocationBar.jsx')).default},{timeout:30000})
after(async()=>{await server?.close()})
test('Google Maps remains an explicit enabled action for selected coordinates across address states',()=>{
 const position={lat:35.1234567,lon:135.7654321},googleMapsUrl='https://www.google.com/maps?q=35.123457,135.765432'
 for(const placeStatus of ['idle','loading','success','error']){
  const html=renderToStaticMarkup(React.createElement(MapLocationBar,{position,placeStatus,placeLabel:placeStatus==='success'?'合成検証市':'',googleMapsUrl,elevation:{status:'success',value:276.9}}))
  const link=html.match(/<a\b[^>]*>[\s\S]*?<\/a>/)?.[0]||''
  assert.match(link,/Googleマップで開く/);assert.ok(link.includes(`href="${googleMapsUrl}"`));assert.match(link,/aria-disabled="false"/)
  assert.match(html,/276.9 m/);assert.match(html,/北緯/);assert.match(html,/東経/)
 }
})
test('without selected coordinates the Maps action stays visible with an explicit disabled state and no destination',()=>{
 const html=renderToStaticMarkup(React.createElement(MapLocationBar,{position:null,googleMapsUrl:''})),link=html.match(/<a\b[^>]*>[\s\S]*?<\/a>/)?.[0]||''
 assert.match(link,/Googleマップで開く/);assert.match(link,/aria-disabled="true"/);assert.match(link,/tabindex="-1"/);assert.match(link,/先に地点を選択/);assert.doesNotMatch(link,/href=/)
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
