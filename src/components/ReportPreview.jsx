import { productionFactor } from '../services/nedo.js'
import { toDegreeMinutes } from '../utils/coordinates.js'
import { snowRateLevel } from '../utils/snowRates.js'
import { evaluateSiteVerdict, primaryVerdictReasons, verdictCriteriaText } from '../utils/verdict.js'
import { capacityValueStatusLabel, summarizeGridFlowDirection } from '../services/gridCapacity.js'
import { powerGridDisplayLine, powerGridDisplayLineLabel, powerGridSearchSummary } from '../services/powerGrid.js'
import HorizonGraphPreview from './HorizonGraphPreview.jsx'
import TerrainSectionPreview from './TerrainSectionPreview.jsx'

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function SnowRateCell({ rate }) {
  const level = snowRateLevel(rate)
  return (
    <td className={`snow-rate-cell snow-rate-cell--${level}`}>
      <span className="snow-rate-cell__value">{rate.toFixed(2)}</span>
      {level === 'alert' && <span className="snow-rate-cell__mark" title="積雪注意">❄ 注意</span>}
    </td>
  )
}

function ValueRow({ label, children, wide = false, hint = '' }) {
  const hasHint = Boolean(hint)
  return (
    <div
      className={`report-value ${wide ? 'report-value--wide' : ''} ${hasHint ? 'report-value--hinted' : ''}`}
      title={hint || undefined}
      aria-label={hasHint ? `${label}。${hint}` : undefined}
    >
      <dt>{label}</dt>
      <dd>{children || '—'}</dd>
    </div>
  )
}

function ReportPage({ page, title, subtitle, children, className = '' }) {
  return (
    <article className={`report-print-page ${className}`}>
      <header className="report-page-header">
        <div>
          <p className="eyebrow">候補地 簡易分析レポート</p>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <span className="report-page-number">{page}</span>
      </header>
      <div className="report-page-body">{children}</div>
    </article>
  )
}

function demReliabilityLabel(source = '') {
  if (/DEM5|5A|5B|5C|レーザ|航空レーザ/.test(source)) {
    return { level: 'high', label: '◎ レーザ測量5m相当', note: '地形断面・地平線の概算に比較的使いやすい標高ソースです。' }
  }
  if (/DEM10|10m|DEM標高タイル|基盤地図情報/.test(source)) {
    return { level: 'medium', label: '△ 10mメッシュ相当', note: '山林・急傾斜地では断面・地平線を参考値として扱ってください。' }
  }
  if (/未取得|手動|—/.test(source)) {
    return { level: 'unknown', label: '— 未取得', note: '標高取得後に精度を確認できます。' }
  }
  return { level: 'unknown', label: '△ 出典確認', note: '取得元の表記を確認してください。' }
}

function collectDemSources(report) {
  const sources = []
  if (report.elevationSource) sources.push(report.elevationSource)
  for (const sample of report.terrain?.samples || []) {
    for (const point of sample.profile || []) {
      if (point.source) sources.push(point.source)
    }
  }
  for (const line of report.terrainSection?.lines || []) {
    for (const point of line.points || []) {
      if (point.source) sources.push(point.source)
    }
  }
  return sources
}

function demSourceSummary(report) {
  const sources = collectDemSources(report)
  const total = sources.length
  const dem5 = sources.filter((source) => /DEM5|5A|5B|5C|レーザ|航空レーザ/.test(source)).length
  const dem10 = sources.filter((source) => /DEM10|10m|DEM標高タイル|基盤地図情報/.test(source)).length
  const unknown = Math.max(0, total - dem5 - dem10)
  const primary = demReliabilityLabel(report.elevationSource)
  const detail = total
    ? `DEM5系 ${dem5}点 / DEM10系 ${dem10}点${unknown ? ` / その他 ${unknown}点` : ''}`
    : '地平線・断面を再分析するとDEM内訳を表示できます。'
  const shouldWarn = total > 0 && dem10 / total >= 0.5
  return { ...primary, total, dem5, dem10, unknown, detail, shouldWarn }
}

