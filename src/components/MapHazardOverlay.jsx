import L from 'leaflet'
import { createElementObject, createLayerComponent } from '@react-leaflet/core'
import { createHazardLayerClass, HAZARD_PANE as Pane } from '../services/hazardLayer.js'
import { hazardRegionFromAddress } from '../utils/regulatoryLayers.js'
import { reverseGeocode } from '../services/gsi.js'
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { storedPrefecture } from '../services/storedHazards.js'

// Region lookup changes display only. Never select a candidate or alter review geometry.
export function HazardRegionController({enabled,onRegion,retry}) {
  const map=useMap()
  useEffect(()=>{
    if(!enabled)return
    let timer,epoch=0,active=true,controller
    const clear=()=>{epoch++;clearTimeout(timer);controller?.abort();onRegion({state:'loading',prefecture:''})}
    const update=()=>{
      clear();const job=epoch
      if(map.getZoom()<8){onRegion({state:'wide',prefecture:''});return}
      timer=setTimeout(async()=>{
        const center=map.getCenter()
        controller=new AbortController()
        try {
          const local=await storedPrefecture({lat:center.lat,lon:center.lng},{signal:controller.signal})
          if(!active||epoch!==job)return
          if(local.state!=='outside'){onRegion({...local,prefecture:local.code||''});return}
          const address=await reverseGeocode(center.lat,center.lng);if(active&&epoch===job)onRegion(hazardRegionFromAddress(address))
        }
        catch {if(active&&epoch===job)onRegion({state:'error',stored:true,prefecture:'',message:'保存行政境界の取得・判読失敗。対象県は未確認。'})}
      },500)
    }
    map.on('movestart',clear);map.on('moveend',update);update()
    return()=>{active=false;epoch++;controller?.abort();clearTimeout(timer);map.off('movestart',clear);map.off('moveend',update)}
  },[map,enabled,onRegion,retry])
  return null
}

const HazardLayer=createHazardLayerClass(L)
export default createLayerComponent((props,context)=>{
  const pane=context.map.getPane(Pane)||context.map.createPane(Pane);pane.style.zIndex='350';pane.style.pointerEvents='none'
  return createElementObject(new HazardLayer(props),context)
},(layer,props,previous)=>{layer.callback=props.onStatus;if(props.opacity!==previous.opacity)layer.setOpacity(props.opacity)})
