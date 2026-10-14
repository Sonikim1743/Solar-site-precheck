import { createEmptyParcelReview, measureParcelReview } from '../../src/utils/parcelReview.js'
import { createTerrainPlan, normalizeTerrainArea, terrainTilePoint } from '../../src/utils/terrainArea.js'
export function terrainReviewSynthetic() {
  const square=(x,y,size)=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]
  const parcelReview={...createEmptyParcelReview(),boundary:{type:'Polygon',coordinates:[square(135,35,.0013),square(135.00045,35.00045,.00015)]}}
  const geometry=measureParcelReview(parcelReview).geometry,plan=createTerrainPlan(geometry),grid=plan.grid,urls=new Set()
  const elevations=Array.from({length:grid.width*grid.height},(_,i)=>{
    const x=grid.xMin+i%grid.width*grid.step
    return 100+Math.min(x,20)*Math.tan(12*Math.PI/180)+Math.max(0,x-20)*Math.tan(18*Math.PI/180)
  })
  for(let i=0;i<elevations.length;i++) {
    const [lon,lat]=plan.positionAt(i),[x,y]=terrainTilePoint(lon,lat,15)
    for(const [px,py] of [[Math.floor(x),Math.floor(y)],[Math.floor(x)+1,Math.floor(y)],[Math.floor(x),Math.floor(y)+1],[Math.floor(x)+1,Math.floor(y)+1]]) urls.add(`https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/15/${Math.floor(px/256)}/${Math.floor(py/256)}.png`)
  }
  const terrainArea=normalizeTerrainArea({version:1,geometryKey:plan.geometryKey,geometry:plan.geometry,fetchedAt:'2026-10-13T00:00:00Z',source:{urls:[...urls]},grid:{...grid,elevations,sourceIds:elevations.map(()=> 'dem5b_png')}})
  return {parcelReview,terrainArea,siteName:'合成テスト地形（実候補地ではありません）',appVersion:'1.28.2-local',position:{lat:35.00065,lon:135.00065}}
}
