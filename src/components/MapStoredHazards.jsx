import {useEffect,useRef} from 'react'
import {useMap} from 'react-leaflet'
import L from 'leaflet'
import {loadStoredViewport,storedHazardStyle} from '../services/storedHazards.js'

// An independent map overlay; never writes parcel, selection, placement or records.
export default function MapStoredHazards({enabled,region,opacity,retry,onStatus}){
  const map=useMap(),layer=useRef(null),renderer=useRef(null),latestOpacity=useRef(opacity)
  latestOpacity.current=opacity
  useEffect(()=>{layer.current?.setStyle(f=>storedHazardStyle(f,opacity))},[opacity])
  useEffect(()=>{
    let active=true,epoch=0,timer,controller
    const clear=()=>{epoch++;clearTimeout(timer);controller?.abort();layer.current?.remove();layer.current=null;renderer.current?.remove();renderer.current=null}
    if(!enabled||!region.stored||region.state!=='ready'){onStatus({state:!enabled?'off':region.stored?'unconfirmed':'outside',message:!enabled?'保存ハザード OFF':region.stored?'保存ハザード：対象県未確定・取得失敗':'保存ハザードは岡山・広島・山口の試験対応'});return clear}
    const moving=()=>{clear();onStatus({state:'loading',message:'保存ハザードの表示範囲を確認中'})}
    const update=()=>{clear();if(map.getZoom()<12){onStatus({state:'wide',message:'保存ハザードはズーム12以上で表示。空白は安全を意味しません。'});return}
      const job=epoch;controller=new AbortController();const signal=controller.signal
      onStatus({state:'loading',message:'保存ハザードを読込中'})
      timer=setTimeout(async()=>{const b=map.getBounds();try{
        const result=await loadStoredViewport([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],{signal})
        if(!active||signal.aborted||job!==epoch)return
        const pane=map.getPane('stored-hazard-vectors')||map.createPane('stored-hazard-vectors');pane.style.zIndex='355';pane.style.pointerEvents='none'
        renderer.current=L.canvas({pane:'stored-hazard-vectors'})
        layer.current=L.geoJSON({type:'FeatureCollection',features:result.features},{pane:'stored-hazard-vectors',renderer:renderer.current,interactive:false,bubblingMouseEvents:false,style:f=>storedHazardStyle(f,latestOpacity.current),attribution:'保存ハザード：国土数値情報（形式変換）／広島：土砂災害ポータルひろしま・DoboX'}).addTo(map)
        onStatus({...result,features:undefined,featureCount:result.features.length})
      }catch(e){if(active&&!signal.aborted&&job===epoch)onStatus({state:'error',message:`保存ハザード取得失敗・未確認：${e.message}`})}},250)
    }
    map.on('movestart',moving);map.on('moveend',update);update()
    return()=>{active=false;clear();map.off('movestart',moving);map.off('moveend',update)}
  },[map,enabled,region.stored,region.state,region.prefecture,retry,onStatus])
  return null
}
