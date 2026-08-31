export * from '../../shared/powerGrid.js'
import { fetchNearbyPowerGrid as fetchGrid } from '../../shared/powerGrid.js'

// Browser requests stay same-origin. The app server identifies itself to Overpass.
export function fetchNearbyPowerGrid(lat, lon, options = {}) {
  return fetchGrid(lat, lon, { ...options, proxy: true })
}
