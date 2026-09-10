import {useEffect,useMemo,useRef,useState} from 'react'
import {MapContainer,TileLayer,CircleMarker,Tooltip,Polyline,ScaleControl,LayersControl,useMap,Circle} from 'react-leaflet'
import {PowerGridOverlay} from './MapPanel.jsx'
import GridEquipmentDetails from './GridEquipmentDetails.jsx'
import GenerationPanel from './GenerationPanel.jsx'
import {filterPowerGridView} from '../services/powerGridView.js'
import {resolvePowerGridIdentities} from '../services/powerGridIdentity.js'
import {buildGridReview,gridDistance,gridRecordKey,gridReviewNote} from '../services/gridReview.js'
import {capacityValueStatusLabel} from '../services/gridCapacity.js'
import {CHUGOKU_GRID_AREAS,CHUGOKU_GRID_SOURCE_PAGE,findChugokuGridAreaByAddress} from '../services/chugokuGridSources.js'
import './grid-capacity-explorer.css'
import './power-grid-page.css'
const pointOf=item=>item?.nearestPoint||item?.position
const statusLabel=row=>row.status==='number'?'設備番号一致':row.status==='candidate'?'名称候補あり':'公式設備は未照合'
function FitGrid({position,data,selected,fitKey}){
 const map=useMap()
 useEffect(()=>{
  const target=pointOf(selected)
  if(position&&target)map.fitBounds([[position.lat,position.lon],[target.lat,target.lon]],{padding:[55,55],maxZoom:15})
  else if(position){const dy=Math.max(1000,data?.radiusMeters||10000)/111320,dx=dy/Math.cos(position.lat*Math.PI/180);map.fitBounds([[position.lat-dy,position.lon-dx],[position.lat+dy,position.lon+dx]],{padding:[25,25]})}
  map.invalidateSize()
 },[map,position,data?.radiusMeters,selected,fitKey])
 return null
}
export default function PowerGridPage({position,placeLabel,powerGrid,gridCapacity,onCheck,onLoadCapacity,onBack,onReport,annualYield='',generation=null,onGenerationChange}){
 const [selectedId,setSelectedId]=useState(''),[official,setOfficial]=useState(null),[tab,setTab]=useState('nearby'),[kind,setKind]=useState('all'),[query,setQuery]=useState('')
 const [areaId,setAreaId]=useState(()=>findChugokuGridAreaByAddress(placeLabel)?.id||''),[radius,setRadius]=useState(powerGrid.data?.radiusMeters||10000),[voltage,setVoltage]=useState('all'),[showNames,setShowNames]=useState(false),[fitKey,setFitKey]=useState(0),[noteStatus,setNoteStatus]=useState('')
 const attempted=useRef(''),siteKey=position?position.lat+','+position.lon:''
 useEffect(()=>{if(gridCapacity.status==='idle')onLoadCapacity()},[gridCapacity.status,onLoadCapacity])
 useEffect(()=>{if(siteKey&&powerGrid.status==='idle'&&attempted.current!==siteKey){attempted.current=siteKey;onCheck({radiusMeters:10000})}},[siteKey,powerGrid.status,onCheck])
 useEffect(()=>{setSelectedId('');setOfficial(null);setQuery('');setNoteStatus('');setAreaId(findChugokuGridAreaByAddress(placeLabel)?.id||'')},[siteKey,placeLabel])
 const data=useMemo(()=>resolvePowerGridIdentities(powerGrid.data,gridCapacity.data),[powerGrid.data,gridCapacity.data])
 const visibleData=useMemo(()=>filterPowerGridView(data,{min:voltage==='66-77'?66:0,max:voltage==='66-77'?77:voltage==='under110'?110:1000,unknown:voltage!=='66-77',showLines:kind!=='substation',showSubstations:kind!=='line'}),[data,voltage,kind])
 const allRows=useMemo(()=>buildGridReview(visibleData,gridCapacity.data),[visibleData,gridCapacity.data])
 const rows=allRows.filter(row=>!query||[row.equipment.name,row.equipment.ref,row.equipment.id].join(' ').toLowerCase().includes(query.toLowerCase()))
 const selected=allRows.find(row=>row.equipment.id===selectedId)
 const safeMatches=useMemo(()=>({lineMatches:allRows.filter(row=>row.kind==='line'&&row.capacity).map(row=>({source:row.equipment,capacity:row.capacity,match:row.match})),substationMatches:allRows.filter(row=>row.kind==='substation'&&row.capacity).map(row=>({source:row.equipment,capacity:row.capacity,match:row.match}))}),[allRows])
 const officialRows=useMemo(()=>[...(gridCapacity.data?.lines||[]),...(gridCapacity.data?.substations||[])].filter(row=>(!areaId||row.areaId===areaId)&&(kind==='all'||row.type===kind)&&(!query||[row.name,row.no,row.flowDirection].join(' ').toLowerCase().includes(query.toLowerCase()))),[gridCapacity.data,areaId,kind,query])
 const record=official||selected?.capacity,targetArea=CHUGOKU_GRID_AREAS.find(area=>area.id===areaId)
 function selectEquipment(payload){setSelectedId(payload.equipment.id);setOfficial(null);setNoteStatus('')}
 function onGeneration(){const panel=document.getElementById('generation-panel');if(panel){panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'start'})}}
 function saveNote(){const url=URL.createObjectURL(new Blob(['\uFEFF'+gridReviewNote({position,placeLabel,row:selected,official,annualYield,generation})],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='系統検討メモ.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNoteStatus('検討メモを保存しました')}
 return <section className="power-page" aria-label="系統確認マップ">
 <header className="power-page__header"><div><div className="power-page__eyebrow">候補地の事前検討 / 系統</div><h1>周辺の電力設備を確認</h1><p>{placeLabel||'候補地を選択してください'}{position&&<span className="power-page__coordinates">{position.lat.toFixed(5)}, {position.lon.toFixed(5)}</span>}</p></div><div className="power-page__actions"><button onClick={onBack}>候補地を変更</button><button disabled={!position} onClick={onReport}>レポートへ</button></div></header>
 <div className="power-page__toolbar"><label>周辺範囲<select value={radius} onChange={e=>setRadius(Number(e.target.value))}>{[5000,10000,20000,50000].map(value=><option key={value} value={value}>{value/1000} km</option>)}</select></label><button className="power-page__primary" disabled={!position||powerGrid.status==='loading'} onClick={()=>onCheck({radiusMeters:radius})}>{powerGrid.status==='loading'?'周辺設備を取得中…':data?'この範囲で再取得':'周辺設備を取得'}</button><label>送電線の表示電圧<select value={voltage} onChange={e=>setVoltage(e.target.value)}><option value="all">すべて・未記載を含む</option><option value="under110">110 kV以下・未記載</option><option value="66-77">66・77 kV</option></select></label><label className="power-page__check"><input type="checkbox" checked={showNames} onChange={e=>setShowNames(e.target.checked)}/>地図に名称を表示</label><button onClick={()=>{setSelectedId('');setFitKey(value=>value+1)}}>範囲全体を見る</button></div>
 {!position&&<div className="power-page__notice"><strong>候補地を選ぶと、周辺設備を距離順に確認できます。</strong><button onClick={onBack}>地図で候補地を選ぶ</button></div>}
 {powerGrid.status==='loading'&&<p className="power-page__notice" role="status">{powerGrid.message} 公式資料は右側で先に確認できます。</p>}
 {powerGrid.status==='error'&&<div className="power-page__notice power-page__notice--warning" role="alert"><strong>地図設備を取得できませんでした</strong><p>{powerGrid.message}</p><button onClick={()=>{setTab('official');setSelectedId('');setOfficial(null);setQuery('')}}>公式設備一覧を確認する</button></div>}
 {data&&<div className="power-page__summary" role="status"><span><strong>{allRows.length}</strong> 表示中の設備</span><span><strong>{allRows.filter(row=>row.capacity).length}</strong> 設備番号で照合</span><span>取得範囲 {Math.round(data.radiusMeters/1000)} km{radius!==data.radiusMeters&&' / 範囲変更は再取得で反映'}</span><span>取得 {data.fetchedAt?new Date(data.fetchedAt).toLocaleString('ja-JP'):'今回の検索'}</span></div>}
 <div className="power-page__workspace"><div className="power-page__map-wrap">
 <MapContainer center={position?[position.lat,position.lon]:[34.9,133.2]} zoom={11} className="power-page__map" scrollWheelZoom>
 <LayersControl position="topright"><LayersControl.BaseLayer checked name="標準地図"><TileLayer url="https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png" attribution="国土地理院" maxZoom={18}/></LayersControl.BaseLayer><LayersControl.BaseLayer name="航空写真"><TileLayer url="https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg" attribution="国土地理院" maxZoom={18}/></LayersControl.BaseLayer></LayersControl>
 <ScaleControl position="bottomleft" imperial={false}/><FitGrid position={position} data={data} selected={selected?.equipment} fitKey={fitKey}/>
 <PowerGridOverlay data={visibleData} capacityMatches={safeMatches} onEquipmentSelect={selectEquipment} showNames={showNames} compact/>
 {position&&<><Circle center={[position.lat,position.lon]} radius={data?.radiusMeters||radius} pathOptions={{color:'#336b8e',weight:1,dashArray:'5 6',fillOpacity:.025}}/><CircleMarker center={[position.lat,position.lon]} radius={8} pathOptions={{color:'white',weight:3,fillColor:'#c46b00',fillOpacity:1}}><Tooltip>候補地</Tooltip></CircleMarker></>}
 {position&&pointOf(selected?.equipment)&&<Polyline positions={[[position.lat,position.lon],[pointOf(selected.equipment).lat,pointOf(selected.equipment).lon]]} pathOptions={{color:'#344d65',dashArray:'5 7',weight:2}}><Tooltip permanent direction="center">{gridDistance(selected.equipment.distanceMeters)} / 直線距離</Tooltip></Polyline>}
 </MapContainer><div className="power-page__legend"><span>赤：110 kV以上 / 青・水色・緑：110 kV未満</span><span>灰：電圧未記載</span><span>紫：変電所</span><span>点線は直線距離。接続経路ではありません。</span></div></div>
 <aside className="power-page__inspector" aria-label="設備一覧と確認内容">
 <div className="power-page__tabs" role="tablist" aria-label="設備の探し方"><button role="tab" aria-selected={tab==='nearby'} onClick={()=>{setTab('nearby');setSelectedId('');setOfficial(null);setQuery('')}}>周辺設備 {allRows.length}</button><button role="tab" aria-selected={tab==='official'} onClick={()=>{setTab('official');setQuery('')}}>公式設備を探す</button></div>
 <div className="power-page__finder"><label>名称・設備番号<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setSelectedId('');setOfficial(null)}} placeholder={tab==='nearby'?'表示設備を絞り込む':'例：新見、岡⑤F3'}/></label><div className="power-page__filter-row"><label>種別<select value={kind} onChange={e=>{setKind(e.target.value);setSelectedId('');setOfficial(null)}}><option value="all">すべて</option><option value="line">送電線</option><option value="substation">変電所</option></select></label>{tab==='official'&&<label>公表地域<select value={areaId} onChange={e=>{setAreaId(e.target.value);setOfficial(null)}}><option value="">全収録地域</option>{CHUGOKU_GRID_AREAS.map(area=><option key={area.id} value={area.id}>{area.label}</option>)}</select></label>}</div></div>
 {tab==='official'&&<p className="power-page__hint">公式の名称・空容量を検索できます。地図上の位置・候補地との対応は未確認です。</p>}
 {gridCapacity.status==='error'&&<p className="power-page__hint" role="alert">公式DBを読み込めません。<button onClick={onLoadCapacity}>再読込</button></p>}
 {!(selected||official)&&<div className="power-page__list" aria-label={tab==='nearby'?'周辺設備の検索結果':'公式設備の検索結果'}>
 {tab==='nearby'?rows.map(row=><button key={row.equipment.id} className={'power-page__equipment'+(selected?.equipment.id===row.equipment.id&&!official?' is-selected':'')} onClick={()=>selectEquipment(row)}><span className="power-page__equipment-top"><span>{row.kind==='line'?'送電線':'変電所'}</span><strong>{gridDistance(row.equipment.distanceMeters)}</strong></span><b>{row.equipment.name}</b><span>{row.equipment.voltageLabel||'電圧未記載'}{row.equipment.direction?' / '+row.equipment.direction+'側':''}</span><span className={'power-page__badge '+row.status}>{statusLabel(row)}</span></button>):
 officialRows.slice(0,80).map(row=><button key={gridRecordKey(row)} className={'power-page__equipment'+(official&&gridRecordKey(official)===gridRecordKey(row)?' is-selected':'')} onClick={()=>{setOfficial(row);setSelectedId('');setNoteStatus('')}}><span className="power-page__equipment-top"><span>{row.type==='line'?'送電線':'変電所'} / {row.no}</span><strong>{row.voltageKv??'—'} kV</strong></span><b>{row.name}</b><span>公表空容量 {capacityValueStatusLabel(row.availableCapacityMw)}</span><span>{row.areaLabel} / {row.updatedAt}</span></button>)}
 {tab==='nearby'&&!rows.length&&<div className="power-page__empty"><strong>{powerGrid.status==='loading'?'周辺設備を探しています':data?'この表示条件の設備はありません':'地図設備はまだありません'}</strong><p>公式資料の名称・設備番号からも確認できます。</p><button onClick={()=>{setTab('official');setQuery('')}}>公式設備を探す</button></div>}
 {tab==='official'&&!officialRows.length&&<p className="power-page__empty">{gridCapacity.status==='loading'?'公式DBを読み込み中…':'一致する設備がありません。地域・検索語を変更してください。'}</p>}
 {tab==='official'&&officialRows.length>80&&<p className="power-page__hint">{officialRows.length}件中80件を表示。名称・番号で絞り込めます。</p>}</div>}
 {(selected||official)&&<section className="power-page__detail" aria-label="選択した設備"><div className="power-page__detail-heading"><span>選択した設備の確認内容</span><button onClick={()=>{setSelectedId('');setOfficial(null)}} aria-label="設備一覧へ戻る">← 一覧へ</button></div><h2>{official?.name||selected?.equipment.name}</h2>{selected&&<p>{gridDistance(selected.equipment.distanceMeters)} / 候補地からの直線距離</p>}
 {!selected?.capacity&&<div className="power-page__notice power-page__notice--warning"><strong>{official?'地図との対応は未確認':'公式設備との照合が必要です'}</strong><p>{selected?.candidates.length?'似た名称の公表設備がありますが、同一設備とは確定できません。':'距離や位置だけで設備名・接続先を決めることはできません。'}</p>{selected&&<button onClick={()=>{setTab('official');setSelectedId('');setQuery(selected.equipment.ref||(selected.equipment.name.includes('未記載')?'':selected.equipment.name))}}>公表資料で調べる</button>}</div>}
 {record&&<GridEquipmentDetails record={record} compact/>}{selected&&<p className="power-page__source"><a target="_blank" rel="noreferrer" href={'https://www.openstreetmap.org/'+selected.equipment.id}>地図の登録情報を見る</a><span>{selected.equipment.id}</span></p>}
 <button className="power-page__primary" onClick={saveNote}>設備確認メモを保存</button>{noteStatus&&<p role="status">{noteStatus}</p>}</section>}
 <div className="power-page__official-links"><a href={targetArea?.mappingUrl||CHUGOKU_GRID_SOURCE_PAGE} target="_blank" rel="noreferrer">公式の系統図</a><a href={targetArea?.pdfUrl||CHUGOKU_GRID_SOURCE_PAGE} target="_blank" rel="noreferrer">空容量・予想潮流の資料</a><small>中国電力NW / {gridCapacity.data?.areas?.find(area=>area.id===areaId)?.updatedAt||'更新日は各設備に表示'}</small></div></aside></div>
 <section className="power-page__handoff"><div><span className="power-page__eyebrow">次の検討</span><h2>発電量と接続条件を、一つの候補地で確認</h2><p>発電量は「どれだけ発電するか」、系統は「どこへ・どの条件で接続するか」。公表空容量から出力制御率は計算しません。</p>{generation?<strong>参考年間発電量 {Math.round(generation.annualKwh).toLocaleString('ja-JP')} kWh</strong>:annualYield?<strong>Solar Pro年間発電量（入力値） {annualYield}</strong>:<span>発電量はまだ計算・入力されていません。</span>}</div><div className="power-page__actions"><button onClick={onGeneration||onBack} disabled={!position}>この地点の発電量を確認</button><button onClick={onReport} disabled={!position}>レポートで整理</button></div></section>
 <GenerationPanel key={siteKey} position={position} result={generation} onChange={onGenerationChange} annualYield={annualYield}/><p className="power-page__footnote">地図：OpenStreetMap・国土地理院。未登録の設備は表示されません。空容量は公表時点の参考情報で、接続可否・工事費・工期は電力会社への確認が必要です。</p>
 </section>
}
