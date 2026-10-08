import {
  createTerrainPlan, terrainTilePoint, bilinearTerrainValue, decodeDemRgba,
  normalizeTerrainArea, TERRAIN_DEM_LAYERS, TERRAIN_AREA_LIMITS,
} from '../utils/terrainArea.js'

const successfulTiles = new Map()
const MAX_CACHE_TILES = 64
const inFlightTiles = new Map()
const functionIds = new WeakMap()
let nextFunctionId = 0, activeRequests = 0
const networkQueue = []
const abortError = message => new DOMException(message || '地形の取得を中止しました。', 'AbortError')
const checkAbort = signal => { if (signal?.aborted) throw signal.reason || abortError() }

function abortable(promise, signal) {
  checkAbort(signal)
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason || abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function functionId(fn) {
  if (!functionIds.has(fn)) functionIds.set(fn, ++nextFunctionId)
  return functionIds.get(fn)
}

function drainNetworkQueue() {
  while (activeRequests < 4 && networkQueue.length) {
    const job = networkQueue.shift()
    if (job.cancelled) continue
    job.started = true
    job.signal.removeEventListener('abort', job.cancel)
    if (job.signal.aborted) { job.reject(job.signal.reason || abortError()); continue }
    activeRequests++
    Promise.resolve().then(job.work).then(job.resolve, job.reject).finally(() => { activeRequests--; drainNetworkQueue() })
  }
}

function networkSlot(work, signal) {
  checkAbort(signal)
  return new Promise((resolve, reject) => {
    const job = { work, signal, resolve, reject, cancelled: false, started: false }
    job.cancel = () => { if (!job.started) { job.cancelled = true; reject(signal.reason || abortError()) } }
    signal.addEventListener('abort', job.cancel, { once: true })
    networkQueue.push(job)
    drainNetworkQueue()
  })
}

function sharedTile(url, { signal, fetchImpl, decodePng, requestTimeoutMs, useCache }) {
  checkAbort(signal)
  if (useCache && successfulTiles.has(url)) {
    const entry = successfulTiles.get(url)
    successfulTiles.delete(url); successfulTiles.set(url, entry)
    return Promise.resolve({ ...entry, cached: true })
  }
  const key = `${functionId(fetchImpl)}:${functionId(decodePng)}:${requestTimeoutMs}:${url}`
  let task = inFlightTiles.get(key)
  if (!task) {
    const controller = new AbortController()
    task = { controller, users: 0, settled: false, promise: null }
    // Queue time is bounded by each caller's deadline. The per-tile timer begins
    // after a global network slot is acquired, not while waiting in that queue.
    task.promise = networkSlot(async () => {
      const timer = setTimeout(() => controller.abort(new Error('標高タイルの取得時間を超えました。')), requestTimeoutMs)
      try {
        checkAbort(controller.signal)
        const response = await abortable(fetchImpl(url, { signal: controller.signal, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' }), controller.signal)
        if (!response.ok) throw new Error(`標高タイル HTTP ${response.status}`)
        const blob = await abortable(response.blob(), controller.signal)
        if (blob.size > 2 * 1024 * 1024) throw new Error('標高タイルが大きすぎます。')
        const data = await abortable(decodePng(blob), controller.signal)
        if (!data || data.length !== 65536) throw new Error('標高タイルのデータ数が不正です。')
        checkAbort(controller.signal)
        const entry = { data, fetchedAt: new Date().toISOString() }
        if (useCache) {
          successfulTiles.delete(url); successfulTiles.set(url, entry)
          while (successfulTiles.size > MAX_CACHE_TILES) successfulTiles.delete(successfulTiles.keys().next().value)
        }
        return { ...entry, cached: false }
      } finally { clearTimeout(timer) }
    }, controller.signal).finally(() => {
      task.settled = true
      // Never remove a newer retry for the same URL.
      if (inFlightTiles.get(key) === task) inFlightTiles.delete(key)
    })
    // A cancelled last subscriber may leave no consumer awaiting the task.
    task.promise.catch(() => {})
    inFlightTiles.set(key, task)
  }
  return new Promise((resolve, reject) => {
    task.users++
    let finished = false
    const finish = (fn, value) => {
      if (finished) return
      finished = true; signal.removeEventListener('abort', onAbort); task.users--
      fn(value)
      if (!task.users && !task.settled) {
        if (inFlightTiles.get(key) === task) inFlightTiles.delete(key)
        task.controller.abort(abortError())
      }
    }
    const onAbort = () => finish(reject, signal.reason || abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    task.promise.then(value => finish(resolve, value), error => finish(reject, error))
    if (signal.aborted) onAbort()
  })
}

export async function fetchPointElevationPng(lat, lon, options = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 20 || lat > 50 || lon < 120 || lon > 155) throw new Error('標高を取得する日本の座標が不正です。')
  const { signal, fetchImpl = globalThis.fetch, decodePng = decodeBrowserDemPng } = options
  const requestTimeoutMs = Math.min(8000, Math.max(10, options.requestTimeoutMs || 8000))
  const timeoutMs = Math.min(30000, Math.max(20, options.timeoutMs || 30000))
  const useCache = options.useCache !== false && fetchImpl === globalThis.fetch && decodePng === decodeBrowserDemPng
  checkAbort(signal)
  const controller = new AbortController(), cancel = () => controller.abort(signal.reason || abortError())
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('PNG標高の取得時間を超えました。')), timeoutMs)
  try {
    for (const layer of TERRAIN_DEM_LAYERS) {
      checkAbort(controller.signal)
      const [x, y] = terrainTilePoint(lon, lat, layer.zoom), x0 = Math.floor(x), y0 = Math.floor(y)
      const needed = new Map()
      for (const [px, py] of [[x0, y0], [x0 + 1, y0], [x0, y0 + 1], [x0 + 1, y0 + 1]]) {
        const tx = Math.floor(px / 256), ty = Math.floor(py / 256), key = `${tx}/${ty}`
        needed.set(key, `https://cyberjapandata.gsi.go.jp/xyz/${layer.id}/${layer.zoom}/${tx}/${ty}.png`)
      }
      const tiles = new Map(), retrieved = []
      let cached = false
      await Promise.all([...needed].map(async ([key, url]) => {
        try {
          const entry = await sharedTile(url, { signal: controller.signal, fetchImpl, decodePng, requestTimeoutMs, useCache })
          tiles.set(key, entry.data); retrieved.push(entry.fetchedAt); cached ||= entry.cached
        } catch (error) { if (controller.signal.aborted) throw controller.signal.reason || error; tiles.set(key, null) }
      }))
      const value = bilinearTerrainValue(x, y, (px, py) => {
        const tx = Math.floor(px / 256), ty = Math.floor(py / 256)
        return tiles.get(`${tx}/${ty}`)?.[(py - ty * 256) * 256 + px - tx * 256]
      })
      if (typeof value === 'number' && Number.isFinite(value) && value >= -500 && value <= 10000) return { value, dataSource: `${layer.label} PNG・双線形補間`, sourceLayer: layer.id, fetchedAt: retrieved.sort()[0], cached }
    }
    throw new Error('公式PNG標高タイルに有効な値がありません。')
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
}

export async function decodeBrowserDemPng(blob) {
  let bitmap, objectUrl
  try {
    if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
    else {
      bitmap = await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('標高PNGを読み込めませんでした。'))
        objectUrl = URL.createObjectURL(blob)
        image.src = objectUrl
      })
    }
    if (bitmap.width !== 256 || bitmap.height !== 256) throw new Error('標高PNGの寸法が不正です。')
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 })
    const context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })
    if (!context) throw new Error('この環境では標高PNGを解析できません。')
    context.drawImage(bitmap, 0, 0)
    return decodeDemRgba(context.getImageData(0, 0, 256, 256).data)
  } finally {
    bitmap?.close?.()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

async function boundedPool(items, worker, signal) {
  let index = 0
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (index < items.length) {
      checkAbort(signal)
      const item = items[index++]
      await worker(item)
    }
  }))
}

