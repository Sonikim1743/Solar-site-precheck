import { pointInTerrainBoundary } from './terrainArea.js'
import { getTerrainCellSlope } from './terrainLayout.js'
import { terrainSlopeIndex } from './terrainSlopeClasses.js'

const finite=Number.isFinite
const cache=new WeakMap()
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
function crossesRing(a,b,ring) {
  return ring.slice(1).some((d,i)=>{
    const c=ring[i],epsilon=1e-7
    if(Math.max(a[0],b[0])+epsilon<Math.min(c[0],d[0])||Math.max(c[0],d[0])+epsilon<Math.min(a[0],b[0])||Math.max(a[1],b[1])+epsilon<Math.min(c[1],d[1])||Math.max(c[1],d[1])+epsilon<Math.min(a[1],b[1]))return false
    return cross(a,b,c)*cross(a,b,d)<=epsilon&&cross(c,d,a)*cross(c,d,b)<=epsilon
  })
}

// Read actual surrounding DEM (including acquired boundary padding), never
// extrapolate a missing node or infer an outward normal from the parcel edge.
export function terrainDrainageHeight(grid,[x,y]) {
  const u=(x-grid.xMin)/grid.step,v=(y-grid.yMin)/grid.step
  if(!finite(u)||!finite(v)||u<0||v<0||u>grid.width-1||v>grid.height-1)return null
  const col=Math.min(Math.floor(u),grid.width-2),row=Math.min(Math.floor(v),grid.height-2)
  const i=row*grid.width,tx=u-col,ty=v-row
  const z=[grid.elevations?.[i+col],grid.elevations?.[i+col+1],grid.elevations?.[i+grid.width+col],grid.elevations?.[i+grid.width+col+1]]
  if(!z.every(finite))return null
  return (z[0]*(1-tx)+z[1]*tx)*(1-ty)+(z[2]*(1-tx)+z[3]*tx)*ty
}

function gradientAt(g,p) {
  const heights=[[p[0]-g.step,p[1]],[p[0]+g.step,p[1]],[p[0],p[1]-g.step],[p[0],p[1]+g.step]].map(q=>terrainDrainageHeight(g,q))
  if(!heights.every(finite))return null
  return [(heights[1]-heights[0])/(2*g.step),(heights[3]-heights[2])/(2*g.step)]
}

export function terrainDrainageSymbolLength(slopeDeg) {
  const grade=terrainSlopeIndex(slopeDeg)
  return grade<0?null:[18,22,26,30,34][grade]
}

