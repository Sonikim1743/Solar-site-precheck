import { Fragment, useEffect, useRef, useState } from 'react'
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

function MapInteractionController({ locked }) {
  const map = useMap()

  useEffect(() => {
    const handlers = [
      map.dragging,
      map.touchZoom,
      map.doubleClickZoom,
      map.boxZoom,
      map.keyboard,
      map.scrollWheelZoom,
    ].filter(Boolean)
    handlers.forEach((handler) => {
      if (locked) handler.disable()
      else handler.enable()
    })
  }, [map, locked])

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
              <strong>住所確認は座標で代替</strong>
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

function pointAtDistance(line, distance) {
  const points = line?.points || []
  return points.find((point) => Math.abs(point.distance - distance) < 0.5) || null
}

function lineLabelPoint(line) {
  if (line.label === '東西断面') {
    return {
      point: line.points?.[line.points.length - 1],
      direction: 'right',
    }
  }
  return {
    point: line.points?.[line.points.length - 1],
    direction: 'top',
  }
}

function TerrainSectionMapOverlay({ analysis }) {
  const lines = analysis?.lines || []
  const eastWest = lines.find((line) => line.label === '東西断面')
  const northSouth = lines.find((line) => line.label === '南北断面')
  if (!eastWest || !northSouth) return null

  const rangeMeters = analysis.rangeMeters || eastWest.rangeMeters || 100
  const west = eastWest.points?.[0]
  const east = eastWest.points?.[eastWest.points.length - 1]
  const south = northSouth.points?.[0]
  const north = northSouth.points?.[northSouth.points.length - 1]
  if (![west, east, south, north].every((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon))) return null

  const bounds = [
    [Math.min(south.lat, north.lat), Math.min(west.lon, east.lon)],
    [Math.max(south.lat, north.lat), Math.max(west.lon, east.lon)],
  ]
  const west50 = pointAtDistance(eastWest, -50)
  const east50 = pointAtDistance(eastWest, 50)
  const south50 = pointAtDistance(northSouth, -50)
  const north50 = pointAtDistance(northSouth, 50)
  const hasInner50 = rangeMeters >= 100 && [west50, east50, south50, north50].every((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon))
  const innerBounds = hasInner50 ? [
    [Math.min(south50.lat, north50.lat), Math.min(west50.lon, east50.lon)],
    [Math.max(south50.lat, north50.lat), Math.max(west50.lon, east50.lon)],
  ] : null
  const rangeLabelPoint = {
    lat: north.lat - (north.lat - south.lat) * 0.12,
    lon: west.lon + (east.lon - west.lon) * 0.14,
  }
  const innerLabelPoint = hasInner50 ? {
    lat: north50.lat,
    lon: east50.lon,
  } : null

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
      />
      <CircleMarker
        center={[rangeLabelPoint.lat, rangeLabelPoint.lon]}
        radius={0}
        pathOptions={{ opacity: 0, fillOpacity: 0 }}
      >
        <Tooltip permanent direction="right" className="terrain-range-tooltip">
          周辺{rangeMeters}m確認範囲
        </Tooltip>
      </CircleMarker>
      {innerBounds && (
        <>
          <Rectangle
            bounds={innerBounds}
            pathOptions={{
              color: '#ffffff',
              weight: 1.8,
              dashArray: '4 4',
              fillOpacity: 0,
              opacity: 0.9,
            }}
          />
          <CircleMarker
            center={[innerLabelPoint.lat, innerLabelPoint.lon]}
            radius={0}
            pathOptions={{ opacity: 0, fillOpacity: 0 }}
          >
            <Tooltip permanent direction="top" className="terrain-range-tooltip terrain-range-tooltip--inner">
              50m確認線
            </Tooltip>
          </CircleMarker>
        </>
      )}
      {lines.map((line) => {
        const positions = (line.points || [])
          .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
          .map((point) => [point.lat, point.lon])
        if (positions.length < 2) return null
        const center = line.points[Math.floor(line.points.length / 2)]
        const endpoint = line.points[line.points.length - 1]
        const label = lineLabelPoint(line)
        return (
          <Fragment key={line.label}>
            <Polyline
              positions={positions}
              pathOptions={{
                color: terrainLineColor(line),
                weight: 4,
                opacity: 0.92,
              }}
            />
            {Number.isFinite(center?.lat) && Number.isFinite(center?.lon) && (
              <CircleMarker
                center={[center.lat, center.lon]}
                radius={4}
                pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#0c7b5e', fillOpacity: 1 }}
              />
            )}
            {Number.isFinite(label.point?.lat) && Number.isFinite(label.point?.lon) && (
              <CircleMarker
                center={[label.point.lat, label.point.lon]}
                radius={0}
                pathOptions={{ opacity: 0, fillOpacity: 0 }}
              >
                <Tooltip permanent direction={label.direction} className="terrain-section-tooltip">
                  {line.label.replace('断面', '')} {terrainLineNote(line)}
                </Tooltip>
              </CircleMarker>
            )}
            {Number.isFinite(endpoint?.lat) && Number.isFinite(endpoint?.lon) && (
              <CircleMarker
                center={[endpoint.lat, endpoint.lon]}
                radius={5}
                pathOptions={{ color: '#ffffff', weight: 2, fillColor: terrainLineColor(line), fillOpacity: 1 }}
              >
                <Tooltip direction="top" className="terrain-section-tooltip">
                  {line.positiveDirection || ''}側 {rangeMeters}m
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
  const [isCompactMap, setIsCompactMap] = useState(false)
  const [mapInteractionEnabled, setMapInteractionEnabled] = useState(false)
  const mapLocked = isCompactMap && !mapInteractionEnabled

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const query = window.matchMedia('(max-width: 640px)')
    const sync = () => setIsCompactMap(query.matches)
    sync()
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])

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
        <MapInteractionController locked={mapLocked} />
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
      {isCompactMap && (
        <button
          type="button"
          className={`map-touch-toggle ${mapInteractionEnabled ? 'map-touch-toggle--active' : ''}`}
          onClick={() => setMapInteractionEnabled((value) => !value)}
          aria-pressed={mapInteractionEnabled}
        >
          {mapInteractionEnabled ? '地図操作ON' : '地図操作を有効化'}
        </button>
      )}
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