// Inputs include only an already-selected geographic geometry. Neither an
// uploaded image nor a cadastral document is sent to GSI. Area and point queries
// share a global four-request pool; cancellation releases only that consumer.
export async function analyzeTerrainArea(geometry, options = {}) {
  const { signal, onProgress = () => {}, fetchImpl = globalThis.fetch, decodePng = decodeBrowserDemPng } = options
  const requestTimeoutMs = Math.min(8000, Math.max(10, options.requestTimeoutMs || 8000))
  const timeoutMs = Math.min(30000, Math.max(20, options.timeoutMs || 30000))
  const useCache = options.useCache !== false && fetchImpl === globalThis.fetch && decodePng === decodeBrowserDemPng
  const startedAt = Date.now()
  checkAbort(signal)
  const controller = new AbortController()
  const forwardAbort = () => controller.abort(signal.reason || abortError())
  signal?.addEventListener('abort', forwardAbort, { once: true })
  const deadline = setTimeout(() => controller.abort(new Error('地形の取得が30秒を超えました。範囲を小さくするか、通信状態を確認して再試行してください。')), timeoutMs)
  const runSignal = controller.signal
  try {
    const plan = createTerrainPlan(geometry)
    checkAbort(runSignal)
    const size = plan.grid.width * plan.grid.height
    const positions = Array.from({ length: size }, (_, i) => plan.positionAt(i))
    const elevations = Array(size).fill(null), sourceIds = Array(size).fill(null), urls = []
    const retrievalTimes = []
    let usedCachedTile = false
    let completedTiles = 0
    for (const layer of TERRAIN_DEM_LAYERS) {
      checkAbort(runSignal)
      const needed = new Map(), samplePixels = new Map()
      for (let i = 0; i < size; i++) if (elevations[i] === null) {
        const [lon, lat] = positions[i], [x, y] = terrainTilePoint(lon, lat, layer.zoom)
        samplePixels.set(i, [x, y])
        const x0 = Math.floor(x), y0 = Math.floor(y)
        for (const [px, py] of [[x0, y0], [x0 + 1, y0], [x0, y0 + 1], [x0 + 1, y0 + 1]]) {
          const tx = Math.floor(px / 256), ty = Math.floor(py / 256), key = `${tx}/${ty}`
          if (!needed.has(key)) needed.set(key, { x: tx, y: ty, key, url: `https://cyberjapandata.gsi.go.jp/xyz/${layer.id}/${layer.zoom}/${tx}/${ty}.png` })
        }
      }
      if (!needed.size) break
      if (urls.length + needed.size > TERRAIN_AREA_LIMITS.maxTiles) throw new Error('面地形：標高タイル数が上限64枚を超えます。範囲を小さくしてください。')
      urls.push(...[...needed.values()].map(tile => tile.url))
      const tiles = new Map()
      onProgress({ phase: 'fetching', completedTiles, totalTiles: urls.length, layer: layer.id, message: `${layer.label}を取得中` })
      await boundedPool([...needed.values()], async tile => {
        checkAbort(runSignal)
        try {
          const entry = await sharedTile(tile.url, { signal: runSignal, fetchImpl, decodePng, requestTimeoutMs, useCache })
          tiles.set(tile.key, entry.data); retrievalTimes.push(entry.fetchedAt); usedCachedTile ||= entry.cached
        } catch (error) {
          if (runSignal.aborted) throw runSignal.reason || error
          tiles.set(tile.key, null)
        }
        completedTiles++
        onProgress({ phase: 'fetching', completedTiles, totalTiles: urls.length, layer: layer.id, message: `${layer.label}を確認中` })
      }, runSignal)
      for (const [i, [x, y]] of samplePixels) {
        const v = bilinearTerrainValue(x, y, (px, py) => {
          const tx = Math.floor(px / 256), ty = Math.floor(py / 256)
          return tiles.get(`${tx}/${ty}`)?.[(py - ty * 256) * 256 + px - tx * 256]
        })
        if (typeof v === 'number' && Number.isFinite(v) && v >= -500 && v <= 10000) { elevations[i] = v; sourceIds[i] = layer.id }
      }
      // Release each layer's temporary tiles before considering fallback pixels.
    }
    checkAbort(runSignal)
    onProgress({ phase: 'calculating', completedTiles, totalTiles: urls.length, layer: '', message: '同じ範囲の等高線・勾配を計算中' })
    // Yield once before pure CPU work, so cancellation after fetching can win.
    await new Promise(resolve => setTimeout(resolve, 0))
    checkAbort(runSignal)
    const result = normalizeTerrainArea({ version: 1, geometryKey: plan.geometryKey, geometry: plan.geometry, fetchedAt: retrievalTimes.sort()[0] || new Date().toISOString(), source: { urls, cached: usedCachedTile }, grid: { ...plan.grid, elevations, sourceIds } })
    checkAbort(runSignal)
    if (Date.now() - startedAt > timeoutMs) throw new Error('地形の処理時間を超えました。範囲を小さくしてください。')
    return result
  } finally {
    clearTimeout(deadline); signal?.removeEventListener('abort', forwardAbort)
  }
}
