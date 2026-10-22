import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { loadReferenceFeatures } from '../services/regulatoryReferences.js'
import { REFERENCE_MIN_ZOOM, referenceStyle } from '../utils/regulatoryRegistry.js'

// Independent display layer: never changes candidate selection, records or DXF/PDF.
export default function MapRegulatoryReferences({enabled,opacity=.5,includeHistorical=false,retry=0,onStatus}) {
  const map=useMap(),layer=useRef(null),renderer=useRef(null),currentOpacity=useRef(opacity)
  currentOpacity.current=opacity
  useEffect(()=>{layer.current?.setStyle(feature=>referenceStyle(feature,opacity))},[opacity])
  useEffect(()=>{
    let active=true,epoch=0,timer,controller
    const clear=()=>{
      epoch++;clearTimeout(timer);controller?.abort()
      if(layer.current){layer.current.remove();layer.current=null}
      if(renderer.current){renderer.current.remove();renderer.current=null}
    }
    if(!enabled){onStatus?.({state:'off',message:'参考区域 OFF（未照会）'});return clear}
    const moving=()=>{clear();onStatus?.({state:'loading',message:'参考区域の表示範囲を確認中'})}
    const update=()=>{
      clear()
      if(map.getZoom()<REFERENCE_MIN_ZOOM){onStatus?.({state:'wide',message:'文化財・農業地域はズーム12以上で参考表示'});return}
      const job=epoch;controller=new AbortController();const signal=controller.signal
      onStatus?.({state:'loading',message:'文化財・農業地域の参考図形を取得中'})
      timer=setTimeout(async()=>{
        const b=map.getBounds(),bounds=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]
        try {
          const result=await loadReferenceFeatures(bounds,{includeHistorical,signal})
          if(!active||signal.aborted||job!==epoch)return
          const pane=map.getPane('regulatory-reference-vectors')||map.createPane('regulatory-reference-vectors')
          pane.style.zIndex='360';pane.style.pointerEvents='none'
          renderer.current=L.canvas({pane:'regulatory-reference-vectors'})
          layer.current=L.geoJSON({type:'FeatureCollection',features:result.features},{pane:'regulatory-reference-vectors',renderer:renderer.current,interactive:false,bubblingMouseEvents:false,style:feature=>referenceStyle(feature,currentOpacity.current),attribution:'参考区域：岡山県／国土数値情報（形式変換）'}).addTo(map)
          onStatus?.({...result,features:undefined,featureCount:result.features.length})
        } catch(error) {if(active&&!signal.aborted&&job===epoch)onStatus?.({state:'error',message:'参考資料の取得失敗。対象範囲は未確認。'})}
      },250)
    }
    map.on('movestart',moving);map.on('moveend',update);update()
    return()=>{active=false;clear();map.off('movestart',moving);map.off('moveend',update)}
  },[map,enabled,includeHistorical,retry,onStatus])
  return null
}
