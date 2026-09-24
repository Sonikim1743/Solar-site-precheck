import { useState } from 'react'
import { endpointSlope, isProfilePoint, profilePointRuns, slopeSegments, steepestSegment } from '../utils/terrainProfile.js'

const graphWidth = 620
const graphHeight = 210
const padding = { left: 42, right: 18, top: 20, bottom: 34 }
const plotWidth = graphWidth - padding.left - padding.right
const plotHeight = graphHeight - padding.top - padding.bottom

function valueText(value, digits = 1, suffix = '') {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '—'
}

function distanceText(value) {
  return Number.isFinite(value) ? `${Number(value.toFixed(1))}m` : '—'
}

function averageSlopeText(line) {
  const slope = endpointSlope(line)
  return slope ? `約${slope.angle.toFixed(1)}°（${slope.slopePercent.toFixed(1)}%）` : '—'
}

function profileStats(line) {
  const s = line.summary || {}
  const slope = endpointSlope(line)
  return [
    `最高 ${valueText(s.maxElevation, 1, 'm')}`,
    `最低 ${valueText(s.minElevation, 1, 'm')}`,
    `両端差 ${valueText(slope?.elevationDelta, 1, 'm')}`,
    `両端平均 ${averageSlopeText(line)}`,
  ].join(' / ')
}

function slopeDirectionText(line) {
  const diff = endpointSlope(line)?.elevationDelta
  const from = line.negativeDirection || '左'
  const to = line.positiveDirection || '右'
  if (!Number.isFinite(diff)) return `${from}→${to} 両端の標高未取得`
  if (Math.abs(diff) < 0.1) return `${from}→${to} 両端はほぼ同じ高さ`
  return `${from}→${to} ${diff > 0 ? '上り' : '下り'}`
}

function averageSlopeNotice(line) {
  const slope = endpointSlope(line)
  if (!slope) return '両端の標高がそろっていないため、平均勾配は未計算です。'
  const from = line.negativeDirection || '左'
  const to = line.positiveDirection || '右'
  const height = Math.abs(slope.heightPer10Meters)
  if (height === 0) return `${from}→${to} 両端は同じ高さ（両端平均0%・途中の起伏は別）`
  const amount = height < 0.01 ? '0.01m未満' : `約${height.toFixed(2)}m`
  return `${from}→${to} 水平10mあたり${amount}${slope.heightPer10Meters > 0 ? '高く' : '低く'}なる（両端平均）`
}

function pointToChart(point, minElevation, maxElevation, rangeMeters) {
  const span = Math.max(1, maxElevation - minElevation)
  return {
    x: padding.left + ((point.distance + rangeMeters) / (rangeMeters * 2)) * plotWidth,
    y: padding.top + plotHeight - ((point.elevation - minElevation) / span) * plotHeight,
  }
}

function slopeLevel(segment) {
  if (!segment || !Number.isFinite(segment.angle)) return 'low'
  if (segment.angle >= 8) return 'high'
  if (segment.angle >= 4) return 'medium'
  return 'low'
}

function steepestSegmentText(line) {
  const segment = steepestSegment(line)
  if (!segment) return '最急区間 —'
  const direction = segment.direction
  return `最急区間 ${distanceText(segment.distance)}・約${segment.angle.toFixed(1)}°（${direction}）`
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

function TerrainProfileMetrics({ line, steepest }) {
  const range = line.rangeMeters || 100
  const s = line.summary || {}
  const average = endpointSlope(line)
  const direction = steepest?.direction
  const steepestValue = steepest
    ? `${steepest.angle.toFixed(1)}°`
    : '—'
  const steepestNote = steepest
    ? `${steepest.start.distance}m→${steepest.end.distance}m（${distanceText(steepest.distance)}）・${direction}`
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
          label="両端高低差"
          value={valueText(average?.elevationDelta, 1, 'm')}
          note={average ? `${line.negativeDirection || '左'}→${line.positiveDirection || '右'}・水平距離${distanceText(average.distance)}` : '両端の標高未取得'}
        />
        <ReportMetric
          label="両端平均角・勾配"
          value={averageSlopeText(line)}
          note="両端の標高差÷水平距離"
        />
        <ReportMetric
          label="最急区間"
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
    .map((line) => endpointSlope(line)?.elevationDelta)
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
        <span>両端の最大高低差</span>
        <strong>{Number.isFinite(summary.maxAbsDiff) ? `${Math.abs(summary.maxAbsDiff).toFixed(1)}m` : '—'}</strong>
      </div>
      <div>
        <span>最急区間</span>
        <strong>{summary.steepest ? `${summary.steepest.line.label} ${summary.steepest.segment.angle.toFixed(1)}° / ${distanceText(summary.steepest.segment.distance)}` : '—'}</strong>
      </div>
    </div>
  )
}

