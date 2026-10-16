import { terrainDrainageCandidates, terrainDrainageArrowDrawing } from './terrainDrainage.js'

const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
const pointDistance=(p,[a,b])=>{
  const x=b[0]-a[0],y=b[1]-a[1],size=x*x+y*y
  const t=size?Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/size)):0
  return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y)
}

export function terrainDrainageSegmentDistance([a,b],[c,d]) {
  if(Math.max(a[0],b[0])+1e-8>=Math.min(c[0],d[0])&&Math.max(c[0],d[0])+1e-8>=Math.min(a[0],b[0])&&Math.max(a[1],b[1])+1e-8>=Math.min(c[1],d[1])&&Math.max(c[1],d[1])+1e-8>=Math.min(a[1],b[1])&&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0)return 0
  return Math.min(pointDistance(a,[c,d]),pointDistance(b,[c,d]),pointDistance(c,[a,b]),pointDistance(d,[a,b]))
}

function hitsBox(segment,box,padding) {
  const l=box.left-padding,r=box.right+padding,t=box.top-padding,b=box.bottom+padding
  if(segment.some(([x,y])=>x>=l&&x<=r&&y>=t&&y<=b))return true
  return [[[l,t],[r,t]],[[r,t],[r,b]],[[r,b],[l,b]],[[l,b],[l,t]]].some(edge=>terrainDrainageSegmentDistance(segment,edge)<1e-8)
}

const ringDistance=(a,b)=>{const d=Math.abs(a.arc-b.arc);return Math.min(d,a.perimeter-d)}
const runDistance=(a,b)=>{
  const d=Math.abs(a.runArc-b.runArc)
  return a.runClosed?Math.min(d,a.perimeter-d):d
}

