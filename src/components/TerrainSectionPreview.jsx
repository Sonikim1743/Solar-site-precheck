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

function TerrainProfileChart({ line, minElevation, maxElevation }) {
  const range = line.rangeMeters || 100
  const interval = line.intervalMeters || 10
  const distanceTicks = Array.from(
    { length: Math.floor((range * 2) / interval) + 1 },
    (_, index) => -range + index * interval,
  )
  const path = makePath(line.points, minElevation, maxElevation, range)
  const area = makeArea(line.points, minElevation, maxElevation, range)
  const span = Math.max(1, maxElevation - minElevation)

  return (
    <div className="terrain-section-chart">
      <div className="terrain-section-chart__title">
        <strong>{line.label} <small>（{slopeDirectionText(line)}）</small></strong>
        <span>{profileStats(line)}</span>
      </div>
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
                <text x={x} y={graphHeight - 11} textAnchor="middle">
                  {distance === 0
                    ? '候補地'
                    : distance === -range
                      ? `${line.negativeDirection || ''} ${distance}m`
                      : distance === range
                        ? `${line.positiveDirection || ''} ${distance}m`
                        : `${distance}m`}
                </text>
              )}
            </g>
          )
        })}
        <path className="terrain-section-chart__area" d={area} />
        <path className="terrain-section-chart__line" d={path} />
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
  )
}

export default function TerrainSectionPreview({ analysis }) {
  if (!analysis?.lines?.length) return null
  const minElevation = analysis.summary?.minElevation
  const maxElevation = analysis.summary?.maxElevation
  if (!Number.isFinite(minElevation) || !Number.isFinite(maxElevation)) return null

  return (
    <section className="terrain-section-preview">
      <div className="terrain-section-preview__heading">
        <div>
          <strong>候補地周辺100m 断面プレビュー</strong>
          <span>候補地点を中心に、東西・南北方向それぞれ21点（10m間隔）で標高取得した簡易断面です。</span>
        </div>
      </div>
      <div className="terrain-section-preview__charts">
        {analysis.lines.map((line) => (
          <TerrainProfileChart
            key={line.label}
            line={line}
            minElevation={minElevation}
            maxElevation={maxElevation}
          />
        ))}
      </div>
      <p className="terrain-section-source-note">
        ※ 標高データは国土地理院DEM標高タイルに基づく概算です。10m間隔の取得点を線で結んで表示しています。造成後地形・擁壁・道路・細かな法面は反映されないため、現地確認や正式図面の代替ではありません。
      </p>
    </section>
  )
}
