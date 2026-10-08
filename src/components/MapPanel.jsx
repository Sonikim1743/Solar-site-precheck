import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import GridEquipmentDetails from './GridEquipmentDetails.jsx'
import TerrainAreaMapOverlay from './TerrainAreaMapOverlay.jsx'
import L from 'leaflet'
import { Circle, CircleMarker, GeoJSON, LayersControl, MapContainer, Marker, Polygon, Polyline, Popup, Rectangle, ScaleControl, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { parcelInfo } from '../services/cadastre.js'
import { featureInteriorPoint, validatePolygonGeometry } from '../services/parcelGeometry.js'
import { getParcelKey } from '../utils/parcelReview.js'
import { capacityValueLabel, summarizeGridFlowDirection } from '../services/gridCapacity.js'
import { normalizeDisplayText } from '../utils/text.js'
import { powerGridDisplayLine, powerGridDisplayLineLabel } from '../services/powerGrid.js'
import '../parcel-review.css'

const INITIAL_MAP_CENTER = [36.2048, 138.2529]
const INITIAL_MAP_ZOOM = 5
const EMPTY_PARCEL_REVIEW = { version: 1, parcels: [], boundary: null, exclusions: [] }
const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] }
const PARCEL_MODE_HINTS = {
  point: '地図をクリックして計算地点を指定',
  target: '筆をクリックして対象に追加・変更',
  reference: '筆をクリックして参考に追加・変更',
  boundary: '角を順に指定 · 開始点を押すと完成',
  exclusion: '除外する角を順に指定 · 開始点を押すと完成',
}

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

function ClickHandler({ onSelect, mode, locked, onAddVertex, onFinish }) {
  useMapEvents({
    click(event) {
      if (locked) return
      if (mode === 'point') onSelect?.({ lat: event.latlng.lat, lon: event.latlng.lng })
      else if (mode === 'boundary' || mode === 'exclusion') {
        // A double-click emits two click events before dblclick. Keep one vertex.
        if (event.originalEvent?.detail > 1) return
        onAddVertex(event.latlng, event.originalEvent?.timeStamp)
      }
    },
    dblclick(event) {
      if (locked || !['boundary', 'exclusion'].includes(mode)) return
      if (event.originalEvent) L.DomEvent.stop(event.originalEvent)
      onFinish()
    },
  })
  return null
}

function MapController({ position }) {
  const map = useMap()

  useEffect(() => {
    if (position) {
      map.flyTo([position.lat, position.lon], Math.max(map.getZoom(), 14))
    } else {
      map.flyTo(INITIAL_MAP_CENTER, INITIAL_MAP_ZOOM)
    }
  }, [map, position])

  return null
}

function MapInteractionController({ locked, drawing }) {
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
    if (drawing) map.doubleClickZoom.disable()
  }, [map, locked, drawing])

  return null
}

