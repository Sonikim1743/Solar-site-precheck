import { interpolateHorizonAngle, solarPositionAtHour } from '../utils/solarWindow.js'

const graph = {
  width: 720,
  height: 382,
  left: 48,
  right: 24,
  top: 24,
  bottom: 70,
}

const plotWidth = graph.width - graph.left - graph.right
const plotHeight = graph.height - graph.top - graph.bottom

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function xForBearing(bearing) {
  return graph.left + (clamp(bearing, 0, 360) / 360) * plotWidth
}

function yForAltitude(altitude) {
  return graph.top + plotHeight - (clamp(altitude, 0, 90) / 90) * plotHeight
}

function interpolateSampleValue(samples, bearing, key) {
  const source = samples
    ?.filter((sample) => Number.isFinite(sample.bearing) && Number.isFinite(sample[key]))
    .map((sample) => ({ bearing: sample.bearing, angle: sample[key] }))
  return interpolateHorizonAngle(source, bearing)
}

function buildHorizonSeries(samples, key = 'angle', step = 5) {
  const points = []
  for (let bearing = 0; bearing <= 360; bearing += step) {
    const angle = interpolateSampleValue(samples, bearing === 360 ? 0 : bearing, key)
    if (Number.isFinite(angle)) {
      points.push({ bearing, angle })
    }
  }
  return points
}

function pointsToPolyline(points) {
  return points
    .map((point) => `${xForBearing(point.bearing).toFixed(1)},${yForAltitude(point.angle).toFixed(1)}`)
    .join(' ')
}

function pointsToArea(points) {
  if (!points.length) return ''
  const line = pointsToPolyline(points)
  const first = points[0]
  const last = points[points.length - 1]
  return [
    `${xForBearing(first.bearing).toFixed(1)},${yForAltitude(0).toFixed(1)}`,
    line,
    `${xForBearing(last.bearing).toFixed(1)},${yForAltitude(0).toFixed(1)}`,
  ].join(' ')
}

function buildSolarPath(lat, declination) {
  const points = []
  for (let hour = 4; hour <= 20; hour += 0.25) {
    const solar = solarPositionAtHour(lat, hour, declination)
    if (solar.altitude > 0.2 && solar.azimuth >= 0 && solar.azimuth <= 360) {
      points.push({ bearing: solar.azimuth, angle: solar.altitude, hour })
    }
  }
  return points.sort((a, b) => a.bearing - b.bearing)
}

function solarDeclinationForDay(dayOfYear) {
  const gamma = (2 * Math.PI * (dayOfYear - 1)) / 365
  return (180 / Math.PI) * (
    0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma)
    + 0.00148 * Math.sin(3 * gamma)
  )
}

function equationOfTimeMinutes(dayOfYear) {
  const gamma = (2 * Math.PI * (dayOfYear - 1)) / 365
  return 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  )
}

function buildSolarHourGuide(position, hour) {
  const standardMeridian = 135
  const lonCorrectionMinutes = Number.isFinite(position?.lon) ? 4 * (position.lon - standardMeridian) : 0
  const points = []
  for (let day = 1; day <= 365; day += 3) {
    const declination = solarDeclinationForDay(day)
    const solarTime = hour + (equationOfTimeMinutes(day) + lonCorrectionMinutes) / 60
    const solar = solarPositionAtHour(position.lat, solarTime, declination)
    if (solar.altitude > 0.2 && solar.azimuth >= 0 && solar.azimuth <= 360) {
      points.push({ bearing: solar.azimuth, angle: solar.altitude, hour, day })
    }
  }
  return points
}

function guideLabelPoint(points) {
  if (!points?.length) return null
  return points.reduce((best, point) => point.angle > best.angle ? point : best, points[0])
}

function formatPeakPoint(point) {
  return `${point.hour}時 太陽${point.altitude.toFixed(1)}° / 山・木${Number.isFinite(point.horizonAngle) ? point.horizonAngle.toFixed(1) : '—'}°`
}

function pointTooltip(point) {
  const horizon = Number.isFinite(point.horizonAngle) ? ` / 山・木 ${point.horizonAngle.toFixed(1)}°` : ''
  const margin = Number.isFinite(point.margin) ? ` / 余裕 ${point.margin.toFixed(1)}°` : ''
  return `${point.hour}時：太陽高度 ${point.altitude.toFixed(1)}° / 方位 ${point.azimuth.toFixed(0)}°${horizon}${margin}`
}

