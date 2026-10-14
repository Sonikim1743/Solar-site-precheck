import { useEffect, useId, useMemo, useState } from 'react'
import { terrainPointToLocal, pointInTerrainBoundary } from '../utils/terrainArea.js'
import { terrainDrawingViewport } from '../utils/terrainDrawingViewport.js'
import { loadTerrainDrawingContext } from '../services/terrainDrawingContext.js'
import { geometryPolygons, featureInteriorPoint } from '../services/parcelGeometry.js'
import { layoutTerrainLabels, terrainLabelBounds } from '../utils/terrainLabelLayout.js'
import { getTerrainCellSlope } from '../utils/terrainLayout.js'
import { TERRAIN_SLOPE_COLORS } from '../utils/terrainSlopeDistribution.js'

const path=(points,project,close=true)=>points.map((p,i)=>`${i?'L':'M'}${project(p).map(v=>v.toFixed(2)).join(' ')}`).join(' ')+(close?' Z':'')
const slopeIndex=s=>!Number.isFinite(s)?-1:s<10?0:s<20?1:s<30?2:3

export default function TerrainDrawingPair({analysis,layout,fence,parcels}) {
  const id=`drawing-${useId().replace(/:/g,'')}`,g=analysis.grid
  const [context,setContext]=useState({status:'loading',tiles:[]})
  useEffect(()=>{let active=true;setContext({status:'loading',tiles:[]});loadTerrainDrawingContext(analysis).then(value=>{if(active)setContext(value)});return()=>{active=false}},[analysis])
  const model=useMemo(()=>{
    const v=terrainDrawingViewport(g),boundary=g.boundary.flat().map(r=>path(r,v.project)).join(' '),fills=[[],[],[],[]]
    for(let row=0;row<g.height-1;row++)for(let col=0;col<g.width-1;col++){
      const i=slopeIndex(getTerrainCellSlope(g,row,col));if(i<0)continue
      const x=g.xMin+col*g.step,y=g.yMin+row*g.step
      fills[i].push(path([[x,y],[x+g.step,y],[x+g.step,y+g.step],[x,y+g.step]],v.project))
    }
    const labels=[],parcelPaths=[]
    for(const p of parcels.filter(p=>p.role==='target')){
      const project=([lon,lat])=>v.project(terrainPointToLocal({lon,lat},g.origin))
      for(const polygon of geometryPolygons(p.geometry))for(const r of polygon)parcelPaths.push(path(r,project))
      const number=p.info?.number
      if(number){const pos=featureInteriorPoint(p);if(pos)labels.push({id:p.id,number,screen:project([pos.lon,pos.lat])})}
    }
    // The drawing uses 18px labels; enlarge collision boxes from the existing
    // 14px label helper without changing other terrain views.
    const k=18/14,labelLayout=layoutTerrainLabels(labels.map(l=>({...l,screen:l.screen.map(n=>n/k)})),{left:38/k,top:45/k,right:735/k,bottom:680/k})
    const placed=labelLayout.labels.map(l=>({...l,screen:l.screen.map(n=>n*k),anchorScreen:l.anchorScreen.map(n=>n*k)}))
    const occupied=placed.map(l=>{const b=terrainLabelBounds(l.number,l.screen.map(n=>n/k));return Object.fromEntries(Object.entries(b).map(([key,n])=>[key,n*k]))}),contourLabels=[]
    const major=(analysis.contours||[]).filter(c=>c.level%10===0),levels=(major.length?major:analysis.contours||[]).slice(0,12)
    for(const c of levels){
      const points=c.paths.flat(),ordered=[...points.slice(Math.floor(points.length/2)),...points.slice(0,Math.floor(points.length/2))]
      for(const p of ordered){
        if(!pointInTerrainBoundary(p,g.boundary))continue
        const screen=v.project(p),b=terrainLabelBounds(`${c.level}m`,screen)
        if(!b||b.left<38||b.right>735||b.top<45||b.bottom>680||occupied.some(o=>b.left<o.right+4&&b.right>o.left-4&&b.top<o.bottom+4&&b.bottom>o.top-4))continue
        occupied.push(b);contourLabels.push({level:c.level,screen});break
      }
    }
    return {v,boundary,fills:fills.map(ps=>ps.join(' ')),parcelPaths,labels:placed,contourLabels,unplaced:labelLayout.unplaced,missing:parcels.filter(p=>p.role==='target'&&!p.info?.number).length,noParcelMetadata:!parcels.some(p=>p.role==='target')}
  },[g,parcels])
  const {v,boundary,fills}=model
  return <div className="terrain-drawing-export-source" aria-hidden="true" data-context-status={context.status} data-context-tiles={context.tiles.length} data-no-parcel-metadata={model.noParcelMetadata} data-unplaced-parcels={model.unplaced.map(p=>p.number).join('、')} data-missing-parcels={model.missing}>
    {[true,false].map((modules,index)=><svg key={index} viewBox="0 0 800 740" data-drawing-view={modules?'layout':'terrain'} data-geometry-key={analysis.geometryKey} data-viewport={JSON.stringify([v.west,v.south,v.east,v.north])} data-margin-m="10" role="img">
      <title>{modules?'参考モジュール配置':'地形・勾配・地番'}</title>
      <defs><clipPath id={`${id}-${index}-boundary`}><path d={boundary} fillRule="evenodd" clipRule="evenodd"/></clipPath><clipPath id={`${id}-${index}-map`}><rect x="35" y="25" width="730" height="660"/></clipPath><pattern id={`${id}-${index}-missing`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#eef0ed"/><path d="M0 8 L8 0" stroke="#aeb5af"/></pattern></defs>
      <rect width="800" height="740" fill="#fff"/>
      <g clipPath={`url(#${id}-${index}-map)`}>
        <rect x="35" y="25" width="730" height="660" fill="#f0f2ee"/>
        {context.tiles.map((tile,k)=>{const [a,b,c]=tile.points.map(v.project);return <image key={k} href={tile.href} width="256" height="256" opacity=".7" transform={`matrix(${(b[0]-a[0])/256} ${(b[1]-a[1])/256} ${(c[0]-a[0])/256} ${(c[1]-a[1])/256} ${a[0]} ${a[1]})`}/>})}
        <path d={boundary} fill={`url(#${id}-${index}-missing)`} fillRule="evenodd"/>
        <g clipPath={`url(#${id}-${index}-boundary)`}>{fills.map((d,i)=><path key={i} d={d} fill={TERRAIN_SLOPE_COLORS[i]}/>)}
          {(analysis.contours||[]).map(c=><path key={c.level} d={c.paths.map(p=>path(p,v.project,false)).join(' ')} fill="none" stroke="#53684f" strokeWidth={c.level%10===0?1.1:.55} opacity=".65"/>)}
          {modules&&<g data-layout-racks={layout.rackCount}>{layout.racks.flatMap(r=>r.modules.map(m=><path key={m.id} d={path(m.corners,v.project)} fill="#222" stroke="#e0edf6" strokeWidth=".55"/>))}</g>}
        </g>
        {modules&&layout.disabledRacks?.map(r=><path key={r.id} d={path(r.corners,v.project)} fill="none" stroke="#222" strokeWidth="1.2" strokeDasharray="5 3"/>)}
        {fence?.rails?.map(r=><path key={r.id} d={path(r.points,v.project,false)} fill="none" stroke="#6b4938" strokeWidth="2" strokeDasharray="6 3 1 3" data-terrain-fence="rail"/>)}
        {!modules&&model.parcelPaths.map((d,i)=><path key={i} d={d} fill="none" stroke="#207b83" strokeWidth="1.3"/>)}
        <path d={boundary} fill="none" stroke="#755a0c" strokeWidth="5" fillRule="evenodd"/><path d={boundary} fill="none" stroke="#ffe073" strokeWidth="2.5" fillRule="evenodd"/>
        {!modules&&model.labels.map(l=><g key={l.id}>{l.displaced&&<line x1={l.anchorScreen[0]} y1={l.anchorScreen[1]} x2={l.screen[0]} y2={l.screen[1]-6} stroke="#207b83"/>}<text x={l.screen[0]} y={l.screen[1]} textAnchor="middle" data-parcel-number={l.number} fontSize="18" fontWeight="700" fill="#142e35" stroke="#fff" strokeWidth="3" paintOrder="stroke">{l.number}</text></g>)}
        {!modules&&<g clipPath={`url(#${id}-${index}-boundary)`}>{model.contourLabels.map(l=><text key={l.level} x={l.screen[0]} y={l.screen[1]} textAnchor="middle" data-contour-level={l.level} fontSize="14" fill="#4d6049" stroke="#fff" strokeWidth="3" paintOrder="stroke">{l.level}m</text>)}</g>}
      </g>
      <g transform="translate(749 48)" fill="#22392e"><text y="-10" textAnchor="middle" fontSize="18">N</text><path d="M0 -5 L-6 13 L0 8 L6 13 Z"/></g>
      <g transform="translate(40 710)" fill="#22392e" stroke="#22392e" strokeWidth="1.3"><path d={`M0 -5 V5 M0 0 H${Math.min(50,Math.max(1,Math.floor((v.east-v.west)/5)))*v.scale}`} /><text y="22" stroke="none" fontSize="16">{Math.min(50,Math.max(1,Math.floor((v.east-v.west)/5)))} m</text></g>
      <text x="755" y="718" textAnchor="end" fontSize="15" fill="#41574c">等高線2m・太線10m / 黄色線：計算範囲 / 外側：周辺地図</text>
    </svg>)}
  </div>
}
