import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { terrainPointToLocal, pointInTerrainBoundary } from '../utils/terrainArea.js'
import { terrainDrawingPrintViewports, terrainDrawingPrintScaleBar, TERRAIN_DRAWING_PHOTO_EXTENT } from '../utils/terrainDrawingViewport.js'
import { loadTerrainDrawingContext } from '../services/terrainDrawingContext.js'
import { geometryPolygons, featureInteriorPoint } from '../services/parcelGeometry.js'
import { layoutTerrainLabels, terrainLabelBounds } from '../utils/terrainLabelLayout.js'
import { getTerrainCellSlope } from '../utils/terrainLayout.js'
import { terrainSlopeIndex } from '../utils/terrainSlopeClasses.js'
import { layoutTerrainDrainage } from '../utils/terrainDrainageLayout.js'
import { TERRAIN_SLOPE_COLORS } from '../utils/terrainSlopeDistribution.js'
import { terrainDrawingLabelFits } from '../utils/terrainDrawingLabels.js'

const path=(points,project,close=true)=>points.map((p,i)=>`${i?'L':'M'}${project(p).map(v=>v.toFixed(2)).join(' ')}`).join(' ')+(close?' Z':'')
const slopeIndex=terrainSlopeIndex

export default function TerrainDrawingPair({analysis,layout,fence,parcels,drawingScale='auto'}) {
  const id=`drawing-${useId().replace(/:/g,'')}`,g=analysis.grid
  const source=useRef(null),[contexts,setContexts]=useState([{status:'loading',tiles:[]},{status:'loading',tiles:[]}])
  const [contextSource,setContextSource]=useState(null)
  const setup=useMemo(()=>{try{return {views:terrainDrawingPrintViewports(g,drawingScale),error:''}}catch(error){return {views:[],error:error.message}}},[g,drawingScale])
  useEffect(()=>{
    if(setup.error){setContexts([{status:'unavailable',tiles:[]},{status:'unavailable',tiles:[]}]);return}
    let active=true,job=0
    const load=()=>{const id=++job;if(source.current)source.current.dataset.contextStatus='loading';setContextSource(null);setContexts([{status:'loading',tiles:[]},{status:'loading',tiles:[]}]);Promise.all([loadTerrainDrawingContext(analysis,'map',{drawingScale}),loadTerrainDrawingContext(analysis,'photo',{drawingScale})]).then(value=>{if(active&&job===id){setContexts(value);setContextSource({analysis,drawingScale})}})}
    const node=source.current;node?.addEventListener('terrain-drawing-context-retry',load);load()
    return()=>{active=false;job++;node?.removeEventListener('terrain-drawing-context-retry',load)}
  },[analysis,drawingScale,setup])
  const scaleCurrent=contextSource?.analysis===analysis&&contextSource.drawingScale===drawingScale
  const contextStatus=!scaleCurrent||contexts.some(c=>c.status==='loading')?'loading':contexts.every(c=>c.status==='ready')?'ready':'unavailable'
  const models=useMemo(()=>{
    // Fixed-scale views share the projection. Reuse only immutable colour
    // paths; labels, fences and drainage keep their existing per-view rules.
    const fillsByViewport=new Map()
    return setup.views.map((v,index)=>{
    const boundary=g.boundary.flat().map(r=>path(r,v.project)).join(' ')
    let fills=fillsByViewport.get(v)
    if(!fills){
      const parts=TERRAIN_SLOPE_COLORS.map(()=>[])
      for(let row=0;row<g.height-1;row++)for(let col=0;col<g.width-1;col++){
        const i=slopeIndex(getTerrainCellSlope(g,row,col));if(i<0)continue
        const x=g.xMin+col*g.step,y=g.yMin+row*g.step
        parts[i].push(path([[x,y],[x+g.step,y],[x+g.step,y+g.step],[x,y+g.step]],v.project))
      }
      fills=parts.map(ps=>ps.join(' '));fillsByViewport.set(v,fills)
    }
    const labels=[],parcelPaths=[],outsideLabels=[],screenBoundary=g.boundary.map(p=>p.map(r=>r.map(v.project)))
    for(const p of parcels.filter(p=>p.role==='target')){
      const project=([lon,lat])=>v.project(terrainPointToLocal({lon,lat},g.origin))
      for(const polygon of geometryPolygons(p.geometry))for(const r of polygon)parcelPaths.push(path(r,project))
      const number=p.info?.number
      if(number){const pos=featureInteriorPoint(p);if(pos){const label={id:p.id,number,screen:project([pos.lon,pos.lat])};if(pointInTerrainBoundary(terrainPointToLocal(pos,g.origin),g.boundary))labels.push(label);else outsideLabels.push(label)}}
    }
    // The drawing uses 18px labels; enlarge collision boxes from the existing
    // 14px label helper without changing other terrain views.
    const k=18/14,labelLayout=layoutTerrainLabels(labels.map(l=>({...l,screen:l.screen.map(n=>n/k)})),{left:38/k,top:45/k,right:735/k,bottom:680/k},box=>terrainDrawingLabelFits(Object.fromEntries(Object.entries(box).map(([key,n])=>[key,n*k])),screenBoundary))
    const placed=labelLayout.labels.map(l=>({...l,screen:l.screen.map(n=>n*k),anchorScreen:l.anchorScreen.map(n=>n*k)}))
    const occupied=placed.map(l=>{const b=terrainLabelBounds(l.number,l.screen.map(n=>n/k));return Object.fromEntries(Object.entries(b).map(([key,n])=>[key,n*k]))}),contourLabels=[]
    const major=(analysis.contours||[]).filter(c=>c.level%10===0)
    const placeContour=c=>{
      const points=c.paths.flatMap(p=>p.flatMap((point,i)=>i?[[ (p[i-1][0]+point[0])/2,(p[i-1][1]+point[1])/2 ],point]:[point])),ordered=[...points.slice(Math.floor(points.length/2)),...points.slice(0,Math.floor(points.length/2))]
      for(const p of ordered){
        if(!pointInTerrainBoundary(p,g.boundary))continue
        const screen=v.project(p),box=terrainLabelBounds(`${c.level} m`,screen.map(n=>n/k)),b=box&&Object.fromEntries(Object.entries(box).map(([key,n])=>[key,n*k]))
        if(!b||b.left<38||b.right>735||b.top<45||b.bottom>680||!terrainDrawingLabelFits(b,screenBoundary)||occupied.some(o=>b.left<o.right+4&&b.right>o.left-4&&b.top<o.bottom+4&&b.bottom>o.top-4))continue
        occupied.push(b);contourLabels.push({level:c.level,screen});break
      }
    }
    for(const c of major){if(contourLabels.length>=12)break;placeContour(c)}
    // A 10m contour in the surrounding DEM may lie outside this selected area.
    // Retain the real 2m contours, and label those when no major label fits.
    if(!contourLabels.length)for(const c of analysis.contours||[]){if(contourLabels.length>=12)break;if(c.level%10!==0)placeContour(c)}
    const drainage=index===0?[]:layoutTerrainDrainage(analysis,v,{occupied,fence,labelLeaders:placed.filter(l=>l.displaced).map(l=>[l.anchorScreen,[l.screen[0],l.screen[1]-6]])}).arrows
    return {drainage,v,boundary,fills,parcelPaths,labels:placed,contourLabels,unplaced:[...labelLayout.unplaced,...outsideLabels],missing:parcels.filter(p=>p.role==='target'&&!p.info?.number).length,noParcelMetadata:!parcels.some(p=>p.role==='target')}
  })},[g,parcels,analysis.contours,fence,setup])
  if(setup.error)return <div ref={source} className="terrain-drawing-export-source" aria-hidden="true" data-drawing-scale={drawingScale} data-scale-error={setup.error} data-context-status="unavailable"/>
  const model=models[1]
  return <div ref={source} className="terrain-drawing-export-source" aria-hidden="true" data-drawing-scale={drawingScale} data-context-status={contextStatus} data-map-context-status={scaleCurrent?contexts[0].status:'loading'} data-photo-context-status={scaleCurrent?contexts[1].status:'loading'} data-context-tiles={scaleCurrent?contexts.reduce((n,c)=>n+c.tiles.length,0):0} data-no-parcel-metadata={model.noParcelMetadata} data-unplaced-parcels={model.unplaced.map(p=>p.number).join('、')} data-missing-parcels={model.missing}>
    {[true,false].map((modules,index)=>{const model=models[index],{v,boundary,fills}=model,bar=terrainDrawingPrintScaleBar(v,drawingScale,models[0].v);return <svg key={index} viewBox="0 0 800 740" data-drawing-view={modules?'layout':'terrain'} data-context-layer={modules?'std':'seamlessphoto'} data-geometry-key={analysis.geometryKey} data-viewport={JSON.stringify([v.west,v.south,v.east,v.north])} data-context-factor={drawingScale==='auto'&&!modules?TERRAIN_DRAWING_PHOTO_EXTENT:1} data-drawing-scale={drawingScale} data-scale-m={bar.meters} data-scale-px={bar.pixelLength} data-margin-m="10" role="img">
      <title>{modules?'参考モジュール配置':'地形・勾配・地番'}</title>
      <defs><clipPath id={`${id}-${index}-boundary`}><path d={boundary} fillRule="evenodd" clipRule="evenodd"/></clipPath><clipPath id={`${id}-${index}-map`}><rect x="35" y="25" width="730" height="660"/></clipPath><pattern id={`${id}-${index}-missing`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#eef0ed"/><path d="M0 8 L8 0" stroke="#aeb5af"/></pattern></defs>
      <rect width="800" height="740" fill="#fff"/>
      <g clipPath={`url(#${id}-${index}-map)`}>
        <rect x="35" y="25" width="730" height="660" fill="#f0f2ee"/>
        {(scaleCurrent?contexts[index].tiles:[]).map((tile,k)=>{const [a,b,c]=tile.points.map(v.project);return <image key={k} href={tile.href} data-context-layer={tile.layer} width="256" height="256" opacity={modules ? .7 : 1} transform={`matrix(${(b[0]-a[0])/256} ${(b[1]-a[1])/256} ${(c[0]-a[0])/256} ${(c[1]-a[1])/256} ${a[0]} ${a[1]})`}/>})}
        <path d={boundary} fill={`url(#${id}-${index}-missing)`} fillRule="evenodd"/>
        <g clipPath={`url(#${id}-${index}-boundary)`}>{fills.map((d,i)=><path key={i} d={d} fill={TERRAIN_SLOPE_COLORS[i]}/>)}
          {(analysis.contours||[]).map(c=><path key={c.level} d={c.paths.map(p=>path(p,v.project,false)).join(' ')} fill="none" stroke="#53684f" strokeWidth={c.level%10===0 ? (modules ? 1.1 : 1.6) : (modules ? .55 : .9)} opacity={modules ? .65 : 1}/>)}
          {modules&&<g data-layout-racks={layout.rackCount}>{layout.racks.flatMap(r=>r.modules.map(m=><path key={m.id} d={path(m.corners,v.project)} fill="#222" stroke="#e0edf6" strokeWidth=".55"/>))}</g>}
        </g>
        {modules&&layout.disabledRacks?.map(r=><path key={r.id} d={path(r.corners,v.project)} fill="none" stroke="#222" strokeWidth="1.2" strokeDasharray="5 3"/>)}
        {fence?.rails?.map(r=><path key={r.id} d={path(r.points,v.project,false)} fill="none" stroke="#6b4938" strokeWidth="2" strokeDasharray="6 3 1 3" data-terrain-fence="rail"/>)}
        {!modules&&<g data-parcel-boundaries="effective-area" clipPath={`url(#${id}-${index}-boundary)`}>{model.parcelPaths.map((d,i)=><path key={i} d={d} fill="none" stroke="#207b83" strokeWidth="1.3"/>)}</g>}
        <path d={boundary} fill="none" stroke="#755a0c" strokeWidth="5" fillRule="evenodd"/><path d={boundary} fill="none" stroke="#ffe073" strokeWidth="2.5" fillRule="evenodd"/>
        {!modules&&<g data-terrain-drainage="dem-downhill" aria-label="地形上の想定排水方向">{model.drainage.map((a,i)=><g key={i} data-drainage-tail={JSON.stringify(a.tail)} data-drainage-head={JSON.stringify(a.head)} data-drainage-anchor={JSON.stringify(a.point)} data-drainage-drop={a.tailElevation-a.headElevation} data-drainage-slope={a.slopeDeg} data-drainage-length-px={a.icon.lengthPx} data-drainage-kind={a.kind}>{a.icon.leader&&<g data-drainage-callout="boundary-anchor"><path d={path(a.icon.leader,p=>p,false)} fill="none" stroke="#fff" strokeWidth="2.5"/><path d={path(a.icon.leader,p=>p,false)} fill="none" stroke="#557079" strokeWidth="1"/><circle cx={a.icon.anchor[0]} cy={a.icon.anchor[1]} r="1.5" fill="#164e63" stroke="#fff" strokeWidth=".8"/></g>}<path d={a.icon.path} fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/><path d={a.icon.path} fill="none" stroke="#164e63" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></g>)}</g>}
        {!modules&&<g data-parcel-labels="effective-area" clipPath={`url(#${id}-${index}-boundary)`}>{model.labels.map(l=><g key={l.id}>{l.displaced&&<line x1={l.anchorScreen[0]} y1={l.anchorScreen[1]} x2={l.screen[0]} y2={l.screen[1]-6} stroke="#207b83"/>}<text x={l.screen[0]} y={l.screen[1]} textAnchor="middle" data-parcel-number={l.number} fontSize="18" fontWeight="700" fill="#142e35" stroke="#fff" strokeWidth="3" paintOrder="stroke">{l.number}</text></g>)}</g>}
        {!modules&&<g clipPath={`url(#${id}-${index}-boundary)`}>{model.contourLabels.map(l=><text key={l.level} x={l.screen[0]} y={l.screen[1]} textAnchor="middle" data-contour-level={l.level} style={{fontSize:18,fontWeight:700,fill:'#183b29',stroke:'#fff',strokeWidth:3.5,paintOrder:'stroke'}}>{l.level} m</text>)}</g>}
      </g>
      <g transform="translate(749 48)" fill="#22392e"><text y="-10" textAnchor="middle" fontSize="18">N</text><path d="M0 -5 L-6 13 L0 8 L6 13 Z"/></g>
      <g transform="translate(40 710)" fill="#22392e" stroke="#22392e" strokeWidth="1.3"><path d={`M0 -5 V5 M0 0 H${bar.pixelLength}`} /><text y="22" stroke="none" fontSize="16">{bar.meters.toLocaleString('ja-JP',{maximumFractionDigits:2})} m</text></g>
      <text x="755" y="718" textAnchor="end" fontSize="15" fill="#41574c">{drawingScale==='auto'?'自動・各図の目盛で確認':`縮尺1:${drawingScale.toLocaleString('ja-JP')}・平面距離 / A3横100%`}</text>
    </svg>})}
  </div>
}