function SnowCompactTable({ station, snowBase }) {
  if (!station?.snow10cm?.monthly?.length) return <p className="report-empty-panel">NEDO積雪データは未取得です。</p>
  const groups = [0, 4, 8]
  return (
    <table className="snow-table snow-table--report snow-table--compact-report">
      <thead>
        <tr>
          {groups.map((start) => (
            <th key={start} colSpan="3">{MONTHS[start]}〜{MONTHS[start + 3]}</th>
          ))}
        </tr>
        <tr>
          {groups.map((start) => (
            <FragmentHeader key={start} />
          ))}
        </tr>
      </thead>
      <tbody>
        {[0, 1, 2, 3].map((offset) => (
          <tr key={offset}>
            {groups.map((start) => {
              const index = start + offset
              const rate = station.snow10cm.monthly[index]
              return (
                <FragmentRow key={index} month={MONTHS[index]} rate={rate} factor={productionFactor(snowBase, rate)} />
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function FragmentHeader() {
  return (
    <>
      <th>月</th>
      <th>出現率</th>
      <th>係数</th>
    </>
  )
}

function FragmentRow({ month, rate, factor }) {
  return (
    <>
      <th>{month}</th>
      <SnowRateCell rate={rate} />
      <td><strong>{factor.toFixed(2)}</strong></td>
    </>
  )
}

function shortLineName(line) {
  return String(line?.label || '断面').replace('断面', '')
}

function lineAverageText(line) {
  const slope = line?.summary?.averageSlopePercent
  if (!Number.isFinite(slope)) return '平均角 —'
  return `平均角${((Math.atan(Math.abs(slope) / 100) * 180) / Math.PI).toFixed(1)}°`
}

function summarizeTerrainPoints(points) {
  const valid = (points || []).filter((point) => Number.isFinite(point.elevation))
  if (valid.length < 2) {
    return {
      minElevation: valid[0]?.elevation ?? null,
      maxElevation: valid[0]?.elevation ?? null,
      elevationDiff: 0,
      totalRise: 0,
      totalFall: 0,
      averageSlopePercent: 0,
      maxSlopePercent: 0,
    }
  }

  let totalRise = 0
  let totalFall = 0
  let maxSlopePercent = 0
  for (let index = 1; index < valid.length; index += 1) {
    const previous = valid[index - 1]
    const current = valid[index]
    const distance = Math.abs(current.distance - previous.distance)
    if (!distance) continue
    const diff = current.elevation - previous.elevation
    if (diff >= 0) totalRise += diff
    else totalFall += Math.abs(diff)
    maxSlopePercent = Math.max(maxSlopePercent, Math.abs(diff / distance) * 100)
  }

  const first = valid[0]
  const last = valid[valid.length - 1]
  const horizontalDistance = Math.abs(last.distance - first.distance) || 1
  const elevationDiff = last.elevation - first.elevation

  return {
    minElevation: Math.min(...valid.map((point) => point.elevation)),
    maxElevation: Math.max(...valid.map((point) => point.elevation)),
    elevationDiff,
    totalRise,
    totalFall,
    averageSlopePercent: Math.abs(elevationDiff / horizontalDistance) * 100,
    maxSlopePercent,
  }
}

function normalizeReportTerrainSection(analysis) {
  if (!analysis?.lines?.length) return null
  const reportRange = Math.min(Math.max(analysis.rangeMeters || 100, 50), 100)
  const lines = analysis.lines.map((line) => {
    const points = (line.points || []).filter((point) => Math.abs(point.distance) <= reportRange)
    return {
      ...line,
      rangeMeters: reportRange,
      points,
      summary: summarizeTerrainPoints(points),
    }
  })
  const allElevations = lines
    .flatMap((line) => line.points || [])
    .map((point) => point.elevation)
    .filter(Number.isFinite)

  return {
    ...analysis,
    rangeMeters: reportRange,
    lines,
    summary: {
      minElevation: allElevations.length ? Math.min(...allElevations) : null,
      maxElevation: allElevations.length ? Math.max(...allElevations) : null,
      sampleCount: allElevations.length,
    },
  }
}

function axisLineLabel(line, fallback) {
  if (!line) return fallback
  const from = line.negativeDirection || fallback.split('↔')[0] || ''
  const to = line.positiveDirection || fallback.split('↔')[1] || ''
  return `${from}↔${to}`
}

function gsiMetersPerPixel(lat, zoom) {
  return (156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / (2 ** zoom)
}

function lonLatToTilePoint(lat, lon, zoom) {
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const sinLat = Math.sin((safeLat * Math.PI) / 180)
  const n = 2 ** zoom
  return {
    x: ((lon + 180) / 360) * n,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n,
  }
}

function buildGsiAerialTileLayout(position, zoom = 17, options = {}) {
  if (!Number.isFinite(position?.lat) || !Number.isFinite(position?.lon)) return null
  const point = lonLatToTilePoint(position.lat, position.lon, zoom)
  const centerTileX = Math.floor(point.x)
  const centerTileY = Math.floor(point.y)
  const cols = options.cols || 7
  const rows = options.rows || 5
  const tileSize = 256
  const startX = centerTileX - Math.floor(cols / 2)
  const startY = centerTileY - Math.floor(rows / 2)
  const n = 2 ** zoom
  const centerPixel = {
    x: (point.x - startX) * tileSize,
    y: (point.y - startY) * tileSize,
  }
  const view = {
    width: options.width || 900,
    height: options.height || 400,
    cx: options.cx || (options.width || 900) / 2,
    cy: options.cy || (options.height || 400) / 2,
  }
  const offset = {
    x: view.cx - centerPixel.x,
    y: view.cy - centerPixel.y,
  }
  const tiles = []

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const tileX = startX + x
      const tileY = startY + y
      if (tileX < 0 || tileY < 0 || tileX >= n || tileY >= n) continue
      tiles.push({
        key: `${zoom}-${tileX}-${tileY}`,
        href: `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${zoom}/${tileX}/${tileY}.jpg`,
        x: offset.x + x * tileSize,
        y: offset.y + y * tileSize,
      })
    }
  }

  return {
    ...view,
    tiles,
    metersPerPixel: gsiMetersPerPixel(position.lat, zoom),
    zoom,
    startTileX: startX,
    startTileY: startY,
    tileSize,
    offset,
  }
}

function ReportTerrainMapPreview({ analysis, position }) {
  const range = analysis?.rangeMeters || 100
  const eastWestLine = (analysis?.lines || []).find((line) => /東西/.test(line.label || '') || line.positiveDirection === '東' || line.negativeDirection === '西')
  const northSouthLine = (analysis?.lines || []).find((line) => /南北/.test(line.label || '') || line.positiveDirection === '北' || line.negativeDirection === '南')
  const tileLayout = buildGsiAerialTileLayout(position)
  const cx = tileLayout?.cx || 380
  const cy = tileLayout?.cy || 250
  const viewWidth = tileLayout?.width || 900
  const rangePx = tileLayout ? Math.min(240, Math.max(42, range / tileLayout.metersPerPixel)) : 110
  const innerPx = tileLayout ? Math.min(rangePx * 0.78, Math.max(36, 50 / tileLayout.metersPerPixel)) : 48
  const scalePx = tileLayout ? Math.max(90, Math.min(240, 100 / tileLayout.metersPerPixel)) : 180
  const viewHeight = tileLayout?.height || 500
  const scaleY = viewHeight - 30
  const scaleLabelY = scaleY - 10
  const creditY = viewHeight - 12
  return (
    <div className="report-map-preview" aria-label="断面方向確認図">
      <div className="report-map-preview__head">
        <div>
          <strong>航空写真・断面方向</strong>
          <span>次ページの東西・南北断面を見るための位置関係メモ</span>
        </div>
        <em>100mスケール</em>
      </div>
      <svg viewBox={`0 0 ${tileLayout?.width || 900} ${tileLayout?.height || 400}`} preserveAspectRatio="xMidYMid slice" role="img">
        <title>候補地点周辺の航空写真と断面方向</title>
        <defs>
          <filter id="reportAerialTextShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#00291f" floodOpacity="0.65" />
          </filter>
        </defs>
        <rect x="0" y="0" width={viewWidth} height={viewHeight} rx="16" fill="#e7eee9" />
        {tileLayout?.tiles?.map((tile) => (
          <image
            key={tile.key}
            href={tile.href}
            x={tile.x}
            y={tile.y}
            width="256"
            height="256"
            preserveAspectRatio="none"
          />
        ))}
        {!tileLayout && (
          <text x={viewWidth / 2} y="126" className="report-map-preview__fallback" textAnchor="middle">地点選択後に航空写真を表示します</text>
        )}
        <rect x="0" y="0" width={viewWidth} height={viewHeight} rx="16" fill="rgba(0,0,0,.06)" />
        <rect x={cx - rangePx} y={cy - rangePx} width={rangePx * 2} height={rangePx * 2} fill="rgba(25, 136, 102, .15)" stroke="#0f8367" strokeWidth="2.2" strokeDasharray="8 6" />
        <rect x={cx - innerPx} y={cy - innerPx} width={innerPx * 2} height={innerPx * 2} fill="rgba(255, 255, 255, .06)" stroke="rgba(255,255,255,.92)" strokeWidth="2" strokeDasharray="8 6" />
        <line x1={cx - rangePx} y1={cy} x2={cx + rangePx} y2={cy} stroke="#d84c3c" strokeWidth="4" strokeLinecap="round" />
        <line x1={cx} y1={cy - rangePx} x2={cx} y2={cy + rangePx} stroke="#d84c3c" strokeWidth="4" strokeLinecap="round" />
        <g opacity="0.5">
          <circle cx={cx} cy={cy} r="12" fill="#0f8062" stroke="#ffffff" strokeWidth="4" />
          <circle cx={cx} cy={cy} r="3.6" fill="#ffd24a" />
        </g>
        <text x={cx} y={Math.max(18, cy - rangePx - 8)} className="report-map-preview__dir" textAnchor="middle">北</text>
        <text x={cx} y={Math.min(viewHeight - 14, cy + rangePx + 18)} className="report-map-preview__dir" textAnchor="middle">南</text>
        <text x={Math.max(28, cx - rangePx - 14)} y={cy + 5} className="report-map-preview__dir" textAnchor="end">西</text>
        <text x={Math.min(viewWidth - 28, cx + rangePx + 14)} y={cy + 5} className="report-map-preview__dir" textAnchor="start">東</text>
        <text x={Math.max(34, cx - rangePx + 18)} y={Math.max(28, cy - rangePx + 32)} className="report-map-preview__tag">周辺{range}m確認範囲</text>
        <text x={cx + innerPx + 8} y={cy - innerPx + 22} className="report-map-preview__tag">50m確認線</text>
        <text x={Math.min(viewWidth - 180, cx + rangePx + 12)} y={cy + 5} className="report-map-preview__callout">東西 {axisLineLabel(eastWestLine, '西↔東')} / {lineAverageText(eastWestLine)}</text>
        <text x={cx - 38} y={Math.max(34, cy - rangePx - 18)} className="report-map-preview__callout report-map-preview__callout--dark">南北 {axisLineLabel(northSouthLine, '南↔北')} / {lineAverageText(northSouthLine)}</text>
        <line x1="30" y1={scaleY} x2={30 + scalePx} y2={scaleY} stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
        <line x1="30" y1={scaleY} x2={30 + scalePx} y2={scaleY} stroke="#0d5f4f" strokeWidth="3" strokeLinecap="round" />
        <text x={30 + scalePx / 2} y={scaleLabelY} className="report-map-preview__scale" textAnchor="middle">100 m</text>
        <text x={viewWidth - 18} y={creditY} className="report-map-preview__credit" textAnchor="end">国土地理院 全国最新写真（シームレス）</text>
      </svg>
      <p>
        実際の航空写真に、候補地点・確認範囲・東西/南北断面方向を重ねて表示しています。
      </p>
    </div>
  )
}

function formatReportGridDistance(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) return '—'
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(distanceMeters >= 10000 ? 0 : 1)} km`
  return `${Math.round(distanceMeters)} m`
}

function reportPointFromBearing(item, tileLayout) {
  if (!item || !tileLayout || !Number.isFinite(item.bearing) || !Number.isFinite(item.distanceMeters)) return null
  const radius = item.distanceMeters / tileLayout.metersPerPixel
  const rad = item.bearing * Math.PI / 180
  return {
    x: tileLayout.cx + Math.sin(rad) * radius,
    y: tileLayout.cy - Math.cos(rad) * radius,
  }
}

function reportLatLonToPoint(point, tileLayout) {
  if (!tileLayout || !Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return null
  const tilePoint = lonLatToTilePoint(point.lat, point.lon, tileLayout.zoom)
  return {
    x: tileLayout.offset.x + (tilePoint.x - tileLayout.startTileX) * tileLayout.tileSize,
    y: tileLayout.offset.y + (tilePoint.y - tileLayout.startTileY) * tileLayout.tileSize,
  }
}

function clipReportPoint(point, width, height, margin = 18) {
  if (!point) return null
  return {
    x: Math.max(margin, Math.min(width - margin, point.x)),
    y: Math.max(margin, Math.min(height - margin, point.y)),
  }
}

function buildReportLinePath(line, tileLayout, width, height) {
  const points = (line?.geometry || [])
    .map((point) => reportLatLonToPoint(point, tileLayout))
    .filter(Boolean)
    .filter((point) => point.x >= -80 && point.x <= width + 80 && point.y >= -80 && point.y <= height + 80)
  if (points.length < 2) return ''
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
}

function PowerGridReportMap({ position, data, lineMatch }) {
  const nearestLine = powerGridDisplayLine(data)
  const lineLabel = powerGridDisplayLineLabel(data)
  const nearestSubstation = data?.summary?.nearestSubstation
  const matchedLine = lineMatch?.capacity
  const farthestDistance = Math.max(
    Number.isFinite(nearestLine?.distanceMeters) ? nearestLine.distanceMeters : 0,
    Number.isFinite(nearestSubstation?.distanceMeters) ? nearestSubstation.distanceMeters : 0,
  )
  let mapZoom = 14
  while (mapZoom > 8 && farthestDistance / gsiMetersPerPixel(position?.lat || 35, mapZoom) > 160) mapZoom--
  const tileLayout = buildGsiAerialTileLayout(position, mapZoom, {
    cols: 7,
    rows: 5,
    width: 900,
    height: 440,
  })
  const viewWidth = tileLayout?.width || 900
  const viewHeight = tileLayout?.height || 440
  const cx = tileLayout?.cx || viewWidth / 2
  const cy = tileLayout?.cy || viewHeight / 2
  const linePoint = clipReportPoint(reportLatLonToPoint(nearestLine?.nearestPoint, tileLayout) || reportPointFromBearing(nearestLine, tileLayout), viewWidth, viewHeight, 28)
  const substationPoint = reportLatLonToPoint(nearestSubstation?.position, tileLayout) || reportPointFromBearing(nearestSubstation, tileLayout)
  const nearestLinePath = buildReportLinePath(nearestLine, tileLayout, viewWidth, viewHeight)
  const visibleContextLines = (data?.lines || [])
    .filter((line) => line.id !== nearestLine?.id)
    .filter((line) => Number.isFinite(line.voltageKv) ? line.voltageKv >= 33 && line.voltageKv <= 110 : false)
    .slice(0, 5)
    .map((line) => ({ line, path: buildReportLinePath(line, tileLayout, viewWidth, viewHeight) }))
    .filter((item) => item.path)

  return (
    <div className="report-power-grid-map" aria-label="候補地点と最寄り系統線の航空写真">
      <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} preserveAspectRatio="xMidYMid slice" role="img">
        <defs>
          <filter id="reportPowerGridTextShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#00291f" floodOpacity="0.72" />
          </filter>
        </defs>
        <rect x="0" y="0" width={viewWidth} height={viewHeight} rx="18" fill="#e7eee9" />
        {tileLayout?.tiles?.map((tile) => (
          <image
            key={tile.key}
            href={tile.href}
            x={tile.x}
            y={tile.y}
            width="256"
            height="256"
            preserveAspectRatio="none"
          />
        ))}
        {!tileLayout && (
          <text x={viewWidth / 2} y={viewHeight / 2} className="report-map-preview__fallback" textAnchor="middle">地点選択後に航空写真を表示します</text>
        )}
        <rect x="0" y="0" width={viewWidth} height={viewHeight} rx="18" fill="rgba(0,0,0,.08)" />
        {visibleContextLines.map(({ line, path }) => (
          <path
            key={line.id}
            d={path}
            fill="none"
            stroke={line.voltageKv >= 77 ? '#14b8c9' : '#3454d1'}
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.52"
          />
        ))}
        {nearestLinePath && (
          <path
            d={nearestLinePath}
            fill="none"
            stroke="#16a3a3"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
        )}
        <circle cx={cx} cy={cy} r="18" fill="#0f8062" stroke="#fff" strokeWidth="6" />
        <circle cx={cx} cy={cy} r="5" fill="#ffd24a" />
        <text x={cx} y={cy + 34} className="report-power-grid-map__center" textAnchor="middle">候補地</text>
        {linePoint && (
          <g>
            <line x1={cx} y1={cy} x2={linePoint.x} y2={linePoint.y} stroke="#ffffff" strokeDasharray="7 7" strokeWidth="3" opacity="0.95" />
            <line x1={cx} y1={cy} x2={linePoint.x} y2={linePoint.y} stroke="#0b6f63" strokeDasharray="7 7" strokeWidth="1.8" />
            <circle cx={linePoint.x} cy={linePoint.y} r="8" fill="#fff" stroke="#16a3a3" strokeWidth="4" />
            <text
              x={Math.min(viewWidth - 220, Math.max(24, linePoint.x + 14))}
              y={Math.max(24, linePoint.y - 14)}
              className="report-power-grid-map__label"
            >
              {lineLabel}：{nearestLine.name}
            </text>
            <text
              x={Math.min(viewWidth - 220, Math.max(24, linePoint.x + 14))}
              y={Math.max(42, linePoint.y + 6)}
              className="report-power-grid-map__label report-power-grid-map__label--sub"
            >
              {nearestLine.voltageLabel} / 候補地から{formatReportGridDistance(nearestLine.distanceMeters)}
            </text>
          </g>
        )}
        {substationPoint && (
          <g opacity="0.92">
            <line x1={cx} y1={cy} x2={substationPoint.x} y2={substationPoint.y} stroke="#7c3aed" strokeDasharray="4 6" strokeWidth="1.8" />
            <rect x={substationPoint.x - 7} y={substationPoint.y - 7} width="14" height="14" rx="3" fill="#7c3aed" stroke="#fff" strokeWidth="2" />
            <text
              x={Math.min(viewWidth - 300, Math.max(24, substationPoint.x + 12))}
              y={Math.min(viewHeight - 24, Math.max(24, substationPoint.y + 18))}
              className="report-power-grid-map__label report-power-grid-map__label--substation"
            >
              参考変電所：{nearestSubstation.name} / {formatReportGridDistance(nearestSubstation.distanceMeters)}
            </text>
          </g>
        )}
        <line x1="28" y1={viewHeight - 30} x2="118" y2={viewHeight - 30} stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
        <line x1="28" y1={viewHeight - 30} x2="118" y2={viewHeight - 30} stroke="#0d5f4f" strokeWidth="3" strokeLinecap="round" />
        <text x="73" y={viewHeight - 40} className="report-power-grid-map__small" textAnchor="middle">約 {formatReportGridDistance((tileLayout?.metersPerPixel || 0) * 90)}</text>
        <text x={viewWidth - 18} y={viewHeight - 12} className="report-map-preview__credit" textAnchor="end">国土地理院 全国最新写真（シームレス）</text>
      </svg>
      <div>
        <strong>位置関係</strong>
        <span>
          {lineLabel}まで{formatReportGridDistance(nearestLine?.distanceMeters)}。
          {nearestSubstation
            ? `参考変電所まで${formatReportGridDistance(nearestSubstation.distanceMeters)}。`
            : '参考変電所は公開地図上で位置を確認できませんでした。'}
          距離は候補地点からの直線距離です。
        </span>
        {matchedLine && (
          <span>公開空容量: {capacityValueStatusLabel(matchedLine.availableCapacityMw)} / 上位系考慮 {capacityValueStatusLabel(matchedLine.upstreamAvailableCapacityMw, { upstream: true })}</span>
        )}
      </div>
    </div>
  )
}

function PowerGridReportPage({ data, capacityData, capacityMatches, placeCapacityCandidates }) {
  const nearestLine = powerGridDisplayLine(data)
  const lineLabel = powerGridDisplayLineLabel(data)
  const nearestSubstation = data?.summary?.nearestSubstation
  const lineRows = (data?.lines || []).slice(0, 4)
  const substationRows = data?.substations?.slice(0, 3) || []
  const lineMatches = capacityMatches?.lineMatches || []
  const substationMatches = capacityMatches?.substationMatches || []
  const firstLineMatch = lineMatches.find((match) => match.source?.id === nearestLine?.id)
  const fetchedAt = data?.fetchedAt ? new Date(data.fetchedAt).toLocaleString('ja-JP') : '—'
  const sourceLabel =
    firstLineMatch?.capacity?.areaLabel ||
    capacityData?.areaLabel ||
    capacityData?.areas?.[0]?.label ||
    '中国電力NW'
  const firstCapacityMatch = firstLineMatch || substationMatches[0] || null
  const placeCandidateRows = [
    ...(placeCapacityCandidates?.lineCandidates || []),
    ...(placeCapacityCandidates?.substationCandidates || []),
  ].slice(0, 4)
  const firstPlaceCandidate = !firstCapacityMatch ? placeCandidateRows[0] || null : null
  const summaryCapacity = firstCapacityMatch?.capacity || firstPlaceCandidate?.capacity || null
  const searchRangeLabel = data?.search?.attemptedRadiiMeters?.length
    ? data.search.attemptedRadiiMeters.map((radius) => `${Math.round(radius / 1000)}km`).join(' → ')
    : `${Math.round((data?.radiusMeters || 5000) / 1000)}km`

  return (
    <ReportPage page="5" title="電力系統・公開空容量 一次確認" subtitle="候補地から近い系統線・参考変電所・公開空容量の整理">
      {!data ? (
        <div className="report-empty-panel">
            電力系統情報は未取得です。候補地点選択後に「周辺系統取得」で最寄り系統線と公開空容量資料を確認できます。
        </div>
      ) : (
        <>
          <PowerGridReportMap position={data.position} data={data} lineMatch={firstLineMatch} />
          <div className={`report-power-grid-summary ${summaryCapacity ? 'report-power-grid-summary--three' : 'report-power-grid-summary--two'}`}>
            <div>
              <span>{lineLabel}</span>
              <strong>{formatReportGridDistance(nearestLine?.distanceMeters)}</strong>
              <small>
                 {nearestLine?.direction ? `${nearestLine.direction}側 / ` : ''}
                 {nearestLine?.voltageLabel || '電圧未記載'} / {nearestLine?.name || '候補なし'}
                 {nearestLine?.positionConfidence?.label ? ` / ${nearestLine.positionConfidence.label}` : ''}
              </small>
            </div>
            <div>
              <span>参考変電所</span>
              <strong>{formatReportGridDistance(nearestSubstation?.distanceMeters)}</strong>
              <small>
                {nearestSubstation?.direction ? `${nearestSubstation.direction}側 / ` : ''}
                {nearestSubstation?.name || '候補なし'}
              </small>
            </div>
            {summaryCapacity && (
              <div>
                <span>{firstCapacityMatch ? '公開空容量' : '公式DB地名候補'}</span>
                <strong>{capacityValueStatusLabel(summaryCapacity.availableCapacityMw)}</strong>
                <small>
                  {summaryCapacity.name}
                  {firstCapacityMatch?.match?.label ? ` / ${firstCapacityMatch.match.label}` : ''}
                  {firstPlaceCandidate ? ' / 距離未確定' : ''}
                  {summaryCapacity.upstreamAvailableCapacityMw != null
                    ? ` / 上位系 ${capacityValueStatusLabel(summaryCapacity.upstreamAvailableCapacityMw, { upstream: true })}`
                    : ''}
                </small>
              </div>
            )}
          </div>

          {data.search?.targetVoltagesKv?.length > 0 && <p className="report-note">{powerGridSearchSummary(data)} 接続可否・空容量の確定を意味するものではありません。</p>}

          {(lineMatches.length > 0 || substationMatches.length > 0) && (
            <div className="report-power-grid-capacity">
              <h3>公開空容量の照合結果</h3>
              <div className="report-power-grid-capacity__grid">
                {[...lineMatches, ...substationMatches].slice(0, 4).map((match) => (
                  <div key={`${match.capacity.type}-${match.capacity.no}-${match.source.id}`}>
                    {(() => {
                      const flow = summarizeGridFlowDirection(match.capacity)
                      return (
                        <>
                    <strong>{match.capacity.name}</strong>
                    <small>{match.match?.label || '名称候補による照合'}</small>
                    <span>空容量 {capacityValueStatusLabel(match.capacity.availableCapacityMw)}</span>
                    <small>
                      上位系考慮 {capacityValueStatusLabel(match.capacity.upstreamAvailableCapacityMw, { upstream: true })}
                      {match.capacity.nMinusOne ? ` / N-1 ${match.capacity.nMinusOne}` : ''}
                    </small>
                    {flow.status === 'published' && (
                      <small>公開予想潮流 {flow.label} / 系統上位・下位 未確定</small>
                    )}
                    <small>地図候補: {match.source.name}（{formatReportGridDistance(match.source.distanceMeters)}）</small>
                        </>
                      )
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!firstCapacityMatch && placeCandidateRows.length > 0 && (
            <div className="report-power-grid-capacity">
              <h3>公式DBの地名一致候補（距離未確定）</h3>
              <div className="report-power-grid-capacity__grid">
                {placeCandidateRows.map((candidate) => (
                  <div key={`report-place-${candidate.capacity.type}-${candidate.capacity.no}`}>
                    {(() => {
                      const record = candidate.capacity
                      const flow = summarizeGridFlowDirection(record)
                      const voltage = Number.isFinite(record.voltageKv)
                        ? `${record.voltageKv} kV${Number.isFinite(record.secondaryVoltageKv) ? ` / 二次 ${record.secondaryVoltageKv} kV` : ''}`
                        : '電圧記載なし'
                      return (
                        <>
                          <strong>{record.name}</strong>
                          <small>
                            {record.type === 'substation' ? '変電所' : '送電線'} / 設備番号 {record.no || '記載なし'} / {voltage}
                          </small>
                          <span>空容量 {capacityValueStatusLabel(record.availableCapacityMw)}</span>
                          <small>
                            上位系 {capacityValueStatusLabel(record.upstreamAvailableCapacityMw, { upstream: true })}
                            {record.nMinusOne ? ` / N-1 ${record.nMinusOne}` : ''}
                          </small>
                          {flow.status === 'published' && <small>公開予想潮流 {flow.label}</small>}
                          <small>位置座標なし / 最寄り設備とは未確定</small>
                        </>
                      )
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="report-power-grid-lists">
            <div>
              <h3>距離順の系統線候補</h3>
              {lineRows.length ? (
                <ol>
                  {lineRows.map((line) => (
                    <li key={line.id}>
                      <strong>{line.name}</strong>
                      <span>
                        {line.voltageLabel} / {line.voltageBand} / {line.direction ? `${line.direction}側 / ` : ''}
                        {formatReportGridDistance(line.distanceMeters)}
                        {line.positionConfidence?.label ? ` / ${line.positionConfidence.label}` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
                ) : <p>周辺で系統線候補を確認できませんでした。</p>}
            </div>
            <div>
              <h3>参考変電所（距離順）</h3>
              <ol>
                {substationRows.map((substation) => (
                  <li key={substation.id}>
                    <strong>{substation.name}</strong>
                    <span>
                      変電所候補 / {substation.voltageLabel} / {substation.direction ? `${substation.direction}側 / ` : ''}
                      {formatReportGridDistance(substation.distanceMeters)}
                    </span>
                  </li>
                ))}
                  {!substationRows.length && <li><span>周辺で変電所候補を確認できませんでした。</span></li>}
              </ol>
            </div>
          </div>

          <div className="report-power-grid-note">
            <strong>情報の区分</strong>
            <span>
              地図欄は公開地図上の位置と直線距離、空容量欄は中国電力NW公式DBの公表値です。
              地名一致候補は設備座標がないため、候補地からの距離を確定していません。
            </span>
          </div>
          <p className="report-note">
            位置情報: OpenStreetMap / Overpass API（取得 {fetchedAt}、段階検索 {searchRangeLabel}）。
            空容量資料: {sourceLabel}{capacityData?.updatedAt ? `（${capacityData.updatedAt}）` : ''}。
            公開空容量は名称・設備番号・電圧の一致条件を表示します。位置確認度が「参考」の設備は公式資料で再確認してください。
            予想潮流は公開CSVの記載値です。潮流方向だけで系統上位・下位は判定しません。
          </p>
        </>
      )}
    </ReportPage>
  )
}

export default function ReportPreview({ report }) {
  const terrain = report.terrain
  const station = report.snowStation
  const solarReference = report.solarReference
  const reportTerrainSection = normalizeReportTerrainSection(report.terrainSection)
  const reportTerrainRange = reportTerrainSection?.rangeMeters || 100
  const reportTitle = report.siteName || report.placeLabel || '名称未入力の候補地'
  const demSummary = demSourceSummary(report)
  const verdict = evaluateSiteVerdict({
    position: report.position,
    terrain,
    solarReference,
    snowStation: station,
    meshBoundary: report.meshBoundary,
    demSummary,
    terrainSection: reportTerrainSection || report.terrainSection,
  })
  const verdictReasons = primaryVerdictReasons(verdict, 3)
  const buildDate = report.buildDate || '—'
  const appVersion = report.appVersion || '—'
  const editHints = {
    siteName: '2. 候補地情報確認の「候補地名」で編集できます。',
    parcel: '地番ファイルを読み込み、地図上の筆界クリックまたは地番検索で選択できます。',
    memo: '2. 候補地情報確認の「候補地メモ」で編集できます。',
    fieldMemo: '2. 候補地情報確認の「現地確認メモ」で編集できます。',
  }

  return (
    <section className="report-card report-card--print-set" id="report-preview">
      <ReportPage page="1" title="候補地チェックレポート" subtitle={reportTitle} className="report-cover-page">
        <div className="report-cover-layout">
          <div>
            <p className="report-cover-kicker">Solar Site Precheck</p>
            <h3 className="report-title-hint" title={editHints.siteName}>{reportTitle}</h3>
            {report.siteName && report.placeLabel && report.siteName !== report.placeLabel && (
              <p className="report-card__place">選択地点：{report.placeLabel}</p>
            )}
            <p>地形・地平線・積雪をSolar Pro入力前に確認するための一次検討レポートです。</p>
          </div>
          <dl className="report-cover-summary">
            <div><dt>用途</dt><dd>候補地の一次確認</dd></div>
            <div><dt>一次確認</dt><dd><span className={`verdict-badge verdict-badge--${verdict.status}`}>{verdict.label}</span></dd></div>
            <div><dt>3次メッシュ</dt><dd>{report.expectedSnowMesh || '—'}</dd></div>
            <div><dt>作成</dt><dd>Solar Site Precheck v{appVersion}</dd></div>
          </dl>
        </div>
        <div className={`report-verdict report-verdict--${verdict.status}`}>
          <strong>
            Solar Pro入力前の一次確認
            <span
              className="help-tooltip help-tooltip--below report-verdict__help no-print"
              tabIndex="0"
              aria-label={`一次確認の主な基準。${verdictCriteriaText()}`}
            >
              ?
              <span className="help-tooltip__body" role="tooltip">
                事業可否の最終判定ではなく、Solar Pro入力前に重点確認する項目を整理します。<br />
                最大地平線角：5°以上は確認、2°以上はやや高め。<br />
                積雪10cm以上出現率：0.50以上は注意、0.01以上は補正確認。<br />
                周辺断面：高低差5m超は造成・進入路確認。
              </span>
            </span>
          </strong>
          <span>{verdict.summary}</span>
          {verdictReasons.length > 0 && (
            <ul>
              {verdictReasons.map((reason) => (
                <li key={`${reason.title}-${reason.detail}`}>
                  <b>{reason.title}</b>{reason.detail ? `：${reason.detail}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
        <dl className="report-grid report-grid--two-col report-grid--cover-data">
          <ValueRow label="緯度（度・分）">{report.position ? toDegreeMinutes(report.position.lat, 'lat') : '—'}</ValueRow>
          <ValueRow label="経度（度・分）">{report.position ? toDegreeMinutes(report.position.lon, 'lon') : '—'}</ValueRow>
          <ValueRow label="候補地点3次メッシュ">{report.expectedSnowMesh || '—'}</ValueRow>
          <ValueRow label="メッシュ境界距離">{report.meshBoundary ? `約${Math.round(report.meshBoundary.minDistanceMeters)}m` : '—'}</ValueRow>
          <ValueRow label="標高">{Number.isFinite(report.elevation) ? `${report.elevation.toFixed(1)} m` : '未取得'}</ValueRow>
          <ValueRow label="標高データ">{report.elevationSource}</ValueRow>
          <ValueRow label="標高精度">{<span className={`dem-quality dem-quality--${demSummary.level}`}>{demSummary.label}</span>}</ValueRow>
          <ValueRow label="想定樹高">{`${report.obstructionHeight.toFixed(1)} m（保守設定）`}</ValueRow>
          <ValueRow label="地番" hint={editHints.parcel}>{report.parcel?.number || '未選択'}</ValueRow>
          <ValueRow label="地番所在地" hint={editHints.parcel}>{report.parcel ? [report.parcel.municipality, report.parcel.area].filter(Boolean).join(' ') : '—'}</ValueRow>
          <ValueRow label="候補地メモ" wide hint={editHints.memo}>{report.memo}</ValueRow>
          <ValueRow label="現地確認メモ" wide hint={editHints.fieldMemo}>{report.fieldMemo}</ValueRow>
        </dl>
        {report.meshBoundary?.isNearBoundary && (
          <div className="report-alert report-alert--watch">
            <strong>3次メッシュ境界付近</strong>
            <span>候補地点は3次メッシュ境界まで約{Math.round(report.meshBoundary.minDistanceMeters)}mです。積雪出現率は隣接メッシュで変わる可能性があります。</span>
          </div>
        )}
      </ReportPage>

      <ReportPage page="2" title="太陽軌道・地平線グラフ" subtitle="冬至9〜15時の太陽高度と、DEM地平線角度の比較" className="report-horizon-print-page">
        {reportTerrainSection ? (
          <ReportTerrainMapPreview analysis={reportTerrainSection} position={report.position} />
        ) : (
          <div className="report-map-preview report-map-preview--empty">
            <strong>断面方向確認図</strong>
            <span>周辺断面を取得すると、次ページの東西・南北断面の基準図を表示します。</span>
          </div>
        )}
        <div className="report-visual-panel report-visual-panel--single">
          {terrain ? (
            <HorizonGraphPreview
              position={report.position}
              terrain={terrain}
              solarReference={solarReference}
              obstructionHeight={report.obstructionHeight}
              reportMode
            />
          ) : (
            <div className="report-empty-panel">地平線グラフは未分析です。</div>
          )}
        </div>
        {solarReference && (
          <div className={`report-alert report-alert--${solarReference.status}`}>
            <strong>太陽高度比較</strong>
            <span>{solarReference.message}</span>
          </div>
        )}
      </ReportPage>

      <ReportPage page="3" title="候補地周辺断面" subtitle={`東西・南北${reportTerrainRange}m断面`} className="report-section-print-page">
        <div className="report-visual-panel report-visual-panel--single report-section-page">
          {reportTerrainSection ? (
            <TerrainSectionPreview analysis={reportTerrainSection} forceSlopeDetails reportMode />
          ) : (
            <div className="report-empty-panel">周辺100m断面は未取得です。</div>
          )}
        </div>
      </ReportPage>

      <ReportPage page="4" title="NEDOデータ・出典・計算条件" subtitle="積雪補正値と採用データの確認">
        <div className="report-data-block report-data-block--compact">
          <h3>NEDO MONSOLA-11 積雪深10cm以上の出現率・発電量係数</h3>
          {station ? (
            <>
              <p className="report-source-line">
                {station.name} / 北緯 {station.latDeg}度 {station.latMin.toFixed(1)}分 / 東経 {station.lonDeg}度 {station.lonMin.toFixed(1)}分 / 標高 {Number.isFinite(station.elevation) ? `${station.elevation}m` : 'PDF読取未確定'}
              </p>
              <SnowCompactTable station={station} snowBase={report.snowBase} />
              <p className="formula-note formula-note--with-legend">
                <span className="formula-note__main">発電量係数 = {report.snowBase.toFixed(2)} − 積雪深10cm以上の出現率</span>
                <span className="formula-note__legend"><span className="snow-legend__notice">0.01以上</span> は着色、<strong className="snow-legend__alert">0.50以上は ❄ 積雪注意</strong></span>
              </p>
            </>
          ) : (
            <p className="report-empty-panel">NEDO積雪データは未取得です。</p>
          )}
        </div>

        <div className="report-data-block report-source-block">
          <h3>データ出典・計算条件</h3>
          <dl>
            <div>
              <dt>標高</dt>
              <dd>{report.elevationSource || '未取得'} / 取得 {buildDate}</dd>
            </div>
            <div>
              <dt>標高精度</dt>
              <dd><span className={`dem-quality dem-quality--${demSummary.level}`}>{demSummary.label}</span> <small>{demSummary.detail}</small></dd>
            </div>
            <div>
              <dt>積雪・日射</dt>
              <dd>NEDO MONSOLA-11（1981–2009年平年値）{report.expectedSnowMesh ? ` / 3次メッシュ ${report.expectedSnowMesh}` : ''}</dd>
            </div>
            <div>
              <dt>座標・地番</dt>
              <dd>緯度経度表示。登記所備付地図データはファイル定義の平面直角座標系に基づき変換。</dd>
            </div>
            <div>
              <dt>計算</dt>
              <dd>Solar Site Precheck v{appVersion} / DEM点サンプリング概算 / 想定樹高 {report.obstructionHeight.toFixed(1)}m（周辺樹木を保守的に加算）</dd>
            </div>
          </dl>
          {demSummary.shouldWarn && (
            <p className="report-source-warning">※ 地平線・断面の取得点で10mメッシュ相当のDEMが多いため、山林・急傾斜地では現地確認や詳細測量で補正してください。</p>
          )}
        </div>
        <p className="report-note">
          ※ 地平線は国土地理院DEMによる概算です。積雪値は候補地点と同じ3次メッシュのNEDO値だけを採用し、最寄り観測地点の参考値は係数計算から除外しています。
        </p>
      </ReportPage>
      {report.powerGrid && (
        <PowerGridReportPage
          data={report.powerGrid}
          capacityData={report.gridCapacity}
          capacityMatches={report.capacityMatches}
          placeCapacityCandidates={report.placeCapacityCandidates}
        />
      )}
    </section>
  )
}
