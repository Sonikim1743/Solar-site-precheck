export const HAZARD_TILE_ORIGIN = 'https://disaportaldata.gsi.go.jp'
export const HAZARD_SOURCE = 'https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html'
export const HAZARD_TERMS = 'https://disaportal.gsi.go.jp/hazardmap/copyright/copyright.html'
export const SOIL_SOURCE = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A33-2025.html'
export const HIROSHIMA_SOIL_METADATA = Object.freeze({permissionSource:'https://nlftp.mlit.go.jp/ksj/gml/codelist/A33_permision_R7.xlsx',permissionSha256:'5fb6cce7a63bb04c3b0e12d30aaa86106b7fd81b29468c86577f4179e550dc81',license:'CC BY',sourceDate:'2025-07-24',a33Date:'2025-08-01',gsiDate:'2026-08-06',attribution:'土砂災害ポータルひろしま、DoboX'})
const legend = name => `https://disaportal.gsi.go.jp/hazardmap/copyright/img/${name}.png`
export const HAZARD_LAYERS = Object.freeze([
  {id:'flood',name:'洪水（想定最大規模）',path:'01_flood_l2_shinsuishin_data',legend:legend('shinsui_legend3'),date:'原典時点は河川別・一律の基準日なし',coverage:'全国配信。ただし未整備・掲載対象外の河川等あり',source:HAZARD_SOURCE},
  {id:'debris',name:'土砂：土石流',path:'05_dosekiryukeikaikuiki_data',legend:legend('keikai_dosekiryu'),soil:true},
  {id:'steep',name:'土砂：急傾斜地の崩壊',path:'05_kyukeishakeikaikuiki_data',legend:legend('keikai_kyukeisya'),soil:true},
  {id:'landslide',name:'土砂：地すべり',path:'05_jisuberikeikaikuiki_data',legend:legend('keikai_jisuberi'),soil:true},
].map(layer=>Object.freeze({...layer,...(layer.soil?{date:'原典 2025-08-01 / GSI配信開始 2026-08-06',coverage:'選択した県のデータのみ。県境外・未指定・未整備は未確認',source:SOIL_SOURCE}:{}),checkedAt:'2026-10-21'})))
const names='北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ')
// Hiroshima additionally verified against the current permission table C25/C63/C92.
// The five other unverified releases remain blocked.
const conditional = new Set(['14','26','30','31','42'])
export const SOIL_PREFECTURES = Object.freeze(names.map((name,i)=>Object.freeze({code:String(i+1).padStart(2,'0'),name,allowed:!conditional.has(String(i+1).padStart(2,'0'))})))
export const soilPrefecture = code => SOIL_PREFECTURES.find(p=>p.code===code&&p.allowed) || null
export const initialHazardSettings = () => ({enabled:false,opacity:.5})
export function changeHazardSettings(previous, patch) {
  return {enabled:typeof patch.enabled==='boolean'?patch.enabled:previous.enabled,
    opacity:Number.isFinite(patch.opacity)?Math.max(.1,Math.min(1,patch.opacity)):previous.opacity}
}
export function hazardRegionFromAddress(address) {
  const code=String(address?.muniCd||'').slice(0,2)
  const prefecture=SOIL_PREFECTURES.find(p=>p.code===code)
  return prefecture?{state:prefecture.allowed?'ready':'unsupported',prefecture:code,name:prefecture.name}:{state:'unavailable',prefecture:''}
}
export function hazardRegionMessage(region={}) {
  if(region.stored)return region.state==='ready'?`保存ハザード：地図中心 ${region.name}（N03 2025行政境界）。地点の重なりは説明で個別確認。`:`保存ハザード：対象県未確定・表示なし。${region.message||'取得・境界を確認してください。'}`
  return ({ready:`土砂：地図中心の${region.name}のみ（県境外は未確認）`,unsupported:`土砂：${region.name}は個別利用条件未確認のため未対応`,wide:'土砂：拡大すると地図中心の対象県を自動確認',loading:'土砂：対象県を確認中',error:'土砂：対象県の取得失敗・表示なし',unavailable:'土砂：対象県未確認・表示なし',idle:'土砂：対象県未確認・表示なし'})[region.state||'idle']
}
export function hazardTileUrl(id, coords, prefecture='') {
  const layer=HAZARD_LAYERS.find(l=>l.id===id),{x,y,z}=coords||{}
  if(!layer||![x,y,z].every(Number.isInteger)||z<2||z>17||x<0||y<0||x>=2**z||y>=2**z)throw new Error('ハザードのタイル指定が不正です。')
  if(layer.soil&&!soilPrefecture(prefecture))throw new Error('土砂の対象県は利用条件を確認した県を選択してください。')
  return `${HAZARD_TILE_ORIGIN}/raster/${layer.path}/${layer.soil?prefecture+'/':''}${z}/${x}/${y}.png`
}
export function hazardStatus(states=[]) {
  const count=key=>states.filter(s=>s===key).length
  const counts={loading:count('loading'),ready:count('ready'),unavailable:count('unavailable'),error:count('error')}
  const state=counts.loading?'loading':counts.error?'error':counts.unavailable?(counts.ready?'partial':'unavailable'):counts.ready?'ready':'idle'
  const message={loading:'タイルを取得中',error:'取得失敗（通信・形式・サーバー等）。範囲は未確認',unavailable:'タイル未提供等（404）。未整備かどうかも要確認',partial:'一部タイル未提供等（404）。範囲は未確認',ready:'画像取得済み。白色・透明部分の安全性は未確認',idle:'表示範囲のタイルは未確認',off:'OFF（未照会）'}[state]
  return {state,message,...counts}
}
export const REGULATORY_UNSUPPORTED = Object.freeze({
  culture:{title:'文化財の未対応地域',message:'岡山の正規公開図形を参考表示。岡山以外は今回の形状取得・利用条件確認の対象外です。',notes:'埋蔵文化財包蔵地と指定史跡は別です。未記載も未確認であり、重なりだけで開発禁止と判断しません。GISの規約を別の公開データへ一律適用しません。',scopeNote:'岡山の別カタログ2875と今回取得した専用GIS原本60を区別します。',links:[['広島県の当該文化財地図（取得情報の営利利用禁止）','https://www.pref.hiroshima.lg.jp/site/bunkazai/bunkazai-map-map.html'],['岡山の別カタログ（今回の取得原本とは別）','https://www.okayama-opendata.jp/datasets/2875'],['山口県の当該GeoJSON（CC-BY-NC-ND・取り込みなし）','https://yamaguchi-opendata.jp/ckan/dataset/iseki-test']]},
  agriculture:{title:'農地の現行境界・未対応資料',message:'岡山の農業地域と広島・山口の古いA12参考図形を表示。現在の農用地区域の確定境界は取得していません。',notes:'農業地域・農業振興地域全体と農用地区域は区別します。A12は2015ファイル版の約1:50,000資料ですが、原資料年は2002/2005等です。岡山A12の非商用条件を他県や別の再利用資料へ一律適用しません。',scopeNote:'北広島町「農業振興地域_2016-2020」は別の候補。資源作成日2023-09-19・ポータル掲載日2025-12-02は地物更新日ではありません。PDL1.0・営利利用可との公開案内あり。原本ファイルを未取得で、座標系・BIKOU・農用地区域の有無は未確認です。',links:[['北広島町の別候補KMZ（今回未取得）','https://hiroshima-dobox.jp/resources/50829'],['国土数値情報A12（県別の個別条件を確認）','https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A12.html']]},
})
