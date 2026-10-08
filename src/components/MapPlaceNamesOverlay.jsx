import L from 'leaflet'
import { createElementObject, createLayerComponent } from '@react-leaflet/core'
import * as protomaps from 'protomaps-leaflet'
import { gsiPlaceNameLayerOptions, observeGsiPlaceNameStatus } from '../utils/mapPlaceNames.js'

const PANE = 'map-place-names'

// A regular Leaflet layer so the existing layer control can show/hide it.
const MapPlaceNamesOverlay = createLayerComponent(
  function createMapPlaceNames({ dimmed = false, onStatus }, context) {
    // protomaps-leaflet's renderer uses the same Leaflet singleton as our map.
    globalThis.L = L
    const pane = context.map.getPane(PANE) || context.map.createPane(PANE)
    pane.style.zIndex = '460'
    pane.style.pointerEvents = 'none'
    const layer = protomaps.leafletLayer({
      ...gsiPlaceNameLayerOptions(protomaps, PANE),
      opacity: dimmed ? .35 : 1,
    })
    observeGsiPlaceNameStatus(layer, onStatus)
    return createElementObject(layer, context)
  },
  function updateMapPlaceNames(layer, props, previous) {
    layer.setStatusCallback(props.onStatus)
    if (props.dimmed !== previous.dimmed) layer.setOpacity(props.dimmed ? .35 : 1)
  },
)

export default MapPlaceNamesOverlay
