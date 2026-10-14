// Display context only: the effective geometry, DEM and statistics are unchanged.
export const TERRAIN_DRAWING_PHOTO_EXTENT = 1.25
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