function makePath(points, minElevation, maxElevation, rangeMeters) {
  return profilePointRuns(points).map((run) => run.map((point, index) => {
      const { x, y } = pointToChart(point, minElevation, maxElevation, rangeMeters)
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')).join(' ')
}

function makeArea(points, minElevation, maxElevation, rangeMeters) {
  const baseY = padding.top + plotHeight
  return profilePointRuns(points).filter((run) => run.length > 1).map((run) => {
    const path = makePath(run, minElevation, maxElevation, rangeMeters)
    const firstX = pointToChart(run[0], minElevation, maxElevation, rangeMeters).x
    const lastX = pointToChart(run.at(-1), minElevation, maxElevation, rangeMeters).x
    return `${path} L ${lastX.toFixed(1)} ${baseY.toFixed(1)} L ${firstX.toFixed(1)} ${baseY.toFixed(1)} Z`
  }).join(' ')
}

function TerrainProfileChart({ line, minElevation, maxElevation, showSlopeDetails, reportMode }) {
  const range = line.rangeMeters || 100
  const interval = line.intervalMeters || 10
  const sitePoint = (line.points || []).find((point) => isProfilePoint(point) && point.distance === 0)
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
    <div className={`terrain-section-chart ${reportMode ? 'terrain-section-chart--report' : ''}`}>
      <div className="terrain-section-chart__title">
        <strong>{line.label} <small>（{slopeDirectionText(line)}）</small></strong>
        <span>{profileStats(line)} / {steepestSegmentText(line)}</span>
        <span>{averageSlopeNotice(line)}</span>
      </div>
      <div className="terrain-section-chart__body">
        <div className="terrain-section-chart__figure">
          <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} role="img">
            <title>{`${line.label} 標高断面`}</title>
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
                <title>{`有効な隣接取得点の中で最も勾配が大きい区間（水平距離${distanceText(steepest.distance)}）です。`}</title>
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
            {(line.points || [])
              .filter(isProfilePoint)
              .map((point) => {
                const x = padding.left + ((point.distance + range) / (range * 2)) * plotWidth
                const y = padding.top + plotHeight - ((point.elevation - minElevation) / span) * plotHeight
                return <circle key={point.distance} className="terrain-section-chart__sample" cx={x} cy={y} r="2.4" />
              })}
            <line className="terrain-section-chart__center" x1={padding.left + plotWidth / 2} x2={padding.left + plotWidth / 2} y1={padding.top} y2={padding.top + plotHeight} />
            <text className="terrain-section-chart__interval" x={padding.left + plotWidth - 4} y={padding.top + 14} textAnchor="end">取得間隔 {distanceText(interval)}</text>
          </svg>
        </div>
        {reportMode && <TerrainProfileMetrics line={line} steepest={steepest} />}
      </div>
      {showSlopeDetails && (
        <div className="terrain-section-chart__segment-list" aria-label={`${line.label} 隣接取得点の区間別勾配`}>
          {segments.map((segment) => (
            <span
              key={`${segment.start.distance}-${segment.end.distance}`}
              className={`terrain-section-chart__segment-chip terrain-section-chart__segment-chip--${slopeLevel(segment)}`}
            >
              {segment.start.distance}→{segment.end.distance}m（{distanceText(segment.distance)}）
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
          <span>候補地点を中心に東西・南北の標高を取得した簡易断面です。橙色は有効な隣接取得点で最も急な区間です。</span>
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
        ※ 国土地理院DEMによる概算。縦横の縮尺は異なり、見た目の傾きは実角度ではありません。両端平均は各断面の値で、筆全体の平均ではありません。欠測区間は接続せず、造成・擁壁などの詳細は現地・図面で確認してください。
      </p>
    </section>
  )
}
