import L from 'leaflet'
import { createControlComponent } from '@react-leaflet/core'
import { roundMapScaleDistance } from '../utils/mapScaleDistance.js'

// Leaflet still calculates the ground distance and bar width. Add the 1.5
// interval so close parcel views can show a true 15 m bar instead of 20 m.
const DetailedScale = L.Control.Scale.extend({
  _getRoundNum: roundMapScaleDistance,
})

export default createControlComponent(props => new DetailedScale({
  ...props,
  maxWidth: 80,
  metric: true,
  imperial: false,
}))
