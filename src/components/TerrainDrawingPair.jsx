import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { terrainDrawingPrintViewports, terrainDrawingPrintScaleBar, TERRAIN_DRAWING_PHOTO_EXTENT } from '../utils/terrainDrawingViewport.js'
import { loadTerrainDrawingContext } from '../services/terrainDrawingContext.js'
import { getTerrainCellSlope } from '../utils/terrainLayout.js'
import { terrainSlopeIndex } from '../utils/terrainSlopeClasses.js'
import { terrainDrawingAnnotations } from '../utils/terrainDrawingAnnotations.js'
import { TERRAIN_SLOPE_COLORS } from '../utils/terrainSlopeDistribution.js'

const path=(points,project,close=true)=>points.map((p,i)=>`${i?'L':'M'}${project(p).map(v=>v.toFixed(2)).join(' ')}`).join(' ')+(close?' Z':'')
const slopeIndex=terrainSlopeIndex

export default function TerrainDrawingPair({analysis,layout,fence,parcels,drawingScale='auto',layoutBackground='std'}) {
  const id=`drawing-${useId().replace(/:/g,'')}`,g=analysis.grid
  const source=useRef(null),[contexts,setContexts]=useState([{status:'loading',tiles:[]},{status:'loading',tiles:[]}])
  const [contextSource,setContextSource]=useState(null)
  const setup=useMemo(()=>{try{return {views:terrainDrawingPrintViewports(g,drawingScale),error:''}}catch(error){return {views:[],error:error.message}}},[g,drawingScale])
  useEffect(()=>{
    if(setup.error){setContexts([{status:'unavailable',tiles:[]},{status:'unavailable',tiles:[]}]);return}
    let active=true,job=0
    const load=()=>{
      const id=++job
      if(source.current)source.current.dataset.contextStatus='loading'
      setContextSource(null)
      const leftKind=layoutBackground==='seamlessphoto'?'photo':'map'
      Promise.all([
        loadTerrainDrawingContext(analysis,leftKind,{drawingScale,view:'layout'}),
        loadTerrainDrawingContext(analysis,'photo',{drawingScale}),
      ]).then(value=>{
        if(active&&job===id){setContexts(value);setContextSource({analysis,drawingScale,layoutBackground})}
      })
    }
    const node=source.current;node?.addEventListener('terrain-drawing-context-retry',load);load()
    return()=>{active=false;job++;node?.removeEventListener('terrain-drawing-context-retry',load)}
  },[analysis,drawingScale,layoutBackground,setup])
  const contextCurrent=contextSource?.analysis===analysis&&contextSource.drawingScale===drawingScale&&contextSource.layoutBackground===layoutBackground
  const contextStatus=!contextCurrent||contexts.some(c=>c.status==='loading')?'loading':contexts.every(c=>c.status==='ready')?'ready':'unavailable'
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
    return {v,boundary,fills,...terrainDrawingAnnotations(analysis,v,{fence,parcels,withDrainage:index===1})}
  })},[g,parcels,analysis.contours,fence,setup])
  if(setup.error)return <div ref={source} className="terrain-drawing-export-source" aria-hidden="true" data-drawing-scale={drawingScale} data-scale-error={setup.error} data-context-status="unavailable"/>
  const model=models[1]
  return <div ref={source} className="terrain-drawing-export-source" aria-hidden="true" data-drawing-scale={drawingScale} data-context-status={contextStatus} data-map-context-status={contextCurrent?contexts[0].status:'loading'} data-photo-context-status={contextCurrent?contexts[1].status:'loading'} data-context-tiles={contextCurrent?contexts.reduce((n,c)=>n+c.tiles.length,0):0} data-no-parcel-metadata={model.noParcelMetadata} data-unplaced-parcels={model.unplaced.map(p=>p.number).join('、')} data-missing-parcels={model.missing}>
    {[true,false].map((modules,index)=>{const model=models[index],{v,boundary,fills}=model,bar=terrainDrawingPrintScaleBar(v,drawingScale,models[0].v);return <svg key={index} viewBox="0 0 800 740" data-drawing-view={modules?'layout':'terrain'} data-context-layer={modules?layoutBackground:'seamlessphoto'} data-geometry-key={analysis.geometryKey} data-viewport={JSON.stringify([v.west,v.south,v.east,v.north])} data-context-factor={drawingScale==='auto'&&!modules?TERRAIN_DRAWING_PHOTO_EXTENT:1} data-drawing-scale={drawingScale} data-scale-m={bar.meters} data-scale-px={bar.pixelLength} data-margin-m="10" role="img">
      <title>{modules?'参考モジュール配置':'地形・勾配・地番'}</title>
      <defs><clipPath id={`${id}-${index}-boundary`}><path d={boundary} fillRule="evenodd" clipRule="evenodd"/></clipPath><clipPath id={`${id}-${index}-map`}><rect x="35" y="25" width="730" height="660"/></clipPath><pattern id={`${id}-${index}-missing`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#eef0ed"/><path d="M0 8 L8 0" stroke="#aeb5af"/></pattern></defs>
      <rect width="800" height="740" fill="#fff"/>
      <g clipPath={`url(#${id}-${index}-map)`}>
        <rect x="35" y="25" width="730" height="660" fill="#f0f2ee"/>
        {(contextCurrent?contexts[index].tiles:[]).map((tile,k)=>{const [a,b,c]=tile.points.map(v.project);return <image key={k} href={tile.href} data-context-layer={tile.layer} width="256" height="256" opacity={modules ? .7 : 1} transform={`matrix(${(b[0]-a[0])/256} ${(b[1]-a[1])/256} ${(c[0]-a[0])/256} ${(c[1]-a[1])/256} ${a[0]} ${a[1]})`}/>})}
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