function SiteMarker({ position, placeInfo, suppressPopup = false }) {
  const markerRef = useRef(null)
  const placeLabel = normalizeDisplayText(placeInfo?.data?.label)

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
              <strong>{placeLabel}</strong>
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
  const slopeText = Number.isFinite(slope)
    ? `平均角${((Math.atan(Math.abs(slope) / 100) * 180) / Math.PI).toFixed(1)}°`
    : '平均角—'
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

function DrawingContextTooltip({ dimmed = false, ...props }) {
  const tooltipRef = useRef(null)
  // Tooltip opacity is an initial Leaflet option, not a mutable React-Leaflet prop.
  useEffect(() => { tooltipRef.current?.setOpacity(dimmed ? 0.18 : 0.9) }, [dimmed])
  return <Tooltip {...props} ref={tooltipRef} opacity={dimmed ? 0.18 : 0.9} />
}

function TerrainSectionMapOverlay({ analysis, dimmed = false }) {
  const opacity = dimmed ? 0.2 : 1
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
          fillOpacity: 0.13 * opacity,
          opacity,
        }}
      />
      <CircleMarker
        center={[rangeLabelPoint.lat, rangeLabelPoint.lon]}
        radius={0}
        pathOptions={{ opacity: 0, fillOpacity: 0 }}
      >
        <DrawingContextTooltip dimmed={dimmed} permanent direction="right" className="terrain-range-tooltip">
          周辺{rangeMeters}m確認範囲
        </DrawingContextTooltip>
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
              opacity: 0.9 * opacity,
            }}
          />
          <CircleMarker
            center={[innerLabelPoint.lat, innerLabelPoint.lon]}
            radius={0}
            pathOptions={{ opacity: 0, fillOpacity: 0 }}
          >
            <DrawingContextTooltip dimmed={dimmed} permanent direction="top" className="terrain-range-tooltip terrain-range-tooltip--inner">
              50m確認線
            </DrawingContextTooltip>
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
                opacity: 0.92 * opacity,
              }}
            />
            {Number.isFinite(center?.lat) && Number.isFinite(center?.lon) && (
              <CircleMarker
                center={[center.lat, center.lon]}
                radius={4}
                pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#0c7b5e', fillOpacity: opacity, opacity }}
              />
            )}
            {Number.isFinite(label.point?.lat) && Number.isFinite(label.point?.lon) && (
              <CircleMarker
                center={[label.point.lat, label.point.lon]}
                radius={0}
                pathOptions={{ opacity: 0, fillOpacity: 0 }}
              >
                <DrawingContextTooltip dimmed={dimmed} permanent direction={label.direction} className="terrain-section-tooltip">
                  {line.label.replace('断面', '')} {terrainLineNote(line)}
                </DrawingContextTooltip>
              </CircleMarker>
            )}
            {Number.isFinite(endpoint?.lat) && Number.isFinite(endpoint?.lon) && (
              <CircleMarker
                center={[endpoint.lat, endpoint.lon]}
                radius={5}
                pathOptions={{ color: '#ffffff', weight: 2, fillColor: terrainLineColor(line), fillOpacity: opacity, opacity }}
              >
                <DrawingContextTooltip dimmed={dimmed} direction="top" className="terrain-section-tooltip">
                  {line.positiveDirection || ''}側 {rangeMeters}m
                </DrawingContextTooltip>
              </CircleMarker>
            )}
          </Fragment>
        )
      })}
    </>
  )
}

function powerLineColor(voltageKv) {
  if (Number.isFinite(voltageKv) && voltageKv >= 110) return '#c74f35'
  if (Number.isFinite(voltageKv) && voltageKv >= 77) return '#10b8a6'
  if (Number.isFinite(voltageKv) && voltageKv >= 66) return '#0ab2cc'
  if (Number.isFinite(voltageKv) && voltageKv >= 33) return '#3983ff'
  if (Number.isFinite(voltageKv)) return '#254cda'
  return '#65756f'
}

function formatMapDistance(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) return '距離未取得'
  if (distanceMeters >= 1000) return `約${(distanceMeters / 1000).toFixed(distanceMeters >= 10000 ? 0 : 1)}km`
  return `約${Math.round(distanceMeters)}m`
}

