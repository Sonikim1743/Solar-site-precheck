import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { Circle, Marker, Tooltip, useMap } from 'react-leaflet'

function supportIcon(type, selected) {
  return L.divIcon({ className: `power-support-marker ${type === 'pole' ? 'is-pole' : 'is-tower'}${selected ? ' is-selected' : ''}`, html: '<span aria-hidden="true"></span>', iconSize: [20, 20], iconAnchor: [10, 10] })
}

function SupportMarker({ item, icon, selected, onSelect }) {
  const marker = useRef(null)
  const label = `${item.type === 'pole' ? '電柱' : '鉄塔'} ${item.ref || '番号未記載'} / ${item.voltageLabel}`
  const labelElement = () => marker.current?.getElement()?.setAttribute('aria-label', label)
  useEffect(labelElement, [label])
  return <Marker ref={marker} title={label} alt={label} keyboard position={[item.position.lat, item.position.lon]} icon={icon} zIndexOffset={selected ? 1000 : 100} eventHandlers={{ add: labelElement, click: () => onSelect(item) }}>
    <Tooltip>{item.type === 'pole' ? '電柱' : '鉄塔'} / {item.ref || '番号未記載'} / {item.voltageLabel}<br/>{Math.round(item.distanceMeters)}m / OSM登録情報</Tooltip>
  </Marker>
}

export default function PowerSupportOverlay({ position, controller, onSelect }) {
  const map = useMap(), { state, selected, fitRevision, visible } = controller
  const radius = state.data?.radiusMeters || (state.status === 'loading' ? state.requestedRadiusMeters : null)
  const icons = useMemo(() => ({ pole: supportIcon('pole', false), tower: supportIcon('tower', false), selectedPole: supportIcon('pole', true), selectedTower: supportIcon('tower', true) }), [])
  useEffect(() => {
    if (!controller.mapActive || !position || !state.data || state.data.siteKey !== controller.siteKey) return
    const dy = state.data.radiusMeters / 111320, dx = dy / Math.cos(position.lat * Math.PI / 180)
    const points = selected ? [[position.lat, position.lon], [selected.position.lat, selected.position.lon]] : [[position.lat - dy, position.lon - dx], [position.lat + dy, position.lon + dx]]
    map.stop(); map.fitBounds(points, { padding: [35, 35], maxZoom: 17, animate: false })
  }, [map, controller.siteKey, controller.mapActive, fitRevision, selected?.id])
  if (!position || !radius) return null
  return <><Circle center={[position.lat, position.lon]} radius={radius} pathOptions={{ color: '#926738', weight: 1.5, dashArray: '3 5', fillOpacity: .015 }}><Tooltip>電柱・鉄塔の取得範囲 {radius}m</Tooltip></Circle>
    {visible.map(item => <SupportMarker key={item.id} item={item} selected={selected?.id === item.id} icon={selected?.id === item.id ? icons[item.type === 'pole' ? 'selectedPole' : 'selectedTower'] : icons[item.type]} onSelect={onSelect}/>)}
  </>
}
