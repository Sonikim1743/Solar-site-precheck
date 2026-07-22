import { useEffect, useMemo, useRef, useState } from 'react'
import MapPanel from './components/MapPanel.jsx'
import ReportPreview from './components/ReportPreview.jsx'
import HorizonGraphPreview from './components/HorizonGraphPreview.jsx'
import TerrainSectionPreview from './components/TerrainSectionPreview.jsx'
import SolarProPreviewButton from './components/SolarProPreviewButton.jsx'
import DiagnosticPanel from './components/DiagnosticPanel.jsx'
import PdfToolsPage, { clearPendingImagePlacement } from './components/PdfToolsPage.jsx'
import {
  DETAILED_HORIZON_DIRECTIONS,
  HORIZON_DIRECTIONS,
  analyzeTerrainCrossSection,
  analyzeSurroundingTerrain,
  fetchElevation,
  recalculateTerrainObstruction,
  reverseGeocode,
  searchAddress,
} from './services/gsi.js'
import {
  adjacentThirdMeshes,
  findNearestMonsolaStation,
  isConfirmedSnowStation,
  productionFactor,
  thirdMeshBoundaryDistance,
  thirdMeshCode,
} from './services/nedo.js'
import { parseCoordinateInput, toDegreeMinutes } from './utils/coordinates.js'
import { escapeCsv } from './utils/csv.js'
import { buildObstructionElevationsCsv } from './utils/obstructionElevations.js'
import { solarAltitudeReference } from './utils/solarWindow.js'
import { snowRateLevel } from './utils/snowRates.js'
import { APP_VERSION, BUILD_DATE, detectRuntimeEnvironment, pdfLimitMb } from './utils/buildInfo.js'
import {
  featureCenter,
  parcelInfo,
  readCadastreFile,
  searchParcels,
} from './services/cadastre.js'

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const initialElevation = { status: 'idle', value: null, source: '', message: '' }
const initialSnow = { status: 'idle', station: null, message: '' }
const initialPlaceInfo = { status: 'idle', data: null, message: '', positionKey: '' }
const initialPlaceApiStatus = {
  status: 'idle',
  label: '待機',
  message: '住所APIは地点選択時に必要な分だけ確認します。',
  checkedAt: null,
  cooldownUntil: null,
}
const DRAFT_KEY = 'solar-site-precheck-draft-v1'
const PLACE_CACHE_KEY = 'solar-site-precheck-place-cache-v1'
const PLACE_CACHE_LIMIT = 300
const PLACE_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000
const PLACE_REQUEST_DELAY_MS = 650
const PLACE_API_COOLDOWN_MS = 5 * 60 * 1000
const PLACE_API_FAILURE_THRESHOLD = 2
const TERRAIN_ANALYSIS_VERSION = 2
const GROUNDY_URL = 'https://www.app.groundy.net/map'
const SOLAR_PRO_PORTAL_URL = 'https://laplaceid.energymntr.com/servicelist/solarpro/installer-related-info'
const initialDrawingTextTool = { text: '', size: 28, opacity: 1, annotations: {}, selected: null, editDrag: null }
const initialDrawingImageTool = { src: '', name: '', aspectRatio: null, opacity: 1, annotations: {}, drag: null, selected: null, editDrag: null }
const initialSolarProMemo = {
  reportName: '',
  annualYield: '',
  capacity: '',
  module: '',
  checkedAt: '',
}

function isDynamicChunkLoadError(error) {
  const message = String(error?.message || error || '')
  return /dynamically imported module|Importing a module script failed|Failed to fetch module script|ChunkLoadError|Loading chunk/i.test(message)
}

function dynamicChunkRefreshMessage() {
  return 'アプリ更新後の古い画面を参照しています。ページを再読み込みしてから、もう一度実行してください。'
}

function isSingleInheritanceLandTransfer(item) {
  return item?.ownershipMode === '単独' &&
    item?.propertyType === '土地' &&
    (item?.registrationCause || '').includes('相続')
}

function inheritanceRowText(item) {
  return [
    item.receiptNumber ? `第${item.receiptNumber}号` : '',
    item.receiptDate || '',
    item.propertyType || '土地',
    item.registryAddress || item.location || '',
    item.extraCount ? `外${item.extraCount}件` : '',
  ].join('\t')
}

function ArrayLengthHelp({ className = '' }) {
  return (
    <span className={`help-tooltip help-tooltip--below ${className}`.trim()} tabIndex="0" aria-label="JKM655N-66QL6-BDV-F1-JPの配列長さ参考値。4列 9.528m、6列 14.292m、8列 19.056m、10列 23.820m。">
      ?
      <span className="help-tooltip__body" role="tooltip">
        図面縮尺合わせ用メモ<br />
        モデル：JKM655N-66QL6-BDV-F1-JP<br />
        4列：9.528m / 6列：14.292m<br />
        8列：19.056m / 10列：23.820m
      </span>
    </span>
  )
}

function createRotatedPreviewUrl(src, rotation = 0) {
  const angle = ((Number(rotation) % 360) + 360) % 360
  if (!angle) return Promise.resolve(src)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const swapped = angle === 90 || angle === 270
      canvas.width = swapped ? image.naturalHeight || image.height : image.naturalWidth || image.width
      canvas.height = swapped ? image.naturalWidth || image.width : image.naturalHeight || image.height
      const context = canvas.getContext('2d')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      if (angle === 90) {
        context.translate(canvas.width, 0)
        context.rotate(Math.PI / 2)
      } else if (angle === 180) {
        context.translate(canvas.width, canvas.height)
        context.rotate(Math.PI)
      } else if (angle === 270) {
        context.translate(0, canvas.height)
        context.rotate(-Math.PI / 2)
      }
      context.drawImage(image, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.86))
    }
    image.onerror = () => reject(new Error('回転プレビューを作成できませんでした。'))
    image.src = src
  })
}

function loadDraft() {
  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_KEY)) || {}
  } catch {
    return {}
  }
}

function placePositionKey(point, digits = 6) {
  return `${Number(point.lat).toFixed(digits)},${Number(point.lon).toFixed(digits)}`
}

function readPlaceCache() {
  try {
    return JSON.parse(window.localStorage.getItem(PLACE_CACHE_KEY)) || {}
  } catch {
    return {}
  }
}

function writePlaceCache(cache) {
  try {
    const entries = Object.entries(cache)
      .filter(([, value]) => value?.createdAt && Date.now() - value.createdAt < PLACE_CACHE_MAX_AGE)
      .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0))
      .slice(0, PLACE_CACHE_LIMIT)
    window.localStorage.setItem(PLACE_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Address cache is only a convenience. The app can continue without it.
  }
}

function cachedPlaceInfo(point) {
  const cache = readPlaceCache()
  const key = placePositionKey(point, 5)
  const hit = cache[key]
  if (!hit?.data || !hit.createdAt) return null
  if (Date.now() - hit.createdAt > PLACE_CACHE_MAX_AGE) return null
  return hit
}

function rememberPlaceInfo(point, data) {
  const cache = readPlaceCache()
  cache[placePositionKey(point, 5)] = { data, createdAt: Date.now() }
  writePlaceCache(cache)
}

function emptyHorizonSamples(directions = HORIZON_DIRECTIONS) {
  return directions.map((item) => ({ ...item, angle: null }))
}

function normalizeBearing(bearing) {
  if (!Number.isFinite(bearing)) return null
  return ((Math.round(bearing) % 360) + 360) % 360
}

function compassDirection(bearing) {
  const normalized = normalizeBearing(bearing)
  if (normalized === null) return ''
  const labels = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西']
  return labels[Math.round(normalized / 22.5) % labels.length]
}

function horizonTimeBand(bearing) {
  const normalized = normalizeBearing(bearing)
  if (normalized === null) return ''
  if (normalized >= 75 && normalized < 135) return '午前側'
  if (normalized >= 135 && normalized <= 225) return '昼前後'
  if (normalized > 225 && normalized <= 285) return '午後側'
  return '北側・低影響時間帯'
}

function formatHorizonDirection(sample) {
  if (!sample || !Number.isFinite(sample.bearing)) return ''
  const direction = sample.direction || compassDirection(sample.bearing)
  return `${sample.bearing}° ${direction}`.trim()
}

function formatHorizonSummary(terrain) {
  if (!terrain || !Number.isFinite(terrain.maxAngle)) return '候補地点を選択してから地平線を分析'
  const highest = terrain.samples
    ?.filter((sample) => Number.isFinite(sample.angle))
    .reduce((max, sample) => (!max || sample.angle > max.angle ? sample : max), null)
  const direction = formatHorizonDirection(highest) || terrain.direction || '方向未特定'
  const timeBand = highest ? horizonTimeBand(highest.bearing) : ''
  return `分析済み：最大 ${terrain.maxAngle.toFixed(1)}°（${direction}${timeBand ? `・${timeBand}` : ''}）`
}

function analysisPositionKey(point) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return ''
  return `${Number(point.lat).toFixed(7)},${Number(point.lon).toFixed(7)}`
}

function terrainFromSamples(samples, source = '手動入力', point = null) {
  const valid = samples.filter((sample) => Number.isFinite(sample.angle))
  if (!valid.length) return null
  const highest = valid.reduce((max, sample) => sample.angle > max.angle ? sample : max)
  return {
    risk: highest.angle >= 5 ? '高' : highest.angle >= 2 ? '中' : '低',
    maxAngle: highest.angle,
    direction: formatHorizonDirection(highest),
    radius: source,
    samples,
    positionKey: analysisPositionKey(point),
    position: point ? { lat: point.lat, lon: point.lon } : null,
  }
}

function SnowRateCell({ rate, children }) {
  const level = snowRateLevel(rate)
  return (
    <td className={`snow-rate-cell snow-rate-cell--${level}`}>
      <span className="snow-rate-cell__value">{children ?? rate.toFixed(2)}</span>
      {level === 'alert' && <span className="snow-rate-cell__mark" title="積雪注意">❄ 注意</span>}
    </td>
  )
}

function Icon({ children }) {
  return <span className="button-icon" aria-hidden="true">{children}</span>
}