export function PowerGridOverlay({ data, capacityMatches, onEquipmentSelect, showNames = false, compact = false }) {
  const displayLine = powerGridDisplayLine(data)
  const lines = displayLine ? [displayLine, ...(data?.lines || []).filter((line) => line.id !== displayLine.id)] : data?.lines || []
  const substations = data?.substations || []
  const lineMatchBySourceId = new Map((capacityMatches?.lineMatches || []).map((match) => [match.source.id, match]))
  const substationMatchBySourceId = new Map((capacityMatches?.substationMatches || []).map((match) => [match.source.id, match]))
  const nearestLineId = displayLine?.id
  const nearestSubstationId = data?.summary?.nearestSubstation?.id
  if (!lines.length && !substations.length) return null

  return (
    <>
      {(onEquipmentSelect ? lines : lines.slice(0, 80)).map((line) => {
        const positions = (line.geometry || [])
          .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
          .map((point) => [point.lat, point.lon])
          if (positions.length < 2) return null
          const targetVoltage = Number.isFinite(line.voltageKv) && line.voltageKv >= 11 && line.voltageKv <= 110
          const unknownVoltage = !Number.isFinite(line.voltageKv)
          const isNearest = line.id === nearestLineId
          const capacityMatch = lineMatchBySourceId.get(line.id)
          const flow = summarizeGridFlowDirection(capacityMatch?.capacity)
          return (
            <Polyline
              key={line.id}
              eventHandlers={onEquipmentSelect ? { click: () => onEquipmentSelect({ equipment: line, capacity: capacityMatch?.capacity, match: capacityMatch?.match, kind: 'line' }) } : undefined}
              positions={positions}
              pathOptions={{
                color: powerLineColor(line.voltageKv),
                weight: isNearest ? 7 : targetVoltage ? 4.5 : 2.2,
                opacity: isNearest ? 0.98 : targetVoltage ? 0.9 : unknownVoltage ? 0.3 : 0.16,
                dashArray: targetVoltage ? undefined : '5 6',
              }}
            >
              <Tooltip
                  sticky={compact || !isNearest}
                  permanent={(!compact && isNearest) || (showNames && !line.name.includes('名称未記載'))}
                direction="top"
                className={`power-grid-tooltip ${isNearest ? 'power-grid-tooltip--nearest' : ''}`}
              >
                {onEquipmentSelect ? <><strong>{line.name}</strong><br />{line.voltageLabel} / {formatMapDistance(line.distanceMeters)}</> : <><strong>{isNearest ? `${powerGridDisplayLineLabel(data)}：` : ''}{line.name}</strong><br />
                 {line.voltageLabel} / {line.voltageBand}<br />
                 候補地から{line.direction ? `${line.direction}側 ` : ''}{formatMapDistance(line.distanceMeters)}<br />
                 {line.positionConfidence?.label || '位置参考'}
                 {capacityMatch && <><br />公表照合：{capacityMatch.match?.label || '名称候補'} / 空容量 {capacityValueLabel(capacityMatch.capacity.availableCapacityMw)}</>}
                 {flow.status === 'published' && <><br />公表の正方向：{flow.label}<br />予想潮流：{flow.expectedLabel}<br />上位・下位：未確定</>}</>}
              </Tooltip>
              {!onEquipmentSelect && <Popup className="grid-equipment-popup" maxWidth={360}>
                {capacityMatch ? <GridEquipmentDetails record={capacityMatch.capacity} /> : <><strong>{line.name}</strong><p>{line.voltageLabel} / {formatMapDistance(line.distanceMeters)}</p><p>公開DBとの設備一致は未確認です。下の設備検索から名称・設備番号で調べられます。</p></>}
              </Popup>}
            </Polyline>
          )
        })}
        {(onEquipmentSelect ? substations : substations.slice(0, 60)).map((substation) => {
          const targetVoltage = Number.isFinite(substation.voltageKv)
            ? substation.voltageKv >= 11 && substation.voltageKv <= 110
            : true
          const isNearest = substation.id === nearestSubstationId
          const capacityMatch = substationMatchBySourceId.get(substation.id)
          return (
        <CircleMarker
            key={substation.id}
            eventHandlers={onEquipmentSelect ? { click: () => onEquipmentSelect({ equipment: substation, capacity: capacityMatch?.capacity, match: capacityMatch?.match, kind: 'substation' }) } : undefined}
            center={[substation.position.lat, substation.position.lon]}
            radius={isNearest ? 10 : targetVoltage ? 8 : 5}
            pathOptions={{
              color: isNearest ? '#5b21b6' : '#6d28d9',
              fillColor: isNearest ? '#efe7ff' : '#f4e8ff',
              fillOpacity: isNearest ? 0.98 : targetVoltage ? 0.9 : 0.38,
              weight: isNearest ? 3 : targetVoltage ? 2.2 : 1.4,
            }}
          >
            <Tooltip
                sticky={compact || !isNearest}
                permanent={(!compact && isNearest) || (showNames && !substation.name.includes('名称未記載'))}
              direction="top"
              className={`power-grid-tooltip power-grid-tooltip--substation ${isNearest ? 'power-grid-tooltip--nearest' : ''}`}
            >
              <strong>{isNearest ? '参考変電所：' : ''}{substation.name}</strong><br />
               {substation.voltageLabel}<br />
               候補地から{substation.direction ? `${substation.direction}側 ` : ''}{formatMapDistance(substation.distanceMeters)}<br />
               {substation.positionConfidence?.label || '位置参考'}
               {capacityMatch && <><br />公表照合：{capacityMatch.match?.label || '名称候補'} / 空容量 {capacityValueLabel(capacityMatch.capacity.availableCapacityMw)}</>}
            </Tooltip>
        </CircleMarker>
          )
        })}
      </>
  )
}

