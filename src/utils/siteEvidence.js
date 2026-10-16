import { normalizeDisplayText } from './text.js'

export const LEGACY_DEM_DRAFT_BACKUP = 'solar-site-precheck-draft-before-dem-separation-v1'

export function restoreDraftEvidence(raw, storage) {
  const draft = JSON.parse(raw) || {}
  const recovered = recoverTerrainEvidence(draft)
  if (!/NEDO/i.test(draft.elevation?.source || '')) return { ...draft, ...recovered }
  let recoverySavePaused = false
  try {
    const backup = storage.getItem(LEGACY_DEM_DRAFT_BACKUP)
    if (backup && backup !== raw) throw new Error('Preserve the existing backup')
    if (!backup) storage.setItem(LEGACY_DEM_DRAFT_BACKUP, raw)
  } catch {
    recoverySavePaused = true
    recovered.elevation.message += ' 元の自動保存を保護中です。変更内容は検討記録JSONで保存してください。'
  }
  return { ...draft, ...recovered, recoverySavePaused }
}

export function currentPlaceLabel(position, placeInfo) {
  if (!Number.isFinite(position?.lat) || !Number.isFinite(position?.lon) || placeInfo?.status !== 'success') return ''
  const key = placeInfo.positionKey
  if (key && ![6, 7].some(digits => key === `${position.lat.toFixed(digits)},${position.lon.toFixed(digits)}`)) return ''
  const label = typeof placeInfo.data?.label === 'string' ? normalizeDisplayText(placeInfo.data.label) : ''
  return ['住所情報なし', '保存記録の候補地'].includes(label) ? '' : label
}

// Older releases overwrote the site's DEM with the NEDO mesh elevation.
// Keep independent sections/area DEM and PVGIS baseline; those did not use it.
export function recoverTerrainEvidence({ elevation, terrain, generation }) {
  if (!/NEDO/i.test(elevation?.source || '')) return { elevation, terrain, generation }
  const { scenario, ...baseline } = generation || {}
  return {
    elevation: {
      status: 'idle', value: null, source: '',
      message: `保存時のNEDO標高${Number.isFinite(elevation.value) ? ` ${elevation.value}m` : ''}は地形計算に使いません。この地点のDEM標高を再取得してください。`,
    },
    terrain: null,
    generation: scenario?.terrain ? baseline : generation,
  }
}