// Keep corroborated alternatives until the print viewport and obstacles are
// known. A valid scan point is useful even on a constant-gradient boundary.
export function terrainDrainageCandidates(analysis,{lengthM=8,minSlopeDeg=1}={}) {
  const g=analysis?.grid
  if(!g?.boundary?.length||!(g.step>0)||!(lengthM>0))return []
  const key=JSON.stringify([lengthM,minSlopeDeg])
  if(cache.get(analysis)?.key===key)return cache.get(analysis).candidates
  const parts=[]
  let perimeter=0
  g.boundary.forEach((polygon,part)=>{
    const ring=polygon[0],holes=polygon.slice(1),segments=[],corners=[]
    const winding=Math.sign(ring.slice(1).reduce((sum,b,i)=>sum+ring[i][0]*b[1]-b[0]*ring[i][1],0))||1
    let arc=0
    for(let i=0;i<ring.length-1;i++){
      const a=ring[i],b=ring[i+1],previous=ring[(i+ring.length-2)%(ring.length-1)]
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]),u=a.map((x,k)=>x-previous[k]),v=b.map((x,k)=>x-a[k])
      const turn=Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*Math.hypot(...v)))))*180/Math.PI
      // This normal only positions an annotation; downhill always comes from DEM.
      const outward=length>0?[winding*v[1]/length,-winding*v[0]/length]:[0,0]
      if(turn>=45)corners.push({point:a,holes,arc,part,kind:'corner',score:turn,outward})
      if(length>0)segments.push({a,b,holes,length,arc,part,outward})
      arc+=length
    }
    perimeter+=arc;parts.push({segments,corners,perimeter:arc,part})
  })
  const atArc=(segments,arc)=>{
    const segment=segments.find(s=>arc>=s.arc&&arc<s.arc+s.length)
    if(!segment)return null
    const t=(arc-segment.arc)/segment.length
    return {point:segment.a.map((a,i)=>a+(segment.b[i]-a)*t),holes:segment.holes,arc,part:segment.part,outward:segment.outward,kind:'uniform',score:0}
  }
  const evaluate=candidate=>{
    if(!candidate)return null
    const {point:p,holes}=candidate,col=Math.floor((p[0]-g.xMin)/g.step),row=Math.floor((p[1]-g.yMin)/g.step)
    const cellSlope=getTerrainCellSlope(g,row,col),gradient=gradientAt(g,p)
    if(!finite(cellSlope)||cellSlope<minSlopeDeg||!gradient)return null
    const magnitude=Math.hypot(...gradient),slopeDeg=Math.atan(magnitude)*180/Math.PI
    if(!finite(slopeDeg)||slopeDeg<minSlopeDeg)return null
    const downhill=gradient.map(v=>-v/magnitude),tail=p.map((v,i)=>v-downhill[i]*lengthM/2),head=p.map((v,i)=>v+downhill[i]*lengthM/2)
    if(holes.some(h=>crossesRing(tail,head,h)))return null
    // No unsampled DEM gaps even if a future glyph source length is longer.
    const count=Math.max(4,Math.ceil(lengthM/(g.step/2))),checks=Array.from({length:count+1},(_,i)=>tail.map((v,k)=>v+(head[k]-v)*i/count))
    if(checks.some(q=>holes.some(h=>pointInTerrainBoundary(q,[[h]]))))return null
    const zs=checks.map(q=>terrainDrainageHeight(g,q))
    if(!zs.every(finite)||zs[0]-zs.at(-1)<.05||zs.some((z,i)=>i&&z>zs[i-1]+1e-7))return null
    for(const q of [tail,head]){
      const other=gradientAt(g,q),size=other&&Math.hypot(...other)
      if(!size||(gradient[0]*other[0]+gradient[1]*other[1])/(magnitude*size)<.5)return null
    }
    return {...candidate,tail,head,gradient,slopeDeg,cellSlopeDeg:cellSlope,tailElevation:zs[0],headElevation:zs.at(-1)}
  }
  const candidates=[],scanStep=Math.max(g.step*2,perimeter/512)
  for(const part of parts){
    if(!part.perimeter)continue
    const count=Math.max(1,Math.floor(part.perimeter/scanStep)),step=part.perimeter/count
    const slots=Array.from({length:count},(_,i)=>evaluate(atArc(part.segments,(i+.5)*step)))
    // Runs end at uncorroborated/flat samples, including across the ring seam.
    const gap=slots.findIndex(a=>!a),start=gap<0?0:(gap+1)%count
    let run=0,previous=null,runArc=0
    for(let i=0;i<count;i++){
      const a=slots[(start+i)%count]
      if(!a){if(previous)run++;previous=null;runArc=0;continue}
      if(previous)runArc+=step
      Object.assign(a,{run:`${part.part}:${run}`,runArc,runClosed:gap<0,perimeter:part.perimeter,sampleWeightM:step})
      previous=a
    }
    for(let i=0;i<count;i++){
      const a=slots[i],b=slots[(i+1)%count]
      if(!a||!b||a.run!==b.run)continue
      const angle=Math.acos(Math.max(-1,Math.min(1,(a.gradient[0]*b.gradient[0]+a.gradient[1]*b.gradient[1])/(Math.hypot(...a.gradient)*Math.hypot(...b.gradient)))))*180/Math.PI
      const grades=Math.abs(terrainSlopeIndex(a.slopeDeg)-terrainSlopeIndex(b.slopeDeg))
      if(angle>=30||grades)for(const q of [a,b])Object.assign(q,{kind:'gradient-change',score:Math.max(q.score,100+angle+grades*25)})
    }
    const valid=slots.filter(Boolean)
    candidates.push(...valid)
    for(const corner of part.corners){
      const a=evaluate(corner);if(!a)continue
      const near=valid.reduce((best,b)=>{const d=Math.abs(a.arc-b.arc),distance=Math.min(d,part.perimeter-d);return !best||distance<best.distance?{b,distance}:best},null)
      const linked=near&&near.distance<=step,delta=linked?((a.arc-near.b.arc+part.perimeter*1.5)%part.perimeter)-part.perimeter/2:0
      candidates.push({...a,perimeter:part.perimeter,run:linked?near.b.run:`${part.part}:corner:${a.arc}`,runArc:linked?near.b.runArc+delta:0,runClosed:linked&&near.b.runClosed,sampleWeightM:0})
    }
  }
  cache.set(analysis,{key,candidates});return candidates
}

