import { useState } from 'react'

const graphWidth = 620
const graphHeight = 210
const padding = { left: 42, right: 18, top: 20, bottom: 34 }
const plotWidth = graphWidth - padding.left - padding.right
const plotHeight = graphHeight - padding.top - padding.bottom

function valueText(value, digits = 1, suffix = '') {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '—'
}

function profileStats(line) {
  const s = line.summary || {}
  return [
    `最高 ${valueText(s.maxElevation, 1, 'm')}`,
    `最低 ${valueText(s.minElevation, 1, 'm')}`,
    `平均勾配 ${valueText(s.averageSlopePercent, 1, '%')}`,
    `最大勾配 ${valueText(s.maxSlopePercent, 1, '%')}`,
  ].join(' / ')
}

function slopeDirectionText(line) {
  const diff = line.summary?.elevationDiff
  const from = line.negativeDirection || '左'
  const to = line.positiveDirection || '右'
  if (!Number.isFinite(diff) || Math.abs(diff) < 0.1) return `${from}→${to} ほぼ水平`
  return `${from}→${to} ${diff > 0 ? '上り' : '下り'}`
}

function heightDiffNotice(line) {
  const diff = line.summary?.elevationDiff
  if (!Number.isFinite(diff) || Math.abs(diff) <= 5) return null
  const from = line.negativeDirection || '左'
  const to = line.positiveDirection || '右'
  return `${from}→${to}で${diff > 0 ? '+' : ''}${diff.toFixed(1)}m`
}

function pointToChart(point, minElevation, maxElevation, rangeMeters) {
  const span = Math.max(1, maxElevation - minElevation)
  return {
    x: padding.left + ((point.distance + rangeMeters) / (rangeMeters * 2)) * plotWidth,
    y: padding.top + plotHeight - ((point.elevation - minElevation) / span) * plotHeight,
  }
}

function steepestSegment(line) {
  const valid = (line.points || []).filter((point) => Number.isFinite(point.elevation))
  let best = null
  for (let index = 1; index < valid.length; index += 1) {
    const start = valid[index - 1]
    const end = valid[index]
    const distance = Math.abs(end.distance - start.distance)
    if (!distance) continue
    const elevationDelta = end.elevation - start.elevation
    const slopePercent = Math.abs(elevationDelta / distance) * 100
    const angle = (Math.atan2(Math.abs(elevationDelta), distance) * 180) / Math.PI
    if (!best || slopePercent > best.slopePercent) {
      best = {
        start,
        end,
        slopePercent,
        angle,
        elevationDelta,
      }
    }
  }
  return best
}

function slopeSegments(line) {
  const valid = (line.points || []).filter((point) => Number.isFinite(point.elevation))
  const segments = []
  for (let index = 1; index < valid.length; index += 1) {
    const start = valid[index - 1]
    const end = valid[index]
    const distance = Math.abs(end.distance - start.distance)
    if (!distance) continue
    const elevationDelta = end.elevation - start.elevation
    const slopePercent = Math.abs(elevationDelta / distance) * 100
    const angle = (Math.atan2(Math.abs(elevationDelta), distance) * 180) / Math.PI
    segments.push({
      start,
      end,
      slopePercent,
      angle,
      direction: elevationDelta >= 0 ? '上り' : '下り',
    })
  }
  return segments
}

function slopeLevel(segment) {
  if (!segment || !Number.isFinite(segment.angle)) return 'low'
  if (segment.angle >= 8) return 'high'
  if (segment.angle >= 4) return 'medium'
  return 'low'
}

function steepestSegmentText(line) {
  const segment = steepestSegment(line)
  if (!segment) return '最大10m勾配 —'
  const direction = segment.elevationDelta >= 0 ? '上り' : '下り'
  return `最大10m勾配 ${segment.slopePercent.toFixed(1)}%（約${segment.angle.toFixed(1)}°・${direction}）`
}

function ReportMetric({ label, value, note }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note && <small>{note}</small>}
    </div>
  )
}

