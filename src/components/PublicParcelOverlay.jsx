import React from 'react'
import L from 'leaflet'
import { createElementObject, createLayerComponent } from '@react-leaflet/core'
import { leafletLayer, PolygonSymbolizer } from 'protomaps-leaflet'
import { PUBLIC_PARCEL_SOURCE, isPublicParcelFeature, publicParcelNumber, publicParcelStatus } from '../utils/publicParcelLayer.js'
import { ParcelNumberSymbolizer } from '../utils/publicParcelLabelLayout.js'
import { PUBLIC_PARCEL_TERRAIN_LIMITS, PUBLIC_PARCEL_TERRAIN_SOURCE, buildPublicParcelTerrainSnapshot, createPublicParcelSnapshotGate, publicParcelViewportKey } from '../utils/publicParcelTerrain.js'
import './public-parcel-overlay.css'

const PANE_NAME = 'publicParcelReference'
const ATTRIBUTION = '<a href="https://source.coop/smartmaps/amx-2024-04" target="_blank" rel="noopener noreferrer">公開地番2024：法務省データをAMXが加工</a>'

export { ParcelNumberSymbolizer }

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
  let parcelsCallback = props.onPublicParcelsChange
  let contextKey = props.contextKey || ''
  let active = false
  let moving = false
  let snapshotTimer = null
  const gate = createPublicParcelSnapshotGate()
  const results = new Map()
  const errors = new Set()
  const requestedTiles = new Map()
  const report = state => { if (active || state === 'off') callback?.(publicParcelStatus(state)) }

  // The renderer catches network errors internally. Observe its existing tile
  // promises so failed requests cannot be misreported as missing coverage.
  const view = layer.views.get('parcels')
  const getDisplayTile = view.getDisplayTile.bind(view)
  const boundsNow = () => {
    const bounds = context.map.getBounds()
    return { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() }
  }
  const visibleTiles = () => Object.values(layer._tiles || {}).filter(tile => tile.current !== false && tile.coords.z === Math.round(context.map.getZoom()))
  const invalidateSnapshot = () => {
    gate.invalidate()
    clearTimeout(snapshotTimer)
  }
  const refreshSnapshot = async () => {
    if (!active || moving || !parcelsCallback) return
    const bounds = boundsNow(), zoom = context.map.getZoom()
    const viewportKey = publicParcelViewportKey(bounds, zoom, contextKey)
    const ticket = gate.begin()
    if (zoom < PUBLIC_PARCEL_SOURCE.minZoom) {
      parcelsCallback({ features: [], status: 'zoom', truncated: false, source: PUBLIC_PARCEL_TERRAIN_SOURCE, viewportKey })
      return
    }
    // Reuse only promises created by the visible renderer. No extra requests,
    // retries or regional downloads are made for 3D labels.
    const center = context.map.project(context.map.getCenter(), Math.round(zoom))
    const visible = visibleTiles().sort((a, b) =>
      Math.hypot(a.coords.x * 256 + 128 - center.x, a.coords.y * 256 + 128 - center.y) -
      Math.hypot(b.coords.x * 256 + 128 - center.x, b.coords.y * 256 + 128 - center.y))
    const rawKeys = new Set(), coordinates = []
    for (const tile of visible) {
      const raw = view.dataTileForDisplayTile(tile.coords).dataTile
      const key = `${raw.z}/${raw.x}/${raw.y}`
      if (rawKeys.has(key)) continue
      rawKeys.add(key)
      if (coordinates.length < PUBLIC_PARCEL_TERRAIN_LIMITS.tiles) coordinates.push(tile.coords)
    }
    const settled = await Promise.allSettled(coordinates.map(coords =>
      requestedTiles.get(`${coords.x}:${coords.y}:${coords.z}`) || Promise.reject(new Error('Tile not observed'))))
    if (!active || moving || !gate.isCurrent(ticket) || viewportKey !== publicParcelViewportKey(boundsNow(), context.map.getZoom(), contextKey)) return
    const snapshot = buildPublicParcelTerrainSnapshot(settled.filter(result => result.status === 'fulfilled').map(result => result.value), {
      bounds, viewportKey, incomplete: settled.some(result => result.status === 'rejected'),
    })
    if (rawKeys.size > coordinates.length) { snapshot.truncated = true; snapshot.status = 'partial' }
    parcelsCallback(snapshot)
  }
  const scheduleSnapshot = () => {
    clearTimeout(snapshotTimer)
    snapshotTimer = setTimeout(() => { refreshSnapshot().catch(() => {
      if (active) report('error')
    }) }, 80)
  }
  const moveStart = () => { moving = true; invalidateSnapshot() }
  const moveEnd = () => { moving = false; scheduleSnapshot() }
  layer.setCallbacks = nextProps => {
    callback = nextProps.onStatus
    parcelsCallback = nextProps.onPublicParcelsChange
    if (contextKey !== (nextProps.contextKey || '')) {
      contextKey = nextProps.contextKey || ''
      invalidateSnapshot()
      if (active) scheduleSnapshot()
    }
  }
  view.getDisplayTile = async coords => {
    const key = `${coords.x}:${coords.y}:${coords.z}`
    const request = getDisplayTile(coords)
    requestedTiles.set(key, request)
    // The source already caches tiles; this bounded list only retains the
    // renderer's current promises for a read-only snapshot.
    if (requestedTiles.size > 128) requestedTiles.delete(requestedTiles.keys().next().value)
    try {
      const tile = await request
      results.set(key, (tile.data.get('fude') || []).some(isPublicParcelFeature))
      errors.delete(key)
      return tile
    } catch (error) {
      if (error.name !== 'AbortError') {
        errors.add(key)
        if (visibleTiles().some(tile => `${tile.coords.x}:${tile.coords.y}:${tile.coords.z}` === key)) report('error')
      }
      throw error
    }
  }
  const zoomStatus = () => {
    if (context.map.getZoom() < PUBLIC_PARCEL_SOURCE.minZoom) report('zoom')
  }
  layer.on('add', () => {
    active = true
    context.map.on('zoomend', zoomStatus)
    context.map.on('movestart', moveStart)
    context.map.on('moveend', moveEnd)
    report(context.map.getZoom() < PUBLIC_PARCEL_SOURCE.minZoom ? 'zoom' : 'loading')
    scheduleSnapshot()
  })
  layer.on('loading', () => report('loading'))
  layer.on('load', () => {
    scheduleSnapshot()
    if (context.map.getZoom() < PUBLIC_PARCEL_SOURCE.minZoom) return report('zoom')
    const keys = Object.values(layer._tiles || {}).map(tile => `${tile.coords.x}:${tile.coords.y}:${tile.coords.z}`)
    report(keys.some(key => errors.has(key)) ? 'error' : keys.some(key => results.get(key)) ? 'ready' : 'empty')
    // Keep metadata bounded along with the renderer's own tile cache.
    if (results.size > 128) for (const key of results.keys()) if (!keys.includes(key)) results.delete(key)
    if (errors.size > 128) for (const key of errors) if (!keys.includes(key)) errors.delete(key)
    for (const key of requestedTiles.keys()) if (!keys.includes(key)) requestedTiles.delete(key)
  })
  layer.on('remove', () => {
    active = false
    invalidateSnapshot()
    requestedTiles.clear()
    context.map.off('zoomend', zoomStatus)
    context.map.off('movestart', moveStart)
    context.map.off('moveend', moveEnd)
    for (const request of view.tileCache.source.zoomaborts || []) request.controller.abort()
    report('off')
  })
  // Turning off this reference layer retains the last acquired snapshot for
  // the independent 3D label toggle. It never clears imported/review geometry.
  return createElementObject(layer, context)
}

const PublicParcelOverlay = createLayerComponent(createPublicParcelLayer, (layer, props) => layer.setCallbacks(props))
export default PublicParcelOverlay

export function PublicParcelOverlayStatus({ status }) {
  if (!status?.message || status.state === 'off') return null
  return <p className={`public-parcel-overlay-status${status.state === 'error' ? ' is-error' : ''}`} role="status">{status.message}{status.state === 'ready' ? ' 混雑時は拡大して確認してください。' : ''}</p>
}
