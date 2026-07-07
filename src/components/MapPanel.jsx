import { Fragment, useEffect, useRef } from 'react'
import L from 'leaflet'
import { Circle, CircleMarker, GeoJSON, LayersControl, MapContainer, Marker, Polyline, Popup, Rectangle, ScaleControl, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
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

function SiteMarker({ position, placeInfo, suppressPopup = false }) {
  const markerRef = useRef(null)

  useEffect(() => {
    if (!position) return
    if (suppressPopup) {
      markerRef.current?.closePopup()
    } else {
      markerRef.current?.openPopup()
    }
  }, [position, placeInfo?.status, placeInfo?.data?.label, suppressPopup])

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

function terrainLineNote(line) {
  const from = line.negativeDirection || '左'
  const to = line.positiveDirection || '右'
  const slope = line.summary?.averageSlopePercent
  const diff = line.summary?.elevationDiff
  const slopeText = Number.isFinite(slope) ? `平均${slope.toFixed(1)}%` : '平均—'
  if (!Number.isFinite(diff) || Math.abs(diff) < 0.1) return `${from}→${to} ${slopeText}`
  return `${from}→${to} ${diff > 0 ? '上り' : '下り'} ${slopeText}`
}

function terrainLineColor(line) {
  const slope = line.summary?.averageSlopePercent
  if (!Number.isFinite(slope)) return '#0c6b58'
  if (slope >= 15) return '#b83b2f'
  if (slope >= 8) return '#c88b00'
  return '#0c7b5e'
}

function TerrainSectionMapOverlay({ analysis }) {
  const lines = analysis?.lines || []
  const eastWest = lines.find((line) => line.label === '東西断面')
  const northSouth = lines.find((line) => line.label === '南北断面')
  if (!eastWest || !northSouth) return null

  const west = eastWest.points?.[0]
  const east = eastWest.points?.[eastWest.points.length - 1]
  const south = northSouth.points?.[0]
  const north = northSouth.points?.[northSouth.points.length - 1]
  if (![west, east, south, north].every((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon))) return null

  const bounds = [
    [Math.min(south.lat, north.lat), Math.min(west.lon, east.lon)],
    [Math.max(south.lat, north.lat), Math.max(west.lon, east.lon)],
  ]

  return (
    <>
      <Rectangle
        bounds={bounds}
        pathOptions={{
          color: '#0c7b5e',
          weight: 2,
          dashArray: '6 5',
          fillColor: '#24a36f',
          fillOpacity: 0.13,
        }}
      >
        <Tooltip permanent direction="top" className="terrain-range-tooltip">
          周辺100m確認範囲
        </Tooltip>
      </Rectangle>
      {lines.map((line) => {
        const positions = (line.points || [])
          .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
          .map((point) => [point.lat, point.lon])
        if (positions.length < 2) return null
        const center = line.points[Math.floor(line.points.length / 2)]
        const endpoint = line.points[line.points.length - 1]
        return (
          <Fragment key={line.label}>
            <Polyline
              positions={positions}
              pathOptions={{
                color: terrainLineColor(line),
                weight: 4,
                opacity: 0.92,
              }}
            >
              <Tooltip permanent direction={line.label === '東西断面' ? 'right' : 'top'} className="terrain-section-tooltip">
                {line.label.replace('断面', '')} {terrainLineNote(line)}
              </Tooltip>
            </Polyline>
            {Number.isFinite(center?.lat) && Number.isFinite(center?.lon) && (
              <CircleMarker
                center={[center.lat, center.lon]}
                radius={4}
                pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#0c7b5e', fillOpacity: 1 }}
              />
            )}
            {Number.isFinite(endpoint?.lat) && Number.isFinite(endpoint?.lon) && (
              <CircleMarker
                center={[endpoint.lat, endpoint.lon]}
                radius={5}
                pathOptions={{ color: '#ffffff', weight: 2, fillColor: terrainLineColor(line), fillOpacity: 1 }}
              >
                <Tooltip direction="top" className="terrain-section-tooltip">
                  {line.positiveDirection || ''}側 100m
                </Tooltip>
              </CircleMarker>
            )}
          </Fragment>
        )
      })}
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
  terrainSection,
}) {
  const hasTerrainOverlay = !!terrainSection?.lines?.length

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
        <ScaleControl position="bottomleft" metric imperial={false} />
        <ClickHandler onSelect={onSelect} />
        <MapController position={position} />
        <ParcelLayer
          data={parcelData}
          selectedParcelId={selectedParcelId}
          focusParcelId={focusParcelId}
          onParcelSelect={onParcelSelect}
        />
        <CurrentLocationLayer currentLocation={currentLocation} />
        <TerrainSectionMapOverlay analysis={terrainSection} />
        <SiteMarker position={position} placeInfo={placeInfo} suppressPopup={hasTerrainOverlay} />
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
