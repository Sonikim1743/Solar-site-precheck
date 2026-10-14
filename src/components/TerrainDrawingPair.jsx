import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { terrainPointToLocal, pointInTerrainBoundary } from '../utils/terrainArea.js'
import { terrainDrawingViewport, terrainDrawingScaleBar, TERRAIN_DRAWING_PHOTO_EXTENT } from '../utils/terrainDrawingViewport.js'
import { loadTerrainDrawingContext } from '../services/terrainDrawingContext.js'
import { geometryPolygons, featureInteriorPoint } from '../services/parcelGeometry.js'
import { layoutTerrainLabels, terrainLabelBounds } from '../utils/terrainLabelLayout.js'
import { getTerrainCellSlope } from '../utils/terrainLayout.js'
import { terrainSlopeIndex } from '../utils/terrainSlopeClasses.js'
import { terrainDrainageArrows, terrainDrainageArrowDrawing } from '../utils/terrainDrainage.js'
import { TERRAIN_SLOPE_COLORS } from '../utils/terrainSlopeDistribution.js'
import { terrainDrawingLabelFits } from '../utils/terrainDrawingLabels.js'

const path=(points,project,close=true)=>points.map((p,i)=>`${i?'L':'M'}${project(p).map(v=>v.toFixed(2)).join(' ')}`).join(' ')+(close?' Z':'')
const slopeIndex=terrainSlopeIndex

