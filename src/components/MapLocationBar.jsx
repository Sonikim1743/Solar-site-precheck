import { useId, useState } from 'react'
import { toDegreeMinutes } from '../utils/coordinates.js'
import { decimalCoordinateText, googleMapsLinks, mapionMapcodeUrl } from '../utils/locationLinks.js'
import './map-location-bar.css'

export default function MapLocationBar({ position, placeLabel, placeStatus, elevation, onCopy, onCopyDecimal, copyStatus, onFetchElevation, onUseCurrentLocation, onResetWorkspace, locationStatus, resetMapNext = false }) {
  const [mapcodeHelpOpen, setMapcodeHelpOpen] = useState(false)
  const mapcodeHelpId = useId()
  const { mapUrl, streetViewUrl } = googleMapsLinks(position)
  const decimalText = decimalCoordinateText(position)
  const mapcodeUrl = mapionMapcodeUrl(position)
  const label = position ? placeLabel || (placeStatus === 'loading' ? '住所を確認中…' : '座標で確認') : '住所検索または地図で地点を選択'
  const height = elevation?.status === 'success' && Number.isFinite(elevation.value) ? `${elevation.value.toFixed(1)} m` : elevation?.status === 'loading' ? '取得中…' : position ? '未取得 ↻' : '—'
  const canFetch = position && !['success', 'loading'].includes(elevation?.status)
  return <section className="map-location-bar" aria-label="選択地点と地図の操作">
    <div className="map-point-summary">
      <div className="map-point-title"><span>選択地点</span><strong title={label}>{label}</strong></div>
      <div className="map-point-meta">
        <div className="map-point-coordinates" aria-label="選択地点の緯度・経度">{position ? <><span>{toDegreeMinutes(position.lat, 'lat')}</span><span>{toDegreeMinutes(position.lon, 'lon')}</span></> : <span>緯度・経度 —</span>}</div>
        <button type="button" className="map-point-elevation" aria-label={canFetch ? 'この地点の標高を取得' : `標高 ${height}`} disabled={!canFetch || !onFetchElevation} onClick={onFetchElevation}><span>標高</span><strong>{height}</strong></button>
        <div className="map-point-copy-actions" role="group" aria-label="座標のコピー">
          <button type="button" className="map-point-copy" aria-label="緯度・経度（度・分）をコピー" disabled={!position || !onCopy} onClick={onCopy}>度・分コピー</button>
          <button type="button" className="map-point-copy" aria-label="緯度・経度（十進度）をコピー" title="Googleマップに貼り付ける緯度, 経度をコピー" disabled={!decimalText || !onCopyDecimal} onClick={onCopyDecimal}>緯度経度コピー</button>
        </div>
      </div>
    </div>
    <div className={`map-location-actions${resetMapNext ? ' map-location-actions--reset-view' : ''}`} role="group" aria-label="地図のユーティリティ">
      <a role="link" href={mapUrl || undefined} title={mapUrl ? '現在の選択地点をGoogleマップで開く' : '先に有効な地点を選択してください'} aria-disabled={!mapUrl} tabIndex={mapUrl ? undefined : -1} target="_blank" rel="noopener noreferrer">Googleマップで見る ↗</a>
      <a role="link" href={streetViewUrl || undefined} title={streetViewUrl ? '選択地点の周辺をGoogleストリートビューで開く（画像がない場合があります）' : '先に有効な地点を選択してください'} aria-disabled={!streetViewUrl} tabIndex={streetViewUrl ? undefined : -1} target="_blank" rel="noopener noreferrer">Googleストリートビューで見る ↗</a>
      <div className="mapcode-action">
        <a role="link" href={mapcodeUrl || undefined} title={mapcodeUrl ? 'Mapionで中心点のMAPCODEを手動確認' : '先に日本の対応範囲内の有効な地点を選択してください'} aria-disabled={!mapcodeUrl} tabIndex={mapcodeUrl ? undefined : -1} target="_blank" rel="noopener noreferrer">MAPCODE確認（Mapion） ↗</a>
        <button type="button" className="mapcode-help-toggle" aria-label="MAPCODEの確認方法" aria-expanded={mapcodeHelpOpen} aria-controls={mapcodeHelpId} onClick={() => setMapcodeHelpOpen(open => !open)}>?</button>
      </div>
      <button type="button" aria-label="現在地を取得" disabled={!onUseCurrentLocation || locationStatus?.status === 'loading'} onClick={onUseCurrentLocation}>{locationStatus?.status === 'loading' ? '取得中…' : '◎ 現在地'}</button>
      <button type="button" title={resetMapNext ? '地図を初期位置・縮尺に戻す' : '選択と分析結果をクリア（地図位置・縮尺は保持）'} disabled={!onResetWorkspace} onClick={onResetWorkspace}>{resetMapNext ? <span>地図位置を<span className="map-reset-label-end">リセット</span></span> : '初期化'}</button>
    </div>
    <div className={`map-location-status${locationStatus?.status === 'error' ? ' is-error' : ''}`} role="status">{copyStatus || locationStatus?.message || ''}</div>
    <p id={mapcodeHelpId} className="mapcode-help" role="note" hidden={!mapcodeHelpOpen}>Mapionで「＋便利ツール → 地図URL」を開き、中心点のMAPCODEを確認・コピーしてください。自動変換・自動コピーは未対応です。</p>
  </section>
}
