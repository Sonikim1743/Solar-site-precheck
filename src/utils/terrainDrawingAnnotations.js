import { terrainPointToLocal, pointInTerrainBoundary } from './terrainArea.js'
import { geometryPolygons, featureInteriorPoint } from '../services/parcelGeometry.js'
import { layoutTerrainLabels, terrainLabelBounds } from './terrainLabelLayout.js'
import { layoutTerrainDrainage } from './terrainDrainageLayout.js'
import { terrainDrawingLabelFits } from './terrainDrawingLabels.js'

const path = (points, project) => points.map((p,i)=>`${i?'L':'M'}${project(p).map(v=>v.toFixed(2)).join(' ')}`).join(' ')+' Z'

// Both PDF and DXF use the same north-up placement and validated DEM arrows.
export function terrainDrawingAnnotations(analysis, v, {fence, parcels=[], withDrainage=true}={}) {
    const g=analysis.grid
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
    const drainage=!withDrainage?[]:layoutTerrainDrainage(analysis,v,{occupied,fence,labelLeaders:placed.filter(l=>l.displaced).map(l=>[l.anchorScreen,[l.screen[0],l.screen[1]-6]])}).arrows
    return {drainage,parcelPaths,labels:placed,contourLabels,unplaced:[...labelLayout.unplaced,...outsideLabels],missing:parcels.filter(p=>p.role==='target'&&!p.info?.number).length,noParcelMetadata:!parcels.some(p=>p.role==='target')}
}
