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

export function terrainDrainageArrows(analysis,{lengthM=8,maxArrows=24,minSpacingM=20,minSlopeDeg=1}={}) {
  const g=analysis?.grid
  if(!g?.boundary?.length||!(g.step>0)||!(lengthM>0))return []
  const key=JSON.stringify([lengthM,maxArrows,minSpacingM,minSlopeDeg])
  if(cache.get(analysis)?.key===key)return cache.get(analysis).arrows
  const segments=[],corners=[]
  let perimeter=0
  g.boundary.forEach((polygon,part)=>{
    const ring=polygon[0],holes=polygon.slice(1)
    for(let i=0;i<ring.length-1;i++){
      const a=ring[i],b=ring[i+1],previous=ring[(i+ring.length-2)%(ring.length-1)]
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]),u=a.map((x,k)=>x-previous[k]),v=b.map((x,k)=>x-a[k])
      const turn=Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*Math.hypot(...v)))))*180/Math.PI
      if(turn>=45)corners.push({point:a,holes,arc:perimeter,part,kind:'corner',score:turn})
      if(length>0)segments.push({a,b,holes,length,arc:perimeter,part})
      perimeter+=length
    }
  })
  const cap=Math.min(24,Math.max(0,Math.floor(maxArrows)))
  if(!cap)return []
  const atArc=(arc,kind)=>{
    const segment=segments.find(s=>arc>=s.arc&&arc<s.arc+s.length)
    if(!segment)return null
    const t=(arc-segment.arc)/segment.length
    return {point:segment.a.map((a,i)=>a+(segment.b[i]-a)*t),holes:segment.holes,arc,part:segment.part,kind}
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
  const uniform=[],features=corners.map(evaluate).filter(Boolean)
  const spacing=Math.max(minSpacingM,perimeter/Math.min(16,cap))
  for(let arc=spacing/2;arc<perimeter;arc+=spacing){const a=evaluate(atArc(arc,'uniform'));if(a)uniform.push(a)}
  // At most 128 scan positions, never closer than two acquired DEM cells.
  const scanStep=Math.max(g.step*2,perimeter/128)
  let previous=null
  for(let arc=scanStep/2;arc<perimeter;arc+=scanStep){
    const a=evaluate(atArc(arc,'gradient-change'))
    if(a&&previous&&a.part===previous.part){
      const angle=Math.acos(Math.max(-1,Math.min(1,(a.gradient[0]*previous.gradient[0]+a.gradient[1]*previous.gradient[1])/(Math.hypot(...a.gradient)*Math.hypot(...previous.gradient)))))*180/Math.PI
      const grades=Math.abs(terrainSlopeIndex(a.slopeDeg)-terrainSlopeIndex(previous.slopeDeg))
      if(angle>=30||grades)features.push({...previous,kind:'gradient-change',score:100+angle+grades*25},{...a,score:100+angle+grades*25})
    }
    previous=a
  }
  const arrows=[],separation=Math.max(g.step*2,minSpacingM/2)
  const add=a=>{if(arrows.length<cap&&!arrows.some(b=>Math.hypot(a.point[0]-b.point[0],a.point[1]-b.point[1])<separation-1e-7))arrows.push(a)}
  for(const a of features.sort((a,b)=>b.score-a.score)){if(arrows.length>=Math.min(8,cap))break;add(a)}
  for(const a of uniform)add(a)
  cache.set(analysis,{key,arrows});return arrows
}

// The north-up map projection flips Y; projecting both actual DEM endpoints
// preserves downhill direction. No camera rotation or boundary normal enters.
export function terrainDrainageArrowDrawing(arrow,project,{symbolic=false}={}) {
  const a=project(arrow.tail),b=project(arrow.head),length=Math.hypot(b[0]-a[0],b[1]-a[1])
  if(!(length>0))return {path:'',tail:a,head:b,lengthPx:0}
  const u=b.map((v,i)=>(v-a[i])/length),lengthPx=symbolic?terrainDrainageSymbolLength(arrow.slopeDeg):length,center=project(arrow.point),tail=symbolic?center.map((v,i)=>v-u[i]*lengthPx/2):a,head=symbolic?center.map((v,i)=>v+u[i]*lengthPx/2):b,wing=Math.min(7,lengthPx*.3),n=[-u[1],u[0]]
  const p=head.map((v,i)=>v-u[i]*wing+n[i]*wing*.55),q=head.map((v,i)=>v-u[i]*wing-n[i]*wing*.55)
  const pair=p=>p.map(v=>v.toFixed(2)).join(' ')
  return {path:`M${pair(tail)} L${pair(head)} M${pair(p)} L${pair(head)} L${pair(q)}`,tail,head,lengthPx}
}

export const terrainDrainageArrowPath=(arrow,project)=>terrainDrainageArrowDrawing(arrow,project).path
