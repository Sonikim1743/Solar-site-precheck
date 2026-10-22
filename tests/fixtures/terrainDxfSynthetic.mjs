import proj4 from 'proj4'
import { createEmptyParcelReview, measureParcelReview, setReviewParcel } from '../../src/utils/parcelReview.js'
import { createTerrainPlan, normalizeTerrainArea, terrainTilePoint } from '../../src/utils/terrainArea.js'
import { buildTerrainLayout } from '../../src/utils/terrainLayout.js'
import { terrainLayoutAnalysisKey } from '../../src/utils/terrainLayoutComparison.js'

// Entirely invented geometry/DEM/parcel metadata; no company drawing or site.
export function terrainDxfSynthetic({ tiltDeg = 15, azimuthDeg = 180, fence = true, exclude = true } = {}) {
  const origin = { lat: 35, lon: 135 }
  const crs = '+proj=aeqd +lat_0=35 +lon_0=135 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'
  const rectangle = (a,b,c,d) => [[a,b],[c,b],[c,d],[a,d],[a,b]]
  const polygons = [
    [[[-90,-55],[20,-55],[20,-10],[0,-10],[0,55],[-90,55],[-90,-55]], rectangle(-70,-10,-40,15)],
    [rectangle(40,-45,90,50)],
  ]
  const boundary = { type: 'MultiPolygon', coordinates: polygons.map(p => p.map(r => r.map(v => proj4(crs,'EPSG:4326',v)))) }
  const parcelReview = setReviewParcel(createEmptyParcelReview(), { type: 'Feature', id: 'synthetic-1', geometry: boundary,
    properties: { 地番: '試験地番１２３－４・山林' } }, 'target', { fileName: 'synthetic-only.geojson', importedAt: '2026-10-19T00:00:00.000Z' })
  const geometry = measureParcelReview(parcelReview).geometry, plan = createTerrainPlan(geometry), g = plan.grid, urls = new Set()
  const elevations = Array.from({ length: g.width*g.height }, (_,i) => 100 + (g.xMin+i%g.width*g.step)*.02 + (g.yMin+Math.floor(i/g.width)*g.step)*.01)
  for (let i=0;i<elevations.length;i++) {
    const [lon,lat]=plan.positionAt(i),[x,y]=terrainTilePoint(lon,lat,15)
    for (const px of [Math.floor(x),Math.floor(x)+1]) for (const py of [Math.floor(y),Math.floor(y)+1]) urls.add(`https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/15/${Math.floor(px/256)}/${Math.floor(py/256)}.png`)
  }
  const terrainArea=normalizeTerrainArea({version:1,geometryKey:plan.geometryKey,geometry:plan.geometry,fetchedAt:'2026-10-19T00:00:00Z',source:{urls:[...urls]},grid:{...g,elevations,sourceIds:elevations.map(()=> 'dem5b_png')}})
  const raw=buildTerrainLayout(terrainArea,{tiltDeg,azimuthDeg,minColumns:4,maxColumns:4}), pool={...raw,analysisReference:terrainArea,analysisKey:terrainLayoutAnalysisKey(terrainArea)}
  const terrainPreview={enabled:true,layout:pool,options:pool.options,appliedOptions:pool.options,layoutMode:'manual',appliedMode:'manual',fence,disabledRackIds:exclude?[pool.racks[0]?.id]:[]}
  return {terrainArea,terrainPreview,parcelReview,position:origin,siteName:'合成試験図（実候補地ではありません）',appVersion:'1.28.2-local'}
}