export default function HorizonGraphPreview({ position, terrain, solarReference, reportMode = false }) {
  const samples = terrain?.samples || []
  if (!position || !samples.length) return null

  const horizonPoints = buildHorizonSeries(samples, 'angle')
  const terrainOnlyPoints = buildHorizonSeries(samples, 'terrainAngle')
  const summerPath = buildSolarPath(position.lat, 23.44)
  const equinoxPath = buildSolarPath(position.lat, 0)
  const winterPath = buildSolarPath(position.lat, -23.44)
  const peakPoints = solarReference?.peakWindow?.points || []
  const reportPeakPoints = peakPoints.filter((point) => [9, 10, 12, 14, 15].includes(Number(point.hour)))
  const tightest = solarReference?.peakWindow?.tightest
  const guideHours = reportMode
    ? [8, 10, 11, 12, 13, 14, 16]
    : [10, 12, 14]

  return (
    <section className={`horizon-graph-card ${reportMode ? 'horizon-graph-card--report' : ''}`} aria-label="地平線グラフプレビュー">
      <div className="horizon-graph-card__heading">
        <div>
          <strong>地平線グラフプレビュー</strong>
          <span>Solar Site Precheck独自の簡易グラフです。Solar Pro公式画面・公式出力ではありません。</span>
        </div>
        <em>概算確認用</em>
      </div>

      <div className="horizon-graph-scroll">
        <svg className="horizon-graph" viewBox={`0 0 ${graph.width} ${graph.height}`} role="img">
          <title>方位角と高度角による地平線・太陽軌道プレビュー</title>
          <rect className="horizon-graph__sky" x={graph.left} y={graph.top} width={plotWidth} height={plotHeight} />
          {[0, 30, 60, 90].map((altitude) => (
            <g key={`alt-${altitude}`}>
              <line className="horizon-graph__grid" x1={graph.left} x2={graph.width - graph.right} y1={yForAltitude(altitude)} y2={yForAltitude(altitude)} />
              <text className="horizon-graph__axis-text" x={graph.left - 10} y={yForAltitude(altitude) + 4} textAnchor="end">{altitude}</text>
            </g>
          ))}
          {[0, 45, 90, 135, 180, 225, 270, 315, 360].map((bearing) => (
            <g key={`bearing-${bearing}`}>
              <line className="horizon-graph__grid" x1={xForBearing(bearing)} x2={xForBearing(bearing)} y1={graph.top} y2={graph.top + plotHeight} />
              <text className="horizon-graph__axis-text" x={xForBearing(bearing)} y={graph.top + plotHeight + 17} textAnchor="middle">{bearing}°</text>
            </g>
          ))}

          <text className="horizon-graph__label" x={18} y={graph.top + 100} transform={`rotate(-90 18 ${graph.top + 100})`}>高度角[°]</text>
          <text className="horizon-graph__label" x={graph.left + plotWidth / 2} y={graph.height - 12} textAnchor="middle">方位角[°]</text>

          {horizonPoints.length > 0 && (
            <polygon className="horizon-graph__horizon-area" points={pointsToArea(horizonPoints)} />
          )}
          {terrainOnlyPoints.length > 0 && (
            <polyline className="horizon-graph__terrain-line" points={pointsToPolyline(terrainOnlyPoints)} />
          )}
          {horizonPoints.length > 0 && (
            <polyline className="horizon-graph__horizon-line" points={pointsToPolyline(horizonPoints)} />
          )}

          <polyline className="horizon-graph__sun horizon-graph__sun--summer" points={pointsToPolyline(summerPath)} />
          <polyline className="horizon-graph__sun horizon-graph__sun--equinox" points={pointsToPolyline(equinoxPath)} />
          <polyline className="horizon-graph__sun horizon-graph__sun--winter" points={pointsToPolyline(winterPath)} />

          {reportMode && guideHours.map((hour) => {
            const guide = buildSolarHourGuide(position, hour)
            if (guide.length < 2) return null
            const labelPoint = guideLabelPoint(guide)
            return (
              <g key={`guide-${hour}`} className="horizon-graph__hour-guide">
                <polyline points={pointsToPolyline(guide)} />
                {labelPoint && (
                  <text x={xForBearing(labelPoint.bearing) + 5} y={yForAltitude(labelPoint.angle) + 3}>{hour}h</text>
                )}
              </g>
            )
          })}

          {peakPoints.map((point) => {
            const isTightest = tightest?.hour === point.hour
            return (
              <g key={point.hour} className={`horizon-graph__peak ${isTightest ? 'horizon-graph__peak--tightest' : ''}`}>
                <title>{pointTooltip(point)}</title>
                <circle cx={xForBearing(point.azimuth)} cy={yForAltitude(point.altitude)} r={isTightest ? 5 : 3.5} />
                <text x={xForBearing(point.azimuth)} y={yForAltitude(point.altitude) - 9} textAnchor="middle">{point.hour}h</text>
              </g>
            )
          })}

          <text className="horizon-graph__direction" x={xForBearing(0)} y={graph.top + plotHeight + 39} textAnchor="middle">北</text>
          <text className="horizon-graph__direction" x={xForBearing(90)} y={graph.top + plotHeight + 39} textAnchor="middle">東</text>
          <text className="horizon-graph__direction" x={xForBearing(180)} y={graph.top + plotHeight + 39} textAnchor="middle">南</text>
          <text className="horizon-graph__direction" x={xForBearing(270)} y={graph.top + plotHeight + 39} textAnchor="middle">西</text>
          <text className="horizon-graph__direction" x={xForBearing(360)} y={graph.top + plotHeight + 39} textAnchor="middle">北</text>
        </svg>
      </div>

      <div className="horizon-graph-legend">
        <span><i className="legend-line legend-line--horizon" />地平線（地形＋想定樹高）</span>
        <span><i className="legend-line legend-line--terrain" />地形のみ</span>
        <span><i className="legend-line legend-line--summer" />夏至</span>
        <span><i className="legend-line legend-line--equinox" />春分・秋分</span>
        <span><i className="legend-line legend-line--winter" />冬至</span>
      </div>

      {peakPoints.length > 0 && (
        <div className={`horizon-graph-peak horizon-graph-peak--${solarReference?.peakWindow?.status || 'ok'}`}>
          <strong>冬至9〜15時チェック</strong>
          <span>{(reportMode ? reportPeakPoints : peakPoints).map(formatPeakPoint).join(' / ')}</span>
        </div>
      )}
    </section>
  )
}
