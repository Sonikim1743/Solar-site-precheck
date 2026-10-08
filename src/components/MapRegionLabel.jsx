import { normalizeDisplayText } from '../utils/text.js'
import './map-region-label.css'

export function getMapRegionLabel(position, placeInfo) {
  if (!Number.isFinite(position?.lat) || !Number.isFinite(position?.lon) || placeInfo?.status !== 'success') return ''
  // Address lookups use six decimals; records reopened in App use seven.
  // A label for another selected point must never linger on the map.
  const key = placeInfo.positionKey
  if (key && ![6, 7].some(digits => key === `${position.lat.toFixed(digits)},${position.lon.toFixed(digits)}`)) return ''
  const label = typeof placeInfo.data?.label === 'string' ? normalizeDisplayText(placeInfo.data.label) : ''
  return label === '住所情報なし' || label === '保存記録の候補地' ? '' : label
}

export default function MapRegionLabel({ position, placeInfo }) {
  const label = getMapRegionLabel(position, placeInfo)
  if (!label) return null

  return <div className="map-region-label" role="note" aria-label="選択地点の地域名">
    <span>選択地点</span><strong>{label}</strong>
  </div>
}
