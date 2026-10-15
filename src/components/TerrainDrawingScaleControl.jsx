import { terrainDrawingPrintFit, TERRAIN_DRAWING_SCALES } from '../utils/terrainDrawingViewport.js'

export default function TerrainDrawingScaleControl({value=1000,onChange,grid,disabled=false}) {
  const fit=grid?terrainDrawingPrintFit(grid,value):null
  return <div className="terrain-drawing-scale no-print">
    <label>配置図1枚の縮尺 <select value={value} disabled={disabled} onChange={e=>onChange?.(e.target.value==='auto'?'auto':Number(e.target.value))}>
      {TERRAIN_DRAWING_SCALES.map(d=><option key={d} value={d}>1:{d.toLocaleString('ja-JP')}（50m = {50000/d}mm）</option>)}
      <option value="auto">自動（図に合わせる・左右別縮尺）</option>
    </select></label>
    <small>{value==='auto'?'左右別縮尺。各図の目盛で確認。':'両図同縮尺。A3横・実際のサイズ100%で印刷。用紙合わせ・別用紙は縮尺が変わります。'}</small>
    {fit&&!fit.fits&&<p role="alert">{fit.reason}</p>}
  </div>
}
