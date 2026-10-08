import proj4 from 'proj4'

// GSI terrain is in local metres. Explicit offsets are needed for proj4's
// AEQD inverse; omitted offsets can return NaN instead of geographical bounds.
export function terrainMapLayers(analysis) {
  const grid = analysis.grid
  const project = proj4('EPSG:4326', `+proj=aeqd +lat_0=${grid.origin.lat} +lon_0=${grid.origin.lon} +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs`)
  const inverse = point => {
    const position = project.inverse(point)
    if (!position.every(Number.isFinite)) throw new Error('地形の地図座標を変換できませんでした。')
    return position
  }
  const latLng = point => { const [lon, lat] = inverse(point); return [lat, lon] }
  const half = grid.step / 2
  const bounds = [latLng([grid.xMin - half, grid.yMin - half]), latLng([grid.xMin + (grid.width - 1) * grid.step + half, grid.yMin + (grid.height - 1) * grid.step + half])]
  const contours = { type: 'FeatureCollection', features: analysis.contours.map(contour => ({ type: 'Feature', properties: { elevation: contour.level, major: Math.abs(contour.level % 10) < 1e-6 }, geometry: { type: 'MultiLineString', coordinates: contour.paths.map(path => path.map(inverse)) } })) }
  return { bounds, contours }
}