// SVG units are physical print units: 800 units = 198 mm in the A3 drawing.
// No terrain/camera/DEM data is changed by annotation placement.
export function layoutTerrainDrainage(analysis,viewport,{occupied=[],fence=null,labelLeaders=[],maxArrows=64,minSpacingPx=40,frame={left:35,top:25,right:765,bottom:685}}={}) {
  const candidates=terrainDrainageCandidates(analysis),scale=viewport.scale
  const fenceSegments=(fence?.rails||[]).flatMap(r=>r.points.slice(1).map((p,i)=>[viewport.project(r.points[i]),viewport.project(p)]))
  const lineObstacles=[...fenceSegments.map(segment=>({segment,radius:1})),...labelLeaders.map(segment=>({segment,radius:.5}))]
  const halo=2.25,clearance=2,radius=minSpacingPx*.75,arrows=[],covered=new Set(),used=new Set()
  const variants=candidates.map(a=>{
    const original=terrainDrainageArrowDrawing(a,viewport.project,{symbolic:true}),p=viewport.project(a.point),out=viewport.project(a.point.map((v,i)=>v+a.outward[i]))
    const along=(original.head[0]-original.tail[0])*(out[0]-p[0])+(original.head[1]-original.tail[1])*(out[1]-p[1]),sign=Math.sign(along)
    // Recenter only along the same shaft. The corroborated boundary point
    // stays on that shaft, >=3 units from its ends; no leader is necessary.
    const offsets=[0,...(sign?[6,10,12].map(n=>sign*Math.min(n,original.lengthPx/2-3)):[])]
    const icons=[...new Set(offsets)].map(offsetAlong=>terrainDrainageArrowDrawing(a,viewport.project,{symbolic:true,offsetAlong}))
    const outLength=Math.hypot(out[0]-p[0],out[1]-p[1]),normal=out.map((x,i)=>(x-p[i])/outLength)
    const support=Math.max(...original.segments.flat().map(q=>-(q[0]-p[0])*normal[0]-(q[1]-p[1])*normal[1]))
    for(const distance of [support+4,support+6,support+8]){
      const icon=terrainDrainageArrowDrawing(a,viewport.project,{symbolic:true,offset:normal.map(n=>n*distance)})
      const [tail,head]=icon.segments[0],dx=head[0]-tail[0],dy=head[1]-tail[1],t=Math.max(0,Math.min(1,((p[0]-tail[0])*dx+(p[1]-tail[1])*dy)/(dx*dx+dy*dy))),end=[tail[0]+t*dx,tail[1]+t*dy]
      // A neutral short callout is a last resort. Its dot retains the exact
      // validated boundary anchor; its line never supplies a flow direction.
      if(Math.hypot(end[0]-p[0],end[1]-p[1])<=12)icons.push({...icon,leader:[p,end]})
    }
    return icons.filter(icon=>{
      if(!icon.path)return false
      const ps=icon.segments.flat()
      if(ps.some(([x,y])=>x-halo<frame.left||x+halo>frame.right||y-halo<frame.top||y+halo>frame.bottom))return false
      if(icon.segments.some(s=>occupied.some(b=>hitsBox(s,b,halo+clearance))))return false
      if(icon.leader&&occupied.some(b=>hitsBox(icon.leader,b,3)))return false
      if(icon.leader){
        const [anchor,end]=icon.leader,length=Math.hypot(end[0]-anchor[0],end[1]-anchor[1]),t=Math.min(1,3/length)
        // Fence and boundary can coincide within projection/clip roundoff.
        // Permit contact inside the anchor dot, never a crossing farther along.
        const clearStart=anchor.map((v,i)=>v+(end[i]-v)*t)
        if(length>3&&lineObstacles.some(({segment})=>terrainDrainageSegmentDistance([clearStart,end],segment)<1e-7))return false
      }
      return !icon.segments.some(s=>lineObstacles.some(({segment,radius})=>terrainDrainageSegmentDistance(s,segment)<halo+radius+clearance-1e-7))
    })
  })
  const samples=candidates.map((a,i)=>({a,i})).filter(({a})=>a.sampleWeightM>0)
  const covers=(a,b)=>a.run===b.run&&runDistance(a,b)*scale<=radius+1e-7
  while(arrows.length<Math.min(64,Math.max(0,Math.floor(maxArrows)))){
    let best=null
    for(let i=0;i<candidates.length;i++){
      if(used.has(i)||!variants[i].length)continue
      const a=candidates[i],spacing=a.score?minSpacingPx*.8:minSpacingPx
      if(arrows.some(b=>a.part===b.part&&(ringDistance(a,b)*scale<spacing-1e-7||Math.hypot(a.point[0]-b.point[0],a.point[1]-b.point[1])<analysis.grid.step*2-1e-7)))continue
      const icon=variants[i].find(icon=>!arrows.some(b=>{
        if(icon.segments.some(s=>b.icon.segments.some(t=>terrainDrainageSegmentDistance(s,t)<halo*2+clearance-1e-7)))return true
        if(icon.leader&&b.icon.segments.some(t=>terrainDrainageSegmentDistance(icon.leader,t)<halo+2))return true
        if(b.icon.leader&&icon.segments.some(t=>terrainDrainageSegmentDistance(b.icon.leader,t)<halo+2))return true
        return icon.leader&&b.icon.leader&&terrainDrainageSegmentDistance(icon.leader,b.icon.leader)<3
      }))
      if(!icon)continue
      const gain=samples.reduce((sum,{a:b,i:j})=>sum+(!covered.has(j)&&covers(a,b)?b.sampleWeightM:0),0)
      const missingPart=!arrows.some(b=>a.part===b.part),missingRun=!arrows.some(b=>a.run===b.run)
      if(!gain&&!missingRun&&!a.score)continue
      const score=(missingPart?1e9:0)+(missingRun?1e7:0)+gain*scale*100+Math.min(300,a.score)*.2-(icon.leader?50:0)-Math.abs(icon.offsetAlong)*.01
      // Coordinate tie breaks keep equivalent rings independent of start/winding.
      if(!best||score>best.score+1e-7||(Math.abs(score-best.score)<1e-7&&(a.point[0]<best.a.point[0]||(a.point[0]===best.a.point[0]&&a.point[1]<best.a.point[1]))))best={a,icon,i,score}
    }
    if(!best)break
    used.add(best.i);arrows.push({...best.a,icon:best.icon})
    for(const {a,i} of samples)if(covers(best.a,a))covered.add(i)
  }
  const validLengthM=samples.reduce((n,{a})=>n+a.sampleWeightM,0),coveredLengthM=samples.reduce((n,{a,i})=>n+(covered.has(i)?a.sampleWeightM:0),0)
  let maxUncoveredM=0
  for(const run of new Set(samples.map(({a})=>a.run))){
    const group=samples.filter(({a})=>a.run===run).sort((a,b)=>a.a.runArc-b.a.runArc)
    let gap=0,prefix=0,inPrefix=true
    for(const {a,i} of group){if(covered.has(i)){gap=0;inPrefix=false}else{gap+=a.sampleWeightM;if(inPrefix)prefix=gap;maxUncoveredM=Math.max(maxUncoveredM,gap)}}
    if(group[0]?.a.runClosed&&prefix<group.reduce((sum,{a})=>sum+a.sampleWeightM,0)-1e-7)maxUncoveredM=Math.max(maxUncoveredM,prefix+gap)
  }
  return {arrows,metrics:{candidateCount:candidates.length,validLengthM,coveredLengthM,coveragePercent:validLengthM?coveredLengthM/validLengthM*100:null,maxUncoveredM,validParts:new Set(candidates.map(a=>a.part)).size,representedParts:new Set(arrows.map(a=>a.part)).size}}
}
