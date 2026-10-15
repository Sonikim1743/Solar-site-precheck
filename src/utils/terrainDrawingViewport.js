// Display context only: the effective geometry, DEM and statistics are unchanged.
export const TERRAIN_DRAWING_PHOTO_EXTENT = 1.25
// The standalone PDF draws the complete 800-unit SVG exactly 198 mm wide.
// Local coordinates are WGS84 azimuthal-equidistant metres, not Web Mercator pixels.
export const TERRAIN_DRAWING_PRINT_WIDTH_MM = 198
export const TERRAIN_DRAWING_SCALES = Object.freeze([1000, 2000, 5000, 10000])
export function normalizeTerrainDrawingScale(value = 1000) {
  if(value === 'auto')return value
  if(!TERRAIN_DRAWING_SCALES.includes(value))throw new RangeError('配置図の縮尺は1:1000・1:2000・1:5000・1:10000または自動を選んでください。')
  return value
}
export function terrainDrawingPrintFit(grid, scale = 1000) {
  const denominator=normalizeTerrainDrawingScale(scale)
  if(denominator==='auto')return {fits:true,denominator,reason:''}
  const ps=grid.boundary.flat(2),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1])
  const spanX=Math.max(...xs)-Math.min(...xs),spanY=Math.max(...ys)-Math.min(...ys)
  const unitsPerMeter=800*1000/(TERRAIN_DRAWING_PRINT_WIDTH_MM*denominator)
  const availableWidthM=730/unitsPerMeter,availableHeightM=660/unitsPerMeter
  const fits=spanX+20<=availableWidthM+1e-7&&spanY+20<=availableHeightM+1e-7
  const next=TERRAIN_DRAWING_SCALES.find(d=>spanX+20<=730*TERRAIN_DRAWING_PRINT_WIDTH_MM*d/800000+1e-7&&spanY+20<=660*TERRAIN_DRAWING_PRINT_WIDTH_MM*d/800000+1e-7)
  return {fits,denominator,unitsPerMeter,availableWidthM,availableHeightM,reason:fits?'':`1:${denominator}では範囲全体と周囲10mがA3横1枚に収まりません。${next?`1:${next}など、より小さい縮尺を選んでください。`:'範囲を分けるか「自動（図に合わせる）」を選んでください。'}自動縮小・切り取りは行いません。`}
}
export function terrainDrawingPrintViewports(grid, scale = 1000) {
  const fit=terrainDrawingPrintFit(grid,scale)
  if(fit.denominator==='auto')return [terrainDrawingViewport(grid),terrainDrawingViewport(grid,10,TERRAIN_DRAWING_PHOTO_EXTENT)]
  if(!fit.fits)throw new RangeError(fit.reason)
  const ps=grid.boundary.flat(2),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2
  const s=fit.unitsPerMeter,v={width:800,height:740,scale:s,marginM:10,denominator:fit.denominator,west:cx-365/s,east:cx+365/s,south:cy-330/s,north:cy+330/s,project:([x,y])=>[400+(x-cx)*s,355-(y-cy)*s]}
  return [v,v]
}
export function terrainDrawingPrintScaleBar(viewport, scale = 1000, reference = viewport) {
  return normalizeTerrainDrawingScale(scale)==='auto'?terrainDrawingScaleBar(viewport,reference):{meters:50,pixelLength:50*viewport.scale}
}
export function terrainDrawingViewport(grid, marginM = 10, extentFactor = 1) {
  const ps=grid.boundary.flat(2),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1])
  const west=Math.min(...xs)-marginM,east=Math.max(...xs)+marginM,south=Math.min(...ys)-marginM,north=Math.max(...ys)+marginM
  const factor=Number.isFinite(extentFactor)&&extentFactor>=1?extentFactor:1
  const scale=Math.min(730/(east-west),660/(north-south))/factor,cx=(west+east)/2,cy=(south+north)/2
  return {width:800,height:740,scale,marginM,west:cx-365/scale,east:cx+365/scale,south:cy-330/scale,north:cy+330/scale,
    project:([x,y])=>[400+(x-cx)*scale,355-(y-cy)*scale]}
}

// Both bars have the original layout bar's physical printed length. The
// number is derived from each view's actual metres per pixel, never relabelled.
export function terrainDrawingScaleBar(viewport, reference = viewport) {
  const referenceMeters=Math.min(50,Math.max(1,Math.floor((reference.east-reference.west)/5)))
  const pixelLength=referenceMeters*reference.scale
  return {pixelLength,meters:pixelLength/viewport.scale}
}