function parcelPathStyle(role, selected, dimmed = false) {
  const style = role === 'target'
    ? { color: '#f0b429', weight: 3.5, fillColor: '#f0b429', fillOpacity: 0.22, dashArray: null }
    : role === 'reference'
      ? { color: '#83c6ff', weight: 3, fillColor: '#5ca9e8', fillOpacity: 0.12, dashArray: '7 4' }
      : { color: selected ? '#f5b940' : '#f8f1a7', weight: selected ? 4 : 1.5, fillColor: selected ? '#f5b940' : '#e8ef67', fillOpacity: selected ? 0.28 : 0.08, dashArray: null }
  const opacity = dimmed ? 0.2 : 1
  return { ...style, opacity, fillOpacity: style.fillOpacity * opacity }
}

function parcelTooltipContent(info, role) {
  const element = document.createElement('span')
  element.textContent = `${role === 'target' ? '対象 · ' : role === 'reference' ? '参考 · ' : ''}${info.number || '地番未記載'}`
  return element
}

function displayParcelKey(feature, sourceName) {
  // Original files may contain IDs beyond the review envelope. Keep the map
  // usable; validation on adding a parcel will report the unsupported value.
  try { return getParcelKey(feature, sourceName) } catch { return null }
}

function restoredParcelFeature(entry) {
  return {
    type: 'Feature',
    id: entry.info?.id || entry.id,
    geometry: entry.geometry,
    properties: {
      __parcelId: entry.info?.id || entry.id,
      __parcelReviewId: entry.id,
      __parcelSourceName: entry.source?.fileName || '',
      地番: entry.info?.number || '',
      所在: entry.info?.area || '',
      市区町村名: entry.info?.municipality || '',
      座標系: entry.info?.mapType || '',
    },
  }
}

