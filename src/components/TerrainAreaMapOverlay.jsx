import { useEffect, useMemo } from 'react'
import { GeoJSON, ImageOverlay, Pane, useMap } from 'react-leaflet'
import { terrainMapLayers } from '../utils/terrainMap.js'
import { getTerrainCellSlope } from '../utils/terrainLayout.js'
import L from 'leaflet'
import { TERRAIN_SLOPE_COLORS, terrainSlopeIndex } from '../utils/terrainSlopeClasses.js'

const colors = TERRAIN_SLOPE_COLORS
const finite = Number.isFinite

function terrainRaster(analysis) {
  const grid = analysis.grid, factor = 4
  const canvas = document.createElement('canvas')
  canvas.width = grid.width * factor
  canvas.height = grid.height * factor
  const context = canvas.getContext('2d')
  if (!context) return null
  const pixel = ([x, y]) => [(x - grid.xMin + grid.step / 2) / grid.step * factor, (grid.yMin + (grid.height - 1) * grid.step + grid.step / 2 - y) / grid.step * factor]
  context.beginPath()
  for (const polygon of grid.boundary) for (const ring of polygon) {
    ring.forEach((point, i) => { const [x, y] = pixel(point); if (i) context.lineTo(x, y); else context.moveTo(x, y) })
    context.closePath()
  }
  context.clip('evenodd')
  context.fillStyle = '#b5bcb5'
  context.fillRect(0, 0, canvas.width, canvas.height)
  for (let row = 0; row < grid.height - 1; row++) for (let col = 0; col < grid.width - 1; col++) {
    const slope = getTerrainCellSlope(grid, row, col)
    if (!finite(slope)) continue
    context.fillStyle = colors[terrainSlopeIndex(slope)]
    const [x, y] = pixel([grid.xMin + col * grid.step, grid.yMin + row * grid.step])
    context.fillRect(x, y - factor, factor, factor)
  }
  return canvas.toDataURL('image/png')
}

export default function TerrainAreaMapOverlay({ analysis, dimmed = false }) {
  const map = useMap()
  const layers = useMemo(() => {
    if (!analysis) return null
    const { bounds, contours } = terrainMapLayers(analysis)
    return { bounds, contours, image: terrainRaster(analysis) }
  }, [analysis])
  useEffect(() => {
    if (!analysis) return
    const bounds = L.geoJSON(analysis.geometry).getBounds()
    if (bounds.isValid()) { map.stop(); map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18, animate: false }) }
  }, [map, analysis?.geometryKey, analysis?.fetchedAt])
  if (!layers) return null
  return <>
    {layers.image && <Pane name="terrain-area-colors" style={{ zIndex: 390, pointerEvents: 'none' }}><ImageOverlay url={layers.image} bounds={layers.bounds} opacity={dimmed ? .12 : .64} interactive={false} /></Pane>}
    <Pane name="terrain-area-lines" style={{ zIndex: 450, pointerEvents: 'none' }}>
      <GeoJSON key={`contour-${analysis.geometryKey}-${analysis.fetchedAt}`} data={layers.contours} interactive={false} style={feature => ({ color: '#685c46', weight: dimmed ? (feature.properties.major ? 1 : .5) : (feature.properties.major ? 1.7 : .8), opacity: dimmed ? .18 : .9, interactive: false })} />
      <GeoJSON key={`area-${analysis.geometryKey}`} data={analysis.geometry} interactive={false} style={{ color: '#ffe073', weight: 3, opacity: dimmed ? .2 : 1, fill: false, interactive: false }} />
    </Pane>
  </>
}
