import { HAZARD_LAYERS, hazardTileUrl, soilPrefecture, SOIL_PREFECTURES } from '../utils/regulatoryLayers.js'
import { activeReferenceSources, isInspectionPoint, locateReferencePoint, pointInBounds, hazardPointTile, classifyHazardPixel } from '../utils/regulatoryPoint.js'
import { readReferenceChunk } from './regulatoryReferences.js'
import { loadHazardTile } from './hazardTiles.js'
import { inspectStoredPoint } from './storedHazards.js'

const abortError = () => new DOMException('地点確認を中止しました。', 'AbortError')
const checkAbort = signal => { if (signal?.aborted) throw abortError() }

export async function inspectReferencePoint(point, { includeHistorical = false, signal, fetchImpl = fetch, sources, maxFilesPerSource = 64 } = {}) {
  if (!isInspectionPoint(point)) throw Error('日本の選択地点を確認してください。')
  const rows = activeReferenceSources(includeHistorical, sources).map(source => {
    const files = source.files.filter(file => pointInBounds(point, file.bbox))
    return { source, files: files.slice(0, maxFilesPerSource), truncated: files.length > maxFilesPerSource, matches: [], failures: [], inBounds: pointInBounds(point, source.bbox) }
  })
  const jobs = rows.flatMap(row => row.files.map(file => ({ row, file })))
  let index = 0
  async function worker() {
    while (index < jobs.length) {
      checkAbort(signal)
      const { row, file } = jobs[index++]
      try {
        const features = await readReferenceChunk(file, { signal, fetchImpl })
        for (const feature of features) {
          if (feature.type !== 'Feature' || !Array.isArray(feature.bbox) || feature.bbox.length !== 4 || !feature.bbox.every(Number.isFinite) || feature.bbox[0] > feature.bbox[2] || feature.bbox[1] > feature.bbox[3]) throw Error('参考図形の範囲を確認できません。')
          if (!pointInBounds(point, feature.bbox)) continue
          const location = locateReferencePoint(point, feature.geometry)
          if (location === 'invalid') throw Error('参考図形の形状を判読できません。')
          if (location === 'outside') continue
          const props = feature.properties || {}, recordId = String(props.sourceRecordId ?? feature.id ?? '')
          const key = `${row.source.id}:${recordId}`
          const previous = row.matches.find(match => match.id === key)
          if (previous) { previous.boundary ||= location === 'boundary'; previous.components.push(feature.id); continue }
          row.matches.push({ id: key, sourceId: row.source.id, sourceRecordId: recordId, sourceRecordIndex: props.sourceRecordIndex ?? null, name: String(props.name || '名称未記載'), kind: String(props.kind || row.source.label), place: String(props.place || ''), era: String(props.era || ''), detailKind: String(props.detailKind || ''), condition: String(props.sourceCondition || ''), description: String(props.sourceDescription || ''), finds: String(props.sourceFinds || ''), remark: String(props.sourceRemark || ''), sourceYear: props.sourceYear || null, boundary: location === 'boundary', components: [feature.id] })
        }
      } catch (error) {
        checkAbort(signal)
        row.failures.push({ url: file.url, message: error.message })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker))
  checkAbort(signal)
  return rows.map(row => ({ source: row.source, matches: row.matches, failures: row.failures, state: row.failures.length ? 'error' : row.truncated ? 'partial' : row.matches.length ? 'matched' : row.inBounds ? 'none' : 'outside' }))
}

// The name-enrichment request (muni.js) is not needed for a point's prefecture.
export async function lookupPointPrefecture(point, { signal, fetchImpl = fetch } = {}) {
  checkAbort(signal)
  const controller = new AbortController(), abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 8000)
  try {
    const url = 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?' + new URLSearchParams({ lat: String(point.lat), lon: String(point.lon) })
    const response = await fetchImpl(url, { signal: controller.signal, credentials: 'omit' })
    if (!response.ok) throw Error(`対象県の照会 HTTP ${response.status}`)
    const data = await response.json()
    const raw = data?.results?.muniCd
    const code = typeof raw === 'number' && Number.isInteger(raw) ? String(raw).padStart(5, '0') : String(raw || '')
    if (!/^\d{5}$/.test(code)) return { state: 'unconfirmed', message: '選択地点の市区町村コードを確認できません。' }
    const prefecture = SOIL_PREFECTURES.find(item => item.code === code.slice(0, 2))
    return prefecture ? { state: prefecture.allowed ? 'ready' : 'unsupported', ...prefecture } : { state: 'unconfirmed', message: '選択地点の対象県は未確認です。' }
  } catch (error) {
    checkAbort(signal)
    return { state: 'error', message: error.message || '対象県の照会失敗' }
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
}

export async function decodePointPixel(blob, pixel, { signal } = {}) {
  checkAbort(signal)
  if (typeof createImageBitmap !== 'function') throw Error('この環境ではPNGの地点画素を判読できません。')
  const bitmap = await createImageBitmap(blob)
  try {
    checkAbort(signal)
    if (bitmap.width !== 256 || bitmap.height !== 256) throw Error('配信画像の寸法を確認できません。')
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 })
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw Error('地点画素の判読に未対応です。')
    context.drawImage(bitmap, 0, 0)
    return Array.from(context.getImageData(pixel.x, pixel.y, 1, 1).data)
  } finally { bitmap.close() }
}