function ParcelLayer({ data, review, selectedParcelId, focusParcelId, onParcelSelect, mode, locked, onDrawingPoint, onDrawingFinish, onError, dimmed = false }) {
  const map = useMap()
  const layerRef = useRef(null)
  const previousDataRef = useRef(undefined)
  const initialBoundsShownRef = useRef(false)
  const sourceName = data?.summary?.fileName || ''
  const entries = review?.parcels || []
  const roleById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry.role])), [entries])
  const latestRef = useRef(null)
  latestRef.current = { onParcelSelect, mode, locked, onDrawingPoint, onDrawingFinish, onError, roleById, sourceName, selectedParcelId, dimmed }
  const combinedData = useMemo(() => {
    // Review metadata belongs to restored entries, never to imported properties.
    const features = (data?.features || []).map((feature) => {
      if (!feature.properties || (!('__parcelReviewId' in feature.properties) && !('__parcelSourceName' in feature.properties))) return feature
      const { __parcelReviewId, __parcelSourceName, ...properties } = feature.properties
      return { ...feature, properties }
    })
    const originalIds = new Set(features.map((feature) => displayParcelKey(feature, sourceName)).filter(Boolean))
    return { type: 'FeatureCollection', features: [...features, ...entries.filter((entry) => entry.geometry && !originalIds.has(entry.id)).map(restoredParcelFeature)] }
  }, [data, entries, sourceName])

  useEffect(() => {
    const group = layerRef.current
    if (!group) return
    // react-leaflet's GeoJSON data is immutable; explicitly replace the layers.
    group.clearLayers()
    group.addData(combinedData)
    const bounds = group.getBounds()
    if (bounds?.isValid() && (data !== previousDataRef.current || !initialBoundsShownRef.current)) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 })
      initialBoundsShownRef.current = true
    }
    previousDataRef.current = data
  }, [combinedData, data, map])

  useEffect(() => {
    layerRef.current?.eachLayer((layer) => {
      const info = parcelInfo(layer.feature)
      const id = layer.feature.properties?.__parcelReviewId || displayParcelKey(layer.feature, sourceName)
      const role = roleById.get(id)
      layer.setStyle(parcelPathStyle(role, info.id === selectedParcelId, dimmed))
      layer.setTooltipContent(parcelTooltipContent(info, role))
      layer.getTooltip()?.setOpacity(dimmed ? 0.18 : 0.9)
    })
  }, [combinedData, roleById, sourceName, selectedParcelId, dimmed])

  useEffect(() => {
    if (!focusParcelId) return
    let exact = null, original = null, restored = null
    layerRef.current?.eachLayer((layer) => {
      const id = layer.feature.properties?.__parcelReviewId || displayParcelKey(layer.feature, sourceName)
      if (id === focusParcelId) exact = layer
      else if (parcelInfo(layer.feature).id === focusParcelId) {
        if (layer.feature.properties?.__parcelReviewId) restored ||= layer
        else original ||= layer
      }
    })
    const layer = exact || original || restored
    const bounds = layer?.getBounds?.()
    if (bounds?.isValid()) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 19 })
    layer?.openTooltip?.()
  }, [focusParcelId, data, map])

  return (
    <GeoJSON
      ref={layerRef}
      data={EMPTY_FEATURE_COLLECTION}
      style={feature => {
        const state = latestRef.current
        const info = parcelInfo(feature)
        const id = feature.properties?.__parcelReviewId || displayParcelKey(feature, state.sourceName)
        return parcelPathStyle(state.roleById.get(id), info.id === state.selectedParcelId, state.dimmed)
      }}
      bubblingMouseEvents={false}
      onEachFeature={(feature, layer) => {
        const info = parcelInfo(feature)
        const state = latestRef.current
        const id = feature.properties?.__parcelReviewId || displayParcelKey(feature, state.sourceName)
        layer.setStyle(parcelPathStyle(state.roleById.get(id), info.id === state.selectedParcelId, state.dimmed))
        layer.bindTooltip(parcelTooltipContent(info, state.roleById.get(id)), { sticky: true, direction: 'top', className: 'parcel-tooltip', opacity: state.dimmed ? 0.18 : 0.9 })
        layer.on('click', (event) => {
          const current = latestRef.current
          if (current.locked) return
          if (['boundary', 'exclusion'].includes(current.mode)) {
            if (!(event.originalEvent?.detail > 1)) current.onDrawingPoint(event.latlng, event.originalEvent?.timeStamp)
            return
          }
          const center = featureInteriorPoint(feature)
          if (!center) {
            current.onError?.('この筆の内部点を確認できません。形状を確認し、地図から計算地点を指定してください。')
            return
          }
          current.onParcelSelect?.(feature, center)
        })
        layer.on('dblclick', (event) => {
          const current = latestRef.current
          if (current.locked || !['boundary', 'exclusion'].includes(current.mode)) return
          if (event.originalEvent) L.DomEvent.stop(event.originalEvent)
          current.onDrawingFinish()
        })
      }}
    />
  )
}

