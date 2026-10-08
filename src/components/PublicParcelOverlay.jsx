import React from 'react'
import L from 'leaflet'
import { createElementObject, createLayerComponent } from '@react-leaflet/core'
import { leafletLayer, PolygonSymbolizer } from 'protomaps-leaflet'
import { PUBLIC_PARCEL_SOURCE, isPublicParcelFeature, publicParcelNumber, publicParcelLabelAnchor, publicParcelStatus } from '../utils/publicParcelLayer.js'
import './public-parcel-overlay.css'

const PANE_NAME = 'publicParcelReference'
const ATTRIBUTION = '<a href="https://source.coop/smartmaps/amx-2024-04" target="_blank" rel="noopener noreferrer">公開地番2024：法務省データをAMXが加工</a>'

class ParcelNumberSymbolizer {
  place(layout, geometry, feature) {
    const number = publicParcelNumber(feature)
    const position = number && publicParcelLabelAnchor(geometry)
    if (!position) return undefined
    // The renderer's collision index expects its Point class (including dist).
    const anchor = geometry[0][0].clone()
    anchor.x = position.x; anchor.y = position.y
    const font = '600 12px sans-serif'
    layout.scratch.font = font
    const width = layout.scratch.measureText(number).width
    const box = { minX: anchor.x - width / 2 - 2, minY: anchor.y - 8, maxX: anchor.x + width / 2 + 2, maxY: anchor.y + 8 }
    return [{ anchor, bboxes: [box], draw: ctx => {
      ctx.globalAlpha = 1
      ctx.font = font
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3
      ctx.strokeStyle = '#163a38'
      ctx.strokeText(number, 0, 0)
      ctx.fillStyle = '#e9ffff'
      ctx.fillText(number, 0, 0)
    } }]
  }
}

function createPublicParcelLayer(props, context) {
  // The official Leaflet renderer expects the same Leaflet singleton globally.
  globalThis.L = L
  const pane = context.map.getPane(PANE_NAME) || context.map.createPane(PANE_NAME)
  pane.style.zIndex = '410'
  pane.style.pointerEvents = 'none'
  pane.classList.add('public-parcel-reference-pane')
  const layer = leafletLayer({
    sources: { parcels: { url: PUBLIC_PARCEL_SOURCE.url, levelDiff: 0, maxDataZoom: PUBLIC_PARCEL_SOURCE.maxDataZoom } },
    pane: PANE_NAME,
    minZoom: PUBLIC_PARCEL_SOURCE.minZoom,
    maxZoom: 21,
    noWrap: true,
    bounds: [[20, 120], [50, 155]],
    keepBuffer: 0,
    updateWhenIdle: true,
    attribution: ATTRIBUTION,
    paintRules: [
      { dataSource: 'parcels', dataLayer: 'fude', filter: (_, feature) => isPublicParcelFeature(feature), symbolizer: new PolygonSymbolizer({ fill: 'rgba(0,0,0,0)', stroke: 'rgba(22,58,56,.65)', width: 2.3 }) },
      { dataSource: 'parcels', dataLayer: 'fude', filter: (_, feature) => isPublicParcelFeature(feature), symbolizer: new PolygonSymbolizer({ fill: 'rgba(0,0,0,0)', stroke: '#d6ffff', width: 1.15 }) },
    ],
    labelRules: [{ dataSource: 'parcels', dataLayer: 'fude', minzoom: 15, filter: (_, feature) => Boolean(publicParcelNumber(feature)), symbolizer: new ParcelNumberSymbolizer() }],
  })
  let callback = props.onStatus
  let active = false
  const results = new Map()
  const errors = new Set()
  const report = state => { if (active || state === 'off') callback?.(publicParcelStatus(state)) }
  layer.setStatusCallback = value => { callback = value }

  // The renderer catches network errors internally. Observe its existing tile
  // promises so failed requests cannot be misreported as missing coverage.
  const view = layer.views.get('parcels')
  const getDisplayTile = view.getDisplayTile.bind(view)
  view.getDisplayTile = async coords => {
    const key = `${coords.x}:${coords.y}:${coords.z}`
    try {
      const tile = await getDisplayTile(coords)
      results.set(key, (tile.data.get('fude') || []).some(isPublicParcelFeature))
      errors.delete(key)
      return tile
    } catch (error) {
      if (error.name !== 'AbortError') { errors.add(key); report('error') }
      throw error
    }
  }
  const zoomStatus = () => {
    if (context.map.getZoom() < PUBLIC_PARCEL_SOURCE.minZoom) report('zoom')
  }
  layer.on('add', () => {
    active = true
    context.map.on('zoomend', zoomStatus)
    report(context.map.getZoom() < PUBLIC_PARCEL_SOURCE.minZoom ? 'zoom' : 'loading')
  })
  layer.on('loading', () => report('loading'))
  layer.on('load', () => {
    if (context.map.getZoom() < PUBLIC_PARCEL_SOURCE.minZoom) return report('zoom')
    const keys = Object.values(layer._tiles || {}).map(tile => `${tile.coords.x}:${tile.coords.y}:${tile.coords.z}`)
    report(keys.some(key => errors.has(key)) ? 'error' : keys.some(key => results.get(key)) ? 'ready' : 'empty')
    // Keep metadata bounded along with the renderer's own tile cache.
    if (results.size > 128) for (const key of results.keys()) if (!keys.includes(key)) results.delete(key)
    if (errors.size > 128) for (const key of errors) if (!keys.includes(key)) errors.delete(key)
  })
  layer.on('remove', () => {
    active = false
    context.map.off('zoomend', zoomStatus)
    for (const request of view.tileCache.source.zoomaborts || []) request.controller.abort()
    report('off')
  })
  // React Leaflet's layer container registers this in LayersControl without
  // adding/fetching it until its unchecked overlay is switched on.
  return createElementObject(layer, context)
}

const PublicParcelOverlay = createLayerComponent(createPublicParcelLayer, (layer, props) => layer.setStatusCallback(props.onStatus))
export default PublicParcelOverlay

export function PublicParcelOverlayStatus({ status }) {
  if (!status?.message || status.state === 'off') return null
  return <p className={`public-parcel-overlay-status${status.state === 'error' ? ' is-error' : ''}`} role="status">{status.message}</p>
}
