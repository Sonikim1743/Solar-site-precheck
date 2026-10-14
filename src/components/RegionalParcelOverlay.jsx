import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { createRegionalParcelLoader, parcelCandidates } from '../services/regionalParcels.js'
import { featureInteriorPoint } from '../services/parcelGeometry.js'

const sharedLoader=createRegionalParcelLoader()
export default function RegionalParcelOverlay(props) {
  const map=useMap(),latest=useRef(props),refresh=useRef(null),loader=useRef(null)
  latest.current=props
  if(!loader.current)loader.current=sharedLoader
  useEffect(()=>{
    const pane=map.getPane('regionalParcelSelection')||map.createPane('regionalParcelSelection');pane.style.zIndex='450'
    const group=L.layerGroup().addTo(map)
    let active=true,ticket=0,controller,data,timer
    const attribution='<a href="https://www.geospatial.jp/ckan/dataset/aigid-moj-33209" target="_blank" rel="noopener noreferrer">選択用地番2024：法務省 / AIGID変換（高梁市・原本由来）</a>'
    map.attributionControl.addAttribution(attribution)
    const status=(state,message)=>active&&latest.current.onStatus?.({state,message})
    function render(){
      const focus=document.activeElement?.getAttribute('data-regional-parcel-id')
      group.clearLayers()
      if(!data?.coverage || map.getZoom()<16)return
      const selected=new Set(latest.current.draft.map(f=>f.id)),drawing=['boundary','exclusion'].includes(latest.current.mode)
      const b=map.getBounds(),features=data.features.filter(f=>f.bbox[0]<=b.getEast()&&f.bbox[2]>=b.getWest()&&f.bbox[1]<=b.getNorth()&&f.bbox[3]>=b.getSouth()),visible=features.slice(0,800)
      for(const f of visible){
        const chosen=selected.has(f.id),layer=L.geoJSON(f,{pane:'regionalParcelSelection',bubblingMouseEvents:drawing,interactive:!drawing,style:{color:f.selectionError?'#eea083':chosen?'#ffdc62':'#b6ffff',weight:chosen?3:1.4,dashArray:f.selectionError?'4 3':undefined,fillColor:chosen?'#ffe26c':'#225b57',fillOpacity:chosen ? .3 : .06}})
        const name=`${f.properties['地番']} · ${f.properties['地図名']}`
        const text=document.createElement('span');text.textContent=name+(f.selectionError?'（形状確認必要・選択不可）':'');layer.bindTooltip(text,{sticky:true,className:'parcel-tooltip'})
        layer.on('click',e=>{
          const current=latest.current
          if(current.locked||['boundary','exclusion'].includes(current.mode))return
          if(e.originalEvent)L.DomEvent.stop(e.originalEvent)
          if(f.selectionError)return current.onError?.(`地番 ${f.properties['地番']} は原本形状の確認が必要です。${f.selectionError} 修復や代替形状は作成しません。`)
          const candidates=e.latlng?parcelCandidates(data.features,e.latlng):[f]
          if(candidates.length>1)return current.onCandidates?.(candidates)
          current.onToggle?.(f)
        })
        group.addLayer(layer)
        layer.eachLayer(path=>{const el=path.getElement?.();if(!el||drawing)return;el.setAttribute('tabindex','0');el.setAttribute('role','button');el.setAttribute('data-regional-parcel-id',f.id);el.setAttribute('aria-label',`地番 ${name}を${chosen?'解除':'選択'}`);el.setAttribute('aria-pressed',String(chosen));el.setAttribute('aria-disabled',String(Boolean(f.selectionError)));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();layer.fire('click',{originalEvent:e})}});if(f.id===focus)el.focus({preventScroll:true})})
        if(visible.length<=100&&map.getZoom()>=18){const p=featureInteriorPoint(f);if(p){const label=document.createElement('span');label.textContent=String(f.properties['地番']);group.addLayer(L.circleMarker([p.lat,p.lon],{radius:0,interactive:false}).bindTooltip(label,{permanent:true,direction:'center',className:'parcel-tooltip'}))}}
      }
      const invalid=features.filter(f=>f.selectionError).length
      status(features.length?'ready':'empty',`公開地番2024・${data.metadata.region}。原本由来の全筆形状（測量境界・最新登記ではありません）。${features.length>800?'800筆まで表示・拡大してください。':'押して選択し「選択完了」で3Dへ。'}${data.completeCoverage===false?' 準備済み地域の外は未準備です。':''}${invalid?` 形状確認必要 ${invalid}筆は選択不可。`:''}`)
    }
    async function load(){
      controller?.abort();const id=++ticket;controller=new AbortController()
      if(map.getZoom()<16){group.clearLayers();status('zoom','地番選択は地図を拡大してください（ズーム16以上）。');return}
      status('loading','準備済み地域の小さな原本断片を取得中…')
      try{
        const b=map.getBounds(),next=await loader.current.load([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],{signal:controller.signal})
        if(!active||id!==ticket)return
        data=next;latest.current.onCoverage?.(next.coverage)
        if(!next.coverage){group.clearLayers();status('empty','この地域の全筆資料は未準備です。参考地番のみ表示し、3Dの確定境界には使いません。準備済み：高梁市 備中町西山周辺。');return}
        render()
      }catch(e){if(active&&id===ticket&&e.name!=='AbortError')status('error',`${e.message} 選択・確定済みの結果は保持しています。`)}
    }
    const move=()=>{controller?.abort();++ticket;clearTimeout(timer);render();timer=setTimeout(load,180)}
    refresh.current=render;map.on('moveend',move);load()
    return()=>{active=false;++ticket;controller?.abort();clearTimeout(timer);map.off('moveend',move);map.removeLayer(group);map.attributionControl.removeAttribution(attribution);refresh.current=null;latest.current.onStatus?.({state:'off',message:''})}
  },[map,props.retry])
  useEffect(()=>refresh.current?.(),[props.draft,props.mode,props.locked])
  return null
}
