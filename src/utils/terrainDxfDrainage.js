import { terrainDrawingAnnotations } from './terrainDrawingAnnotations.js'
import { terrainDrawingPrintFit, terrainDrawingPrintViewports } from './terrainDrawingViewport.js'

// Symbols match the report's printed lengths; the inverse viewport maps
// both endpoints to model metres (+X east, +Y north), not raster pixels.
export function terrainDxfDrainage(analysis, report, fence, modelText) {
  const requested = report.drawingScale ?? 1000
  const drawingScale = terrainDrawingPrintFit(analysis.grid, requested).fits ? requested : 'auto'
  const [, v] = terrainDrawingPrintViewports(analysis.grid, drawingScale)
  const { drainage } = terrainDrawingAnnotations(analysis, v, { fence, parcels: report.parcelReview.parcels })
  const [x0, y0] = v.project([0, 0])
  const local = ([x,y]) => [(x-x0)/v.scale, (y0-y)/v.scale]
  const arrows = drainage.map(({ icon, slopeDeg }) => {
    const [tail, tip] = icon.segments[0].map(local)
    const [a,b] = [icon.segments[1][0],icon.segments[2][1]].map(local)
    const base = [(a[0]+b[0])/2,(a[1]+b[1])/2]
    const headWidth = Math.hypot(a[0]-b[0],a[1]-b[1])
    const length = Math.hypot(tip[0]-tail[0],tip[1]-tail[1])
    const unit = tip.map((c,i)=>(c-tail[i])/length)
    const leader = icon.leader?.map(local)
    return { tail, base, tip, headWidth, unit, leader, label: `${Math.round(slopeDeg)}°` }
  })
  const bounds = points => [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]
  const labels = modelText.map(e => {
    const [x,y] = e.point
    return [x,y-e.height*.25,x+e.height*String(e.text).length,y+e.height]
  })
  const symbols = arrows.map(a=>bounds([a.tail,a.tip,...[1,-1].map(sign=>[a.base[0]-a.unit[1]*a.headWidth/2*sign,a.base[1]+a.unit[0]*a.headWidth/2*sign]),...(a.leader || [])]))
  const intersects = (a,b,d)=>a[0]<b[2]+d&&a[2]>b[0]-d&&a[1]<b[3]+d&&a[3]>b[1]-d
  const height = 11/v.scale
  const gap = 3/v.scale
  for (const [i,a] of arrows.entries()) {
    const width = a.label.length*.76*height
    const [ux,uy] = a.unit
    let point,box
    search: for (const dist of [0,1,2,3,4,5,6]) for (const side of [0,1,-1,2,-2,3,-3]) {
      // Prefer a point just beyond the tip; only shift to avoid nearby text or symbols.
      const advance = gap + (Math.abs(ux)*width+Math.abs(uy)*height)/2 + dist*height*.65
      const center = [a.tip[0]+ux*advance-uy*side*height*.72,a.tip[1]+uy*advance+ux*side*height*.72]
      const candidate = [center[0]-width/2,center[1]-height/2]
      const candidateBox = [candidate[0],candidate[1]-height*.2,candidate[0]+width,candidate[1]+height]
      // If the drawing is crowded, keep the first (nearest) label, not a distant one.
      if (!point) { point = candidate; box = candidateBox }
      if (labels.some(b=>intersects(candidateBox,b,gap)) || symbols.some((b,j)=>intersects(candidateBox,b,gap*(i === j ? .4 : 1)))) continue
      point = candidate
      box = candidateBox
      break search
    }
    labels.push(box)
    a.labelPoint = point
  }
  return { arrows, height, shaftWidth: 1.6/v.scale, drawingScale }
}