function ReviewGeometryLayers({ review, vertices, onClose, locked = false, dimmed = false }) {
  const boundary = review?.boundary
  const opacity = dimmed ? 0.2 : 1
  return <>
    {boundary && <GeoJSON key={`boundary-${JSON.stringify(boundary)}`} data={boundary} interactive={false} style={{ color: '#ffffff', weight: 3.5, fillColor: '#27b890', fillOpacity: 0.12 * opacity, opacity }}>
      <DrawingContextTooltip dimmed={dimmed} permanent direction="center" className="parcel-tooltip">検討範囲</DrawingContextTooltip>
    </GeoJSON>}
    {(review?.exclusions || []).map((geometry, index) => <GeoJSON key={`exclusion-${index}-${JSON.stringify(geometry)}`} data={geometry} interactive={false} style={{ color: '#fb8686', weight: 3, dashArray: '6 4', fillColor: '#e75757', fillOpacity: 0.28 * opacity, opacity }}>
      <DrawingContextTooltip dimmed={dimmed} permanent direction="center" className="parcel-tooltip">除外範囲 {index + 1}</DrawingContextTooltip>
    </GeoJSON>)}
    {vertices.length > 2 && <Polygon positions={vertices} interactive={false} pathOptions={{ color: '#ffffff', weight: 2, dashArray: '5 4', fillColor: '#32d1ae', fillOpacity: 0.2 }} />}
    {vertices.length === 2 && <Polyline positions={vertices} interactive={false} pathOptions={{ color: '#ffffff', weight: 3, dashArray: '5 4' }} />}
    {vertices.map((point, index) => <Fragment key={`${index}-${point[0]}-${point[1]}`}>
      {index === 0 && <CircleMarker center={point} radius={22} interactive={!locked} bubblingMouseEvents={false} pathOptions={{ stroke: false, fillColor: '#ffffff', fillOpacity: 0.12 }} eventHandlers={{ click: event => {
        if (event.originalEvent) L.DomEvent.stop(event.originalEvent)
        if (!locked) onClose?.()
      } }}>
        <Tooltip permanent direction="top" className="parcel-draft-tooltip">{vertices.length >= 3 ? '開始点 · 押して閉じる' : '開始点（3点以上で閉じる）'}</Tooltip>
      </CircleMarker>}
      <CircleMarker center={point} radius={index === 0 ? 7 : 5} interactive={false} pathOptions={{ color: '#183d35', fillColor: index === 0 ? '#ffe073' : '#ffffff', fillOpacity: 1, weight: 2 }}>
        {index > 0 && <Tooltip permanent direction="top" className="parcel-draft-tooltip">{index + 1}</Tooltip>}
      </CircleMarker>
    </Fragment>)}
  </>
}

