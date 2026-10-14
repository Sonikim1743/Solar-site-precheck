import { useId, useRef, useState } from 'react'
import { TERRAIN_DIRECTIONS, terrainCompassRotation, terrainNavigationCube } from '../utils/terrainNavigation.js'

export default function TerrainViewNavigation({ view, onSelect, controls }) {
  const [open, setOpen] = useState(false)
  const compassRef = useRef(null)
  const id = `terrain-directions-${useId().replace(/:/g,'')}`
  const go = direction => { if(open)compassRef.current?.focus({ preventScroll:true }); setOpen(false); onSelect(direction) }
  return <div className="terrain-view-navigation" role="group" aria-label="地形の方向" data-navigation-azimuth={view.azimuth} data-navigation-pitch={view.pitch} onKeyDown={event => { if(event.key === 'Escape' && open){event.preventDefault();setOpen(false);compassRef.current?.focus({ preventScroll:true })} }}>
    <div className="terrain-navigation-tools">
      {!controls && <button type="button" className="terrain-navigation-home" aria-label="最初の視点に戻す" title="最初の視点" onClick={() => go('home')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8v10h-6v-7H9v7H3Z" /></svg></button>}
      <button ref={compassRef} type="button" className="terrain-navigation-compass" aria-label="方位を選ぶ" title="方位を選ぶ" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19" /><g transform={`rotate(${terrainCompassRotation(view)} 22 22)`}><path d="M22 5 16 22h12Z" className="terrain-compass-north" /><path d="M22 39 16 22h12Z" className="terrain-compass-south" /></g></svg></button>
    </div>
    <svg className="terrain-navigation-cube" viewBox="0 0 160 160" role="group" aria-label="方位キューブ">
      {terrainNavigationCube(view).map(face => <g key={face.id} role="button" tabIndex="0" aria-label={`${face.label}から見る`} data-cube-face={face.id} onClick={() => go(face.id)} onKeyDown={event => { if(['Enter',' '].includes(event.key)){event.preventDefault();go(face.id)} }}>
        <polygon points={face.points.map(p => p.join(',')).join(' ')} />
        <text x={face.center[0]} y={face.center[1]} textAnchor="middle" dominantBaseline="central">{face.label}</text>
      </g>)}
    </svg>
    {controls && <div className="terrain-navigation-controls" role="group" aria-label="キューブ下の3D操作">{controls}</div>}
    {open && <div id={id} className="terrain-navigation-menu" role="group" aria-label="見る方向を選択">{TERRAIN_DIRECTIONS.map(direction => <button key={direction.id} type="button" onClick={() => go(direction.id)}>{direction.label}から見る</button>)}</div>}
  </div>
}