function TerrainProfileMetrics({ line, steepest, diffNotice }) {
  const range = line.rangeMeters || 100
  const s = line.summary || {}
  const direction = steepest?.elevationDelta >= 0 ? '上り' : '下り'
  const steepestValue = steepest
    ? `${steepest.angle.toFixed(1)}° / ${steepest.slopePercent.toFixed(1)}%`
    : '—'
  const steepestNote = steepest
    ? `${steepest.start.distance}m→${steepest.end.distance}m・${direction}`
    : ''

  return (
    <aside className="terrain-section-chart__metrics" aria-label={`${line.label} 数値サマリー`}>
      <h4>断面数値</h4>
      <dl>
        <ReportMetric
          label="方向"
          value={slopeDirectionText(line)}
          note={`${line.negativeDirection || '左'} -${range}m / 候補地 / ${line.positiveDirection || '右'} +${range}m`}
        />
        <ReportMetric
          label="最高 / 最低"
          value={`${valueText(s.maxElevation, 1, 'm')} / ${valueText(s.minElevation, 1, 'm')}`}
        />
        <ReportMetric
          label="端点高低差"
          value={valueText(s.elevationDiff, 1, 'm')}
          note={diffNotice || '±5m以内は大きな高低差なし'}
        />
        <ReportMetric
          label="平均勾配"
          value={valueText(s.averageSlopePercent, 1, '%')}
        />
        <ReportMetric
          label="最大10m勾配"
          value={steepestValue}
          note={steepestNote}
        />
      </dl>
    </aside>
  )
}

function overallTerrainSummary(analysis) {
  const lines = analysis?.lines || []
  const steepSegments = lines
    .map((line) => ({ line, segment: steepestSegment(line) }))
    .filter((item) => item.segment)
  const steepest = steepSegments.sort((a, b) => b.segment.slopePercent - a.segment.slopePercent)[0]
  const elevationDiffs = lines
    .map((line) => line.summary?.elevationDiff)
    .filter((value) => Number.isFinite(value))
  const maxAbsDiff = elevationDiffs.length
    ? elevationDiffs.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, elevationDiffs[0])
    : null
  return {
    maxElevation: analysis?.summary?.maxElevation,
    minElevation: analysis?.summary?.minElevation,
    maxAbsDiff,
    steepest,
  }
}

function TerrainSectionSummary({ analysis }) {
  const summary = overallTerrainSummary(analysis)
  const range = analysis?.rangeMeters || 100
  return (
    <div className="terrain-section-summary">
      <div>
        <span>確認範囲</span>
        <strong>候補地±{range}m</strong>
      </div>
      <div>
        <span>最高 / 最低</span>
        <strong>{valueText(summary.maxElevation, 1, 'm')} / {valueText(summary.minElevation, 1, 'm')}</strong>
      </div>
      <div>
        <span>最大高低差</span>
        <strong>{Number.isFinite(summary.maxAbsDiff) ? `${summary.maxAbsDiff > 0 ? '+' : ''}${summary.maxAbsDiff.toFixed(1)}m` : '—'}</strong>
      </div>
      <div>
        <span>最大10m勾配</span>
        <strong>{summary.steepest ? `${summary.steepest.line.label} ${summary.steepest.segment.angle.toFixed(1)}°` : '—'}</strong>
      </div>
    </div>
  )
}