export default function App() {
  const [draftSeed] = useState(loadDraft)
  const [position, setPosition] = useState(draftSeed.position || null)
  const [elevation, setElevation] = useState(draftSeed.elevation || initialElevation)
  const [terrain, setTerrain] = useState(
    draftSeed.terrainAnalysisVersion === TERRAIN_ANALYSIS_VERSION ? (draftSeed.terrain || null) : null,
  )
  const [terrainSection, setTerrainSection] = useState(null)
  const [terrainSectionStatus, setTerrainSectionStatus] = useState('idle')
  const [terrainSectionOpen, setTerrainSectionOpen] = useState(false)
  const [terrainSectionRange, setTerrainSectionRange] = useState(100)
  const [obstructionHeight, setObstructionHeight] = useState(draftSeed.obstructionHeight ?? 20)
  const [detailedHorizon, setDetailedHorizon] = useState(
    draftSeed.detailedHorizon ?? (draftSeed.terrain?.samples?.length > HORIZON_DIRECTIONS.length),
  )
  const [terrainStatus, setTerrainStatus] = useState('idle')
  const [horizonPanelOpen, setHorizonPanelOpen] = useState(false)
  const [horizonExportMessage, setHorizonExportMessage] = useState('')
  const [address, setAddress] = useState('')
  const [addressResults, setAddressResults] = useState([])
  const [searchStatus, setSearchStatus] = useState('idle')
  const [currentLocation, setCurrentLocation] = useState(null)
  const [locationStatus, setLocationStatus] = useState({ status: 'idle', message: '' })
  const [placeInfo, setPlaceInfo] = useState(initialPlaceInfo)
  const [placeApiStatus, setPlaceApiStatus] = useState(initialPlaceApiStatus)
  const [parcelData, setParcelData] = useState(null)
  const [parcelQuery, setParcelQuery] = useState('')
  const [parcelStatus, setParcelStatus] = useState({ status: 'idle', message: '' })
  const [selectedParcel, setSelectedParcel] = useState(null)
  const [focusParcelId, setFocusParcelId] = useState(null)
  const [siteName, setSiteName] = useState('')
  const [siteNameTouched, setSiteNameTouched] = useState(false)
  const [snowData, setSnowData] = useState(isConfirmedSnowStation(draftSeed.snowStation)
    ? { status: 'success', station: draftSeed.snowStation, message: '前回の入力内容を復元しました。' }
    : initialSnow)
  const [adjacentMeshCompare, setAdjacentMeshCompare] = useState({ status: 'idle', stations: [], message: '' })
  const [snowBase, setSnowBase] = useState(draftSeed.snowBase ?? 0.95)
  const [pdfProgress, setPdfProgress] = useState('')
  const [memo, setMemo] = useState('')
  const [fieldMemo, setFieldMemo] = useState('')
  const [solarProMemo, setSolarProMemo] = useState(() => ({
    ...initialSolarProMemo,
    ...(draftSeed.solarProMemo || {}),
  }))
  const [drawingConvertStatus, setDrawingConvertStatus] = useState({ status: 'idle', message: '' })
  const [drawingJob, setDrawingJob] = useState(null)
  const [drawingSelectedPages, setDrawingSelectedPages] = useState([])
  const [activeDrawingPageNumber, setActiveDrawingPageNumber] = useState(null)
  const [pdfPreviewView, setPdfPreviewView] = useState({ zoom: 1, x: 0, y: 0, panMode: false, drag: null })
  const activePdfPreviewRef = useRef(null)
  const [activePdfPreviewSize, setActivePdfPreviewSize] = useState({ width: 0, height: 0 })
  const [drawingPageRotations, setDrawingPageRotations] = useState({})
  const [drawingRotatedPreviews, setDrawingRotatedPreviews] = useState({})
  const [drawingTextTool, setDrawingTextTool] = useState(initialDrawingTextTool)
  const [drawingImageTool, setDrawingImageTool] = useState(initialDrawingImageTool)
  const [drawingMergeFiles, setDrawingMergeFiles] = useState([])
  const [drawingMergePreview, setDrawingMergePreview] = useState(true)
  const [drawingPanelOpen, setDrawingPanelOpen] = useState(false)
  const [templateFileName, setTemplateFileName] = useState('')
  const [equipmentDownloadMessage, setEquipmentDownloadMessage] = useState('')
  const [inheritanceStatus, setInheritanceStatus] = useState({ status: 'idle', message: '' })
  const [inheritanceJob, setInheritanceJob] = useState(null)
  const [inheritanceSort, setInheritanceSort] = useState('receipt')
  const [inheritanceCopyStatus, setInheritanceCopyStatus] = useState('')
  const [activePage, setActivePage] = useState(() => {
    if (typeof window === 'undefined') return 'solar'
    if (window.location.hash === '#inheritance-check') return 'inheritance'
    if (window.location.hash === '#pdf-tools') return 'pdf'
    return 'solar'
  })
  const draftSaveTimer = useRef(null)
  const placeRequestTimer = useRef(null)
  const placeRequestSeq = useRef(0)
  const placeApiFailureCount = useRef(0)
  const placeApiCooldownUntil = useRef(0)

  useEffect(() => {
    window.clearTimeout(draftSaveTimer.current)
    draftSaveTimer.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
          position,
          elevation,
          terrain,
          terrainAnalysisVersion: TERRAIN_ANALYSIS_VERSION,
          obstructionHeight,
          detailedHorizon,
          snowStation: snowData.station,
          snowBase,
          solarProMemo,
        }))
      } catch {
        // Storage can be unavailable or full; the app should continue to work without draft persistence.
      }
    }, 200)

    return () => window.clearTimeout(draftSaveTimer.current)
  }, [position, elevation, terrain, obstructionHeight, detailedHorizon, snowData.station, snowBase, solarProMemo])

  useEffect(() => {
    if (position && placeInfo.status === 'idle') schedulePlaceInfo(position)
  }, [position, placeInfo.status])

  useEffect(() => () => window.clearTimeout(placeRequestTimer.current), [])

  useEffect(() => {
    if (siteNameTouched) return
    if (siteName.trim()) return
    if (!terrain || !['success', 'manual'].includes(terrainStatus)) return
    const station = isConfirmedSnowStation(snowData.station) ? snowData.station : null
    if (!station) return
    setSiteName(station.placeName || station.name || '')
  }, [siteName, siteNameTouched, terrain, terrainStatus, snowData.station])

  async function loadNearestSnow(nextPosition) {
    setSnowData({ status: 'loading', station: null, message: '' })
    try {
      const station = await findNearestMonsolaStation(nextPosition.lat, nextPosition.lon)
      setSnowData({
        status: 'success',
        station,
        message: `最寄り観測地点は参考情報です。候補地の積雪値・発電量係数には使用しません。候補地の3次メッシュ: ${thirdMeshCode(nextPosition.lat, nextPosition.lon)}`,
      })
    } catch {
      setSnowData({ status: 'error', station: null, message: 'MONSOLA-11データを読み込めませんでした。' })
    }
  }

  function schedulePlaceInfo(nextPosition) {
    const requestId = placeRequestSeq.current + 1
    placeRequestSeq.current = requestId
    window.clearTimeout(placeRequestTimer.current)

    const positionKey = placePositionKey(nextPosition)
    const cached = cachedPlaceInfo(nextPosition)
    if (cached) {
      setPlaceInfo({ status: 'success', data: cached.data, message: '', positionKey })
      setPlaceApiStatus({
        status: 'cached',
        label: 'キャッシュ',
        message: '同じ地点の住所情報を前回取得値から表示しています。',
        checkedAt: cached.createdAt,
        cooldownUntil: null,
      })
      return
    }

    const now = Date.now()
    if (placeApiCooldownUntil.current > now) {
      setPlaceInfo({
        status: 'error',
        data: null,
        message: '住所APIが一時的に不安定です。座標・3次メッシュで確認してください。',
        positionKey,
      })
      setPlaceApiStatus({
        status: 'cooldown',
        label: '一時停止',
        message: '住所APIの連続失敗を検知したため、短時間の再試行を控えています。',
        checkedAt: now,
        cooldownUntil: placeApiCooldownUntil.current,
      })
      return
    }

    setPlaceInfo({ status: 'loading', data: null, message: '周辺住所を確認中…', positionKey })
    setPlaceApiStatus({
      status: 'loading',
      label: '確認中',
      message: '地理院住所APIに問い合わせています。',
      checkedAt: null,
      cooldownUntil: null,
    })
    placeRequestTimer.current = window.setTimeout(() => {
      loadPlaceInfo(nextPosition, requestId)
    }, PLACE_REQUEST_DELAY_MS)
  }

  async function loadPlaceInfo(nextPosition, requestId) {
    const positionKey = placePositionKey(nextPosition)
    try {
      let data
      try {
        data = await reverseGeocode(nextPosition.lat, nextPosition.lon)
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 500))
        if (requestId !== placeRequestSeq.current) return
        data = await reverseGeocode(nextPosition.lat, nextPosition.lon)
      }
      if (requestId !== placeRequestSeq.current) return
      rememberPlaceInfo(nextPosition, data)
      placeApiFailureCount.current = 0
      placeApiCooldownUntil.current = 0
      setPlaceApiStatus({
        status: 'success',
        label: '正常',
        message: '住所APIから周辺住所を取得しました。',
        checkedAt: Date.now(),
        cooldownUntil: null,
      })
      setPlaceInfo((current) => current.positionKey === positionKey
        ? { status: 'success', data, message: '', positionKey }
        : current)
    } catch {
      if (requestId !== placeRequestSeq.current) return
      const failures = placeApiFailureCount.current + 1
      placeApiFailureCount.current = failures
      const cooldownUntil = failures >= PLACE_API_FAILURE_THRESHOLD ? Date.now() + PLACE_API_COOLDOWN_MS : null
      if (cooldownUntil) placeApiCooldownUntil.current = cooldownUntil
      setPlaceApiStatus({
        status: cooldownUntil ? 'cooldown' : 'error',
        label: cooldownUntil ? '一時停止' : '取得失敗',
        message: cooldownUntil
          ? '住所APIの応答が不安定です。しばらく座標・3次メッシュで代替します。'
          : '住所APIに接続できませんでした。次の地点選択時に再試行します。',
        checkedAt: Date.now(),
        cooldownUntil,
      })
      setPlaceInfo((current) => current.positionKey === positionKey
        ? { status: 'error', data: null, message: '住所は自動取得できませんでした。座標・3次メッシュで確認してください。', positionKey }
        : current)
    }
  }

  function resetCandidateInputs() {
    setSiteName('')
    setSiteNameTouched(false)
    setMemo('')
    setFieldMemo('')
    setSelectedParcel(null)
    setFocusParcelId(null)
    setParcelQuery('')
    setSnowBase(0.95)
    setAdjacentMeshCompare({ status: 'idle', stations: [], message: '' })
  }

  function scrollToPageTop() {
    if (typeof window === 'undefined') return
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetWorkTools() {
    setDrawingJob(null)
    setDrawingSelectedPages([])
    setActiveDrawingPageNumber(null)
    setPdfPreviewView({ zoom: 1, x: 0, y: 0, panMode: false, drag: null })
    setDrawingPageRotations({})
    setDrawingRotatedPreviews({})
    setDrawingTextTool(initialDrawingTextTool)
    setDrawingImageTool(initialDrawingImageTool)
    setDrawingMergeFiles([])
    setDrawingConvertStatus({ status: 'idle', message: 'PDF管理と地形解析の一時結果を初期化しました。' })
    setInheritanceJob(null)
    setInheritanceStatus({ status: 'idle', message: '' })
    setInheritanceCopyStatus('')
    setInheritanceSort('receipt')
    setTerrain(null)
    setTerrainStatus('idle')
    setHorizonPanelOpen(false)
    setHorizonExportMessage('')
    setTerrainSection(null)
    setTerrainSectionStatus('idle')
    setTerrainSectionOpen(false)
  }

  async function selectPosition(nextPosition, options = {}) {
    const { resetCandidate = true } = options
    if (resetCandidate) resetCandidateInputs()
    setPosition(nextPosition)
    setTerrain(null)
    setTerrainStatus('idle')
    setHorizonPanelOpen(false)
    setHorizonExportMessage('')
    setTerrainSection(null)
    setTerrainSectionStatus('idle')
    setTerrainSectionOpen(false)
    setElevation({ status: 'loading', value: null, source: '', message: '' })
    schedulePlaceInfo(nextPosition)
    loadNearestSnow(nextPosition)

    try {
      const result = await fetchElevation(nextPosition.lat, nextPosition.lon)
      setElevation({ status: 'success', value: result.value, source: result.dataSource, message: '' })
    } catch {
      setElevation({
        status: 'error', value: null, source: '',
        message: '標高を自動取得できませんでした。手動入力してください。',
      })
    }
  }

  async function handleAddressSearch(event) {
    event.preventDefault()
    const query = address.trim()
    if (!query) return

    const parsed = parseCoordinateInput(query)
    if (parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon) &&
      parsed.lat >= 20 && parsed.lat <= 50 && parsed.lon >= 120 && parsed.lon <= 155) {
      setSearchStatus('idle')
      setAddressResults([])
      selectPosition({ lat: parsed.lat, lon: parsed.lon })
      return
    }

    setSearchStatus('loading')
    setAddressResults([])
    try {
      const results = await searchAddress(query)
      setAddressResults(results)
      setSearchStatus(results.length ? 'success' : 'empty')
    } catch {
      setSearchStatus('error')
    }
  }

  function chooseAddress(result) {
    setAddress(result.title)
    setAddressResults([])
    setSearchStatus('idle')
    selectPosition({ lat: result.lat, lon: result.lon })
  }

  function handleUseCurrentLocation() {
    if (!window.isSecureContext) {
      setLocationStatus({
        status: 'error',
        message: '現在地取得は https または localhost 限定です。ngrok共有URLまたはこのPC上の127.0.0.1でお試しください。',
      })
      return
    }

    if (!navigator.geolocation) {
      setLocationStatus({ status: 'error', message: 'このブラウザでは現在地取得に対応していません。' })
      return
    }

    setLocationStatus({ status: 'loading', message: '位置情報の許可を確認しています…' })
    navigator.geolocation.getCurrentPosition(
      (result) => {
        const nextLocation = {
          lat: result.coords.latitude,
          lon: result.coords.longitude,
          accuracy: result.coords.accuracy,
        }
        setCurrentLocation(nextLocation)
        setLocationStatus({
          status: 'success',
          message: `現在地を候補地点に反映しました。推定精度 約${Math.round(result.coords.accuracy)}m`,
        })
        setSelectedParcel(null)
        setFocusParcelId(null)
        selectPosition({ lat: nextLocation.lat, lon: nextLocation.lon })
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? '位置情報の利用が許可されませんでした。ブラウザ設定を確認してください。'
          : error.code === error.TIMEOUT
            ? '現在地取得がタイムアウトしました。もう一度お試しください。'
            : '現在地を取得できませんでした。住所検索または地図クリックを使用してください。'
        setLocationStatus({ status: 'error', message })
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
  }

  async function handleCadastreFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setParcelStatus({ status: 'loading', message: '地番データを読み込んでいます…' })
    try {
      const data = await readCadastreFile(file, (message) => {
        setParcelStatus({ status: 'loading', message })
      }, { focus: position, radiusKm: 3 })
      setParcelData(data)
      setParcelQuery('')
      setSelectedParcel(null)
      setParcelStatus({
        status: 'success',
        message: `${data.summary.fileName}: ${data.summary.displayable.toLocaleString()}筆を表示` +
          (data.summary.focusRadiusKm ? ` / 候補地点から${data.summary.focusRadiusKm}km以内（全${data.summary.total.toLocaleString()}筆から抽出）` : '') +
          (data.summary.skipped ? ` / 座標範囲外 ${data.summary.skipped.toLocaleString()}筆を除外` : '') +
          (data.summary.conversionSkipped ? ` / 変換不可 ${data.summary.conversionSkipped.toLocaleString()}ファイル` : ''),
      })
    } catch (error) {
      setParcelData(null)
      setParcelStatus({ status: 'error', message: error.message })
    }
  }

  function chooseParcel(feature, centerOverride = null) {
    const info = parcelInfo(feature)
    const center = centerOverride || featureCenter(feature)
    setSelectedParcel(info)
    setFocusParcelId(info.id)
    if (center) selectPosition(center, { resetCandidate: false })
  }

  async function handleTerrainAnalysis() {
    if (!position || !Number.isFinite(elevation.value)) return
    if (terrain?.samples?.length && terrainStatus !== 'loading') {
      setHorizonPanelOpen((current) => !current)
      return
    }
    setTerrainStatus('loading')
    setHorizonPanelOpen(true)
    setHorizonExportMessage('')
    try {
      const directions = detailedHorizon ? DETAILED_HORIZON_DIRECTIONS : HORIZON_DIRECTIONS
      const result = await analyzeSurroundingTerrain(
        position.lat,
        position.lon,
        elevation.value,
        obstructionHeight,
        directions,
      )
      setTerrain({
        ...result,
        positionKey: analysisPositionKey(position),
        position: { lat: position.lat, lon: position.lon },
      })
      setTerrainStatus('success')
      setHorizonPanelOpen(true)
    } catch {
      setTerrainStatus('error')
      setHorizonPanelOpen(true)
    }
  }

  async function handleTerrainSectionAnalysis() {
    if (!position) return
    if (terrainSection && terrainSectionStatus === 'success') {
      setTerrainSectionOpen((current) => !current)
      return
    }
    setTerrainSectionStatus('loading')
    setTerrainSection(null)
    setTerrainSectionOpen(true)
    try {
      const result = await analyzeTerrainCrossSection(position.lat, position.lon, {
        rangeMeters: terrainSectionRange,
        intervalMeters: 10,
      })
      setTerrainSection(result)
      setTerrainSectionStatus('success')
      setTerrainSectionOpen(true)
    } catch {
      setTerrainSectionStatus('error')
      setTerrainSectionOpen(true)
    }
  }

  function updateHorizonAngle(bearing, rawValue) {
    const value = rawValue === '' ? null : Number(rawValue)
    const base = terrain?.samples || emptyHorizonSamples(detailedHorizon ? DETAILED_HORIZON_DIRECTIONS : HORIZON_DIRECTIONS)
    const samples = base.map((sample) => sample.bearing === bearing
      ? { ...sample, angle: Number.isFinite(value) ? value : null }
      : sample)
    setTerrain(terrainFromSamples(samples, '手動入力', position))
    setTerrainStatus('manual')
    setHorizonPanelOpen(true)
  }

  async function handleNedoPdf(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!position) {
      setSnowData({ status: 'error', station: null, message: '先に住所検索または地図クリックで候補地点を選択してください。' })
      return
    }
    setSnowData({ status: 'loading', station: null, message: '' })
    setPdfProgress('PDFを準備しています…')
    try {
      const { extractMonsolaPdf } = await import('./services/nedoPdf.js')
      const expectedMesh = thirdMeshCode(position.lat, position.lon)
      const station = await extractMonsolaPdf(file, setPdfProgress, {
        mesh: expectedMesh,
        elevation: elevation.value,
      })
      if (station.id !== expectedMesh) {
        throw new Error(`候補地点の3次メッシュは ${expectedMesh}、読み込んだPDFは ${station.id} です。候補地点と同じメッシュのPDFを選んでください。`)
      }
      setSnowData({
        status: 'success', station: { ...station, expectedMesh },
        message: `候補地点と同じ3次メッシュ（${expectedMesh}）を確認しました。表位置の自動検出、3方式OCR、年・季節値で交差検証済みです。${station.verification?.correctedColumns?.length ? ` 単純OCRの誤読候補を${station.verification.correctedColumns.length}列補正しました。` : ''}${Number.isFinite(station.elevation) ? '' : ' PDF標高は確定できなかったため国土地理院値を維持します。'}`,
      })
      if (Number.isFinite(station.elevation)) {
        setElevation({ status: 'success', value: station.elevation, source: 'NEDO MONSOLA-11 PDF', message: '' })
      }
    } catch (error) {
      setSnowData({
        status: 'error',
        station: null,
        message: isDynamicChunkLoadError(error) ? dynamicChunkRefreshMessage() : error.message,
      })
    } finally {
      setPdfProgress('')
    }
  }

  async function handleNedoWeb() {
    if (!position) {
      setSnowData({ status: 'error', station: null, message: '先に住所検索または地図クリックで候補地点を選択してください。' })
      return
    }
    const expectedMesh = thirdMeshCode(position.lat, position.lon)
    setSnowData({ status: 'loading', station: null, message: '' })
    setPdfProgress(`NEDO Webから3次メッシュ ${expectedMesh} を取得しています…`)
    try {
      const { fetchMonsolaWeb } = await import('./services/nedoWeb.js')
      const station = await fetchMonsolaWeb(expectedMesh)
      setSnowData({
        status: 'success',
        station: { ...station, expectedMesh },
        message: `NEDO Webから候補地点と同じ3次メッシュ（${expectedMesh}）を取得しました。HTML表の積雪出現率を年・季節値で検証済みです。`,
      })
      if (Number.isFinite(station.elevation)) {
        setElevation({ status: 'success', value: station.elevation, source: 'NEDO MONSOLA-11 Web', message: '' })
      }
    } catch (error) {
      const message = isDynamicChunkLoadError(error)
        ? dynamicChunkRefreshMessage()
        : `${error.message} RUN_APP.cmdで起動している場合はローカル中継で取得できます。`
      setSnowData({
        status: 'error',
        station: null,
        message,
      })
    } finally {
      setPdfProgress('')
    }
  }

  async function handleAdjacentMeshCompare() {
    if (!adjacentMeshes.length) return
    setAdjacentMeshCompare({ status: 'loading', stations: [], message: '隣接3次メッシュのNEDO値を取得しています…' })
    try {
      const { fetchMonsolaWeb } = await import('./services/nedoWeb.js')
      const results = await Promise.allSettled(adjacentMeshes.map(async (item) => {
        const station = await fetchMonsolaWeb(item.mesh)
        return { ...item, station }
      }))
      const stations = results.map((result, index) => result.status === 'fulfilled'
        ? result.value
        : { ...adjacentMeshes[index], error: result.reason?.message || '取得失敗' })
      const successCount = stations.filter((item) => item.station).length
      setAdjacentMeshCompare({
        status: successCount ? 'success' : 'error',
        stations,
        message: successCount
          ? `隣接メッシュ ${successCount}/${adjacentMeshes.length} 件を取得しました。採用値ではなく境界確認用の参考値です。`
          : '隣接メッシュを取得できませんでした。NEDOページのリンクから手動確認してください。',
      })
    } catch (error) {
      setAdjacentMeshCompare({
        status: 'error',
        stations: [],
        message: isDynamicChunkLoadError(error) ? dynamicChunkRefreshMessage() : error.message || '隣接メッシュ比較に失敗しました。',
      })
    }
  }

  async function handleDrawingPdfToJpg(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setDrawingPanelOpen(true)
    setDrawingConvertStatus({ status: 'loading', message: 'PDF図面を読み込んでいます…' })
    setDrawingJob(null)
    setDrawingSelectedPages([])
    setActiveDrawingPageNumber(null)
    setPdfPreviewView({ zoom: 1, x: 0, y: 0, panMode: false, drag: null })
    setDrawingPageRotations({})
    setDrawingRotatedPreviews({})
    setDrawingMergeFiles([])
    setDrawingImageTool(initialDrawingImageTool)
    try {
      const { preparePdfJpgPreview } = await import('./services/pdfToJpg.js')
      const job = await preparePdfJpgPreview(file, (message) => {
        setDrawingConvertStatus({ status: 'loading', message })
      })
      setDrawingJob(job)
      setDrawingSelectedPages(job.pages.map((page) => page.pageNumber))
      setActiveDrawingPageNumber(job.pages[0]?.pageNumber || null)
      setPdfPreviewView({ zoom: 1, x: 0, y: 0, panMode: false, drag: null })
      setDrawingPageRotations(Object.fromEntries(job.pages.map((page) => [page.pageNumber, 0])))
      setDrawingRotatedPreviews({})
      setDrawingTextTool(initialDrawingTextTool)
      setDrawingImageTool(initialDrawingImageTool)
      setDrawingConvertStatus({ status: 'success', message: `${job.pageCount}ページを読み込みました。保存するページを選択してください。` })
    } catch (error) {
      setDrawingConvertStatus({
        status: 'error',
        message: isDynamicChunkLoadError(error) ? dynamicChunkRefreshMessage() : error.message || 'PDFをJPGに変換できませんでした。',
      })
    }
  }

  async function handleMergePdfFiles(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length < 2) {
      setDrawingPanelOpen(true)
      setDrawingConvertStatus({ status: 'error', message: 'まとめるPDFを2つ以上選択してください。' })
      return
    }
    setDrawingPanelOpen(true)
    setDrawingMergeFiles(files)
    setDrawingTextTool(initialDrawingTextTool)
    setDrawingImageTool(initialDrawingImageTool)
    if (!drawingMergePreview) {
      setDrawingJob(null)
      setDrawingSelectedPages([])
      setActiveDrawingPageNumber(null)
      setPdfPreviewView({ zoom: 1, x: 0, y: 0, panMode: false, drag: null })
      setDrawingPageRotations({})
      setDrawingRotatedPreviews({})
      setDrawingConvertStatus({ status: 'success', message: `${files.length}ファイルを選択しました。「PDFまとめ保存」を押すと全ページを保存します。` })
      return
    }
    setDrawingConvertStatus({ status: 'loading', message: 'PDFまとめ用のプレビューを作成しています…' })
    try {
      const { preparePdfJpgPreview } = await import('./services/pdfToJpg.js')
      const previewJobs = []
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex]
        const job = await preparePdfJpgPreview(file, (message) => {
          setDrawingConvertStatus({ status: 'loading', message: `${fileIndex + 1}/${files.length}ファイル目：${message}` })
        }, { previewScale: 0.55 })
        previewJobs.push(job)
      }
      let pageNumber = 0
      const pages = previewJobs.flatMap((job, fileIndex) => job.pages.map((page) => {
        pageNumber += 1
        return {
          ...page,
          pageNumber,
          sourcePageNumber: page.pageNumber,
          sourceFileIndex: fileIndex,
          sourceName: job.baseName,
          file: files[fileIndex],
        }
      }))
      const baseName = files.length === 2
        ? `${previewJobs[0].baseName}_${previewJobs[1].baseName}_まとめ`
        : `PDFまとめ_${files.length}件`
      setDrawingJob({ mode: 'multi', file: null, files, baseName, pageCount: pages.length, pages })
      setDrawingSelectedPages(pages.map((page) => page.pageNumber))
      setActiveDrawingPageNumber(pages[0]?.pageNumber || null)
      setPdfPreviewView({ zoom: 1, x: 0, y: 0, panMode: false, drag: null })
      setDrawingPageRotations(Object.fromEntries(pages.map((page) => [page.pageNumber, 0])))
      setDrawingRotatedPreviews({})
      setDrawingConvertStatus({ status: 'success', message: `${files.length}ファイル / ${pages.length}ページを読み込みました。必要なページだけ選んで保存できます。` })
    } catch (error) {
      setDrawingConvertStatus({
        status: 'error',
        message: isDynamicChunkLoadError(error) ? dynamicChunkRefreshMessage() : error.message || 'PDFまとめ用のプレビューを作成できませんでした。',
      })
    }
  }

  async function saveMergedDrawingPdfs() {
    if (drawingMergeFiles.length < 2) {
      setDrawingConvertStatus({ status: 'error', message: 'まとめるPDFを2つ以上選択してください。' })
      return
    }
    let fileHandle = null
    try {
      if (window.showSaveFilePicker) {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: `PDFまとめ_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.pdf`,
          types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
        })
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        setDrawingConvertStatus({ status: 'idle', message: 'PDFまとめをキャンセルしました。' })
        return
      }
      setDrawingConvertStatus({ status: 'error', message: error.message || '保存先の選択に失敗しました。' })
      return
    }

    setDrawingConvertStatus({ status: 'loading', message: 'PDFをまとめています…' })
    try {
      const { saveMergedPdfFilesAsPdf } = await import('./services/pdfToJpg.js')
      const result = await saveMergedPdfFilesAsPdf(drawingMergeFiles, (message) => {
        setDrawingConvertStatus({ status: 'loading', message })
      }, { fileHandle, fileNameBase: 'PDFまとめ' })
      setDrawingConvertStatus({ status: 'success', message: `${result.fileCount}ファイル / ${result.pageCount}ページを1つのPDFにまとめました。` })
      setDrawingMergeFiles([])
    } catch (error) {
      setDrawingConvertStatus({
        status: 'error',
        message: isDynamicChunkLoadError(error) ? dynamicChunkRefreshMessage() : error.message || 'PDFまとめに失敗しました。',
      })
    }
  }

  function handleTemplateFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    setTemplateFileName(file?.name || '')
  }

  function toggleDrawingPage(pageNumber) {
    setDrawingSelectedPages((current) => current.includes(pageNumber)
      ? current.filter((value) => value !== pageNumber)
      : [...current, pageNumber].sort((a, b) => a - b))
  }

  function rotateDrawingPage(pageNumber, delta) {
    setDrawingPageRotations((current) => {
      const next = ((current[pageNumber] || 0) + delta + 360) % 360
      return { ...current, [pageNumber]: next }
    })
    const hadTextAnnotations = Boolean(drawingTextTool.annotations[pageNumber]?.length)
    const hadImageAnnotations = Boolean(drawingImageTool.annotations[pageNumber]?.length)
    if (hadTextAnnotations) {
      setDrawingTextTool((current) => ({
        ...current,
        selected: current.selected?.pageNumber === pageNumber ? null : current.selected,
        editDrag: current.editDrag?.pageNumber === pageNumber ? null : current.editDrag,
        annotations: {
          ...current.annotations,
          [pageNumber]: [],
        },
      }))
    }
    if (hadImageAnnotations) {
      setDrawingImageTool((current) => ({
        ...current,
        selected: current.selected?.pageNumber === pageNumber ? null : current.selected,
        editDrag: current.editDrag?.pageNumber === pageNumber ? null : current.editDrag,
        annotations: {
          ...current.annotations,
          [pageNumber]: [],
        },
      }))
    }
    if (hadTextAnnotations || hadImageAnnotations) {
      setDrawingConvertStatus({
        status: 'idle',
        message: 'ページ向きを変更したため、このページの注記・貼り付け画像をクリアしました。向きを決めてから再配置してください。',
      })
    }
  }

  function textImageRectForPage(page, containerRect, rotation = 0, view = null) {
    const normalizedRotation = ((Number(rotation) % 360) + 360) % 360
    const swapped = normalizedRotation === 90 || normalizedRotation === 270
    const visualWidth = swapped ? page.height : page.width
    const visualHeight = swapped ? page.width : page.height
    const scale = Math.min(containerRect.width / visualWidth, containerRect.height / visualHeight)
    const zoom = view?.zoom || 1
    const baseWidth = visualWidth * scale
    const baseHeight = visualHeight * scale
    const width = baseWidth * zoom
    const height = baseHeight * zoom
    return {
      left: (containerRect.width - baseWidth) / 2 + (view?.x || 0) - ((width - baseWidth) / 2),
      top: (containerRect.height - baseHeight) / 2 + (view?.y || 0) - ((height - baseHeight) / 2),
      width,
      height,
    }
  }

  function activePreviewRectForPage(page) {
    if (!activePdfPreviewSize.width || !activePdfPreviewSize.height) return null
    const activePageNumber = activeDrawingPageNumber || drawingJob?.pages?.[0]?.pageNumber || page.pageNumber
    return textImageRectForPage(
      page,
      activePdfPreviewSize,
      drawingPageRotations[page.pageNumber] || 0,
      page.pageNumber === activePageNumber ? pdfPreviewView : null,
    )
  }

  function activePreviewPointStyle(page, point) {
    const rect = activePreviewRectForPage(page)
    if (!rect) {
      return {
        left: `${(point.x || 0) * 100}%`,
        top: `${(point.y || 0) * 100}%`,
      }
    }
    return {
      left: `${rect.left + (point.x || 0) * rect.width}px`,
      top: `${rect.top + (point.y || 0) * rect.height}px`,
    }
  }

  function activePreviewBoxStyle(page, box) {
    const rect = activePreviewRectForPage(page)
    if (!rect) {
      return {
        left: `${(box.x || 0) * 100}%`,
        top: `${(box.y || 0) * 100}%`,
        width: `${(box.width || 0) * 100}%`,
        height: `${(box.height || 0) * 100}%`,
      }
    }
    return {
      left: `${rect.left + (box.x || 0) * rect.width}px`,
      top: `${rect.top + (box.y || 0) * rect.height}px`,
      width: `${(box.width || 0) * rect.width}px`,
      height: `${(box.height || 0) * rect.height}px`,
    }
  }

  function activePreviewImageStyle(page) {
    const rect = activePreviewRectForPage(page)
    if (!rect) {
      return {
        left: '50%',
        top: '50%',
        width: 'auto',
        height: 'auto',
        maxWidth: '100%',
        maxHeight: '100%',
        transform: 'translate(-50%, -50%)',
      }
    }
    return {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transform: 'none',
    }
  }

  function previewUrlForPage(page) {
    const rotation = normalizedPageRotation(page.pageNumber)
    if (!rotation) return page.previewUrl
    return drawingRotatedPreviews[`${page.pageNumber}:${rotation}`] || page.previewUrl
  }

  function isRotatedPreviewReady(page) {
    const rotation = normalizedPageRotation(page.pageNumber)
    return !rotation || Boolean(drawingRotatedPreviews[`${page.pageNumber}:${rotation}`])
  }

  function warnRotatedPreviewPreparing() {
    setDrawingConvertStatus({
      status: 'idle',
      message: '回転後のプレビューを作成中です。表示が安定してから文字・画像を配置してください。',
    })
  }

  function pointFromClientInPage(page, clientX, clientY, container) {
    const rect = container.getBoundingClientRect()
    const rotation = drawingPageRotations[page.pageNumber] || 0
    const activePageNumber = activeDrawingPageNumber || drawingJob?.pages?.[0]?.pageNumber || page.pageNumber
    const view = page.pageNumber === activePageNumber ? pdfPreviewView : null
    const imageRect = textImageRectForPage(page, rect, rotation, view)
    const x = (clientX - rect.left - imageRect.left) / imageRect.width
    const y = (clientY - rect.top - imageRect.top) / imageRect.height
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    }
  }

  function setDrawingTextPosition(page, event) {
    event.preventDefault()
    event.stopPropagation()
    const pageNumber = page.pageNumber
    if (!isRotatedPreviewReady(page)) {
      warnRotatedPreviewPreparing()
      return
    }
    if (!drawingTextTool.text.trim()) {
      setDrawingConvertStatus({ status: 'idle', message: '先に挿入するテキストを入力してください。' })
      return
    }
    const point = pointFromClientInPage(page, event.clientX, event.clientY, event.currentTarget)
    const annotation = {
      id: `${Date.now()}-${Math.round(Math.random() * 100000)}`,
      text: drawingTextTool.text.trim(),
      x: point.x,
      y: point.y,
      size: drawingTextTool.size,
      opacity: Number.isFinite(drawingTextTool.opacity) ? Math.max(0.1, Math.min(1, drawingTextTool.opacity)) : 1,
    }
    setDrawingTextTool((current) => ({
      ...current,
      selected: { pageNumber, id: annotation.id },
      editDrag: null,
      annotations: {
        ...current.annotations,
        [pageNumber]: [annotation],
      },
    }))
    setDrawingImageTool((current) => ({ ...current, selected: null, editDrag: null }))
    setDrawingConvertStatus({ status: 'success', message: `${pageNumber}ページに「${annotation.text.slice(0, 12)}」を追加しました。PDF保存時に反映されます。` })
  }

  function startDrawingTextMove(page, annotation, event) {
    event.preventDefault()
    event.stopPropagation()
    const point = pagePointFromEvent(page, event)
    setDrawingTextTool((current) => ({
      ...current,
      selected: { pageNumber: page.pageNumber, id: annotation.id },
      editDrag: {
        pageNumber: page.pageNumber,
        id: annotation.id,
        offsetX: point.x - annotation.x,
        offsetY: point.y - annotation.y,
      },
    }))
    setDrawingImageTool((current) => ({ ...current, selected: null, editDrag: null }))
  }

  function pagePointFromEvent(page, event) {
    const container = event.currentTarget.closest?.('.pdf-active-page__preview') || event.currentTarget
    return pointFromClientInPage(page, event.clientX, event.clientY, container)
  }

  function normalizedPageRotation(pageNumber) {
    const value = Number(drawingPageRotations[pageNumber] || 0) % 360
    return ((value + 360) % 360)
  }

  function visualPageAspect(page) {
    const rotation = normalizedPageRotation(page.pageNumber)
    const width = Number(page.width) || 1
    const height = Number(page.height) || 1
    return rotation === 90 || rotation === 270 ? height / width : width / height
  }

  function fitNormalizedBoxToAspect(page, box, imageAspectRatio) {
    const aspectRatio = Number.isFinite(imageAspectRatio) && imageAspectRatio > 0 ? imageAspectRatio : 1
    const pageAspect = visualPageAspect(page)
    let width = Math.max(0.02, Math.min(1, box.width))
    let height = width * pageAspect / aspectRatio
    if (height > box.height) {
      height = Math.max(0.02, Math.min(1, box.height))
      width = height * aspectRatio / pageAspect
    }
    width = Math.max(0.02, Math.min(1, width))
    height = Math.max(0.02, Math.min(1, height))
    return {
      x: Math.max(0, Math.min(1 - width, box.x + (box.width - width) / 2)),
      y: Math.max(0, Math.min(1 - height, box.y + (box.height - height) / 2)),
      width,
      height,
    }
  }

  function readImageAspectRatio(src) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        const width = image.naturalWidth || image.width
        const height = image.naturalHeight || image.height
        resolve(width && height ? width / height : 1)
      }
      image.onerror = () => reject(new Error('画像サイズを確認できませんでした。'))
      image.src = src
    })
  }

  async function loadClipboardImageForPdf() {
    if (!navigator.clipboard?.read) {
      setDrawingConvertStatus({ status: 'error', message: 'このブラウザではクリップボード画像の読込に対応していません。' })
      return
    }
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((value) => value.startsWith('image/'))
        if (!type) continue
        const blob = await item.getType(type)
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(new Error('画像を読み込めませんでした。'))
          reader.readAsDataURL(blob)
        })
        const aspectRatio = await readImageAspectRatio(dataUrl)
        setDrawingImageTool((current) => ({ ...current, src: dataUrl, name: 'クリップボード画像', aspectRatio }))
        setDrawingConvertStatus({ status: 'success', message: 'クリップボード画像を読み込みました。PDFプレビュー上で貼り付け範囲をドラッグしてください。' })
        return
      }
      setDrawingConvertStatus({ status: 'error', message: 'クリップボード内に画像が見つかりませんでした。' })
    } catch (error) {
      setDrawingConvertStatus({ status: 'error', message: error?.name === 'NotAllowedError' ? 'ブラウザでクリップボード読込が許可されませんでした。' : error.message || 'クリップボード画像を読み込めませんでした。' })
    }
  }

  function beginDrawingImageArea(page, event) {
    if (pdfPreviewView.panMode) {
      event.preventDefault()
      event.stopPropagation()
      setPdfPreviewView((current) => ({
        ...current,
        drag: {
          startClientX: event.clientX,
          startClientY: event.clientY,
          startX: current.x,
          startY: current.y,
        },
      }))
      return
    }
    if (!drawingImageTool.src) return
    event.preventDefault()
    event.stopPropagation()
    if (!isRotatedPreviewReady(page)) {
      warnRotatedPreviewPreparing()
      return
    }
    const point = pagePointFromEvent(page, event)
    setDrawingImageTool((current) => ({
      ...current,
      drag: { pageNumber: page.pageNumber, startX: point.x, startY: point.y, currentX: point.x, currentY: point.y },
    }))
  }

  function updateDrawingImageArea(page, event) {
    if (pdfPreviewView.drag) {
      setPdfPreviewView((current) => current.drag
        ? {
            ...current,
            x: current.drag.startX + event.clientX - current.drag.startClientX,
            y: current.drag.startY + event.clientY - current.drag.startClientY,
          }
        : current)
      return
    }
    if (drawingTextTool.editDrag?.pageNumber === page.pageNumber) {
      const point = pagePointFromEvent(page, event)
      const edit = drawingTextTool.editDrag
      setDrawingTextTool((current) => ({
        ...current,
        annotations: {
          ...current.annotations,
          [page.pageNumber]: (current.annotations[page.pageNumber] || []).map((annotation) => annotation.id === edit.id
            ? {
                ...annotation,
                x: Math.max(0, Math.min(1, point.x - edit.offsetX)),
                y: Math.max(0, Math.min(1, point.y - edit.offsetY)),
              }
            : annotation),
        },
      }))
      return
    }
    if (drawingImageTool.editDrag?.pageNumber === page.pageNumber) {
      const point = pagePointFromEvent(page, event)
      const edit = drawingImageTool.editDrag
      setDrawingImageTool((current) => ({
        ...current,
        annotations: {
          ...current.annotations,
          [page.pageNumber]: (current.annotations[page.pageNumber] || []).map((annotation) => {
            if (annotation.id !== edit.id) return annotation
            if (edit.type === 'resize') {
              const pageAspect = visualPageAspect(page)
              const aspectRatio = edit.aspectRatio || annotation.aspectRatio || drawingImageTool.aspectRatio || 1
              const rawWidth = Math.max(0.03, point.x - annotation.x)
              const rawHeight = Math.max(0.03, point.y - annotation.y)
              const widthByHeight = rawHeight * aspectRatio / pageAspect
              let width = Math.max(rawWidth, widthByHeight)
              let height = width * pageAspect / aspectRatio
              if (annotation.x + width > 1) {
                width = Math.max(0.03, 1 - annotation.x)
                height = width * pageAspect / aspectRatio
              }
              if (annotation.y + height > 1) {
                height = Math.max(0.03, 1 - annotation.y)
                width = height * aspectRatio / pageAspect
              }
              return {
                ...annotation,
                width: Math.max(0.03, Math.min(1 - annotation.x, width)),
                height: Math.max(0.03, Math.min(1 - annotation.y, height)),
              }
            }
            const width = annotation.width || 0.1
            const height = annotation.height || 0.1
            return {
              ...annotation,
              x: Math.max(0, Math.min(1 - width, point.x - edit.offsetX)),
              y: Math.max(0, Math.min(1 - height, point.y - edit.offsetY)),
            }
          }),
        },
      }))
      return
    }
    if (!drawingImageTool.drag || drawingImageTool.drag.pageNumber !== page.pageNumber) return
    const point = pagePointFromEvent(page, event)
    setDrawingImageTool((current) => ({
      ...current,
      drag: current.drag ? { ...current.drag, currentX: point.x, currentY: point.y } : null,
    }))
  }

  function finishDrawingImageArea(page, event) {
    if (pdfPreviewView.drag) {
      event.preventDefault()
      event.stopPropagation()
      setPdfPreviewView((current) => ({ ...current, drag: null }))
      return
    }
    if (drawingTextTool.editDrag?.pageNumber === page.pageNumber) {
      event.preventDefault()
      event.stopPropagation()
      setDrawingTextTool((current) => ({ ...current, editDrag: null }))
      return
    }
    if (drawingImageTool.editDrag?.pageNumber === page.pageNumber) {
      event.preventDefault()
      event.stopPropagation()
      setDrawingImageTool((current) => ({ ...current, editDrag: null }))
      return
    }
    if (!drawingImageTool.drag || drawingImageTool.drag.pageNumber !== page.pageNumber) return
    event.preventDefault()
    event.stopPropagation()
    const point = pagePointFromEvent(page, event)
    const drag = { ...drawingImageTool.drag, currentX: point.x, currentY: point.y }
    const x = Math.min(drag.startX, drag.currentX)
    const y = Math.min(drag.startY, drag.currentY)
    const width = Math.abs(drag.currentX - drag.startX)
    const height = Math.abs(drag.currentY - drag.startY)
    if (width < 0.02 || height < 0.02) {
      setDrawingImageTool((current) => ({ ...current, drag: null }))
      setDrawingConvertStatus({ status: 'idle', message: '貼り付け範囲が小さすぎます。画像を入れる範囲をドラッグしてください。' })
      return
    }
    const fitted = fitNormalizedBoxToAspect(page, { x, y, width, height }, drawingImageTool.aspectRatio || 1)
    const annotation = {
      id: `${Date.now()}-${Math.round(Math.random() * 100000)}`,
      src: drawingImageTool.src,
      x: fitted.x,
      y: fitted.y,
      width: fitted.width,
      height: fitted.height,
      aspectRatio: drawingImageTool.aspectRatio || null,
      rotation: 0,
      opacity: Number.isFinite(drawingImageTool.opacity) ? Math.max(0.1, Math.min(1, drawingImageTool.opacity)) : 1,
    }
    setDrawingImageTool((current) => ({
      ...current,
      drag: null,
      selected: { pageNumber: page.pageNumber, id: annotation.id },
      annotations: {
        ...current.annotations,
        [page.pageNumber]: [...(current.annotations[page.pageNumber] || []), annotation],
      },
    }))
    setDrawingTextTool((current) => ({ ...current, selected: null, editDrag: null }))
    setDrawingConvertStatus({ status: 'success', message: `${page.pageNumber}ページに画像を配置しました。PDF保存時に反映されます。` })
  }

  function startDrawingImageMove(page, annotation, event) {
    event.preventDefault()
    event.stopPropagation()
    const point = pagePointFromEvent(page, event)
    setDrawingImageTool((current) => ({
      ...current,
      selected: { pageNumber: page.pageNumber, id: annotation.id },
      editDrag: {
        type: 'move',
        pageNumber: page.pageNumber,
        id: annotation.id,
        offsetX: point.x - annotation.x,
        offsetY: point.y - annotation.y,
      },
    }))
    setDrawingTextTool((current) => ({ ...current, selected: null, editDrag: null }))
  }

  function startDrawingImageResize(page, annotation, event) {
    event.preventDefault()
    event.stopPropagation()
    if (!isRotatedPreviewReady(page)) {
      warnRotatedPreviewPreparing()
      return
    }
    setDrawingImageTool((current) => ({
      ...current,
      selected: { pageNumber: page.pageNumber, id: annotation.id },
      editDrag: {
        type: 'resize',
        pageNumber: page.pageNumber,
        id: annotation.id,
        aspectRatio: annotation.aspectRatio || current.aspectRatio || 1,
      },
    }))
    setDrawingTextTool((current) => ({ ...current, selected: null, editDrag: null }))
  }

  function updateSelectedTextAnnotation(updater) {
    const selected = drawingTextTool.selected
    if (!selected) {
      setDrawingConvertStatus({ status: 'idle', message: '先に編集する文字を選択してください。' })
      return
    }
    setDrawingTextTool((current) => ({
      ...current,
      annotations: {
        ...current.annotations,
        [selected.pageNumber]: (current.annotations[selected.pageNumber] || [])
          .map((annotation) => annotation.id === selected.id ? updater(annotation) : annotation)
          .filter(Boolean),
      },
    }))
  }

  function scaleSelectedText(factor) {
    updateSelectedTextAnnotation((annotation) => {
      const nextSize = Math.round(Math.max(12, Math.min(96, (annotation.size || drawingTextTool.size || 28) * factor)))
      return { ...annotation, size: nextSize }
    })
  }

  function updateSelectedImageAnnotation(updater) {
    const selected = drawingImageTool.selected
    if (!selected) {
      setDrawingConvertStatus({ status: 'idle', message: '先に編集する画像を選択してください。' })
      return
    }
    setDrawingImageTool((current) => ({
      ...current,
      annotations: {
        ...current.annotations,
        [selected.pageNumber]: (current.annotations[selected.pageNumber] || [])
          .map((annotation) => annotation.id === selected.id ? updater(annotation) : annotation)
          .filter(Boolean),
      },
    }))
  }

  function rotateSelectedImage(delta) {
    updateSelectedImageAnnotation((annotation) => ({
      ...annotation,
      rotation: (((annotation.rotation || 0) + delta) % 360 + 360) % 360,
    }))
  }

  function scaleSelectedImage(factor) {
    updateSelectedImageAnnotation((annotation) => {
      const page = drawingJob?.pages?.find((item) => item.pageNumber === drawingImageTool.selected?.pageNumber)
      const aspectRatio = annotation.aspectRatio || drawingImageTool.aspectRatio
      let width = Math.max(0.03, Math.min(1, (annotation.width || 0.1) * factor))
      let height = Math.max(0.03, Math.min(1, (annotation.height || 0.1) * factor))
      if (page && Number.isFinite(aspectRatio) && aspectRatio > 0) {
        height = width * visualPageAspect(page) / aspectRatio
        if (height > 1) {
          height = 1
          width = height * aspectRatio / visualPageAspect(page)
        }
      }
      width = Math.max(0.03, Math.min(1, width))
      height = Math.max(0.03, Math.min(1, height))
      return {
        ...annotation,
        width,
        height,
        x: Math.max(0, Math.min(1 - width, annotation.x || 0)),
        y: Math.max(0, Math.min(1 - height, annotation.y || 0)),
      }
    })
  }

  function changeDrawingTextSize(size) {
    setDrawingTextTool((current) => {
      const selected = current.selected
      const next = { ...current, size }
      if (!selected) return next
      return {
        ...next,
        annotations: {
          ...current.annotations,
          [selected.pageNumber]: (current.annotations[selected.pageNumber] || []).map((annotation) => annotation.id === selected.id
            ? { ...annotation, size }
            : annotation),
        },
      }
    })
  }

  function changeSelectedTextOpacity(opacity) {
    const nextOpacity = Math.max(0.1, Math.min(1, Number(opacity) || 1))
    setDrawingTextTool((current) => {
      const selected = current.selected
      const next = { ...current, opacity: nextOpacity }
      if (!selected) return next
      return {
        ...next,
        annotations: {
          ...current.annotations,
          [selected.pageNumber]: (current.annotations[selected.pageNumber] || []).map((annotation) => annotation.id === selected.id
            ? { ...annotation, opacity: nextOpacity }
            : annotation),
        },
      }
    })
  }

  function changeSelectedImageOpacity(opacity) {
    const nextOpacity = Math.max(0.1, Math.min(1, Number(opacity) || 1))
    setDrawingImageTool((current) => {
      const selected = current.selected
      const next = { ...current, opacity: nextOpacity }
      if (!selected) return next
      return {
        ...next,
        annotations: {
          ...current.annotations,
          [selected.pageNumber]: (current.annotations[selected.pageNumber] || []).map((annotation) => annotation.id === selected.id
            ? { ...annotation, opacity: nextOpacity }
            : annotation),
        },
      }
    })
  }

  function deleteSelectedImage() {
    const selected = drawingImageTool.selected
    if (!selected) return
    setDrawingImageTool((current) => ({
      ...current,
      selected: null,
      editDrag: null,
      annotations: {
        ...current.annotations,
        [selected.pageNumber]: (current.annotations[selected.pageNumber] || []).filter((annotation) => annotation.id !== selected.id),
      },
    }))
  }

  function deleteSelectedText() {
    const selected = drawingTextTool.selected
    if (!selected) return
    setDrawingTextTool((current) => ({
      ...current,
      selected: null,
      editDrag: null,
      annotations: {
        ...current.annotations,
        [selected.pageNumber]: (current.annotations[selected.pageNumber] || []).filter((annotation) => annotation.id !== selected.id),
      },
    }))
  }

  async function handleImageFilesToPdf(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    setDrawingPanelOpen(true)
    setDrawingConvertStatus({ status: 'loading', message: '画像をPDFページとして読み込んでいます…' })
    setDrawingJob(null)
    setDrawingSelectedPages([])
    setActiveDrawingPageNumber(null)
    setPdfPreviewView({ zoom: 1, x: 0, y: 0, panMode: false, drag: null })
    setDrawingPageRotations({})
    setDrawingRotatedPreviews({})
    setDrawingMergeFiles([])
    setDrawingTextTool(initialDrawingTextTool)
    setDrawingImageTool(initialDrawingImageTool)
    try {
      const { prepareImageFilesPdfPreview } = await import('./services/pdfToJpg.js')
      const job = await prepareImageFilesPdfPreview(files, (message) => {
        setDrawingConvertStatus({ status: 'loading', message })
      })
      setDrawingJob(job)
      setDrawingSelectedPages(job.pages.map((page) => page.pageNumber))
      setActiveDrawingPageNumber(job.pages[0]?.pageNumber || null)
      setPdfPreviewView({ zoom: 1, x: 0, y: 0, panMode: false, drag: null })
      setDrawingPageRotations(Object.fromEntries(job.pages.map((page) => [page.pageNumber, 0])))
      setDrawingRotatedPreviews({})
      setDrawingConvertStatus({ status: 'success', message: `${job.pageCount}枚の画像を読み込みました。注記を配置してから、選択ページPDF保存で保存先を指定できます。` })
    } catch (error) {
      setDrawingConvertStatus({ status: 'error', message: isDynamicChunkLoadError(error) ? dynamicChunkRefreshMessage() : error.message || '画像を読み込めませんでした。' })
    }
  }

  function changePdfPreviewZoom(delta) {
    setPdfPreviewView((current) => ({
      ...current,
      zoom: Math.max(0.6, Math.min(4, Number((current.zoom + delta).toFixed(2)))),
    }))
  }

  function resetPdfPreviewView() {
    setPdfPreviewView({ zoom: 1, x: 0, y: 0, panMode: false, drag: null })
  }

  function sanitizeSuggestedFileName(name, fallback = 'output') {
    return String(name || fallback)
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim() || fallback
  }

  async function saveBlobWithPicker(blob, suggestedName, options = {}) {
    if (typeof window !== 'undefined' && window.showSaveFilePicker) {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName,
        types: options.types || [],
      })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
      return true
    }

    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = suggestedName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(link.href)
    return false
  }

  async function saveSelectedDrawingPages({ chooseLocation = false } = {}) {
    if (!drawingJob || !drawingSelectedPages.length) return
    let directoryHandle = null
    let fileHandle = null
    let fileNameBase = drawingJob.baseName
    if (chooseLocation) {
      try {
        if (drawingSelectedPages.length === 1 && window.showSaveFilePicker) {
          const pageNumber = drawingSelectedPages[0]
          const suffix = drawingJob.pageCount > 1 ? `_p${String(pageNumber).padStart(2, '0')}` : ''
          fileHandle = await window.showSaveFilePicker({
            suggestedName: `${drawingJob.baseName}${suffix}.jpg`,
            types: [{ description: 'JPG画像', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } }],
          })
          fileNameBase = drawingJob.baseName
        } else if (window.showDirectoryPicker) {
          directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
          const inputName = window.prompt('保存するJPGの基本ファイル名を入力してください。複数ページの場合は _p01 のようにページ番号を付けて保存します。', drawingJob.baseName)
          fileNameBase = sanitizeSuggestedFileName(inputName || drawingJob.baseName, drawingJob.baseName)
        } else {
          setDrawingConvertStatus({ status: 'error', message: 'このブラウザでは保存先選択に対応していません。通常保存を使用してください。' })
          return
        }
      } catch (error) {
        if (error?.name === 'AbortError') {
          setDrawingConvertStatus({ status: 'idle', message: '保存をキャンセルしました。' })
          return
        }
        setDrawingConvertStatus({ status: 'error', message: error.message || '保存先の選択に失敗しました。' })
        return
      }
    }
    setDrawingConvertStatus({ status: 'loading', message: '選択ページをJPGとして保存しています…' })
    try {
      const { savePdfPagesAsJpg, savePreparedImagePagesAsJpg } = await import('./services/pdfToJpg.js')
      const overlayOptions = {
        textOverlay: Object.values(drawingTextTool.annotations).some((items) => items?.length)
          ? {
              annotations: drawingTextTool.annotations,
            }
          : null,
        imageOverlay: Object.values(drawingImageTool.annotations).some((items) => items?.length)
          ? {
              annotations: drawingImageTool.annotations,
            }
          : null,
      }
      const count = drawingJob.mode === 'images'
        ? await savePreparedImagePagesAsJpg(
            drawingJob.pages.filter((page) => drawingSelectedPages.includes(page.pageNumber)),
            drawingPageRotations,
            (message) => {
              setDrawingConvertStatus({ status: 'loading', message })
            },
            { directoryHandle, fileHandle, fileNameBase, ...overlayOptions },
          )
        : await savePdfPagesAsJpg(drawingJob.file, drawingSelectedPages, drawingPageRotations, (message) => {
            setDrawingConvertStatus({ status: 'loading', message })
          }, { directoryHandle, fileHandle, fileNameBase, ...overlayOptions })
      setDrawingConvertStatus({ status: 'success', message: `${count}ページをJPGとして保存しました。${chooseLocation ? '保存先を指定しました。' : ''}` })
    } catch (error) {
      setDrawingConvertStatus({ status: 'error', message: error.message || 'JPG保存に失敗しました。' })
    }
  }

  async function saveSelectedDrawingPagesAsPdf({ chooseLocation = false } = {}) {
    if (!drawingJob || !drawingSelectedPages.length) return
    let fileHandle = null
    let fileNameBase = drawingJob.baseName
    if (chooseLocation) {
      try {
        if (window.showSaveFilePicker) {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: `${drawingJob.baseName}_selected.pdf`,
            types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
          })
          fileNameBase = drawingJob.baseName
        } else {
          setDrawingConvertStatus({ status: 'error', message: 'このブラウザでは保存先選択に対応していません。通常保存を使用してください。' })
          return
        }
      } catch (error) {
        if (error?.name === 'AbortError') {
          setDrawingConvertStatus({ status: 'idle', message: '保存をキャンセルしました。' })
          return
        }
        setDrawingConvertStatus({ status: 'error', message: error.message || '保存先の選択に失敗しました。' })
        return
      }
    }
    setDrawingConvertStatus({ status: 'loading', message: '選択ページを1つのPDFとして保存しています…' })
    try {
      const { savePdfPagesAsPdf, savePreparedPdfPagesAsPdf, savePreparedImagePagesAsPdf } = await import('./services/pdfToJpg.js')
      const overlayOptions = {
        textOverlay: Object.values(drawingTextTool.annotations).some((items) => items?.length)
          ? {
              annotations: drawingTextTool.annotations,
            }
          : null,
        imageOverlay: Object.values(drawingImageTool.annotations).some((items) => items?.length)
          ? {
              annotations: drawingImageTool.annotations,
            }
          : null,
      }
      const count = drawingJob.mode === 'images'
        ? await savePreparedImagePagesAsPdf(
            drawingJob.pages.filter((page) => drawingSelectedPages.includes(page.pageNumber)),
            drawingPageRotations,
            (message) => {
              setDrawingConvertStatus({ status: 'loading', message })
            },
            {
              fileHandle,
              fileNameBase,
              ...overlayOptions,
            },
          )
        : drawingJob.mode === 'multi'
          ? await savePreparedPdfPagesAsPdf(
              drawingJob.pages.filter((page) => drawingSelectedPages.includes(page.pageNumber)),
              drawingPageRotations,
              (message) => {
                setDrawingConvertStatus({ status: 'loading', message })
              },
              {
                fileHandle,
                fileNameBase,
                ...overlayOptions,
              },
            )
          : await savePdfPagesAsPdf(drawingJob.file, drawingSelectedPages, drawingPageRotations, (message) => {
              setDrawingConvertStatus({ status: 'loading', message })
            }, {
              fileHandle,
              fileNameBase,
              ...overlayOptions,
            })
      setDrawingConvertStatus({ status: 'success', message: `${count}ページを1つのPDFとして保存しました。${chooseLocation ? '保存先を指定しました。' : ''}` })
    } catch (error) {
      setDrawingConvertStatus({ status: 'error', message: error.message || 'PDF保存に失敗しました。' })
    }
  }

  async function handleInheritancePdf(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setInheritanceStatus({ status: 'loading', message: '相続資料PDFをブラウザ内で読み込んでいます…' })
    setInheritanceJob(null)
    try {
      const {
        readInheritancePdf,
        readInheritancePdfOnServer,
        shouldPreferServerPdfParsing,
      } = await import('./services/inheritancePdf.js')
      const onProgress = (message) => {
        setInheritanceStatus({ status: 'loading', message })
      }
      let job
      if (shouldPreferServerPdfParsing()) {
        try {
          job = await readInheritancePdfOnServer(file, onProgress)
        } catch (serverError) {
          console.warn('Server-side inheritance PDF parsing failed.', serverError)
          setInheritanceStatus({
            status: 'loading',
            message: `ローカルサーバー解析に失敗しました。ブラウザ内解析を試しています…（${serverError.message || '詳細不明'}）`,
          })
          try {
            job = await readInheritancePdf(file, onProgress)
          } catch (browserError) {
            throw new Error([
              '相続資料PDFを読み取れませんでした。',
              `サーバー解析: ${serverError.message || '失敗'}`,
              `ブラウザ解析: ${browserError.message || '失敗'}`,
            ].join(' '))
          }
        }
      } else {
        try {
          job = await readInheritancePdf(file, onProgress)
        } catch (error) {
          setInheritanceStatus({ status: 'loading', message: 'ブラウザ内解析に失敗したため、ローカルサーバー解析を試しています…' })
          job = await readInheritancePdfOnServer(file, onProgress).catch((serverError) => {
            console.warn('Server-side inheritance PDF parsing failed.', serverError)
            throw new Error([
              '相続資料PDFを読み取れませんでした。',
              `ブラウザ解析: ${error.message || '失敗'}`,
              `サーバー解析: ${serverError.message || '失敗'}`,
            ].join(' '))
          })
        }
      }
      setInheritanceJob(job)
      const singleTransferCount = job.results.filter(isSingleInheritanceLandTransfer).length
      const receiptSummary = job.receiptSummary
      const receiptCheck = receiptSummary?.expectedCount
        ? `受付番号 ${receiptSummary.firstNumber}〜${receiptSummary.lastNumber} / ${receiptSummary.readCount}件読取`
        : '受付番号範囲を確認できませんでした'
      setInheritanceStatus({
        status: 'success',
        message: `${job.pageCount}ページを確認しました。${receiptCheck}。単独 / 所有権移転・相続（土地） ${singleTransferCount}件を抽出しました。`,
      })
    } catch (error) {
      setInheritanceStatus({ status: 'error', message: error.message || '相続資料PDFを読み取れませんでした。' })
    }
  }

  function clearInheritanceJob() {
    setInheritanceJob(null)
    setInheritanceStatus({ status: 'idle', message: '' })
    setInheritanceCopyStatus('')
  }

  async function downloadInheritanceCsv() {
    if (!sortedInheritanceRows.length) return
    const rows = [
      ['受付番号', '受付日', '土地', '住所', '外記載'],
      ...sortedInheritanceRows.map((item) => [
        item.receiptNumber ? `第${item.receiptNumber}号` : '',
        item.receiptDate,
        item.propertyType || '土地',
        item.registryAddress || item.location,
        item.extraCount ? `外${item.extraCount}件` : '',
      ]),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const baseName = sanitizeSuggestedFileName(inheritanceJob.fileName.replace(/\.pdf$/i, '') || '相続資料', '相続資料')
    const suggestedName = `${baseName}_単独所有権移転相続リスト.csv`
    try {
      await saveBlobWithPicker(blob, suggestedName, {
        types: [{ description: 'CSVファイル', accept: { 'text/csv': ['.csv'] } }],
      })
      setInheritanceStatus((current) => ({ ...current, status: 'success', message: `${suggestedName} を保存しました。` }))
    } catch (error) {
      if (error?.name === 'AbortError') {
        setInheritanceStatus((current) => ({ ...current, message: 'CSV保存をキャンセルしました。' }))
        return
      }
      setInheritanceStatus((current) => ({ ...current, status: 'error', message: error.message || 'CSV保存に失敗しました。' }))
    }
  }

  async function copyInheritanceRow(item, index) {
    const text = inheritanceRowText(item)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(text)
      setInheritanceCopyStatus(`row-${index}`)
    } catch {
      setInheritanceCopyStatus('failed')
      window.prompt('コピーできない場合は、この内容を選択してコピーしてください。', text)
    }
    window.setTimeout(() => setInheritanceCopyStatus(''), 1600)
  }

  function updateSnowRate(index, rawValue) {
    const value = Number(rawValue)
    if (!snowData.station || !Number.isFinite(value) || value < 0 || value > 1) return
    const monthly = [...snowData.station.snow10cm.monthly]
    monthly[index] = value
    setSnowData((current) => ({
      ...current,
      station: {
        ...current.station,
        mode: 'manual-corrected',
        verified: true,
        validationVersion: 2,
        snow10cm: { ...current.station.snow10cm, monthly },
      },
    }))
  }

  const expectedSnowMesh = position ? thirdMeshCode(position.lat, position.lon) : ''
  const meshBoundary = useMemo(() => (
    position ? thirdMeshBoundaryDistance(position.lat, position.lon) : null
  ), [position])
  const adjacentMeshes = useMemo(() => (
    expectedSnowMesh ? adjacentThirdMeshes(expectedSnowMesh) : []
  ), [expectedSnowMesh])
  useEffect(() => {
    setAdjacentMeshCompare({ status: 'idle', stations: [], message: '' })
  }, [expectedSnowMesh])
  const nedoMonsolaUrl = expectedSnowMesh
    ? `https://domessolar.infop.nedo.go.jp/appww/cgi-bin/monsola.cgi?m=${expectedSnowMesh}`
    : ''
  const confirmedSnowStation = isConfirmedSnowStation(snowData.station) ? snowData.station : null
  const referenceSnowStation = snowData.station && !isConfirmedSnowStation(snowData.station) ? snowData.station : null
  const confirmedMeshPlaceName = confirmedSnowStation?.placeName || ''
  const selectedPlaceLabel = placeInfo.status === 'success' ? placeInfo.data.label : ''
  const solarReference = useMemo(() => solarAltitudeReference(position, terrain), [position, terrain])
  const inheritanceSingleTransferRows = useMemo(
    () => inheritanceJob?.results?.filter(isSingleInheritanceLandTransfer) || [],
    [inheritanceJob]
  )
  const sortedInheritanceRows = useMemo(() => {
    const rows = [...inheritanceSingleTransferRows]
    if (inheritanceSort === 'extra-desc') {
      rows.sort((a, b) => (b.extraCount || 0) - (a.extraCount || 0) || a.sequence - b.sequence)
    } else if (inheritanceSort === 'address') {
      rows.sort((a, b) => {
        const addressA = a.registryAddress || a.location || ''
        const addressB = b.registryAddress || b.location || ''
        return addressA.localeCompare(addressB, 'ja') || a.sequence - b.sequence
      })
    } else {
      rows.sort((a, b) => a.sequence - b.sequence)
    }
    return rows
  }, [inheritanceSingleTransferRows, inheritanceSort])

  const report = useMemo(() => ({
    position,
    elevation: elevation.value,
    elevationSource: elevation.source || (elevation.status === 'error' ? '手動確認が必要' : '—'),
    terrain,
    terrainSection,
    siteName,
    parcel: selectedParcel,
    snowStation: confirmedSnowStation,
    expectedSnowMesh,
    meshBoundary,
    snowBase,
    obstructionHeight,
    solarReference,
    placeLabel: selectedPlaceLabel,
    appVersion: APP_VERSION,
    buildDate: BUILD_DATE,
    memo,
    fieldMemo,
    solarProMemo,
  }), [position, elevation, terrain, terrainSection, siteName, selectedParcel, confirmedSnowStation, expectedSnowMesh, meshBoundary, snowBase, obstructionHeight, solarReference, selectedPlaceLabel, memo, fieldMemo, solarProMemo])

  function downloadCsv() {
    const rows = [
      ['項目', '値'],
      ['候補地名', siteName],
      ['地番', selectedParcel?.number || ''],
      ['地番所在地', [selectedParcel?.municipality, selectedParcel?.area].filter(Boolean).join(' ')],
      ['緯度（度分）', position ? toDegreeMinutes(position.lat, 'lat') : ''],
      ['経度（度分）', position ? toDegreeMinutes(position.lon, 'lon') : ''],
      ['緯度（10進）', position?.lat?.toFixed(6) || ''],
      ['経度（10進）', position?.lon?.toFixed(6) || ''],
      ['標高(m)', Number.isFinite(elevation.value) ? elevation.value.toFixed(1) : ''],
      ['標高データ', elevation.source],
      ['地平線の想定樹高(m)', obstructionHeight.toFixed(1)],
      ['冬至南中太陽高度', solarReference ? `${solarReference.winterSolsticeNoon.toFixed(1)}°` : ''],
      ['太陽高度比較', solarReference ? `${solarReference.label} / ${solarReference.message}` : ''],
      ['冬至9〜15時ピーク時間帯確認', solarReference?.peakWindow ? `${solarReference.peakWindow.label} / ${solarReference.peakWindow.message}` : ''],
      ...(terrain?.samples || HORIZON_DIRECTIONS).map(({ bearing, direction }) => [
        `地平線仰角 ${bearing}° ${direction}`,
        terrain?.samples?.find((sample) => sample.bearing === bearing)?.angle?.toFixed(1) || '',
      ]),
      ['候補地点の3次メッシュ', expectedSnowMesh],
      ['3次メッシュ境界距離(m)', meshBoundary ? Math.round(meshBoundary.minDistanceMeters) : ''],
      ['3次メッシュ境界確認', meshBoundary ? (meshBoundary.isNearBoundary ? '境界付近：隣接メッシュ確認推奨' : '境界から十分離れています') : ''],
      ['NEDO確定状態', confirmedSnowStation ? '候補地点と同一メッシュ確認済み' : '未確定（参考地点は採用しない）'],
      ['NEDO参照地点', confirmedSnowStation?.name || ''],
      ['NEDO緯度', confirmedSnowStation ? `${confirmedSnowStation.latDeg}度${confirmedSnowStation.latMin.toFixed(1)}分` : ''],
      ['NEDO経度', confirmedSnowStation ? `${confirmedSnowStation.lonDeg}度${confirmedSnowStation.lonMin.toFixed(1)}分` : ''],
      ...MONTHS.flatMap((month, index) => [
        [`${month} 積雪10cm以上出現率`, confirmedSnowStation?.snow10cm.monthly[index]?.toFixed(2) || ''],
        [`${month} 発電量係数`, confirmedSnowStation ? productionFactor(snowBase, confirmedSnowStation.snow10cm.monthly[index]).toFixed(2) : ''],
      ]),
      ['候補地メモ', memo],
      ['現地確認メモ', fieldMemo],
      ['Solar Proレポート名', solarProMemo.reportName],
      ['Solar Pro年間発電量', solarProMemo.annualYield],
      ['Solar Pro設備容量', solarProMemo.capacity],
      ['Solar Pro使用モジュール', solarProMemo.module],
      ['Solar Pro確認日', solarProMemo.checkedAt],
    ]
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${siteName || '候補地'}_チェック.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function downloadSolarProObstructionCsv() {
    setHorizonExportMessage('')
    if (!position) {
      setHorizonExportMessage('先に候補地点を選択してください。')
      return
    }
    if (!terrain?.samples?.length) {
      setHorizonExportMessage('先に地平線分析を完了してください。')
      return
    }
    const currentPositionKey = analysisPositionKey(position)
    if (terrain.positionKey && terrain.positionKey !== currentPositionKey) {
      setHorizonExportMessage('現在の候補地点と地平線分析結果が一致しません。地平線を再分析してからCSV出力してください。')
      return
    }
    const outputPosition = { lat: Number(position.lat), lon: Number(position.lon) }
    const csv = buildObstructionElevationsCsv({
      samples: terrain.samples,
      position: outputPosition,
      sessionName: siteName || selectedPlaceLabel || expectedSnowMesh || 'Solar Site Precheck DEM Horizon',
    })
    if (!csv) {
      setHorizonExportMessage('有効な地平線結果がないためCSVを作成できません。')
      return
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    if (typeof window !== 'undefined' && window.showSaveFilePicker) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: 'ObstructionElevations.csv',
          types: [{ description: 'Solar Pro地平線CSV', accept: { 'text/csv': ['.csv'] } }],
        })
        const writable = await fileHandle.createWritable()
        await writable.write(blob)
        await writable.close()
        return
      } catch (error) {
        if (error?.name === 'AbortError') return
      }
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'ObstructionElevations.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function saveEquipmentFile(filePath, suggestedName) {
    setEquipmentDownloadMessage('')
    try {
      const response = await fetch(filePath)
      if (!response.ok) throw new Error('file-not-found')
      const blob = await response.blob()

      if (typeof window !== 'undefined' && window.showSaveFilePicker) {
        try {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName,
            types: [{ description: 'Solar Pro太陽電池データ', accept: { 'application/octet-stream': ['.MD0W'] } }],
          })
          const writable = await fileHandle.createWritable()
          await writable.write(blob)
          await writable.close()
          setEquipmentDownloadMessage(`${suggestedName} を保存しました。`)
          return
        } catch (error) {
          if (error?.name === 'AbortError') return
        }
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = suggestedName
      link.click()
      URL.revokeObjectURL(url)
      setEquipmentDownloadMessage('このブラウザでは保存先を選べないため、通常のダウンロードとして保存しました。')
    } catch {
      setEquipmentDownloadMessage('モジュールデータを取得できませんでした。アプリを更新してから再度お試しください。')
    }
  }

  const horizonDirections = terrain?.samples?.length
    ? terrain.samples.map(({ direction, bearing }) => ({ direction, bearing }))
    : (detailedHorizon ? DETAILED_HORIZON_DIRECTIONS : HORIZON_DIRECTIONS)
  const horizonSamples = horizonDirections.map((item) =>
    terrain?.samples?.find((sample) => sample.bearing === item.bearing) || { ...item, angle: null },
  )
  const showHorizonResult = horizonPanelOpen && (Boolean(terrain) || terrainStatus === 'error' || terrainStatus === 'loading')
  const snowStation = snowData.station
  const snowIsConfirmed = isConfirmedSnowStation(snowStation)
  const canChooseSaveLocation = typeof window !== 'undefined' && ('showSaveFilePicker' in window || 'showDirectoryPicker' in window)
  const activeDrawingPage = useMemo(() => {
    if (!drawingJob?.pages?.length) return null
    return drawingJob.pages.find((page) => page.pageNumber === activeDrawingPageNumber) || drawingJob.pages[0]
  }, [drawingJob, activeDrawingPageNumber])
  const selectedImageOpacity = useMemo(() => {
    const selected = drawingImageTool.selected
    if (!selected) return Number.isFinite(drawingImageTool.opacity) ? drawingImageTool.opacity : 1
    const annotation = (drawingImageTool.annotations[selected.pageNumber] || []).find((item) => item.id === selected.id)
    return Number.isFinite(annotation?.opacity) ? annotation.opacity : 1
  }, [drawingImageTool])
  const selectedTextOpacity = useMemo(() => {
    const selected = drawingTextTool.selected
    if (!selected) return Number.isFinite(drawingTextTool.opacity) ? drawingTextTool.opacity : 1
    const annotation = (drawingTextTool.annotations[selected.pageNumber] || []).find((item) => item.id === selected.id)
    return Number.isFinite(annotation?.opacity) ? annotation.opacity : 1
  }, [drawingTextTool])

  useEffect(() => {
    const element = activePdfPreviewRef.current
    if (!element) return undefined
    const update = () => {
      const rect = element.getBoundingClientRect()
      setActivePdfPreviewSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [activeDrawingPage?.pageNumber, activePage])

  useEffect(() => {
    if (!drawingJob?.pages?.length) return undefined
    let cancelled = false
    drawingJob.pages.forEach((page) => {
      const rotation = ((Number(drawingPageRotations[page.pageNumber] || 0) % 360) + 360) % 360
      if (!rotation) return
      const key = `${page.pageNumber}:${rotation}`
      if (drawingRotatedPreviews[key]) return
      createRotatedPreviewUrl(page.previewUrl, rotation)
        .then((url) => {
          if (cancelled) return
          setDrawingRotatedPreviews((current) => current[key] ? current : { ...current, [key]: url })
        })
        .catch(() => {
          if (cancelled) return
          setDrawingConvertStatus((current) => current.status === 'loading'
            ? current
            : { status: 'idle', message: '回転プレビューを作成できませんでした。表示がずれる場合はページを再読み込みしてください。' })
        })
    })
    return () => {
      cancelled = true
    }
  }, [drawingJob, drawingPageRotations, drawingRotatedPreviews])

  const parcelResults = useMemo(
    () => searchParcels(parcelData, parcelQuery),
    [parcelData, parcelQuery],
  )

  function switchPage(nextPage) {
    setActivePage(nextPage)
    if (typeof window !== 'undefined') {
      const hash = nextPage === 'inheritance'
        ? '#inheritance-check'
        : nextPage === 'pdf'
          ? '#pdf-tools'
          : '#site-select'
      window.history.replaceState(null, '', hash)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <button type="button" className="brand-mark" onClick={scrollToPageTop} aria-label="ページの先頭へ戻る">
            <span aria-hidden="true">☀</span>
          </button>
          <div>
            <div className="brand-name">Solar Site <strong>Precheck</strong></div>
            <div className="brand-subtitle">太陽光候補地・入力準備ツール</div>
          </div>
        </div>
        <div className="topbar-actions">
          <nav className="page-switcher" aria-label="画面切替">
            <button
              type="button"
              className={activePage === 'solar' ? 'page-switcher__button page-switcher__button--active' : 'page-switcher__button'}
              onClick={() => switchPage('solar')}
            >
              太陽光チェック
            </button>
            <button
              type="button"
              className={activePage === 'inheritance' ? 'page-switcher__button page-switcher__button--active' : 'page-switcher__button'}
              onClick={() => switchPage('inheritance')}
            >
              登記チェック
            </button>
            <button
              type="button"
              className={activePage === 'pdf' ? 'page-switcher__button page-switcher__button--active' : 'page-switcher__button'}
              onClick={() => switchPage('pdf')}
            >
              PDFツール
            </button>
          </nav>
          <button type="button" className="reset-work-button" onClick={resetWorkTools}>
            初期化
          </button>
          <div className="status-pill"><span></span>作業補助ツール</div>
        </div>
      </header>

      <main>
        {activePage === 'solar' && (
          <>
        <section className="hero">
          <div className="hero-layout">
            <div>
              <p className="eyebrow">SITE SCREENING WORKSPACE</p>
              <h1>
                候補地の情報を、<br />
                <a className="hero-title-link" href={SOLAR_PRO_PORTAL_URL} target="_blank" rel="noreferrer">Solar Pro入力前</a>
                にひとまとめ。
              </h1>
              <p>航空写真から位置を選び、標高・地平線・NEDO積雪データを一次検討レポートに整理します。</p>
            </div>
            <div className="hero-service-links no-print" aria-label="外部サービスを開く">
              <a href={GROUNDY_URL} target="_blank" rel="noreferrer">
                <span className="hero-service-links__icon">地</span>
                <strong>Groundy</strong>
                <small>地図を開く</small>
              </a>
              <a href={SOLAR_PRO_PORTAL_URL} target="_blank" rel="noreferrer">
                <span className="hero-service-links__icon">SP</span>
                <strong>Solar Pro</strong>
                <small>管理・DL</small>
              </a>
              <a href="#solar-manual">
                <span className="hero-service-links__icon">📘</span>
                <strong>入力マニュアル</strong>
                <small>手順を見る</small>
              </a>
            </div>
          </div>
        </section>

        <section className={`utility-panel no-print ${drawingPanelOpen ? 'utility-panel--open' : 'utility-panel--collapsed'}`}>
          <div>
            <div className="utility-title-with-help">
              <strong>補助ツール：図面PDF→JPG</strong>
              <ArrayLengthHelp />
            </div>
            <span>図面PDFをプレビューし、必要なページだけJPG保存します。PDF編集は上部の「PDFツール」で行えます。</span>
          </div>
          <button type="button" className="utility-button" onClick={() => setDrawingPanelOpen((open) => !open)}>
            {drawingPanelOpen ? 'JPG変換を閉じる' : 'JPG変換を開く'}
          </button>
          {drawingPanelOpen && (
            <label className="utility-button utility-button--compact">
              PDF図面を選択
              <input type="file" accept="application/pdf,.pdf" onChange={handleDrawingPdfToJpg} />
            </label>
          )}
          {drawingPanelOpen && drawingConvertStatus.message && (
            <p className={`utility-message utility-message--${drawingConvertStatus.status}`}>
              {drawingConvertStatus.message}
            </p>
          )}
          {drawingPanelOpen && drawingJob && (
            <div className="drawing-converter">
              <div className="drawing-converter__toolbar">
                <strong>{drawingJob.baseName}</strong>
                <span>{drawingSelectedPages.length}/{drawingJob.pageCount}ページ選択中</span>
                <button type="button" onClick={() => setDrawingSelectedPages(drawingJob.pages.map((page) => page.pageNumber))}>選択</button>
                <button type="button" onClick={() => setDrawingSelectedPages([])}>選択解除</button>
                <button type="button" disabled={!drawingSelectedPages.length || drawingConvertStatus.status === 'loading'} onClick={() => saveSelectedDrawingPages({ chooseLocation: canChooseSaveLocation })}>
                  JPG保存
                </button>
              </div>
              <div className="drawing-page-grid">
                {drawingJob.pages.map((page) => (
                  <label className={`drawing-page-card ${drawingSelectedPages.includes(page.pageNumber) ? 'drawing-page-card--selected' : ''}`} key={page.pageNumber}>
                    <input type="checkbox" checked={drawingSelectedPages.includes(page.pageNumber)} onChange={() => toggleDrawingPage(page.pageNumber)} />
                    <span>{page.pageNumber}ページ / 回転 {drawingPageRotations[page.pageNumber] || 0}°</span>
                    <div className="drawing-page-card__preview">
                      <img
                        src={page.previewUrl}
                        alt={`${page.pageNumber}ページのプレビュー`}
                        style={{ transform: `rotate(${drawingPageRotations[page.pageNumber] || 0}deg)` }}
                      />
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="workflow">
          <section className="panel map-panel" id="site-select">
            <div className="section-heading">
              <div className="step-number">1</div>
              <div>
                <div className="heading-with-help">
                  <h2>候補地点を選択</h2>
                  <details className="workflow-help no-print">
                    <summary aria-label="候補地点選択のヒントと基本作業順を確認">?</summary>
                    <div className="workflow-help__body">
                      <strong>候補地点選択のヒント</strong>
                      <p className="workflow-help__lead">
                        GroundyやGoogleマップで現地情報・周辺道路・区画を確認してから住所や座標を入力すると、位置指定の精度が上がります。
                      </p>
                      <strong>基本作業順</strong>
                      <ol>
                        <li><b>地点を選択</b><span>住所・座標・地図クリックで候補地点を決める</span></li>
                        <li><b>地平線分析</b><span>DEMと想定樹高からCSV用の地平線値を作る</span></li>
                        <li><b>NEDO積雪取得</b><span>同一3次メッシュの積雪値だけを採用する</span></li>
                        <li><b>レポート確認</b><span>一次確認レポートとSolar Pro用CSVへ進む</span></li>
                      </ol>
                      <p className="workflow-help__note">※ 事業可否の最終判定ではなく、Solar Pro入力前の根拠整理です。</p>
                    </div>
                  </details>
                </div>
                <p>住所・地名・緯度経度をまとめて検索、または航空写真を直接クリック</p>
              </div>
            </div>

            <div className="site-search-row">
              <form className="address-search" onSubmit={handleAddressSearch}>
                <Icon>⌕</Icon>
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="住所・地名・緯度経度を入力（例：広島県庄原市東城町帝釈宇山 / 34.8617, 133.2433）"
                  aria-label="住所・地名・緯度経度"
                />
                <button type="submit" aria-label="候補地点を検索" disabled={searchStatus === 'loading'}>{searchStatus === 'loading' ? '検索中' : '検索'}</button>
                {addressResults.length > 0 && (
                  <ul className="search-results">
                    {addressResults.map((result) => (
                      <li key={`${result.lat}-${result.lon}`}>
                        <button type="button" onClick={() => chooseAddress(result)}><span>●</span>{result.title}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </form>

              <details className="cadastre-option site-extra-option">
              <summary>
                <span>
                  <strong>追加機能</strong>
                  <small>地番ファイル・筆界確認</small>
                </span>
              </summary>
              <div className="cadastre-option__body">
                <div className="cadastre-guide">
                  <div>
                    <strong>地番ファイルの使い方</strong>
                    <ol>
                      <li>上の住所検索または地図クリックで候補地点を選択</li>
                      <li>G空間情報センターで対象市区町村のGeoJSONをダウンロード</li>
                      <li>この画面へ戻り、ファイルを読み込んで地番検索または筆界をクリック</li>
                    </ol>
                    <small>50MBを超えるファイルは候補地点から3km以内だけを自動表示します。ダウンロード画面の利用条件も確認してください。</small>
                  </div>
                  <a
                    className="cadastre-source-link"
                    href="https://www.geospatial.jp/ckan/dataset?q=%E7%99%BB%E8%A8%98%E6%89%80%E5%82%99%E4%BB%98%E5%9C%B0%E5%9B%B3%E3%83%87%E3%83%BC%E3%82%BF"
                    target="_blank"
                    rel="noreferrer"
                  >G空間情報センターで探す ↗</a>
                </div>

                <div className="cadastre-toolbar">
                  <div className="cadastre-toolbar__title">
                    <span>地番ファイルを読み込む</span>
                    <small>法務省XML・ZIP、変換済みGeoJSONに対応</small>
                  </div>
                  <label className="secondary-button file-button cadastre-file-button">
                    XML・ZIP・GeoJSONを選択
                    <input type="file" accept=".xml,.zip,.geojson,.json,application/xml,application/zip,application/geo+json,application/json" onChange={handleCadastreFile} />
                  </label>
                  <div className="parcel-search">
                    <input
                      value={parcelQuery}
                      onChange={(event) => setParcelQuery(event.target.value)}
                      disabled={!parcelData}
                      placeholder={parcelData ? '地番・所在地を検索' : '先に地番ファイルを読み込む'}
                      aria-label="地番検索"
                    />
                    {parcelQuery && parcelData && (
                      <ul className="parcel-results">
                        {parcelResults.map(({ feature, info, center }) => (
                          <li key={info.id}>
                            <button type="button" onClick={() => {
                              chooseParcel(feature, center)
                              setParcelQuery('')
                            }}>
                              <strong>{info.number}</strong>
                              <span>{[info.municipality, info.area].filter(Boolean).join(' ') || '所在地情報なし'}</span>
                            </button>
                          </li>
                        ))}
                        {!parcelResults.length && <li className="parcel-results__empty">一致する地番がありません</li>}
                      </ul>
                    )}
                  </div>
                </div>
                {parcelStatus.message && <p className={`inline-message ${parcelStatus.status === 'error' ? 'inline-message--error' : ''}`}>{parcelStatus.message}</p>}
              </div>
              </details>
            </div>
            {searchStatus === 'empty' && <p className="inline-message">該当する候補がありません。座標の場合は「34.8617, 133.2433」の形式も使えます。</p>}
            {searchStatus === 'error' && <p className="inline-message inline-message--error">住所検索に接続できませんでした。座標入力または地図クリックを使用してください。</p>}

            <MapPanel
              position={position}
              onSelect={(nextPosition) => {
                setSelectedParcel(null)
                setFocusParcelId(null)
                selectPosition(nextPosition)
              }}
              onUseCurrentLocation={handleUseCurrentLocation}
              currentLocation={currentLocation}
              locationStatus={locationStatus}
              placeInfo={placeInfo}
              parcelData={parcelData}
              selectedParcelId={selectedParcel?.id || null}
              focusParcelId={focusParcelId}
              onParcelSelect={chooseParcel}
              terrainSection={terrainSection}
            />

            <div className="map-analysis-strip">
              <div className="selected-point-mini">
                <span>選択地点</span>
                <strong>{position ? `${toDegreeMinutes(position.lat, 'lat')} / ${toDegreeMinutes(position.lon, 'lon')}` : '地図で地点を選択'}</strong>
                <small>
                  {elevation.status === 'loading' && '標高 取得中…'}
                  {elevation.status === 'success' && `標高 ${elevation.value.toFixed(1)}m`}
                  {elevation.status === 'error' && '標高 未取得'}
                  {elevation.status === 'idle' && '標高 —'}
                  {selectedPlaceLabel ? ` / ${selectedPlaceLabel}` : ''}
                </small>
              </div>
              <div className="terrain-section-quick">
                <div>
                  <strong>
                    {terrainSectionStatus === 'success' && (terrainSectionOpen ? `周辺${terrainSectionRange}m断面を表示中` : `周辺${terrainSectionRange}m断面を取得済み`)}
                    {terrainSectionStatus === 'loading' && `周辺${terrainSectionRange}m断面を取得中…`}
                    {terrainSectionStatus === 'error' && '断面取得失敗'}
                    {terrainSectionStatus === 'idle' && `周辺${terrainSectionRange}mの地形断面`}
                  </strong>
                  <span>東西・南北へ各{terrainSectionRange}m、10m間隔で確認</span>
                </div>
                <label className="terrain-range-select" title="地図上の確認範囲と断面の取得距離を変更します。">
                  <span>範囲</span>
                  <select
                    value={terrainSectionRange}
                    disabled={terrainSectionStatus === 'loading'}
                    onChange={(event) => {
                      setTerrainSectionRange(Number(event.target.value))
                      setTerrainSection(null)
                      setTerrainSectionStatus('idle')
                      setTerrainSectionOpen(false)
                    }}
                  >
                    <option value={50}>50m</option>
                    <option value={100}>100m</option>
                    <option value={200}>200m</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="secondary-button terrain-section-button"
                  aria-label="地形断面を確認"
                  disabled={!position || terrainSectionStatus === 'loading'}
                  onClick={handleTerrainSectionAnalysis}
                >
                  {terrainSectionStatus === 'loading' ? '取得中…' : terrainSection ? (terrainSectionOpen ? '閉じる' : '開く') : '断面を確認'}
                </button>
              </div>
              {terrainSectionStatus === 'error' && (
                <p className="inline-message inline-message--error">周辺{terrainSectionRange}mの標高断面を取得できませんでした。時間をおいて再試行してください。</p>
              )}
              {terrainSectionOpen && <TerrainSectionPreview analysis={terrainSection} />}
            </div>
            {selectedParcel && (
              <div className="selected-parcel-card">
                <div>
                  <span>選択中の地番</span>
                  <strong>{selectedParcel.number}</strong>
                  <small>{[selectedParcel.municipality, selectedParcel.area, selectedParcel.mapType].filter(Boolean).join(' / ') || '属性情報なし'}</small>
                </div>
                <button type="button" onClick={() => {
                  setSelectedParcel(null)
                  setFocusParcelId(null)
                }}>選択解除</button>
              </div>
            )}
            {elevation.message && <p className="inline-message inline-message--error">{elevation.message}</p>}
          </section>

          <section className="panel details-panel" id="site-details">
            <div className="section-heading">
              <div className="step-number">2</div>
              <div><h2>候補地情報を確認</h2><p>自動取得値は原資料で補正できます</p></div>
            </div>

            <div className="form-stack">
              <label className="site-name-field">
                <span>候補地名</span>
                <input value={siteName} onChange={(e) => {
                  setSiteNameTouched(true)
                  setSiteName(e.target.value)
                }} placeholder="未入力（必要に応じて手入力）" />
                <small>
                  {position
                    ? `現在の選択地点: ${selectedPlaceLabel || (placeInfo.status === 'loading' ? '確認中…' : '座標で確認')}`
                    : '地点を選択すると周辺住所を表示します。'}
                </small>
              </label>
              <div className="site-mini-summary">
                <span>選択地点メモ</span>
                <strong>{expectedSnowMesh || '地点未選択'}</strong>
                <small>
                  {elevation.status === 'success' && `標高 ${elevation.value.toFixed(1)}m`}
                  {elevation.status === 'loading' && '標高 取得中…'}
                  {elevation.status === 'error' && '標高 未取得'}
                  {elevation.status === 'idle' && '標高 —'}
                </small>
              </div>
              <div className="field-block">
                <div className="field-label-row">
                  <span>地平線仰角</span>
                  <div className="field-label-actions">
                    <small>候補地点から250m〜5km・各方位10点を概算</small>
                  </div>
                </div>
                <div className="terrain-box">
                  <div>
                    <strong>{formatHorizonSummary(terrain)}</strong>
                    <span>{detailedHorizon ? '10°間隔・36方位を一括分析（詳細）' : '0° / 45° / 90° / 135° / 180° / 225° / 270° / 315°を一括分析'}</span>
                    <small className="terrain-box-note">
                      DEM解析結果を1°間隔に補間してSolar Pro用CSVに出力します。<br />
                      ※ SunEye実測値ではなく概算データです。
                    </small>
                  </div>
                  <div className="terrain-actions">
                    <button
                      type="button"
                      className="action-button action-button--terrain"
                      aria-label="地平線を分析"
                      disabled={!position || !Number.isFinite(elevation.value) || terrainStatus === 'loading'}
                      onClick={handleTerrainAnalysis}
                    >
                      <span>
                        {terrainStatus === 'loading'
                          ? '分析中…'
                          : terrain?.samples?.length
                            ? (horizonPanelOpen ? '地平線結果を閉じる' : '地平線結果を開く')
                            : (detailedHorizon ? '詳細地平線36方位を分析' : '地平線8方位を分析')}
                      </span>
                      <small>{terrain?.samples?.length ? '再クリックで結果を開閉' : (position ? '選択地点から周辺地形を取得' : '先に地図で地点を選択')}</small>
                    </button>
                    <label className="horizon-tool-button horizon-detail-toggle" title="10°間隔・36方位で地平線を分析します。通常より細かく確認したい場合に使用します。">
                      <input
                        type="checkbox"
                        checked={detailedHorizon}
                        onChange={(event) => {
                          setDetailedHorizon(event.target.checked)
                          setTerrain(null)
                          setTerrainStatus('idle')
                          setHorizonPanelOpen(false)
                          setHorizonExportMessage('')
                        }}
                      />
                      <span>詳細分析</span>
                    </label>
                    <button
                      type="button"
                      className="horizon-tool-button horizon-csv-button horizon-csv-button--solarpro"
                      aria-label="Solar Pro用地平線CSVを出力"
                      disabled={!position || !terrain?.samples?.length}
                      onClick={downloadSolarProObstructionCsv}
                    >
                      Solar Pro地平線CSV出力
                    </button>
                  </div>
                </div>
                {horizonExportMessage && <p className="inline-message">{horizonExportMessage}</p>}
                {showHorizonResult && (
                  <div className="horizon-result-panel">
                    <div className="solarpro-guide-row">
                      <span>Solar Proで入力する場所を確認</span>
                      <SolarProPreviewButton
                        label="地平線入力画面を見る"
                        image="/screenshots/solarpro-horizon.png"
                        caption="Solar Pro 地平線入力画面"
                        path="上部ツールバー：3DCAD → 地平線"
                      />
                    </div>
                    {solarReference && (
                      <div className={`solar-angle-warning solar-angle-warning--${solarReference.status}`}>
                        <strong>冬の太陽高さとの比較：{solarReference.label}</strong>
                        <span>{solarReference.message}</span>
                        {solarReference.peakWindow && (
                          <div className={`solar-peak-check solar-peak-check--${solarReference.peakWindow.status}`}>
                            <strong>発電ピーク時間帯（冬至9〜15時）：{solarReference.peakWindow.label}</strong>
                            <span>{solarReference.peakWindow.message}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <HorizonGraphPreview
                      position={position}
                      terrain={terrain}
                      solarReference={solarReference}
                    />
                    <label className="assumption-row">
                      <span>保守的に加算する想定樹高</span>
                      <span className="number-with-unit">
                        <input
                          type="number"
                          min="0"
                          max="50"
                          step="1"
                          value={obstructionHeight}
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            const nextHeight = Number.isFinite(value) ? value : 20
                            setObstructionHeight(nextHeight)
                            setTerrain((current) => recalculateTerrainObstruction(current, elevation.value, nextHeight))
                            if (terrainStatus === 'success') setTerrainStatus('success')
                          }}
                        />
                        <em>m</em>
                      </span>
                      <small>候補地周辺の各地形標高に一律加算します。標準値は20mです。</small>
                    </label>
                    <div className={`horizon-table ${horizonSamples.length > 12 ? 'horizon-table--detail' : ''}`}>
                      {horizonSamples.map((sample) => (
                        <label key={sample.bearing}>
                          <span>{sample.bearing}°<small title="地形のみの仰角です。入力欄は想定樹高を加えた保守側の角度です。">{sample.direction}{Number.isFinite(sample.terrainAngle) ? ` / 地形 ${sample.terrainAngle.toFixed(1)}°` : ''}</small></span>
                          <input type="number" min="0" step="0.1" value={Number.isFinite(sample.angle) ? sample.angle.toFixed(1) : ''} onChange={(event) => updateHorizonAngle(sample.bearing, event.target.value)} placeholder="—" />
                          <em>°</em>
                        </label>
                      ))}
                      {horizonSamples.length > 12 && (
                        <div className="horizon-help horizon-help--inline">
                          <div className="horizon-help__text">
                            <strong>表の読み方</strong>
                            <span>入力欄は地形標高に想定樹高を加えた保守側の地平線仰角です。「地形」は樹高を加える前の地形のみの角度なので、現地確認時の参考値として見てください。</span>
                          </div>
                          <div className="horizon-help__visual" aria-hidden="true">
                            <div className="horizon-mini-sky"></div>
                            <div className="horizon-mini-slope"></div>
                            <div className="horizon-mini-origin"><span>候補地</span></div>
                            <div className="horizon-mini-tree"></div>
                            <div className="horizon-mini-diff"><span>差分 = 樹高</span></div>
                            <div className="horizon-mini-angle"></div>
                            <div className="horizon-mini-line horizon-mini-line--terrain"><span>地形</span></div>
                            <div className="horizon-mini-line horizon-mini-line--safe"><span>樹高込み</span></div>
                          </div>
                        </div>
                      )}
                    </div>
                    {terrainStatus === 'error' && <p className="inline-message inline-message--error">周辺標高を取得できませんでした。各方位を手動入力できます。</p>}
                  </div>
                )}
              </div>

              <div className="field-block snow-block">
                <div className="field-label-row">
                  <span>NEDO 積雪10cm以上出現率</span>
                  <div className="field-label-actions">
                    <small>MONSOLA-11</small>
                  </div>
                </div>
                <div className={`snow-verification ${snowIsConfirmed ? 'snow-verification--confirmed' : ''}`}>
                  <div>
                    <span>候補地点の3次メッシュ</span>
                    <strong>{expectedSnowMesh || '候補地点を選択してください'}</strong>
                    {position && (
                      <dl className="mesh-place-pair">
                        <div>
                          <dt>選択地点住所</dt>
                          <dd>{selectedPlaceLabel || (placeInfo.status === 'loading' ? '確認中…' : '座標・3次メッシュで確認')}</dd>
                        </div>
                        <div>
                          <dt>NEDO地点名</dt>
                          <dd>{confirmedMeshPlaceName || '未取得'}</dd>
                        </div>
                      </dl>
                    )}
                  </div>
                  <div className="snow-verification__status">
                    <em>{snowIsConfirmed ? '同一メッシュ確認済み' : '積雪値 未確定'}</em>
                    {meshBoundary && (
                      meshBoundary.isNearBoundary && adjacentMeshes.length > 0 ? (
                        <details className="mesh-boundary-status mesh-boundary-status--watch snow-boundary-inline">
                          <summary>
                            <span className="mesh-boundary-status__lamp" aria-hidden="true" />
                            <strong>境界 {Math.round(meshBoundary.minDistanceMeters)}m</strong>
                          </summary>
                          <div className="adjacent-mesh-panel__body">
                            <div className="adjacent-mesh-actions">
                              <button
                                type="button"
                                className="secondary-button"
                                disabled={adjacentMeshCompare.status === 'loading'}
                                onClick={handleAdjacentMeshCompare}
                              >
                                {adjacentMeshCompare.status === 'loading' ? '比較取得中…' : '隣接メッシュを比較'}
                              </button>
                              <small>境界付近の参考確認です。採用値は同一3次メッシュ確認済みの値だけを使用します。</small>
                            </div>
                            <div className="adjacent-mesh-list">
                              {adjacentMeshes.map((item) => (
                                <a
                                  key={item.mesh}
                                  href={`https://domessolar.infop.nedo.go.jp/appww/cgi-bin/monsola.cgi?m=${item.mesh}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <span>{item.direction}</span>
                                  <strong>{item.mesh}</strong>
                                </a>
                              ))}
                            </div>
                            {adjacentMeshCompare.message && (
                              <p className={`inline-message ${adjacentMeshCompare.status === 'error' ? 'inline-message--error' : ''}`}>{adjacentMeshCompare.message}</p>
                            )}
                            {adjacentMeshCompare.stations.length > 0 && (
                              <>
                                <p className="adjacent-mesh-note">
                                  表示値は「積雪深10cm以上の出現率」です。例：0.55 は対象期間の約55%で10cm以上の積雪が出る目安です。
                                </p>
                                <div className="adjacent-mesh-results">
                                  {adjacentMeshCompare.stations.map((item) => {
                                    const monthly = item.station?.snow10cm?.monthly || []
                                    const maxRate = monthly.length ? Math.max(...monthly) : null
                                    return (
                                      <div key={item.mesh} className={item.error ? 'adjacent-mesh-result adjacent-mesh-result--error' : 'adjacent-mesh-result'}>
                                        <span>{item.direction}</span>
                                        <strong>{item.mesh}</strong>
                                        {item.station ? (
                                          <dl>
                                            <div><dt>年間平均</dt><dd>{item.station.snow10cm.annual.toFixed(2)}</dd></div>
                                            <div><dt>冬季平均</dt><dd>{item.station.snow10cm.winter.toFixed(2)}</dd></div>
                                            <div className={Number.isFinite(maxRate) && maxRate >= 0.5 ? 'is-alert' : ''}><dt>月最大</dt><dd>{Number.isFinite(maxRate) ? maxRate.toFixed(2) : '—'}</dd></div>
                                          </dl>
                                        ) : (
                                          <small>{item.error}</small>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        </details>
                      ) : (
                        <div className="mesh-boundary-status mesh-boundary-status--ok snow-boundary-inline">
                          <span className="mesh-boundary-status__lamp" aria-hidden="true" />
                          <strong>境界OK</strong>
                          <small>約{Math.round(meshBoundary.minDistanceMeters)}m</small>
                        </div>
                      )
                    )}
                  </div>
                  <small>NEDO Webから同じ3次メッシュ番号のMONSOLAページを取得した場合だけ係数を計算します。PDF読込は補助機能です。</small>
                </div>
                <div className="nedo-action-panel">
                  <button
                    type="button"
                    className="action-button action-button--nedo"
                    aria-label="NEDO積雪データを取得"
                    disabled={!position || snowData.status === 'loading'}
                    onClick={handleNedoWeb}
                  >
                    <span>{snowData.status === 'loading' ? '取得中…' : 'NEDO Webから積雪データを取得'}</span>
                    <small>{expectedSnowMesh ? `3次メッシュ ${expectedSnowMesh} を取得して適用` : '先に地図で地点を選択'}</small>
                  </button>
                  {nedoMonsolaUrl ? (
                    <a
                      className="mesh-link-button"
                      href={nedoMonsolaUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="NEDO 3次メッシュページを開く"
                    >
                      <span>3次メッシュのNEDOページを開く</span>
                      <small>{expectedSnowMesh}</small>
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="mesh-link-button mesh-link-button--disabled"
                      disabled
                      aria-label="候補地点未選択のためNEDOページは開けません"
                    >
                      <span>3次メッシュのNEDOページを開く</span>
                      <small>地点未選択</small>
                    </button>
                  )}
                </div>
                <details className="nedo-optional-tools">
                  <summary>PDF読込・参考地点確認（補助機能）</summary>
                  <div className="nedo-actions">
                    <label className="secondary-button file-button">
                      NEDO PDFを読み込む
                      <input type="file" accept="application/pdf" onChange={handleNedoPdf} />
                    </label>
                    <button type="button" className="secondary-button" disabled={!position || snowData.status === 'loading'} onClick={() => position && loadNearestSnow(position)}>近傍参考地点を表示</button>
                  </div>
                </details>
                {(pdfProgress || snowData.status === 'loading') && <p className="inline-message">{pdfProgress || 'MONSOLA-11データを検索中…'}</p>}
                {snowData.message && <p className={`inline-message ${snowData.status === 'error' ? 'inline-message--error' : ''}`}>{snowData.message}</p>}

                {referenceSnowStation && (
                  <div className="nedo-reference-card">
                    <strong>参考地点: {referenceSnowStation.name}</strong>
                    <span>候補地から約{referenceSnowStation.distanceKm.toFixed(1)}km / 標高 {referenceSnowStation.elevation}m</span>
                    <small>これは「近い地点の参考値」です。候補地点の3次メッシュと一致していないため、レポート・CSV・発電量係数へは反映しません。</small>
                    {referenceSnowStation.snow10cm?.monthly?.length > 0 && (
                      <div className="snow-table-wrap snow-table-wrap--reference">
                        <table className="snow-table snow-table--reference">
                          <thead><tr><th>月</th>{MONTHS.map((month) => <th key={month}>{month}</th>)}</tr></thead>
                          <tbody>
                            <tr><th>参考出現率</th>{referenceSnowStation.snow10cm.monthly.map((rate, index) => <SnowRateCell key={MONTHS[index]} rate={rate} />)}</tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {snowStation && snowIsConfirmed && (
                  <div className="snow-result-panel">
                    <div className="solarpro-guide-row">
                      <span>Solar Proで入力する場所を確認</span>
                      <SolarProPreviewButton
                        label="積雪補正入力画面を見る"
                        image="/screenshots/solarpro-snow.png"
                        caption="Solar Pro 傾斜面日射補正係数入力画面"
                        path="上部ツールバー：発電量予測 → 電力計算設定 → 各種係数の補正予算 → 設定 → 傾斜面日射補正係数を月別に → 設定"
                      />
                    </div>
                    <div className="nedo-card">
                      <div className="nedo-card__meta">
                        <strong className="nedo-station-title">
                          <span>{snowStation.name}</span>
                          {snowStation.placeName && <b>{snowStation.placeName}</b>}
                        </strong>
                        <span>{snowStation.mode === 'manual-corrected' ? 'NEDO値・手動補正あり' : snowStation.mode === 'nedo-web' ? 'NEDO 3次メッシュWeb値・整合性確認済み' : 'NEDO 3次メッシュPDF値・整合性確認済み'}</span>
                        <span className="nedo-location-line">
                          <span className="solarpro-location-values">北緯 {snowStation.latDeg}度 {snowStation.latMin.toFixed(1)}分 / 東経 {snowStation.lonDeg}度 {snowStation.lonMin.toFixed(1)}分 / 標高 {Number.isFinite(snowStation.elevation) ? `${snowStation.elevation}m` : 'PDF読取未確定'}</span>
                          <SolarProPreviewButton
                            label="設置場所入力画面"
                            image="/screenshots/solarpro-location.png"
                            caption="Solar Pro 設置場所入力画面"
                            path="上部ツールバー：3DCAD → 設置場所"
                            placement="side"
                            highlight="location"
                          />
                        </span>
                        {snowStation.verification && <span>{snowStation.verification.method} / 読取差異 {snowStation.verification.disagreementColumns.length}列 / 自動補正 {snowStation.verification.correctedColumns.length}列</span>}
                      </div>
                      <label className="base-factor">
                        <span>基準発電量係数</span>
                        <input type="number" step="0.01" value={snowBase} onChange={(event) => setSnowBase(Number(event.target.value))} />
                      </label>
                      <div className="snow-table-wrap">
                        <table className="snow-table">
                          <thead><tr><th>月</th>{MONTHS.map((month) => <th key={month}>{month}</th>)}</tr></thead>
                          <tbody>
                            <tr><th>出現率</th>{snowStation.snow10cm.monthly.map((rate, index) => (
                              <td key={MONTHS[index]} className={`snow-rate-cell snow-rate-cell--${snowRateLevel(rate)}`}>
                                <input aria-label={`${MONTHS[index]} 積雪出現率`} type="number" min="0" max="1" step="0.01" value={rate.toFixed(2)} onChange={(event) => updateSnowRate(index, event.target.value)} />
                                {snowRateLevel(rate) === 'alert' && <span className="snow-rate-cell__mark" title="積雪注意">❄ 注意</span>}
                              </td>
                            ))}</tr>
                            <tr><th>係数</th>{snowStation.snow10cm.monthly.map((rate, index) => <td key={MONTHS[index]}><strong>{productionFactor(snowBase, rate).toFixed(2)}</strong></td>)}</tr>
                          </tbody>
                        </table>
                      </div>
                      <p className="formula-note formula-note--with-legend">
                        <span className="formula-note__main">発電量係数 = {snowBase.toFixed(2)} − 積雪深10cm以上の出現率</span>
                        <span className="formula-note__legend"><span className="snow-legend__notice">0.01以上</span> は着色、<strong className="snow-legend__alert">0.50以上は ❄ 積雪注意</strong></span>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <label><span>候補地メモ</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="土地利用、接道、系統連系、周辺施設など" rows="3" /></label>
              <label><span>現地確認メモ</span><textarea value={fieldMemo} onChange={(e) => setFieldMemo(e.target.value)} placeholder="樹木・建物などの遮蔽物、傾斜、搬入路、写真番号など" rows="4" /></label>
            </div>
          </section>
        </div>

        <section className="report-section" id="report-section">
          <details className="report-disclosure">
            <summary className="report-disclosure__summary">
              <div className="section-heading"><div className="step-number">3</div><div><h2>候補地チェックレポート</h2><p>地形・地平線・積雪を1枚で確認する簡易分析レポート</p></div></div>
              <span className="report-disclosure__toggle">クリックして開く</span>
            </summary>
            <div className="report-disclosure__body">
            <div className="action-row no-print">
              <button type="button" className="secondary-button" onClick={downloadCsv}>チェックCSV出力</button>
              <button type="button" className="primary-button" onClick={() => window.print()}>PDF印刷</button>
            </div>
            <details className="solarpro-memo-panel no-print">
              <summary>
                <span>Solar Pro照合メモ</span>
                <small>発電量レポートと突き合わせる時だけ入力</small>
              </summary>
              <div className="solarpro-memo-grid">
                <label>
                  <span>Solar Proレポート名</span>
                  <input
                    value={solarProMemo.reportName}
                    onChange={(event) => setSolarProMemo((current) => ({ ...current, reportName: event.target.value }))}
                    placeholder="例：庄原市永末町①発電所"
                  />
                </label>
                <label>
                  <span>年間発電量</span>
                  <input
                    value={solarProMemo.annualYield}
                    onChange={(event) => setSolarProMemo((current) => ({ ...current, annualYield: event.target.value }))}
                    placeholder="例：1,234,567 kWh/年"
                  />
                </label>
                <label>
                  <span>設備容量</span>
                  <input
                    value={solarProMemo.capacity}
                    onChange={(event) => setSolarProMemo((current) => ({ ...current, capacity: event.target.value }))}
                    placeholder="例：999.9 kW"
                  />
                </label>
                <label>
                  <span>使用モジュール</span>
                  <input
                    value={solarProMemo.module}
                    onChange={(event) => setSolarProMemo((current) => ({ ...current, module: event.target.value }))}
                    placeholder="例：JKM655N-66QL6-BDV-F1-JP"
                  />
                </label>
                <label>
                  <span>確認日</span>
                  <input
                    value={solarProMemo.checkedAt}
                    onChange={(event) => setSolarProMemo((current) => ({ ...current, checkedAt: event.target.value }))}
                    placeholder="例：2026.07.21"
                  />
                </label>
              </div>
            </details>
            <ReportPreview report={report} />
            </div>
          </details>
        </section>

        <div className="support-sections">
          <section className="manual-section panel" id="solar-manual">
            <details className="manual-disclosure">
              <summary className="manual-disclosure__summary">
                <div className="section-heading">
                  <div className="step-number">M</div>
                  <div>
                    <h2>Solar Pro入力マニュアル</h2>
                    <p>候補地チェック結果、地平線CSV、積雪補正値を使ってSolar Proへ入力するための作業手順</p>
                  </div>
                </div>
                <span className="manual-disclosure__toggle">クリックして開く</span>
              </summary>

              <div className="manual-disclosure__body">
                <div className="manual-grid">
            <article className="manual-card manual-card--accent">
              <span>まず確認</span>
              <h3>このツールで準備する値</h3>
              <ol>
                <li>候補地点を地図・住所・座標で指定する。</li>
                <li>緯度・経度・標高・3次メッシュを確認する。</li>
                <li>地平線を分析し、Solar Pro用CSVとして出力する。</li>
                <li>NEDO Webから同一3次メッシュの積雪出現率を取得する。</li>
                <li>簡易レポートでCSV、積雪、断面の根拠を確認する。</li>
              </ol>
            </article>

            <article className="manual-card">
              <span>STEP 1</span>
              <h3>設置場所を入力</h3>
              <p>Solar Pro上部メニューの <strong>3DCAD → 設置場所</strong> を開き、MONSOLA-11を選択して緯度・経度・標高を入力します。</p>
              <ul>
                <li>緯度・経度はこのツールの度分表示を使用。</li>
                <li>標高はNEDO取得後の値を優先し、必要に応じて原典確認。</li>
                <li>3次メッシュ番号とNEDO地点名も念のため確認。</li>
              </ul>
            </article>

            <article className="manual-card">
              <span>STEP 2</span>
              <h3>地平線CSVを読み込む</h3>
              <p><strong>3DCAD → 地平線</strong> を開き、このツールで出力した <strong>ObstructionElevations.csv</strong> を読み込みます。</p>
              <ul>
                <li>分析結果は1°間隔へ補間してCSV化。</li>
                <li>SunEye実測値ではなく、DEM解析＋想定樹高の概算値。</li>
                <li>読み込み後、Solar Pro側の地平線グラフで不自然な方位がないか確認。</li>
              </ul>
            </article>

            <article className="manual-card">
              <span>STEP 3</span>
              <h3>積雪補正係数を入力</h3>
              <p><strong>発電量予測 → 電力計算設定 → 各種係数の補正予算 → 設定</strong> から、傾斜面日射補正係数を月別に入力します。</p>
              <ul>
                <li>基本式は 0.95 − 積雪10cm以上出現率。</li>
                <li>0.50以上の月は積雪注意として重点確認。</li>
                <li>メッシュ境界付近では隣接メッシュ比較も参考にする。</li>
              </ul>
            </article>

            <article className="manual-card">
              <span>STEP 4</span>
              <h3>モジュール配置の初期確認</h3>
              <p>図面JPG、航空写真、現地写真を見ながら、方位・傾斜・列間隔・通路・近接影を確認します。</p>
              <ul>
                <li>敷地境界、道路、搬入路、保守通路を先に確認。</li>
                <li>冬至付近の影、樹木、建物、電柱などを別メモに残す。</li>
                <li>PCS容量、DC/AC比、過積載率は後工程で再確認。</li>
              </ul>
            </article>

            <article className="manual-card">
              <span>完了チェック</span>
              <h3>簡易シミュレーション前の確認</h3>
              <div className="manual-check-list">
                <label><input type="checkbox" /> 設置場所の緯度・経度・標高を入力した</label>
                <label><input type="checkbox" /> 地平線CSVを出力し、Solar Proで読み込んだ</label>
                <label><input type="checkbox" /> 積雪補正係数を月別に入力した</label>
                <label><input type="checkbox" /> 図面・航空写真・現地影メモを確認した</label>
                <label><input type="checkbox" /> 結果が極端な場合は原典データを再確認した</label>
              </div>
            </article>
                </div>
              </div>
            </details>
          </section>

          <section className="knowledge-section panel" id="solar-tips">
          <div className="section-heading">
            <div className="step-number">4</div>
            <div>
              <h2>情報・ダウンロード・リンク集</h2>
              <p>Solar Pro入力前後に使うテンプレート、標準機器メモ、外部確認サイトをまとめます。</p>
            </div>
          </div>

          <div className="knowledge-grid">
            <article className="knowledge-card knowledge-card--accent">
              <span className="knowledge-card__label">Solar Pro</span>
              <h3>モジュール配置で確認したいこと</h3>
              <ul>
                <li>方位角・傾斜角は図面条件と現地条件を分けてメモする。</li>
                <li>列間隔は冬至付近の影、保守通路、積雪地域の落雪スペースを同時に見る。</li>
                <li>PCS容量、DC/AC比、過積載率は別メモで残すと後工程で確認しやすい。</li>
                <li>樹木・建物など近接影は、地平線データとは別に現地確認対象として扱う。</li>
              </ul>
            </article>

            <article className="knowledge-card">
              <span className="knowledge-card__label">報告書テンプレート</span>
              <h3>Solar Pro用テンプレートの確認</h3>
              <p>社内テンプレート（.spt）はアプリに同梱せず、各自のPCまたは社内共有フォルダーから選択して確認します。</p>
              <label className="template-download-button template-download-button--file">
                ローカル .spt を選択
                <input type="file" accept=".spt" onChange={handleTemplateFile} />
              </label>
              {templateFileName && <small>選択中：{templateFileName}</small>}
              <small>配置先例：Solar Pro 5.0 / Samples / レポートテンプレート。内部テンプレートは公開用ZIPやGitHubには含めないでください。</small>
            </article>

            <article className="knowledge-card">
              <span className="knowledge-card__label">入力前チェック</span>
              <h3>Solar Proへ転記する前の最低確認</h3>
              <div className="check-note-list">
                <label><input type="checkbox" /> 設置場所：緯度・経度・標高を確認</label>
                <label><input type="checkbox" /> 日射データベース：MONSOLA-11の地域を確認</label>
                <label><input type="checkbox" /> 地平線：CSVを読み込み、グラフを確認</label>
                <label><input type="checkbox" /> 積雪補正：月別係数を入力</label>
                <label><input type="checkbox" /> 現地影：近接障害物は別途メモ・写真確認</label>
              </div>
            </article>

            <article className="knowledge-card">
              <span className="knowledge-card__label">スマホ利用</span>
              <h3>ホーム画面に追加して使う</h3>
              <ul>
                <li>Android Chrome：右上メニュー → 「ホーム画面に追加」または「アプリをインストール」。</li>
                <li>iPhone Safari：共有ボタン → 「ホーム画面に追加」。</li>
                <li>地図・NEDO取得はオンライン接続が必要です。現場では通信状態も確認してください。</li>
                <li>検証版URLを使う場合、ngrokの確認画面が出たら「Visit Site」を押してください。</li>
              </ul>
            </article>

            <article className="knowledge-card knowledge-card--wide module-import-card">
              <div className="module-import-card__header">
                <div>
                  <span className="knowledge-card__label">太陽電池DB</span>
                  <h3>JINKO SOLAR モジュールデータ</h3>
                  <p>Solar Proの太陽電池データベースへインポートして使う社内標準候補です。</p>
                </div>
                <div className="module-download-list" aria-label="JINKO SOLARモジュールデータをダウンロード">
                  <div className="module-download-item">
                    <span>JKM655N-66QL6-BDV-F1-JP</span>
                    <button type="button" onClick={() => saveEquipmentFile('/equipment/JKM655N-66QL6-BDV-F1-JP.MD0W', 'JKM655N-66QL6-BDV-F1-JP.MD0W')}>
                      保存
                    </button>
                  </div>
                  <div className="module-download-item">
                    <span>JKM720N-66HL5-BDV</span>
                    <button type="button" onClick={() => saveEquipmentFile('/equipment/JKM720N-66HL5-BDV.MD0W', 'JKM720N-66HL5-BDV.MD0W')}>
                      保存
                    </button>
                  </div>
                </div>
              </div>
              {equipmentDownloadMessage && <p className="inline-message">{equipmentDownloadMessage}</p>}
              <details className="module-import-guide">
                <summary>
                  <span>Solar Proへの取り込み方法</span>
                  <em>開く / 閉じる</em>
                </summary>
                <ol>
                  <li>Solar Pro上部メニューの <strong>その他 → 太陽電池データベース</strong> を開く。</li>
                  <li><strong>メーカー名</strong> を <strong>JINKO SOLAR</strong> に変更する。</li>
                  <li><strong>データのインポート</strong> を押し、ダウンロードした `.MD0W` ファイルを選択する。</li>
                  <li>一覧に対象モジュールが追加されたことを確認して <strong>OK</strong> を押す。</li>
                </ol>
                <small>PCSデータはこのカードでは扱いません。PCS仕様は別途確認し、Solar Pro側のPCS設定で管理します。</small>
              </details>
            </article>

            <details className="knowledge-card knowledge-card--wide knowledge-card--collapsible">
              <summary>
                <span className="knowledge-card__label">外部確認リンク</span>
                <h3>参考GIS・法規制確認リンク</h3>
              </summary>
              <div className="external-link-grid">
                <a href="https://www.gis.pref.okayama.jp/pref-okayama/Portal" target="_blank" rel="noreferrer">
                  <span>岡山県GISを開く</span>
                  <small>埋蔵文化財、土砂災害警戒区域、山地災害危険地区、土地利用・都市計画、景観・自然公園などを確認。</small>
                </a>
                <a href="https://disaportal.gsi.go.jp/" target="_blank" rel="noreferrer">
                  <span>ハザードマップポータル</span>
                  <small>全国共通の洪水・土砂・地形リスク確認。岡山県GISの補助確認用。</small>
                </a>
                <a href="https://maps.gsi.go.jp/" target="_blank" rel="noreferrer">
                  <span>地理院地図で確認</span>
                  <small>航空写真、地形図、標高、傾斜感を公式画面で再確認。</small>
                </a>
                <a href="https://map.maff.go.jp/" target="_blank" rel="noreferrer">
                  <span>農地ナビ</span>
                  <small>農地性・周辺農地・農振検討の初期確認。最終判断は自治体・農業委員会へ確認。</small>
                </a>
                <a href="https://heritagemap.nabunken.go.jp/" target="_blank" rel="noreferrer">
                  <span>文化財総覧WebGIS</span>
                  <small>全国文化財の補助確認。埋蔵文化財は岡山県GISも優先確認。</small>
                </a>
                <a href="https://www.geospatial.jp/ckan/dataset?q=%E7%99%BB%E8%A8%98%E6%89%80%E5%82%99%E4%BB%98%E5%9C%B0%E5%9B%B3%E3%83%87%E3%83%BC%E3%82%BF" target="_blank" rel="noreferrer">
                  <span>登記所備付地図データ</span>
                  <small>地番XML/GeoJSON確認用。アプリの地番ファイル読込フローと連携。</small>
                </a>
              </div>
            </details>

          </div>
        </section>
        </div>
          </>
        )}

        {activePage === 'pdf' && (
          <PdfToolsPage
            ArrayLengthHelp={ArrayLengthHelp}
            state={{
              drawingConvertStatus,
              drawingJob,
              drawingSelectedPages,
              drawingMergeFiles,
              drawingMergePreview,
              activeDrawingPage,
              drawingImageTool,
              drawingTextTool,
              pdfPreviewView,
              drawingPageRotations,
              selectedImageOpacity,
              selectedTextOpacity,
              canChooseSaveLocation,
            }}
            actions={{
              switchPage,
              handleDrawingPdfToJpg,
              handleMergePdfFiles,
              handleImageFilesToPdf,
              setDrawingMergePreview,
              saveMergedDrawingPdfs,
              setDrawingSelectedPages,
              saveSelectedDrawingPages,
              saveSelectedDrawingPagesAsPdf,
              setDrawingTextPosition,
              beginDrawingImageArea,
              updateDrawingImageArea,
              finishDrawingImageArea,
              startDrawingImageMove,
              startDrawingImageResize,
              startDrawingTextMove,
              setDrawingImageTool,
              setDrawingTextTool,
              toggleDrawingPage,
              changePdfPreviewZoom,
              setPdfPreviewView,
              resetPdfPreviewView,
              rotateDrawingPage,
              setActiveDrawingPageNumber,
              loadClipboardImageForPdf,
              changeDrawingTextSize,
              activateTextPlacementMode: () => {
                setDrawingImageTool(clearPendingImagePlacement)
                setDrawingTextTool((current) => ({ ...current, selected: null, editDrag: null }))
                setDrawingConvertStatus({ status: 'idle', message: '文字入力モードに切り替えました。ページをクリックすると文字を配置できます。' })
              },
              resetDrawingTextTool: () => setDrawingTextTool(initialDrawingTextTool),
              resetDrawingImageTool: () => setDrawingImageTool(initialDrawingImageTool),
              scaleSelectedText,
              changeSelectedTextOpacity,
              deleteSelectedText,
              rotateSelectedImage,
              scaleSelectedImage,
              changeSelectedImageOpacity,
              deleteSelectedImage,
            }}
            refs={{ activePdfPreviewRef }}
            helpers={{
              activePreviewBoxStyle,
              previewUrlForPage,
              activePreviewImageStyle,
              isRotatedPreviewReady,
              activePreviewPointStyle,
            }}
          />
        )}

        {activePage === 'inheritance' && (
        <section className="inheritance-section panel inheritance-section--standalone" id="inheritance-check">
            <div className="inheritance-page-heading">
              <div className="section-heading">
                <div className="step-number">相</div>
                <div>
                  <h2>相続登記チェック</h2>
                  <p>法務局資料PDFから土地の単独相続候補を拾い出す、オフライン確認補助です。</p>
                </div>
              </div>
              <button type="button" className="secondary-button" onClick={() => switchPage('solar')}>
                太陽光チェックへ戻る
              </button>
            </div>

            <div className="inheritance-disclosure__body">
              <div className="privacy-note">
                <strong>個人情報保護のための注意</strong>
                <span>PDFは環境に応じてブラウザ内またはローカルサーバーで解析します。目安上限 {pdfLimitMb(detectRuntimeEnvironment())}MB。受付番号・受付日・土地所在地・外記載を抽出し、最終確認は必ず原本で行ってください。</span>
              </div>

              <div className="inheritance-toolbar">
                <div>
                  <span>PDFを選択</span>
                  <small>テキスト抽出できるPDFに対応。スキャンPDFは今後OCR対応予定です。</small>
                </div>
                <label className="secondary-button file-button">
                  相続資料PDFを読み込む
                  <input type="file" accept="application/pdf,.pdf" onChange={handleInheritancePdf} />
                </label>
                <button type="button" className="secondary-button" disabled={!inheritanceJob} onClick={clearInheritanceJob}>結果クリア</button>
                <button type="button" className="primary-button" disabled={!inheritanceSingleTransferRows.length} onClick={downloadInheritanceCsv}>保存先を選んでCSV出力</button>
              </div>

              {inheritanceStatus.message && (
                <p className={`inline-message ${inheritanceStatus.status === 'error' ? 'inline-message--error' : ''}`}>{inheritanceStatus.message}</p>
              )}

              {inheritanceJob && (
                <div className="inheritance-result">
                  <div className="inheritance-summary">
                    <div><span>ファイル</span><strong>{inheritanceJob.fileName}</strong></div>
                    <div><span>ページ数</span><strong>{inheritanceJob.pageCount}</strong></div>
                    <div>
                      <span>受付番号範囲</span>
                      <strong>
                        {inheritanceJob.receiptSummary?.firstNumber
                          ? `${inheritanceJob.receiptSummary.firstNumber}〜${inheritanceJob.receiptSummary.lastNumber}`
                          : '未確認'}
                      </strong>
                    </div>
                    <div>
                      <span>読取 / 範囲件数</span>
                      <strong>
                        {inheritanceJob.receiptSummary?.expectedCount
                          ? `${inheritanceJob.receiptSummary.readCount} / ${inheritanceJob.receiptSummary.expectedCount}件`
                          : '—'}
                      </strong>
                    </div>
                    <div>
                      <span>抜け番説明候補</span>
                      <strong>
                        {inheritanceJob.receiptSummary?.missingCount
                          ? `${inheritanceJob.receiptSummary.explainedMissingCount} / ${inheritanceJob.receiptSummary.missingCount}件`
                          : '0件'}
                      </strong>
                    </div>
                    <div><span>単独 / 所有権移転・相続</span><strong>{inheritanceSingleTransferRows.length}件</strong></div>
                    <div><span>確認した候補</span><strong>{inheritanceJob.results.length}件</strong></div>
                  </div>
                  {inheritanceJob.receiptSummary?.expectedCount && (
                    <p className={`inline-message ${inheritanceJob.receiptSummary.isContinuous ? '' : 'inline-message--error'}`}>
                      {inheritanceJob.receiptSummary.isContinuous
                        ? `受付番号は ${inheritanceJob.receiptSummary.firstNumber}〜${inheritanceJob.receiptSummary.lastNumber} まで連続して読取済みです。`
                        : `受付番号の抜け候補 ${inheritanceJob.receiptSummary.missingCount}件中、黒塗り・取下・受付文字なし等で説明できる候補は ${inheritanceJob.receiptSummary.explainedMissingCount}件です。${inheritanceJob.receiptSummary.missingExplanationMatches ? '件数は一致しています。' : `未説明候補が ${inheritanceJob.receiptSummary.unexplainedMissingCount}件あります。`}（抜け候補：${inheritanceJob.receiptSummary.missingNumbers.join('、')}${inheritanceJob.receiptSummary.missingCount > inheritanceJob.receiptSummary.missingNumbers.length ? ' ほか' : ''}）`}
                    </p>
                  )}
                  {inheritanceJob.receiptSummary?.missingCount > 0 && (
                    <details className="mini-details">
                      <summary>抜け番の分類を確認</summary>
                      <div className="mini-details__body">
                        <p>
                          {Object.entries(inheritanceJob.receiptSummary.missingBreakdown || {})
                            .map(([label, count]) => `${label}: ${count}件`)
                            .join(' / ')}
                        </p>
                        <ul>
                          {(inheritanceJob.receiptSummary.missingDetails || []).slice(0, 10).map((item) => (
                            <li key={item.receiptNumber}>
                              第{item.receiptNumber}号：{item.label}{item.pageNumber ? `（${item.pageNumber}ページ）` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  )}

                  {inheritanceSingleTransferRows.length ? (
                    <div className="inheritance-list-panel">
                      <div className="inheritance-list-tools">
                        <label>
                          <span>並び替え</span>
                          <select value={inheritanceSort} onChange={(event) => setInheritanceSort(event.target.value)}>
                            <option value="receipt">受付順</option>
                            <option value="extra-desc">外記載が多い順</option>
                            <option value="address">住所順</option>
                          </select>
                        </label>
                        <small>行の「コピー」は、受付番号・受付日・土地・住所・外記載をタブ区切りでコピーします。</small>
                      </div>
                      <div className="inheritance-table-wrap">
                        <table className="inheritance-table">
                          <thead>
                            <tr>
                              <th>受付番号</th>
                              <th>受付日</th>
                              <th>土地</th>
                              <th>住所</th>
                              <th>外記載</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedInheritanceRows.map((item, index) => (
                              <tr key={`${item.pageNumber}-${item.sequence}-${index}`} className="inheritance-row--single">
                                <td>{item.receiptNumber ? `第${item.receiptNumber}号` : '番号未抽出'}</td>
                                <td>{item.receiptDate || '受付日未抽出'}</td>
                                <td>{item.propertyType || '土地'}</td>
                                <td>
                                  <span>{item.registryAddress || item.location || '所在未抽出'}</span>
                                </td>
                                <td>
                                  {item.extraCount ? `外${item.extraCount}件` : ''}
                                </td>
                                <td>
                                  <button type="button" className="tiny-action-button" onClick={() => copyInheritanceRow(item, index)}>
                                    {inheritanceCopyStatus === `row-${index}` ? 'コピー済み' : 'コピー'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="inline-message">単独 / 所有権移転・相続（土地）を検出できませんでした。PDFの文字認識状態または原本を確認してください。</p>
                  )}
                </div>
              )}
            </div>
        </section>
        )}
      </main>

      <footer>
        <div>
          <span>Solar Site Precheck — 入力内容はこのブラウザに自動保存</span>
          <span>Version {APP_VERSION} / Build {BUILD_DATE} / 地図・標高：国土地理院 / 積雪出現率：NEDO MONSOLA-11</span>
        </div>
        <DiagnosticPanel placeApiStatus={placeApiStatus} />
      </footer>
    </div>
  )
}
