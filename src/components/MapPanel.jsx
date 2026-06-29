import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { Circle, GeoJSON, LayersControl, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { parcelInfo } from '../services/cadastre.js'

const markerIcon = L.divIcon({
  className: 'site-marker-wrapper',
  html: '<span class="site-marker"><span></span></span>',
  iconSize: [34, 42],
  iconAnchor: [17, 39],
})

const currentLocationIcon = L.divIcon({
  className: 'current-location-marker-wrapper',
  html: '<span class="current-location-marker"><span></span></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

function ClickHandler({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect({ lat: event.latlng.lat, lon: event.latlng.lng })
    },
  })
  return null
}

function MapController({ position }) {
  const map = useMap()

  useEffect(() => {
    if (position) map.flyTo([position.lat, position.lon], Math.max(map.getZoom(), 14))
  }, [map, position])

  return null
}

function SiteMarker({ position, placeInfo }) {
  const markerRef = useRef(null)

  useEffect(() => {
    if (position) markerRef.current?.openPopup()
  }, [position, placeInfo?.status, placeInfo?.data?.label])

  if (!position) return null

  return (
    <Marker ref={markerRef} position={[position.lat, position.lon]} icon={markerIcon}>
      <Popup closeButton={false} className="site-popup">
        <div className="site-popup__content">
          <span>選択地点</span>
          {placeInfo?.status === 'loading' && <strong>周辺住所を確認中…</strong>}
          {placeInfo?.status === 'success' && (
            <>
              <strong>{placeInfo.data.label}</strong>
              <small>{placeInfo.data.source}</small>
            </>
          )}
          {placeInfo?.status === 'error' && (
            <>
              <strong>住所情報未取得</strong>
              <small>{placeInfo.message}</small>
            </>
          )}
          {(!placeInfo || placeInfo.status === 'idle') && <strong>地点を選択しました</strong>}
          <em>
            北緯 {position.lat.toFixed(6)} / 東経 {position.lon.toFixed(6)}
          </em>
        </div>
      </Popup>
    </Marker>
  )
}

function CurrentLocationLayer({ currentLocation }) {
  if (!currentLocation) return null

  const accuracy = Number.isFinite(currentLocation.accuracy) ? currentLocation.accuracy : null

  return (
    <>
      {accuracy && (
        <Circle
          center={[currentLocation.lat, currentLocation.lon]}
          radius={Math.min(Math.max(accuracy, 8), 500)}
          pathOptions={{ color: '#1d75d8', fillColor: '#4ea1ff', fillOpacity: 0.12, weight: 1.5 }}
        />
      )}
      <Marker position={[currentLocation.lat, currentLocation.lon]} icon={currentLocationIcon}>
        <Popup closeButton={false} className="site-popup">
          <div className="site-popup__content">
            <span>現在地</span>
            <strong>ブラウザの位置情報</strong>
            {accuracy && <small>推定精度 約{Math.round(accuracy)}m</small>}
            <em>
              北緯 {currentLocation.lat.toFixed(6)} / 東経 {currentLocation.lon.toFixed(6)}
            </em>
          </div>
        </Popup>
      </Marker>
    </>
  )
}

function ParcelLayer({ data, selectedParcelId, focusParcelId, onParcelSelect }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    const bounds = layerRef.current?.getBounds()
    if (bounds?.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 })
  }, [data, map])

  useEffect(() => {
    layerRef.current?.eachLayer((layer) => {
      const selected = parcelInfo(layer.feature).id === selectedParcelId
      layer.setStyle({
        color: selected ? '#f5b940' : '#f8f1a7',
        weight: selected ? 4 : 1.5,
        fillColor: selected ? '#f5b940' : '#e8ef67',
        fillOpacity: selected ? 0.28 : 0.08,
      })
    })
  }, [selectedParcelId])

  useEffect(() => {
    if (!focusParcelId) return
    layerRef.current?.eachLayer((layer) => {
      if (parcelInfo(layer.feature).id !== focusParcelId) return
      const bounds = layer.getBounds?.()
      if (bounds?.isValid()) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 19 })
      layer.openTooltip?.()
    })
  }, [focusParcelId, map])

  if (!data) return null
  return (
    <GeoJSON
      ref={layerRef}
      data={data}
      style={{ color: '#f8f1a7', weight: 1.5, fillColor: '#e8ef67', fillOpacity: 0.08 }}
      bubblingMouseEvents={false}
      onEachFeature={(feature, layer) => {
        const info = parcelInfo(feature)
        layer.bindTooltip(info.number, { sticky: true, direction: 'top', className: 'parcel-tooltip' })
        layer.on('click', () => {
          const center = layer.getBounds?.().getCenter()
          onParcelSelect(feature, center ? { lat: center.lat, lon: center.lng } : null)
        })
      }}
    />
  )
}

export default function MapPanel({
  position,
  onSelect,
  onUseCurrentLocation,
  currentLocation,
  locationStatus,
  placeInfo,
  parcelData,
  selectedParcelId,
  focusParcelId,
  onParcelSelect,
}) {
  return (
    <div className="map-shell">
      <MapContainer
        center={[36.2048, 138.2529]}
        zoom={5}
        minZoom={4}
        scrollWheelZoom
        className="map"
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="航空写真">
            <TileLayer
              attribution='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院 全国最新写真（シームレス）</a>'
              url="https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg"
              maxZoom={18}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="標準地図">
            <TileLayer
              attribution='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>'
              url="https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        <ClickHandler onSelect={onSelect} />
        <MapController position={position} />
        <ParcelLayer
          data={parcelData}
          selectedParcelId={selectedParcelId}
          focusParcelId={focusParcelId}
          onParcelSelect={onParcelSelect}
        />
        <CurrentLocationLayer currentLocation={currentLocation} />
        <SiteMarker position={position} placeInfo={placeInfo} />
      </MapContainer>
      <div className="map-hint">地図をクリックして候補地点を指定</div>
      <div className="map-location-control">
        <button type="button" onClick={onUseCurrentLocation} disabled={locationStatus?.status === 'loading'}>
          {locationStatus?.status === 'loading' ? '現在地を取得中…' : '◎ 現在地を取得'}
        </button>
        {locationStatus?.message && (
          <small className={locationStatus.status === 'error' ? 'is-error' : ''}>{locationStatus.message}</small>
        )}
      </div>
      {parcelData && <div className="parcel-map-badge">地番レイヤー {parcelData.features.length.toLocaleString()}筆</div>}
    </div>
  )
}