function makePath(points, minElevation, maxElevation, rangeMeters) {
  const span = Math.max(1, maxElevation - minElevation)
  return points
    .filter((point) => Number.isFinite(point.elevation))
    .map((point, index) => {
      const x = padding.left + ((point.distance + rangeMeters) / (rangeMeters * 2)) * plotWidth
      const y = padding.top + plotHeight - ((point.elevation - minElevation) / span) * plotHeight
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

function makeArea(points, minElevation, maxElevation, rangeMeters) {
  const path = makePath(points, minElevation, maxElevation, rangeMeters)
  if (!path) return ''
  const firstX = padding.left
  const lastX = padding.left + plotWidth
  const baseY = padding.top + plotHeight
  return `${path} L ${lastX.toFixed(1)} ${baseY.toFixed(1)} L ${firstX.toFixed(1)} ${baseY.toFixed(1)} Z`
}

function TerrainProfileChart({ line, minElevation, maxElevation, showSlopeDetails, reportMode }) {
  const range = line.rangeMeters || 100
  const interval = line.intervalMeters || 10
  const diffNotice = heightDiffNotice(line)
  const sitePoint = (line.points || [])
    .filter((point) => Number.isFinite(point?.distance) && Number.isFinite(point?.elevation))
    .reduce((closest, point) => (
      !closest || Math.abs(point.distance) < Math.abs(closest.distance) ? point : closest
    ), null)
  const siteElevationText = sitePoint ? `標高 ${sitePoint.elevation.toFixed(1)}m` : ''
  const distanceTicks = Array.from(
    { length: Math.floor((range * 2) / interval) + 1 },
    (_, index) => -range + index * interval,
  )
  const path = makePath(line.points, minElevation, maxElevation, range)
  const area = makeArea(line.points, minElevation, maxElevation, range)
  const steepest = steepestSegment(line)
  const segments = slopeSegments(line)
  const span = Math.max(1, maxElevation - minElevation)
  const steepestStart = steepest ? pointToChart(steepest.start, minElevation, maxElevation, range) : null
  const steepestEnd = steepest ? pointToChart(steepest.end, minElevation, maxElevation, range) : null
  const steepestLabel = steepest && steepestStart && steepestEnd
    ? {
        x: (steepestStart.x + steepestEnd.x) / 2,
        y: Math.min(steepestStart.y, steepestEnd.y) - 8,
      }
    : null

  return (
    <div className={`terrain-section-chart ${reportMode ? 'terrain-section-chart--report' : ''} ${diffNotice ? 'terrain-section-chart--height-watch' : ''}`}>
      <div className="terrain-section-chart__title">
        <strong>{line.label} <small>（{slopeDirectionText(line)}）</small></strong>
        {diffNotice && <em className="terrain-section-chart__height-alert">高低差あり：{diffNotice}</em>}
        <span>{profileStats(line)} / {steepestSegmentText(line)}</span>
      </div>
      <div className="terrain-section-chart__body">
        <div className="terrain-section-chart__figure">
          <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} role="img">
            <title>{line.label} 標高断面</title>
            <rect className="terrain-section-chart__bg" x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} />
            {[0, 0.5, 1].map((ratio) => {
              const y = padding.top + plotHeight * ratio
              const elevation = maxElevation - (maxElevation - minElevation) * ratio
              return (
                <g key={ratio}>
                  <line className="terrain-section-chart__grid" x1={padding.left} x2={padding.left + plotWidth} y1={y} y2={y} />
                  <text x={padding.left - 8} y={y + 4} textAnchor="end">{elevation.toFixed(0)}m</text>
                </g>
              )
            })}
            {distanceTicks.map((distance) => {
              const x = padding.left + ((distance + range) / (range * 2)) * plotWidth
              const isMajor = distance % 50 === 0
              const isLabeled = distance % 20 === 0 || distance === -range || distance === range
              return (
                <g key={distance}>
                  <line
                    className={`terrain-section-chart__grid terrain-section-chart__grid--${isMajor ? 'major' : 'minor'}`}
                    x1={x}
                    x2={x}
                    y1={padding.top}
                    y2={padding.top + plotHeight}
                  />
                  {isLabeled && (
                    <>
                      <text x={x} y={distance === 0 && siteElevationText ? graphHeight - 16 : graphHeight - 11} textAnchor="middle">
                        {distance === 0
                          ? '候補地'
                          : distance === -range
                            ? `${line.negativeDirection || ''} ${distance}m`
                            : distance === range
                              ? `${line.positiveDirection || ''} ${distance}m`
                              : `${distance}m`}
                      </text>
                      {distance === 0 && siteElevationText && (
                        <text className="terrain-section-chart__site-elevation" x={x} y={graphHeight - 4} textAnchor="middle">
                          {siteElevationText}
                        </text>
                      )}
                    </>
                  )}
                </g>
              )
            })}
            <path className="terrain-section-chart__area" d={area} />
            <path className="terrain-section-chart__line" d={path} />
            {showSlopeDetails && segments.map((segment) => {
              const start = pointToChart(segment.start, minElevation, maxElevation, range)
              const end = pointToChart(segment.end, minElevation, maxElevation, range)
              return (
                <line
                  key={`${segment.start.distance}-${segment.end.distance}`}
                  className={`terrain-section-chart__segment terrain-section-chart__segment--${slopeLevel(segment)}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                />
              )
            })}
            {steepestStart && steepestEnd && (
              <g>
                <title>10mごとの取得点の中で、最も勾配が大きい区間です。</title>
                <line
                  className="terrain-section-chart__steepest"
                  x1={steepestStart.x}
                  y1={steepestStart.y}
                  x2={steepestEnd.x}
                  y2={steepestEnd.y}
                />
                {steepestLabel && (
                  <text className="terrain-section-chart__steepest-label" x={steepestLabel.x} y={steepestLabel.y} textAnchor="middle">
                    最大 {steepest.angle.toFixed(1)}°
                  </text>
                )}
              </g>
            )}
            {line.points
              .filter((point) => Number.isFinite(point.elevation))
              .map((point) => {
                const x = padding.left + ((point.distance + range) / (range * 2)) * plotWidth
                const y = padding.top + plotHeight - ((point.elevation - minElevation) / span) * plotHeight
                return <circle key={point.distance} className="terrain-section-chart__sample" cx={x} cy={y} r="2.4" />
              })}
            <line className="terrain-section-chart__center" x1={padding.left + plotWidth / 2} x2={padding.left + plotWidth / 2} y1={padding.top} y2={padding.top + plotHeight} />
            <text className="terrain-section-chart__interval" x={padding.left + plotWidth - 4} y={padding.top + 14} textAnchor="end">10m刻み</text>
          </svg>
        </div>
        {reportMode && <TerrainProfileMetrics line={line} steepest={steepest} diffNotice={diffNotice} />}
      </div>
      {showSlopeDetails && (
        <div className="terrain-section-chart__segment-list" aria-label={`${line.label} 10m区間別勾配`}>
          {segments.map((segment) => (
            <span
              key={`${segment.start.distance}-${segment.end.distance}`}
              className={`terrain-section-chart__segment-chip terrain-section-chart__segment-chip--${slopeLevel(segment)}`}
            >
              {segment.start.distance}→{segment.end.distance}m
              <strong>{segment.angle.toFixed(1)}°</strong>
              <em>{segment.direction}</em>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TerrainSectionPreview({ analysis, forceSlopeDetails = false, reportMode = false }) {
  const [showSlopeDetails, setShowSlopeDetails] = useState(false)
  if (!analysis?.lines?.length) return null
  const minElevation = analysis.summary?.minElevation
  const maxElevation = analysis.summary?.maxElevation
  if (!Number.isFinite(minElevation) || !Number.isFinite(maxElevation)) return null
  const showDetails = forceSlopeDetails || showSlopeDetails

  return (
    <section className={`terrain-section-preview ${reportMode ? 'terrain-section-preview--report' : ''}`}>
      <div className="terrain-section-preview__heading">
        <div>
          <strong>候補地周辺{analysis.rangeMeters || 100}m 断面プレビュー</strong>
          <span>候補地点を中心に、東西・南北方向を10m間隔で標高取得した簡易断面です。勾配角度は、読みやすさを優先して最も急な10m区間だけ橙色で表示します。</span>
        </div>
        {!forceSlopeDetails && (
          <button
            type="button"
            className={`terrain-section-preview__detail-toggle ${showSlopeDetails ? 'terrain-section-preview__detail-toggle--active' : ''}`}
            onClick={() => setShowSlopeDetails((value) => !value)}
          >
            勾配詳細 {showSlopeDetails ? 'ON' : 'OFF'}
          </button>
        )}
      </div>
      <div className="terrain-section-preview__charts">
        {analysis.lines.map((line) => (
          <TerrainProfileChart
            key={line.label}
            line={line}
            minElevation={minElevation}
            maxElevation={maxElevation}
            showSlopeDetails={showDetails}
            reportMode={reportMode}
          />
        ))}
      </div>
      <TerrainSectionSummary analysis={analysis} />
      <p className="terrain-section-source-note">
        ※ 標高データは国土地理院DEM標高タイルに基づく概算です。10m間隔の取得点を線で結んで表示しています。造成後地形・擁壁・道路・細かな法面は反映されないため、現地確認や正式図面の代替ではありません。
      </p>
    </section>
  )
}
