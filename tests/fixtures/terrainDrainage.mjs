// Analytic synthetic terrain only; no candidate-site or downloaded source data.
export const drainageRing=(x,y,width,height)=>[[x,y],[x+width,y],[x+width,y+height],[x,y+height],[x,y]]

export function drainageFixture({boundary=[[drainageRing(0,0,100,100)]],height=(x,y)=>100-.2*x+.1*y,missing=()=>false}={}) {
  const points=boundary.flat(2),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),step=5
  const xMin=Math.floor((Math.min(...xs)-15)/step)*step,yMin=Math.floor((Math.min(...ys)-15)/step)*step
  const width=Math.ceil((Math.max(...xs)+15-xMin)/step)+1,rows=Math.ceil((Math.max(...ys)+15-yMin)/step)+1
  const elevations=[],slopes=[]
  for(let row=0;row<rows;row++)for(let col=0;col<width;col++){
    const x=xMin+col*step,y=yMin+row*step
    elevations.push(missing(x,y)?null:height(x,y))
    slopes.push(Math.atan(Math.hypot((height(x+5,y)-height(x-5,y))/10,(height(x,y+5)-height(x,y-5))/10))*180/Math.PI)
  }
  return {geometryKey:'synthetic-drainage',contours:[],grid:{origin:{lat:35,lon:135},width,height:rows,step,xMin,yMin,boundary,elevations,slopes}}
}

export const drainageCases=()=>[
  ['square',drainageFixture()],
  ['long-narrow',drainageFixture({boundary:[[drainageRing(0,0,500,12)]]})],
  ['concave',drainageFixture({boundary:[[[[0,0],[100,0],[100,30],[30,30],[30,100],[0,100],[0,0]]]]})],
  ['separate-parts',drainageFixture({boundary:[[drainageRing(0,0,500,100)],[drainageRing(520,0,10,10)]]})],
  ['ten-islands',drainageFixture({boundary:Array.from({length:10},(_,i)=>[drainageRing(i*25,0,10,10)])})],
  ['channel-nodata',drainageFixture({missing:(x)=>x>=45&&x<=55})],
  ['hole',drainageFixture({boundary:[[drainageRing(0,0,100,100),drainageRing(38,1,24,35)]]})],
  ['flat',drainageFixture({height:()=>100})],
  ['flat-steep',drainageFixture({height:x=>100-Math.max(0,x-50)*.4})],
  ['slope-change',drainageFixture({height:x=>100-Math.min(x,35)*Math.tan(2*Math.PI/180)-Math.max(0,Math.min(x-35,30))*Math.tan(12*Math.PI/180)-Math.max(0,x-65)*Math.tan(25*Math.PI/180)})],
  ['steep',drainageFixture({height:x=>100-x})],
  ['valid-patch',drainageFixture({missing:(x,y)=>x<15||x>35||y< -15||y>15})],
]

export const drainageTestFence=()=>({rails:[{id:'synthetic-fence',points:drainageRing(3,3,94,94)}]})
export const drainageTestLabels=()=>[[220,150,360,174],[360,150,500,174],[530,280,665,304],[310,535,450,559],[155,405,290,429]].map(([left,top,right,bottom])=>({left,top,right,bottom}))