export default function TerrainDrawingPair({analysis,layout,fence,parcels}) {
  const id=`drawing-${useId().replace(/:/g,'')}`,g=analysis.grid
  const source=useRef(null),[contexts,setContexts]=useState([{status:'loading',tiles:[]},{status:'loading',tiles:[]}])
  useEffect(()=>{
    let active=true,job=0
    const load=()=>{const id=++job;if(source.current)source.current.dataset.contextStatus='loading';setContexts([{status:'loading',tiles:[]},{status:'loading',tiles:[]}]);Promise.all([loadTerrainDrawingContext(analysis,'map'),loadTerrainDrawingContext(analysis,'photo')]).then(value=>{if(active&&job===id)setContexts(value)})}
    const node=source.current;node?.addEventListener('terrain-drawing-context-retry',load);load()
    return()=>{active=false;job++;node?.removeEventListener('terrain-drawing-context-retry',load)}
  },[analysis])
  const contextStatus=contexts.some(c=>c.status==='loading')?'loading':contexts.every(c=>c.status==='ready')?'ready':'unavailable'
  const models=useMemo(()=>[1,TERRAIN_DRAWING_PHOTO_EXTENT].map(factor=>{
    const v=terrainDrawingViewport(g,10,factor),boundary=g.boundary.flat().map(r=>path(r,v.project)).join(' '),fills=TERRAIN_SLOPE_COLORS.map(()=>[])
    for(let row=0;row<g.height-1;row++)for(let col=0;col<g.width-1;col++){
      const i=slopeIndex(getTerrainCellSlope(g,row,col));if(i<0)continue
      const x=g.xMin+col*g.step,y=g.yMin+row*g.step
      fills[i].push(path([[x,y],[x+g.step,y],[x+g.step,y+g.step],[x,y+g.step]],v.project))
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
    const arrowBoxes=[]
    // Rails are sampled at grid intervals: small segment boxes keep the arrow
    // halo clear of the fence without hiding an entire diagonal enclosure.
    const fenceBoxes=(fence?.rails||[]).flatMap(rail=>rail.points.slice(1).map((point,i)=>{
      const a=v.project(rail.points[i]),b=v.project(point)
      return {left:Math.min(a[0],b[0])-2,right:Math.max(a[0],b[0])+2,top:Math.min(a[1],b[1])-2,bottom:Math.max(a[1],b[1])+2}
    }))
    const drainage= factor===1 ? [] : terrainDrainageArrows(analysis).map(a=>({...a,icon:terrainDrainageArrowDrawing(a,v.project,{symbolic:true})})).filter(a=>{
      const p=a.icon.tail,q=a.icon.head,b={left:Math.min(p[0],q[0])-8,right:Math.max(p[0],q[0])+8,top:Math.min(p[1],q[1])-8,bottom:Math.max(p[1],q[1])+8}
      if(!a.icon.path||b.left<35||b.right>765||b.top<25||b.bottom>685||[...occupied,...arrowBoxes,...fenceBoxes].some(o=>b.left<o.right+5&&b.right>o.left-5&&b.top<o.bottom+5&&b.bottom>o.top-5))return false
      arrowBoxes.push(b);return true
    })
    return {drainage,v,boundary,fills:fills.map(ps=>ps.join(' ')),parcelPaths,labels:placed,contourLabels,unplaced:[...labelLayout.unplaced,...outsideLabels],missing:parcels.filter(p=>p.role==='target'&&!p.info?.number).length,noParcelMetadata:!parcels.some(p=>p.role==='target')}
  }),[g,parcels,analysis.contours,fence])
  const model=models[1]
  return <div ref={source} className="terrain-drawing-export-source" aria-hidden="true" data-context-status={contextStatus} data-map-context-status={contexts[0].status} data-photo-context-status={contexts[1].status} data-context-tiles={contexts.reduce((n,c)=>n+c.tiles.length,0)} data-no-parcel-metadata={model.noParcelMetadata} data-unplaced-parcels={model.unplaced.map(p=>p.number).join('、')} data-missing-parcels={model.missing}>
    {[true,false].map((modules,index)=>{const model=models[index],{v,boundary,fills}=model,bar=terrainDrawingScaleBar(v,models[0].v);return <svg key={index} viewBox="0 0 800 740" data-drawing-view={modules?'layout':'terrain'} data-context-layer={modules?'std':'seamlessphoto'} data-geometry-key={analysis.geometryKey} data-viewport={JSON.stringify([v.west,v.south,v.east,v.north])} data-context-factor={modules?1:TERRAIN_DRAWING_PHOTO_EXTENT} data-scale-m={bar.meters} data-scale-px={bar.pixelLength} data-margin-m="10" role="img">
      <title>{modules?'参考モジュール配置':'地形・勾配・地番'}</title>
      <defs><clipPath id={`${id}-${index}-boundary`}><path d={boundary} fillRule="evenodd" clipRule="evenodd"/></clipPath><clipPath id={`${id}-${index}-map`}><rect x="35" y="25" width="730" height="660"/></clipPath><pattern id={`${id}-${index}-missing`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#eef0ed"/><path d="M0 8 L8 0" stroke="#aeb5af"/></pattern></defs>
      <rect width="800" height="740" fill="#fff"/>
      <g clipPath={`url(#${id}-${index}-map)`}>
        <rect x="35" y="25" width="730" height="660" fill="#f0f2ee"/>
        {contexts[index].tiles.map((tile,k)=>{const [a,b,c]=tile.points.map(v.project);return <image key={k} href={tile.href} data-context-layer={tile.layer} width="256" height="256" opacity={modules ? .7 : 1} transform={`matrix(${(b[0]-a[0])/256} ${(b[1]-a[1])/256} ${(c[0]-a[0])/256} ${(c[1]-a[1])/256} ${a[0]} ${a[1]})`}/>})}
        <path d={boundary} fill={`url(#${id}-${index}-missing)`} fillRule="evenodd"/>
        <g clipPath={`url(#${id}-${index}-boundary)`}>{fills.map((d,i)=><path key={i} d={d} fill={TERRAIN_SLOPE_COLORS[i]}/>)}
          {(analysis.contours||[]).map(c=><path key={c.level} d={c.paths.map(p=>path(p,v.project,false)).join(' ')} fill="none" stroke="#53684f" strokeWidth={c.level%10===0 ? (modules ? 1.1 : 1.6) : (modules ? .55 : .9)} opacity={modules ? .65 : 1}/>)}
          {modules&&<g data-layout-racks={layout.rackCount}>{layout.racks.flatMap(r=>r.modules.map(m=><path key={m.id} d={path(m.corners,v.project)} fill="#222" stroke="#e0edf6" strokeWidth=".55"/>))}</g>}
        </g>
        {modules&&layout.disabledRacks?.map(r=><path key={r.id} d={path(r.corners,v.project)} fill="none" stroke="#222" strokeWidth="1.2" strokeDasharray="5 3"/>)}
        {fence?.rails?.map(r=><path key={r.id} d={path(r.points,v.project,false)} fill="none" stroke="#6b4938" strokeWidth="2" strokeDasharray="6 3 1 3" data-terrain-fence="rail"/>)}
        {!modules&&<g data-parcel-boundaries="effective-area" clipPath={`url(#${id}-${index}-boundary)`}>{model.parcelPaths.map((d,i)=><path key={i} d={d} fill="none" stroke="#207b83" strokeWidth="1.3"/>)}</g>}
        <path d={boundary} fill="none" stroke="#755a0c" strokeWidth="5" fillRule="evenodd"/><path d={boundary} fill="none" stroke="#ffe073" strokeWidth="2.5" fillRule="evenodd"/>
        {!modules&&<g data-terrain-drainage="dem-downhill" aria-label="地形上の想定排水方向">{model.drainage.map((a,i)=><g key={i} data-drainage-tail={JSON.stringify(a.tail)} data-drainage-head={JSON.stringify(a.head)} data-drainage-drop={a.tailElevation-a.headElevation} data-drainage-slope={a.slopeDeg} data-drainage-length-px={a.icon.lengthPx} data-drainage-kind={a.kind}><path d={a.icon.path} fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/><path d={a.icon.path} fill="none" stroke="#164e63" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></g>)}</g>}
        {!modules&&<g data-parcel-labels="effective-area" clipPath={`url(#${id}-${index}-boundary)`}>{model.labels.map(l=><g key={l.id}>{l.displaced&&<line x1={l.anchorScreen[0]} y1={l.anchorScreen[1]} x2={l.screen[0]} y2={l.screen[1]-6} stroke="#207b83"/>}<text x={l.screen[0]} y={l.screen[1]} textAnchor="middle" data-parcel-number={l.number} fontSize="18" fontWeight="700" fill="#142e35" stroke="#fff" strokeWidth="3" paintOrder="stroke">{l.number}</text></g>)}</g>}
        {!modules&&<g clipPath={`url(#${id}-${index}-boundary)`}>{model.contourLabels.map(l=><text key={l.level} x={l.screen[0]} y={l.screen[1]} textAnchor="middle" data-contour-level={l.level} style={{fontSize:18,fontWeight:700,fill:'#183b29',stroke:'#fff',strokeWidth:3.5,paintOrder:'stroke'}}>{l.level} m</text>)}</g>}
      </g>
      <g transform="translate(749 48)" fill="#22392e"><text y="-10" textAnchor="middle" fontSize="18">N</text><path d="M0 -5 L-6 13 L0 8 L6 13 Z"/></g>
      <g transform="translate(40 710)" fill="#22392e" stroke="#22392e" strokeWidth="1.3"><path d={`M0 -5 V5 M0 0 H${bar.pixelLength}`} /><text y="22" stroke="none" fontSize="16">{bar.meters.toLocaleString('ja-JP',{maximumFractionDigits:2})} m</text></g>
      <text x="755" y="718" textAnchor="end" fontSize="15" fill="#41574c">等高線2m・太線10m / 黄色線：計算範囲 / 外側：{modules?'周辺地図':'航空写真'}</text>
    </svg>})}
  </div>
}
