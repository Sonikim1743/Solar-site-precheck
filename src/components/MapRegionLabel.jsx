import { currentPlaceLabel } from '../utils/siteEvidence.js'
import './map-region-label.css'

export function getMapRegionLabel(position, placeInfo) {
  return currentPlaceLabel(position, placeInfo)
}

export default function MapRegionLabel({ position, placeInfo }) {
  const label = getMapRegionLabel(position, placeInfo)
  if (!label) return null

  return <div className="map-region-label" role="note" aria-label="選択地点の地域名">
    <span>選択地点</span><strong>{label}</strong>
  </div>
}