export default function MapPanel({
  position,
  onSelect,
  onUseCurrentLocation,
  onResetWorkspace,
  currentLocation,
  locationStatus,
  placeInfo,
  parcelData,
  selectedParcelId,
  focusParcelId,
  onParcelSelect,
  parcelReview = EMPTY_PARCEL_REVIEW,
  parcelMode = 'point',
  onReviewGeometry,
  onParcelDrawingError,
  onParcelModeChange,
  terrainSection,
  terrainArea,
  powerGrid,
  capacityMatches,
  googleMapsUrl,
}) {
  const hasTerrainOverlay = !!terrainSection?.lines?.length
  const [showTerrainArea, setShowTerrainArea] = useState(true)
  useEffect(() => setShowTerrainArea(true), [terrainArea?.geometryKey, terrainArea?.fetchedAt])
  const [isCompactMap, setIsCompactMap] = useState(false)
  const [mapInteractionEnabled, setMapInteractionEnabled] = useState(false)
  const [draftVertices, setDraftVertices] = useState([])
  const draftRef = useRef([])
  const mapShellRef = useRef(null)
  const lastVertexEventRef = useRef(null)
  const [drawingMessage, setDrawingMessage] = useState('')
  const mapLocked = isCompactMap && !mapInteractionEnabled
  const isDrawing = parcelMode === 'boundary' || parcelMode === 'exclusion'

  useEffect(() => {
    if (!isDrawing) return
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    mapShellRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }, [parcelMode, isDrawing])

  function replaceDraft(vertices) {
    draftRef.current = vertices
    setDraftVertices(vertices)
  }

  function reportDrawingError(message) {
    setDrawingMessage(message)
    onParcelDrawingError?.(message)
  }

  function addDraftVertex(latlng, timeStamp = 0) {
    if (mapLocked || !isDrawing || !latlng) return
    const point = [latlng.lat, latlng.lng]
    const last = lastVertexEventRef.current
    // Touch browsers may omit click.detail. Ignore the duplicate final tap only.
    if (last && timeStamp > 0 && timeStamp - last.timeStamp < 400 && Math.abs(last.point[0] - point[0]) < 0.000002 && Math.abs(last.point[1] - point[1]) < 0.000002) return
    if (draftRef.current.length >= 200) {
      reportDrawingError('1つの範囲は200点までです。「確定」するか、点を戻してください。')
      return
    }
    lastVertexEventRef.current = { point, timeStamp }
    replaceDraft([...draftRef.current, point])
    setDrawingMessage('')
  }

  function finishDrawing() {
    if (!isDrawing || mapLocked) return
    if (draftRef.current.length < 3) {
      reportDrawingError('範囲には3点以上必要です。角を順に指定してください。')
      return
    }
    try {
      const ring = draftRef.current.map(([lat, lon]) => [lon, lat])
      const geometry = validatePolygonGeometry({ type: 'Polygon', coordinates: [[...ring, [...ring[0]]]] })
      if (!onReviewGeometry || onReviewGeometry(geometry, parcelMode) === false) return
      replaceDraft([])
      setDrawingMessage('')
      onParcelModeChange?.('point')
    } catch (error) {
      reportDrawingError(error?.message || '範囲を確定できません。点の交差や重なりを確認してください。')
    }
  }

  function cancelDrawing() {
    replaceDraft([])
    setDrawingMessage('')
    onParcelModeChange?.('point')
  }

  function undoDraftVertex() {
    replaceDraft(draftRef.current.slice(0, -1))
    lastVertexEventRef.current = null
    setDrawingMessage('')
  }

  useEffect(() => {
    replaceDraft([])
    lastVertexEventRef.current = null
    setDrawingMessage('')
  }, [parcelMode, parcelReview])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const query = window.matchMedia('(max-width: 640px)')
    const sync = () => setIsCompactMap(query.matches)
    sync()
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])

  return (
    <>
    <div ref={mapShellRef} className={`map-shell${isDrawing ? ' map-shell--parcel-drawing' : ''}`} onKeyDown={(event) => {
      if (!isDrawing || event.target.closest?.('input, textarea, select, button, a')) return
      if (event.key === 'Escape') { event.preventDefault(); cancelDrawing() }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); finishDrawing() }
    }}>
      <MapContainer
        center={INITIAL_MAP_CENTER}
        zoom={INITIAL_MAP_ZOOM}
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
        <ClickHandler onSelect={onSelect} mode={parcelMode} locked={mapLocked} onAddVertex={addDraftVertex} onFinish={finishDrawing} />
        <MapController position={position} />
        <MapInteractionController locked={mapLocked} drawing={isDrawing} />
        <ParcelLayer
          data={parcelData}
          selectedParcelId={selectedParcelId}
          focusParcelId={focusParcelId}
          onParcelSelect={onParcelSelect}
          review={parcelReview}
          mode={parcelMode}
          locked={mapLocked}
          onDrawingPoint={addDraftVertex}
          onDrawingFinish={finishDrawing}
          onError={reportDrawingError}
          dimmed={isDrawing}
        />
        <PowerGridOverlay data={powerGrid} capacityMatches={capacityMatches} />
        <CurrentLocationLayer currentLocation={currentLocation} />
        <TerrainSectionMapOverlay analysis={terrainSection} dimmed={isDrawing} />
        {terrainArea && showTerrainArea && <TerrainAreaMapOverlay analysis={terrainArea} dimmed={isDrawing} />}
        <SiteMarker position={position} placeInfo={placeInfo} suppressPopup={hasTerrainOverlay || (terrainArea && showTerrainArea) || parcelMode !== 'point'} />
        <ReviewGeometryLayers review={parcelReview} vertices={draftVertices} onClose={finishDrawing} locked={mapLocked} dimmed={isDrawing} />
      </MapContainer>
      <div className="map-draw-controls" role="group" aria-label="地図に範囲を描く">
        <button type="button" className={parcelMode === 'boundary' ? 'is-active' : ''} aria-pressed={parcelMode === 'boundary'} onClick={() => onParcelModeChange?.(parcelMode === 'boundary' ? 'point' : 'boundary')} disabled={!onParcelModeChange}>範囲を描く</button>
        <button type="button" className={parcelMode === 'exclusion' ? 'is-active' : ''} aria-pressed={parcelMode === 'exclusion'} onClick={() => onParcelModeChange?.(parcelMode === 'exclusion' ? 'point' : 'exclusion')} disabled={!onParcelModeChange}>除外</button>
      </div>
      {isDrawing && <div className="map-hint">{PARCEL_MODE_HINTS[parcelMode]}</div>}
      {googleMapsUrl && (
        <a className="map-google-open" href={googleMapsUrl} target="_blank" rel="noreferrer">
          Googleマップで開く
        </a>
      )}
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
        <div className="map-location-buttons">
        <button type="button" onClick={onUseCurrentLocation} disabled={locationStatus?.status === 'loading'}>
          {locationStatus?.status === 'loading' ? '現在地を取得中…' : '◎ 現在地を取得'}
        </button>
        {onResetWorkspace && <button type="button" className="map-reset-button" title="候補地・入力・計算結果を初期化" onClick={onResetWorkspace}>初期化</button>}
        </div>
        {locationStatus?.message && (
          <small className={locationStatus.status === 'error' ? 'is-error' : ''}>{locationStatus.message}</small>
        )}
      </div>
      {parcelData && <div className="parcel-map-badge">地番レイヤー {parcelData.features.length.toLocaleString()}筆</div>}
    </div>
    {isDrawing && <div className="parcel-drawing-toolbar" aria-label="範囲の作図操作">
      <div className="parcel-drawing-toolbar__instruction">
        <strong>{parcelMode === 'boundary' ? '検討範囲' : '除外範囲'}を作図</strong>
        <span aria-live="polite">{draftVertices.length}点を指定 · 3点以上で開始点を押して閉じる</span>
        {mapLocked && <small>先に「地図操作を有効化」を押してください。</small>}
      </div>
      <div className="parcel-drawing-toolbar__buttons">
        <button type="button" onClick={undoDraftVertex} disabled={!draftVertices.length}>1点戻す</button>
        <button type="button" onClick={cancelDrawing}>取消</button>
        <button type="button" className="parcel-button--primary" onClick={finishDrawing} disabled={draftVertices.length < 3 || mapLocked || !onReviewGeometry}>確定</button>
      </div>
      <small>角を順に指定し、開始点をもう一度押すと完成します。「確定」でも完成できます。</small>
    </div>}
    {drawingMessage && <p className="parcel-review-message parcel-review-message--error" role="alert">{drawingMessage}</p>}
    {terrainArea && <div className="terrain-map-legend" aria-label="検討範囲の勾配凡例"><button type="button" aria-pressed={showTerrainArea} onClick={() => setShowTerrainArea(value => !value)}>{showTerrainArea ? '等高線・勾配 ON' : '等高線・勾配 OFF'}</button>{showTerrainArea && <><span><i style={{ background: '#cfe3cd' }} />10°未満</span><span><i style={{ background: '#efe8ad' }} />10–20°</span><span><i style={{ background: '#eabd8d' }} />20–30°</span><span><i style={{ background: '#df9d9b' }} />30°以上</span><span><i style={{ background: '#b5bcb5' }} />勾配未確認</span><small>黄色線：分析した参考範囲 / 色は施工可否を示しません</small></>}</div>}
    {!!(parcelReview?.parcels?.length || parcelReview?.boundary || parcelReview?.exclusions?.length) && <div className="parcel-map-legend" aria-label="地図の凡例">
      <span><i className="parcel-map-legend__target" />対象</span><span><i className="parcel-map-legend__reference" />参考</span><span><i className="parcel-map-legend__boundary" />検討範囲</span><span><i className="parcel-map-legend__exclusion" />除外</span>
    </div>}
    </>
  )
}
