import { useState } from 'react'
import { layoutOutputState } from '../utils/layoutOutputState.js'
import { downloadTerrainDxf } from '../utils/terrainDxf.js'

export default function TerrainDxfButton({ report, blocked = false, save = downloadTerrainDxf }) {
  const [error, setError] = useState('')
  const disabled = blocked || !layoutOutputState(report?.terrainArea, report?.terrainPreview).current
  function download() {
    if (disabled) return
    try { save(report); setError('') } catch (cause) { setError(cause.message || 'DXFを保存できませんでした。') }
  }
  return <><button type="button" className="secondary-button" onClick={download} disabled={disabled} title="実寸2D・1単位=1m、参考DEM・境界（測量成果ではありません）">DXFを保存</button>{error && <span role="alert">{error}</span>}</>
}
