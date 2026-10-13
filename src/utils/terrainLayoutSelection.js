import { estimateTerrainLayoutAc } from './terrainLayout.js'

const poolRacks = pool => Array.isArray(pool?.racks) ? pool.racks : []

// New selections are excluded rack IDs. Older in-memory previews used an
// integer prefix count. An explicit array, including [], always wins over the
// legacy count. Unknown IDs cannot remove an unrelated candidate rack.
export function normalizeTerrainRackSelection(pool, selection) {
  const racks = poolRacks(pool)
  const excluded = Array.isArray(selection) ? selection : Array.isArray(selection?.disabledRackIds) ? selection.disabledRackIds : null
  if (excluded) {
    const wanted = new Set(excluded.filter(id => typeof id === 'string'))
    return [...new Set(racks.filter(rack => wanted.has(rack.id)).map(rack => rack.id))]
  }
  const legacyCount = Number.isInteger(selection) ? selection : selection?.activeRackCount
  const count = Number.isInteger(legacyCount) ? Math.max(0, Math.min(racks.length, legacyCount)) : racks.length
  return [...new Set(racks.slice(count).map(rack => rack.id))]
}

export function selectedTerrainLayout(pool, selection) {
  if (!pool) return null
  const disabledRackIds = normalizeTerrainRackSelection(pool, selection), disabled = new Set(disabledRackIds)
  const racks = poolRacks(pool).filter(rack => !disabled.has(rack.id)), disabledRacks = poolRacks(pool).filter(rack => disabled.has(rack.id))
  const moduleCount = racks.reduce((sum, rack) => sum + (Array.isArray(rack.modules) ? rack.modules.length : Number.isSafeInteger(rack.moduleCount) && rack.moduleCount >= 0 ? rack.moduleCount : 0), 0)
  const dcKw = moduleCount * 720 / 1000, capacity = estimateTerrainLayoutAc(dcKw)
  const warnings = (pool.warnings || []).filter(warning => typeof warning !== 'string' || !warning.startsWith('AC換算が10kW未満'))
  if (dcKw > 0 && capacity.acTargetKw < 10) warnings.push('AC換算が10kW未満のため標準表示の下限10kWです。実際のPCS容量を示しません。')
  return { ...pool, racks, disabledRacks, disabledRackIds, poolRackCount: poolRacks(pool).length, rackCount: racks.length,
    moduleCount, dcKw, ...capacity, warnings, stats: { ...pool.stats, acStepKw: capacity.acStepKw,
      selectedRackCount: racks.length, disabledRackCount: disabledRacks.length,
      placedFootprintAreaM2: racks.reduce((sum, rack) => sum + rack.widthM * rack.depthM, 0) } }
}

export function toggleTerrainRackSelection(pool, selection, id) {
  const previous = normalizeTerrainRackSelection(pool, selection)
  if (typeof id !== 'string' || !poolRacks(pool).some(rack => rack.id === id)) return previous
  const disabled = new Set(previous)
  if (disabled.has(id)) disabled.delete(id); else disabled.add(id)
  return poolRacks(pool).filter(rack => disabled.has(rack.id)).map(rack => rack.id)
}

// Minus removes the last active candidate. Plus restores the first excluded
// candidate in the fixed pool order; remaining rack coordinates never change.
export function adjustTerrainRackSelection(pool, selection, direction) {
  const disabled = normalizeTerrainRackSelection(pool, selection), excluded = new Set(disabled)
  const racks = poolRacks(pool)
  const rack = direction === -1 ? [...racks].reverse().find(rack => !excluded.has(rack.id))
    : direction === 1 ? racks.find(rack => excluded.has(rack.id)) : null
  return rack ? toggleTerrainRackSelection(pool, disabled, rack.id) : disabled
}
