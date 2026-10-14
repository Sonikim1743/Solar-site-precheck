// Display context only: the effective geometry, DEM and statistics are unchanged.
export function terrainDrawingViewport(grid, marginM = 10) {
  const ps=grid.boundary.flat(2),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1])
  const west=Math.min(...xs)-marginM,east=Math.max(...xs)+marginM,south=Math.min(...ys)-marginM,north=Math.max(...ys)+marginM
  const scale=Math.min(730/(east-west),660/(north-south)),cx=(west+east)/2,cy=(south+north)/2
  return {width:800,height:740,scale,marginM,west:cx-365/scale,east:cx+365/scale,south:cy-330/scale,north:cy+330/scale,
    project:([x,y])=>[400+(x-cx)*scale,355-(y-cy)*scale]}
}