export async function inspectHazardPoint(point, { signal, fetchImpl = fetch, decodePixel = decodePointPixel, lookupRegion = lookupPointPrefecture } = {}) {
  const { coords, pixel } = hazardPointTile(point)
  const regionPromise = Promise.resolve().then(() => lookupRegion(point, { signal, fetchImpl })).catch(error => {
    checkAbort(signal)
    return { state: 'error', message: error.message || '対象県の照会失敗' }
  })
  const inspect = async (layer, prefecture = '') => {
    const url = hazardTileUrl(layer.id, coords, prefecture)
    try {
      const result = await loadHazardTile(layer.id, coords, { prefecture, signal, fetchImpl })
      if (result.state === 'unavailable') return { layer, state: 'unavailable', url, coords, pixel, message: '配信画像404。区域なし・安全とは判定できません。' }
      try {
        const rgba = await decodePixel(result.blob, pixel, { signal })
        checkAbort(signal)
        return { layer, ...classifyHazardPixel(rgba), url, coords, pixel, prefecture }
      } catch (error) {
        checkAbort(signal)
        return { layer, state: 'unreadable', url, coords, pixel, message: error.message }
      }
    } catch (error) {
      checkAbort(signal)
      return { layer, state: 'error', url, coords, pixel, message: error.message }
    }
  }
  // Both branches have rejection handlers immediately, including cancellation.
  const [flood, region] = await Promise.all([inspect(HAZARD_LAYERS.find(layer => !layer.soil)), regionPromise])
  checkAbort(signal)
  const soils = HAZARD_LAYERS.filter(layer => layer.soil)
  const soilResults = region.state === 'ready' && soilPrefecture(region.code)
    ? await Promise.all(soils.map(layer => inspect(layer, region.code)))
    : soils.map(layer => ({ layer, state: region.state, message: region.message || `${region.name || '選択地点の対象県'}は個別条件未確認・判読対象外です。` }))
  checkAbort(signal)
  return { region, layers: [flood, ...soilResults] }
}

export async function inspectRegulatoryPoint(point, { enabled = false, includeHistorical = false, signal, ...dependencies } = {}) {
  if (!isInspectionPoint(point)) throw Error('先に確認する地点を選んでください。')
  if (!enabled) return { point: { ...point }, state: 'off', references: [], hazards: null }
  const [references, hazards] = await Promise.all([
    inspectReferencePoint(point, { includeHistorical, signal, fetchImpl: dependencies.fetchImpl, sources: dependencies.sources }),
    (async()=>{
      if(dependencies.useStored===false)return inspectHazardPoint(point,{signal,...dependencies})
      try{
        const result=await inspectStoredPoint(point,{signal,fetchImpl:dependencies.fetchImpl})
        return result.region.state==='outside'?inspectHazardPoint(point,{signal,...dependencies}):result
      }catch(error){checkAbort(signal);return {mode:'stored',region:{state:'error',message:error.message},datasets:[]}}
    })(),
  ])
  checkAbort(signal)
  return { point: { ...point }, state: 'complete', includeHistorical, checkedAt: new Date().toISOString(), references, hazards }
}
