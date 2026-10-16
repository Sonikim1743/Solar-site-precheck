import { toDegreeMinutes } from '../utils/coordinates.js'
import './map-location-bar.css'

export default function MapLocationBar({ position, placeLabel, placeStatus, elevation, googleMapsUrl, onCopy, copyStatus, onFetchElevation, onUseCurrentLocation, onResetWorkspace, locationStatus }) {
  const label = position ? placeLabel || (placeStatus === 'loading' ? '住所を確認中…' : '座標で確認') : '住所検索または地図で地点を選択'
  const height = elevation?.status === 'success' && Number.isFinite(elevation.value) ? `${elevation.value.toFixed(1)} m` : elevation?.status === 'loading' ? '取得中…' : position ? '未取得 ↻' : '—'
  const canFetch = position && !['success', 'loading'].includes(elevation?.status)
  return <section className="map-location-bar" aria-label="選択地点と地図の操作">
    <div className="map-point-summary">
      <div className="map-point-title"><span>選択地点</span><strong title={label}>{label}</strong></div>
      <div className="map-point-meta">
        <div className="map-point-coordinates" aria-label="選択地点の緯度・経度">{position ? <><span>{toDegreeMinutes(position.lat, 'lat')}</span><span>{toDegreeMinutes(position.lon, 'lon')}</span></> : <span>緯度・経度 —</span>}</div>
        <button type="button" className="map-point-elevation" aria-label={canFetch ? 'この地点の標高を取得' : `標高 ${height}`} disabled={!canFetch || !onFetchElevation} onClick={onFetchElevation}><span>標高</span><strong>{height}</strong></button>
        <button type="button" className="map-point-copy" aria-label="緯度・経度（度・分）をコピー" disabled={!position || !onCopy} onClick={onCopy}>コピー</button>
      </div>
    </div>
    <div className="map-location-actions" role="group" aria-label="地図のユーティリティ">
      <a role="link" href={googleMapsUrl || undefined} title={googleMapsUrl ? '現在の選択地点をGoogleマップで開く' : '先に地点を選択してください'} aria-disabled={!googleMapsUrl} tabIndex={googleMapsUrl ? undefined : -1} target="_blank" rel="noreferrer">Googleマップで開く ↗</a>
      <button type="button" aria-label="現在地を取得" disabled={!onUseCurrentLocation || locationStatus?.status === 'loading'} onClick={onUseCurrentLocation}>{locationStatus?.status === 'loading' ? '取得中…' : '◎ 現在地'}</button>
      <button type="button" title="候補地・入力・計算結果を初期化" disabled={!onResetWorkspace} onClick={onResetWorkspace}>初期化</button>
    </div>
    <div className={`map-location-status${locationStatus?.status === 'error' ? ' is-error' : ''}`} role="status">{copyStatus || locationStatus?.message || ''}</div>
  </section>
}
