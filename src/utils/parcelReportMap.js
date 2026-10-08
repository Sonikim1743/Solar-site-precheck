const WIDTH = 720, HEIGHT = 300, PADDING = 26, TILE_SIZE = 256
export const PARCEL_REPORT_MAP_MAX_TILES = 20

// The boundary and standard-map tiles share one Web Mercator projection.
// This display projection does not participate in parcel area calculations.
function worldPoint([lon, lat], zoom) {
  const size = TILE_SIZE * 2 ** zoom
  const sine = Math.sin(lat * Math.PI / 180)
  return [(lon + 180) / 360 * size, (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size]
}

function pointsOf(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates?.flat() || []
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates?.flat(2) || []
  return []
}

export function parcelReportMapLayout(geometries) {
  const points = (geometries || []).flatMap(pointsOf)
  if (!points.length || points.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || point[0] < 120 || point[0] > 155 || point[1] < 20 || point[1] > 50)) return null
  const world = points.map(point => worldPoint(point, 0))
  let west = Infinity, east = -Infinity, north = Infinity, south = -Infinity
  for (const [x, y] of world) { west = Math.min(west, x); east = Math.max(east, x); north = Math.min(north, y); south = Math.max(south, y) }
  let zoom = 18
  while (zoom > 2 && ((east - west) * 2 ** zoom > WIDTH - 2 * PADDING || (south - north) * 2 ** zoom > HEIGHT - 2 * PADDING)) zoom--
  const left = (west + east) / 2 * 2 ** zoom - WIDTH / 2
  const top = (north + south) / 2 * 2 ** zoom - HEIGHT / 2
  const tiles = [], count = 2 ** zoom
  for (let y = Math.max(0, Math.floor(top / TILE_SIZE)); y <= Math.min(count - 1, Math.ceil((top + HEIGHT) / TILE_SIZE) - 1); y++) {
    for (let x = Math.max(0, Math.floor(left / TILE_SIZE)); x <= Math.min(count - 1, Math.ceil((left + WIDTH) / TILE_SIZE) - 1); x++) {
      tiles.push({ key: `${zoom}/${x}/${y}`, x: x * TILE_SIZE - left, y: y * TILE_SIZE - top, href: `https://cyberjapandata.gsi.go.jp/xyz/std/${zoom}/${x}/${y}.png` })
    }
  }
  if (tiles.length > PARCEL_REPORT_MAP_MAX_TILES) return null
  return {
    width: WIDTH, height: HEIGHT, padding: PADDING, zoom, left, top, tiles,
    key: `${zoom}/${left}/${top}`,
    project(point) { const [x, y] = worldPoint(point, zoom); return [x - left, y - top] },
  }
}
