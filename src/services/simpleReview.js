import { measureParcelReview, normalizeParcelReview } from '../utils/parcelReview.js'
import { featureInteriorPoint } from './parcelGeometry.js'
import { analyzeTerrainCrossSection, analyzeSurroundingTerrain, fetchElevation, HORIZON_DIRECTIONS } from './gsi.js'
import { analyzeTerrainArea } from './terrainArea.js'
import { thirdMeshCode, isConfirmedSnowStation } from './nedo.js'
import { normalizeTerrainLayoutOptions } from '../utils/terrainLayout.js'
import { terrainLayoutResultMatchesOptions } from '../utils/terrainLayoutError.js'
import { normalizeTerrainArea, terrainGeometryKey } from '../utils/terrainArea.js'
const fetchMonsolaWeb = async (...args) => (await import('./nedoWeb.js')).fetchMonsolaWeb(...args)

export function normalizeSimpleLayoutSettings(settings = {}) {
  return { tiltDeg: [10, 15, 20].includes(settings.tiltDeg) ? settings.tiltDeg : 15, direction: settings.direction === 'optimized' ? 'optimized' : 'south' }
}
export function simpleReviewDefaults(layoutOptions, settings) {
  const selected = normalizeSimpleLayoutSettings(settings)
  return { sectionRangeM: 100, sectionIntervalM: 10, obstructionHeightM: 20, horizonDirections: 8, snowBase: .95,
    layout: normalizeTerrainLayoutOptions({ ...layoutOptions, tiltDeg: selected.tiltDeg, azimuthDeg: 180 }), layoutSettings: selected }
}
const guard = signal => { if (signal?.aborted) throw signal.reason || new DOMException('中止', 'AbortError') }
export function simpleLayoutWorker(analysis, options, signal, settings) {
  return new Promise((resolve, reject) => {
    guard(signal)
    const worker = new Worker(new URL('../workers/terrainLayoutWorker.js', import.meta.url), { type: 'module' })
    let settled = false
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate(); error ? reject(error) : resolve(result) }
    const abort = () => finish(signal.reason || new DOMException('中止', 'AbortError'))
    const timer = setTimeout(() => finish(new Error('配置計算が時間切れです。再試行してください。')), 15000)
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data.result)
    worker.onerror = e => finish(new Error(e.message || '配置計算を開始できません。'))
    try { worker.postMessage({ analysis, options, fixedSouth: normalizeSimpleLayoutSettings(settings).direction === 'south', optimized: settings?.direction === 'optimized' }) } catch (e) { finish(e) }
  })
}

export async function runSimpleReview(reviewInput, { signal, onProgress = () => {}, dependencies = {}, terrainArea: acquiredArea, layoutOptions, layoutSettings } = {}) {
  const review = normalizeParcelReview(reviewInput), metrics = measureParcelReview(review)
  if (!metrics.geometry || !(metrics.usableAreaM2 > 0)) throw new Error('先に対象の筆または検討範囲を選んでください。')
  const position = featureInteriorPoint({ geometry: metrics.geometry })
  if (!position) throw new Error('有効範囲の内部代表点を確認できません。範囲を見直してください。')
  const defaults = simpleReviewDefaults(layoutOptions, layoutSettings), steps = [], results = {}
  const deps = { fetchElevation, section: analyzeTerrainCrossSection, horizon: analyzeSurroundingTerrain, snow: fetchMonsolaWeb, area: analyzeTerrainArea, layout: simpleLayoutWorker, ...dependencies }
  const step = async (name, action, partial = () => false) => {
    guard(signal); onProgress({ name, steps: [...steps], position })
    try { const value = await action(); guard(signal); if (value == null) throw new Error('取得結果がありません。'); const status = partial(value) ? 'review' : 'success'; steps.push({ name, status, message: status === 'review' ? (name === '参考配置' && value.rackCount === 0 ? '指定の勾配・間隔条件では0架台です。施工不可の判定ではありません。' : '一部欠測・計算上限などを確認してください。') : '取得済み' }); return value }
    catch (error) { guard(signal); steps.push({ name, status: 'error', message: error.message || '取得できません。再試行してください。' }); return null }
  }
  results.elevation = await step('代表点標高', () => deps.fetchElevation(position.lat, position.lon, { signal }), v => !Number.isFinite(v?.value))
  results.section = await step('地形断面', () => deps.section(position.lat, position.lon, { rangeMeters: defaults.sectionRangeM, intervalMeters: defaults.sectionIntervalM, signal }), v => !v?.lines?.length || v.lines.some(l => l.points?.some(p => p.missing || !Number.isFinite(p.elevation))))
  results.horizon = Number.isFinite(results.elevation?.value) ? await step('地平線・日影', () => deps.horizon(position.lat, position.lon, results.elevation.value, defaults.obstructionHeightM, HORIZON_DIRECTIONS, { signal }), v => !v?.samples?.length || v.samples.some(s => s.missing || s.missingCount > 0 || !Number.isFinite(s.angle))) : (steps.push({ name: '地平線・日影', status: 'error', message: '代表点標高なし・未計算' }), null)
  results.snow = await step('NEDO積雪', () => deps.snow(thirdMeshCode(position.lat, position.lon), { signal }), v => !isConfirmedSnowStation(v) || v.id !== thirdMeshCode(position.lat, position.lon))
  results.area = await step('範囲地形', async () => {
    const key = terrainGeometryKey(metrics.geometry)
    // Reuse only a validated acquisition of this exact confirmed geometry.
    // A new area or a boundary/exclusion change requires a fresh acquisition.
    const area = acquiredArea?.geometryKey === key
      ? normalizeTerrainArea(acquiredArea, metrics.geometry)
      : await deps.area(metrics.geometry, { signal })
    if (area?.geometryKey !== key) throw new Error('確定範囲と地形の応答が一致しません。再取得してください。')
    return area
  }, v => v?.summary?.coveragePercent < 100 || v?.summary?.slopeCoveragePercent < 100)
  results.layout = results.area ? await step('参考配置', async () => {
    const layout = await deps.layout(results.area, defaults.layout, signal, defaults.layoutSettings)
    if (!terrainLayoutResultMatchesOptions(layout, defaults.layout, defaults.layoutSettings.direction === 'optimized') || !Array.isArray(layout.racks) || !layout.racks.every(r=>r && Array.isArray(r.modules)) || layout.rackCount !== layout.racks.length || !Number.isSafeInteger(layout.moduleCount) || layout.moduleCount !== layout.racks.reduce((count,r)=>count+r.modules.length,0) || !Number.isFinite(layout.dcKw) || Math.abs(layout.dcKw-layout.moduleCount*defaults.layout.modulePowerW/1000)>1e-8) throw new Error('参考配置の条件・数量応答が一致しません。再試行してください。')
    return layout
  }, v => v.rackCount === 0 || v.warnings?.some(w => /上限|途中|時間/.test(typeof w === 'string' ? w : w.message))) : (steps.push({ name: '参考配置', status: 'error', message: '範囲地形なし・未計算' }), null)
  guard(signal)
  const snapshot = { position, geometryKey: results.area?.geometryKey, defaults, steps, results, acquiredAt: new Date().toISOString(), review, areaM2: metrics.usableAreaM2, status: steps.every(s => s.status === 'success') ? 'complete' : 'review' }
  return snapshot
}
