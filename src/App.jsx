import { useEffect, useMemo, useRef, useState } from 'react'
import MapPanel from './components/MapPanel.jsx'
import ReportPreview from './components/ReportPreview.jsx'
import HorizonGraphPreview from './components/HorizonGraphPreview.jsx'
import TerrainSectionPreview from './components/TerrainSectionPreview.jsx'
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
const DRAFT_KEY = 'solar-site-precheck-draft-v1'
const TERRAIN_ANALYSIS_VERSION = 2
const APP_VERSION = '1.2'
const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'dev'
const BUILD_TARGET = typeof __BUILD_TARGET__ !== 'undefined' ? __BUILD_TARGET__ : 'local'
const PDF_LIMIT_MB = typeof __PDF_LIMIT_MB__ !== 'undefined' && __PDF_LIMIT_MB__ ? __PDF_LIMIT_MB__ : ''
const MIN_REQUIRED_RUNTIME = typeof __MIN_REQUIRED_RUNTIME__ !== 'undefined' ? __MIN_REQUIRED_RUNTIME__ : '1.2'

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

function loadDraft() {
  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_KEY)) || {}
  } catch {
    return {}
  }
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

function terrainFromSamples(samples, source = '手動入力') {
  const valid = samples.filter((sample) => Number.isFinite(sample.angle))
  if (!valid.length) return null
  const highest = valid.reduce((max, sample) => sample.angle > max.angle ? sample : max)
  return {
    risk: highest.angle >= 5 ? '高' : highest.angle >= 2 ? '中' : '低',
    maxAngle: highest.angle,
    direction: formatHorizonDirection(highest),
    radius: source,
    samples,
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

function SolarProPreviewButton({ label, image, caption, path, placement = 'right', highlight = '' }) {
  return (
    <span className={`solarpro-preview solarpro-preview--${placement}`}>
      <button type="button" className="preview-button">{label}</button>
      <span className="preview-popover">
        {path && <span className="preview-path">{path}</span>}
        <span className="preview-image-wrap">
          <img src={image} alt={caption} />
          {highlight === 'location' && (
            <span className="preview-highlight preview-highlight--location">
              <em>ここに入力</em>
            </span>
          )}
        </span>
        <small>{caption}</small>
      </span>
    </span>
  )
}

function detectRuntimeEnvironment() {
  if (typeof window === 'undefined') return '不明'
  const host = window.location.hostname
  if (host.endsWith('.pages.dev')) return 'Cloudflare Pages'
  if (host === 'localhost' || host === '127.0.0.1') return 'Portable / Local'
  if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return 'Portable LAN'
  return 'Web配信'
}

function currentBundleName() {
  if (typeof document === 'undefined') return '—'
  const script = document.querySelector('script[type="module"][src*="/assets/index-"]')
  if (script?.src) return script.src.split('/').pop()
  return '—'
}

function DiagnosticPanel() {
  const [checks, setChecks] = useState({
    status: 'idle',
    nedo: '未確認',
    badMesh: '未確認',
    pdfApi: '未確認',
    sw: '未確認',
  })
  const environment = detectRuntimeEnvironment()
  const bundleName = currentBundleName()
  const pdfLimitText = PDF_LIMIT_MB || (environment === 'Cloudflare Pages' ? '20' : '80')

  async function runChecks() {
    setChecks((current) => ({ ...current, status: 'checking' }))
    const next = {
      status: 'done',
      nedo: 'NG',
      badMesh: 'NG',
      pdfApi: 'NG',
      sw: '未確認',
    }
    try {
      const response = await fetch('/api/nedo-monsola?mesh=52331366', { cache: 'no-store' })
      next.nedo = response.ok ? 'OK' : `NG ${response.status}`
    } catch {
      next.nedo = 'NG'
    }
    try {
      const response = await fetch('/api/nedo-monsola?mesh=bad', { cache: 'no-store' })
      next.badMesh = response.status === 400 ? 'OK' : `NG ${response.status}`
    } catch {
      next.badMesh = 'NG'
    }
    try {
      const response = await fetch('/api/inheritance-pdf', { method: 'GET', cache: 'no-store' })
      next.pdfApi = response.status === 405 ? 'OK' : `NG ${response.status}`
    } catch {
      next.pdfApi = 'NG'
    }
    try {
      if (!navigator.serviceWorker?.getRegistrations) {
        next.sw = '非対応'
      } else {
        const registrations = await navigator.serviceWorker.getRegistrations()
        next.sw = registrations.length ? `${registrations.length}件` : '整理済み'
      }
    } catch {
      next.sw = '確認失敗'
    }
    setChecks(next)
  }

  return (
    <details className="diagnostic-panel">
      <summary>
        <span>実行環境・API診断</span>
        <small>{environment} / v{APP_VERSION}</small>
      </summary>
      <div className="diagnostic-panel__body">
        <dl>
          <div><dt>環境</dt><dd>{environment}</dd></div>
          <div><dt>Build</dt><dd>{BUILD_DATE} / {BUILD_TARGET}</dd></div>
          <div><dt>JS</dt><dd>{bundleName}</dd></div>
          <div><dt>PDF目安</dt><dd>{pdfLimitText}MB</dd></div>
          <div><dt>Runtime</dt><dd>min {MIN_REQUIRED_RUNTIME}</dd></div>
          <div><dt>NEDO API</dt><dd className={checks.nedo === 'OK' ? 'is-ok' : ''}>{checks.nedo}</dd></div>
          <div><dt>Bad mesh</dt><dd className={checks.badMesh === 'OK' ? 'is-ok' : ''}>{checks.badMesh}</dd></div>
          <div><dt>PDF API</dt><dd className={checks.pdfApi === 'OK' ? 'is-ok' : ''}>{checks.pdfApi}</dd></div>
          <div><dt>SW</dt><dd>{checks.sw}</dd></div>
        </dl>
        <button type="button" className="secondary-button" disabled={checks.status === 'checking'} onClick={runChecks}>
          {checks.status === 'checking' ? '確認中…' : 'API状態を確認'}
        </button>
        <p>Cloudflare版ではPDFサーバー解析が無い場合があります。NEDOがOKなら積雪Web取得は利用できます。</p>
      </div>
    </details>
  )
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
  const [drawingConvertStatus, setDrawingConvertStatus] = useState({ status: 'idle', message: '' })
  const [drawingJob, setDrawingJob] = useState(null)
  const [drawingSelectedPages, setDrawingSelectedPages] = useState([])
  const [templateFileName, setTemplateFileName] = useState('')
  const [inheritanceStatus, setInheritanceStatus] = useState({ status: 'idle', message: '' })
  const [inheritanceJob, setInheritanceJob] = useState(null)
  const [inheritanceSort, setInheritanceSort] = useState('receipt')
  const [inheritanceCopyStatus, setInheritanceCopyStatus] = useState('')
  const [activePage, setActivePage] = useState(() =>
    typeof window !== 'undefined' && window.location.hash === '#inheritance-check' ? 'inheritance' : 'solar',
  )
  const draftSaveTimer = useRef(null)

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
        }))
      } catch {
        // Storage can be unavailable or full; the app should continue to work without draft persistence.
      }
    }, 200)

    return () => window.clearTimeout(draftSaveTimer.current)
  }, [position, elevation, terrain, obstructionHeight, detailedHorizon, snowData.station, snowBase])

  useEffect(() => {
    if (position && placeInfo.status === 'idle') loadPlaceInfo(position)
  }, [position, placeInfo.status])

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

  async function loadPlaceInfo(nextPosition) {
    const positionKey = `${nextPosition.lat.toFixed(6)},${nextPosition.lon.toFixed(6)}`
    setPlaceInfo({ status: 'loading', data: null, message: '周辺住所を確認中…', positionKey })
    try {
      const data = await reverseGeocode(nextPosition.lat, nextPosition.lon)
      setPlaceInfo((current) => current.positionKey === positionKey
        ? { status: 'success', data, message: '', positionKey }
        : current)
    } catch {
      setPlaceInfo((current) => current.positionKey === positionKey
        ? { status: 'error', data: null, message: '周辺住所を取得できませんでした。', positionKey }
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
    loadPlaceInfo(nextPosition)
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
      setTerrain(result)
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
    setTerrain(terrainFromSamples(samples))
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
      setSnowData({ status: 'error', station: null, message: error.message })
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
      setSnowData({
        status: 'error',
        station: null,
        message: `${error.message} RUN_APP.cmdで起動している場合はローカル中継で取得できます。`,
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
      setAdjacentMeshCompare({ status: 'error', stations: [], message: error.message || '隣接メッシュ比較に失敗しました。' })
    }
  }

  async function handleDrawingPdfToJpg(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setDrawingConvertStatus({ status: 'loading', message: 'PDF図面を読み込んでいます…' })
    setDrawingJob(null)
    setDrawingSelectedPages([])
    try {
      const { preparePdfJpgPreview } = await import('./services/pdfToJpg.js')
      const job = await preparePdfJpgPreview(file, (message) => {
        setDrawingConvertStatus({ status: 'loading', message })
      })
      setDrawingJob(job)
      setDrawingSelectedPages(job.pages.map((page) => page.pageNumber))
      setDrawingConvertStatus({ status: 'success', message: `${job.pageCount}ページを読み込みました。保存するページを選択してください。` })
    } catch (error) {
      setDrawingConvertStatus({ status: 'error', message: error.message || 'PDFをJPGに変換できませんでした。' })
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
      const { savePdfPagesAsJpg } = await import('./services/pdfToJpg.js')
      const count = await savePdfPagesAsJpg(drawingJob.file, drawingSelectedPages, (message) => {
        setDrawingConvertStatus({ status: 'loading', message })
      }, { directoryHandle, fileHandle, fileNameBase })
      setDrawingConvertStatus({ status: 'success', message: `${count}ページをJPGとして保存しました。${chooseLocation ? '保存先を指定しました。' : ''}` })
    } catch (error) {
      setDrawingConvertStatus({ status: 'error', message: error.message || 'JPG保存に失敗しました。' })
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
  }), [position, elevation, terrain, terrainSection, siteName, selectedParcel, confirmedSnowStation, expectedSnowMesh, meshBoundary, snowBase, obstructionHeight, solarReference, selectedPlaceLabel, memo, fieldMemo])

  function downloadCsv() {
    const rows = [
      ['項目', '値'],
      ['候補地名', siteName],
      ['地番', selectedParcel?.number || ''],
      ['地番区域', [selectedParcel?.municipality, selectedParcel?.area].filter(Boolean).join(' ')],
      ['緯度（度分）', position ? toDegreeMinutes(position.lat, 'lat') : ''],
      ['経度（度分）', position ? toDegreeMinutes(position.lon, 'lon') : ''],
      ['緯度（10進）', position?.lat?.toFixed(6) || ''],
      ['経度（10進）', position?.lon?.toFixed(6) || ''],
      ['標高(m)', Number.isFinite(elevation.value) ? elevation.value.toFixed(1) : ''],
      ['標高データ', elevation.source],
      ['地平線の想定樹高(m)', obstructionHeight.toFixed(1)],
      ['冬至南中太陽高度', solarReference ? `${solarReference.winterSolsticeNoon.toFixed(1)}°` : ''],
      ['太陽高度比較', solarReference ? `${solarReference.label} / ${solarReference.message}` : ''],
      ['冬至10〜14時ピーク時間帯確認', solarReference?.peakWindow ? `${solarReference.peakWindow.label} / ${solarReference.peakWindow.message}` : ''],
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
    const csv = buildObstructionElevationsCsv({
      samples: terrain.samples,
      position,
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
  const parcelResults = useMemo(
    () => searchParcels(parcelData, parcelQuery),
    [parcelData, parcelQuery],
  )

  function switchPage(nextPage) {
    setActivePage(nextPage)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', nextPage === 'inheritance' ? '#inheritance-check' : '#site-select')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span>☀</span></div>
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
              相続登記チェック
            </button>
          </nav>
          <div className="status-pill"><span></span>MVP プロトタイプ</div>
        </div>
      </header>

      <main>
        {activePage === 'solar' && (
          <>
        <section className="hero">
          <p className="eyebrow">SITE SCREENING WORKSPACE</p>
          <h1>候補地の情報を、<br /><span>Solar Pro入力前</span>にひとまとめ。</h1>
          <p>航空写真から位置を選び、標高・地平線・NEDO積雪データを一次検討レポートに整理します。</p>
        </section>

        <section className="utility-panel no-print">
          <div>
            <strong>補助ツール：図面PDF → JPG変換</strong>
            <span>PDF図面をプレビューし、必要なページだけJPG保存します。ファイルはブラウザ内で処理されます。</span>
          </div>
          <a className="utility-link-button utility-link-button--manual" href="#solar-manual">📘 Solar Pro入力マニュアル</a>
          <label className="utility-button">
            PDF図面を選択
            <input type="file" accept="application/pdf,.pdf" onChange={handleDrawingPdfToJpg} />
          </label>
          {drawingConvertStatus.message && (
            <p className={`utility-message utility-message--${drawingConvertStatus.status}`}>
              {drawingConvertStatus.message}
            </p>
          )}
          {drawingJob && (
            <div className="drawing-converter">
              <div className="drawing-converter__toolbar">
                <strong>{drawingJob.baseName}</strong>
                <span>{drawingSelectedPages.length}/{drawingJob.pageCount}ページ選択中</span>
                <button type="button" onClick={() => setDrawingSelectedPages(drawingJob.pages.map((page) => page.pageNumber))}>全選択</button>
                <button type="button" onClick={() => setDrawingSelectedPages([])}>選択解除</button>
                <button type="button" disabled={!drawingSelectedPages.length || drawingConvertStatus.status === 'loading'} onClick={() => saveSelectedDrawingPages()}>
                  選択ページを保存
                </button>
                {canChooseSaveLocation && (
                  <button type="button" disabled={!drawingSelectedPages.length || drawingConvertStatus.status === 'loading'} onClick={() => saveSelectedDrawingPages({ chooseLocation: true })}>
                    保存先・ファイル名を選んで保存
                  </button>
                )}
              </div>
              <div className="drawing-page-grid">
                {drawingJob.pages.map((page) => (
                  <label className={`drawing-page-card ${drawingSelectedPages.includes(page.pageNumber) ? 'drawing-page-card--selected' : ''}`} key={page.pageNumber}>
                    <input type="checkbox" checked={drawingSelectedPages.includes(page.pageNumber)} onChange={() => toggleDrawingPage(page.pageNumber)} />
                    <span>{page.pageNumber}ページ</span>
                    <img src={page.previewUrl} alt={`${page.pageNumber}ページのプレビュー`} />
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
              <div><h2>候補地点を選択</h2><p>住所・地名・緯度経度をまとめて検索、または航空写真を直接クリック</p></div>
            </div>

            <div className="site-search-row">
              <form className="address-search" onSubmit={handleAddressSearch}>
                <Icon>⌕</Icon>
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="住所・地名・緯度経度を入力（例：岡山県真庭市 / 34.8617, 133.2433）"
                  aria-label="住所・地名・緯度経度"
                />
                <button type="submit" disabled={searchStatus === 'loading'}>{searchStatus === 'loading' ? '検索中' : '検索'}</button>
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
                      placeholder={parcelData ? '地番・地番区域を検索' : '先に地番ファイルを読み込む'}
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
                              <span>{[info.municipality, info.area].filter(Boolean).join(' ') || '地番区域情報なし'}</span>
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
                    ? `現在の選択地点: ${selectedPlaceLabel || (placeInfo.status === 'loading' ? '確認中…' : '住所未取得')}`
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
                    <button type="button" className="action-button action-button--terrain" disabled={!position || !Number.isFinite(elevation.value) || terrainStatus === 'loading'} onClick={handleTerrainAnalysis}>
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
                    <button type="button" className="horizon-tool-button horizon-csv-button horizon-csv-button--solarpro" disabled={!position || !terrain?.samples?.length} onClick={downloadSolarProObstructionCsv}>
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
                            <strong>発電ピーク時間帯（冬至10〜14時）：{solarReference.peakWindow.label}</strong>
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
                          <dd>{selectedPlaceLabel || (placeInfo.status === 'loading' ? '確認中…' : '未取得')}</dd>
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
                  <button type="button" className="action-button action-button--nedo" disabled={!position || snowData.status === 'loading'} onClick={handleNedoWeb}>
                    <span>{snowData.status === 'loading' ? '取得中…' : 'NEDO Webから積雪データを取得'}</span>
                    <small>{expectedSnowMesh ? `3次メッシュ ${expectedSnowMesh} を取得して適用` : '先に地図で地点を選択'}</small>
                  </button>
                  <a
                    className={`mesh-link-button ${!nedoMonsolaUrl ? 'mesh-link-button--disabled' : ''}`}
                    href={nedoMonsolaUrl || undefined}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!nedoMonsolaUrl}
                    onClick={(event) => {
                      if (!nedoMonsolaUrl) event.preventDefault()
                    }}
                  >
                    <span>3次メッシュのNEDOページを開く</span>
                    <small>{expectedSnowMesh || '地点未選択'}</small>
                  </a>
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
                    <p>図面と候補地チェック結果を見ながら、Solar Proで簡易シミュレーションを行うための作業手順</p>
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
                <li>地平線8方位を分析し、必要なら手動補正する。</li>
                <li>NEDO Webから同一3次メッシュの積雪出現率を取得する。</li>
                <li>Solar Pro転記用ミニ表を開き、入力値を確認する。</li>
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
              <h3>地平線を入力</h3>
              <p><strong>3DCAD → 地平線</strong> を開き、方位角と高度角を入力します。現在は一次検討用として8方位を使います。</p>
              <ul>
                <li>0° / 45° / 90° / 135° / 180° / 225° / 270° / 315°を入力。</li>
                <li>樹高20mを加算した保守的な概算値として扱う。</li>
                <li>冬の太陽高度警告が出た場合は現地影を重点確認。</li>
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
                <label><input type="checkbox" /> 地平線8方位を入力または確認した</label>
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
              <p>Solar Pro入力前後に使うテンプレート、チェック項目、外部確認サイトをまとめます。</p>
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
                <label><input type="checkbox" /> 地平線：8方位の仰角を入力または確認</label>
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
                <span>PDFは環境に応じてブラウザ内またはローカルサーバーで解析します。目安上限 {PDF_LIMIT_MB || (detectRuntimeEnvironment() === 'Cloudflare Pages' ? '20' : '80')}MB。受付番号・受付日・土地所在地・外記載を抽出し、最終確認は必ず原本で行ってください。</span>
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
        <DiagnosticPanel />
      </footer>
    </div>
  )
}