// Compatibility for callers requesting only a bounded set of world positions.
// Print layout uses the full validated pool and selects after collision checks.
export function terrainDrainageArrows(analysis,{maxArrows=24,minSpacingM=20,...options}={}) {
  const cap=Math.min(24,Math.max(0,Math.floor(maxArrows))),g=analysis?.grid
  if(!cap||!g)return []
  const candidates=terrainDrainageCandidates(analysis,options)
  const arrows=[],separation=Math.max(g.step*2,minSpacingM/2)
  const add=a=>{if(arrows.length<cap&&!arrows.some(b=>Math.hypot(a.point[0]-b.point[0],a.point[1]-b.point[1])<separation-1e-7))arrows.push(a)}
  for(const a of candidates.filter(a=>a.score).sort((a,b)=>b.score-a.score)){if(arrows.length>=Math.min(8,cap))break;add(a)}
  for(const a of candidates.filter(a=>a.kind==='uniform'))add(a)
  return arrows
}

// The north-up map projection flips Y; projecting both actual DEM endpoints
// preserves downhill direction. No camera rotation or boundary normal enters.
export function terrainDrainageArrowDrawing(arrow,project,{symbolic=false,offsetAlong=0,offset=[0,0]}={}) {
  const a=project(arrow.tail),b=project(arrow.head),length=Math.hypot(b[0]-a[0],b[1]-a[1])
  if(!(length>0))return {path:'',tail:a,head:b,lengthPx:0}
  const u=b.map((v,i)=>(v-a[i])/length),lengthPx=symbolic?terrainDrainageSymbolLength(arrow.slopeDeg):length,anchor=project(arrow.point),shift=symbolic?Math.max(-lengthPx/2+3,Math.min(lengthPx/2-3,offsetAlong)):0,center=anchor.map((v,i)=>v+u[i]*shift+(symbolic?offset[i]:0)),tail=symbolic?center.map((v,i)=>v-u[i]*lengthPx/2):a,head=symbolic?center.map((v,i)=>v+u[i]*lengthPx/2):b,wing=Math.min(7,lengthPx*.3),n=[-u[1],u[0]]
  const p=head.map((v,i)=>v-u[i]*wing+n[i]*wing*.55),q=head.map((v,i)=>v-u[i]*wing-n[i]*wing*.55)
  const pair=p=>p.map(v=>v.toFixed(2)).join(' ')
  return {path:`M${pair(tail)} L${pair(head)} M${pair(p)} L${pair(head)} L${pair(q)}`,tail,head,lengthPx,anchor,offsetAlong:shift,segments:[[tail,head],[p,head],[head,q]]}
}

export const terrainDrainageArrowPath=(arrow,project)=>terrainDrainageArrowDrawing(arrow,project).path
