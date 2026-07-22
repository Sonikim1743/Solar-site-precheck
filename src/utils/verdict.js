function maxMonthlySnowRate(station) {
  const monthly = station?.snow10cm?.monthly || []
  const valid = monthly.filter((value) => Number.isFinite(value))
  if (!valid.length) return null
  return Math.max(...valid)
}

export const VERDICT_THRESHOLDS = Object.freeze({
  horizonWatchDeg: 5,
  horizonInfoDeg: 2,
  snowDangerRate: 0.5,
  snowWatchRate: 0.01,
  terrainSectionDiffMeters: 5,
})

export const VERDICT_CRITERIA = [
  `最大地平線角 ${VERDICT_THRESHOLDS.horizonWatchDeg}°以上：地平線確認`,
  `最大地平線角 ${VERDICT_THRESHOLDS.horizonInfoDeg}°以上：やや高めとして表示`,
  '冬至9〜15時の太陽高度と地平線角を比較',
  `積雪10cm以上出現率 ${VERDICT_THRESHOLDS.snowDangerRate.toFixed(2)}以上：積雪注意`,
  `積雪10cm以上出現率 ${VERDICT_THRESHOLDS.snowWatchRate.toFixed(2)}以上：積雪補正確認`,
  `周辺断面の高低差 ${VERDICT_THRESHOLDS.terrainSectionDiffMeters}m超：造成・進入路確認`,
  '3次メッシュ境界付近：隣接メッシュ確認',
  'DEM10m相当が多い場合：参考値として注意',
]

export function verdictCriteriaText() {
  return VERDICT_CRITERIA.join('\n')
}

function maxTerrainSectionDiff(terrainSection) {
  const diffs = (terrainSection?.lines || [])
    .map((line) => line.summary?.elevationDiff)
    .filter((value) => Number.isFinite(value))
  if (!diffs.length) return null
  return diffs.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, diffs[0])
}

function addFlag(flags, severity, title, detail) {
  flags.push({ severity, title, detail })
}

function severityRank(severity) {
  if (severity === 'danger') return 3
  if (severity === 'watch') return 2
  if (severity === 'info') return 1
  return 0
}

export function evaluateSiteVerdict({
  position = null,
  terrain = null,
  solarReference = null,
  snowStation = null,
  meshBoundary = null,
  demSummary = null,
  terrainSection = null,
} = {}) {
  const flags = []

  if (!position) {
    addFlag(flags, 'info', '地点未選択', '候補地点を選択すると一次確認を開始できます。')
  }

  if (!terrain || !Number.isFinite(terrain.maxAngle)) {
    addFlag(flags, 'info', '地平線未分析', '地平線CSV出力前にDEM地平線を分析してください。')
  } else if (terrain.maxAngle >= VERDICT_THRESHOLDS.horizonWatchDeg) {
    addFlag(flags, 'watch', '地平線確認', `最大地平線角 ${terrain.maxAngle.toFixed(1)}°。影の影響を重点確認してください。`)
  } else if (terrain.maxAngle >= VERDICT_THRESHOLDS.horizonInfoDeg) {
    addFlag(flags, 'info', '地平線やや高め', `最大地平線角 ${terrain.maxAngle.toFixed(1)}°。Solar Pro入力前に方向を確認してください。`)
  }

  if (solarReference?.status === 'danger') {
    addFlag(flags, 'danger', '冬季太陽高度', solarReference.message)
  } else if (solarReference?.status === 'watch') {
    addFlag(flags, 'watch', '冬季太陽高度', solarReference.message)
  }

  const snowMax = maxMonthlySnowRate(snowStation)
  if (snowMax === null) {
    addFlag(flags, 'info', '積雪未取得', 'NEDO MONSOLA-11の積雪出現率を取得してください。')
  } else if (snowMax >= VERDICT_THRESHOLDS.snowDangerRate) {
    addFlag(flags, 'danger', '積雪注意', `積雪10cm以上出現率の月最大が ${snowMax.toFixed(2)} です。`)
  } else if (snowMax >= VERDICT_THRESHOLDS.snowWatchRate) {
    addFlag(flags, 'watch', '積雪補正確認', `積雪10cm以上出現率の月最大が ${snowMax.toFixed(2)} です。`)
  }

  if (meshBoundary?.isNearBoundary) {
    addFlag(flags, 'watch', '3次メッシュ境界', `境界まで約${Math.round(meshBoundary.minDistanceMeters)}m。隣接メッシュ値を確認してください。`)
  }

  if (demSummary?.shouldWarn) {
    addFlag(flags, 'watch', 'DEM精度確認', '10mメッシュ相当のDEM取得点が多いため、山林・急傾斜地では参考値として扱ってください。')
  } else if (demSummary?.level === 'unknown') {
    addFlag(flags, 'info', '標高出典確認', '標高データの出典を確認してください。')
  }

  const sectionDiff = maxTerrainSectionDiff(terrainSection)
  if (sectionDiff === null) {
    addFlag(flags, 'info', '断面未取得', '候補地周辺100m断面を取得すると造成・傾斜感を確認できます。')
  } else if (Math.abs(sectionDiff) > VERDICT_THRESHOLDS.terrainSectionDiffMeters) {
    addFlag(flags, 'watch', '周辺高低差', `100m断面で最大高低差 ${sectionDiff > 0 ? '+' : ''}${sectionDiff.toFixed(1)}m。造成・進入路を確認してください。`)
  }

  const actionable = flags.filter((flag) => flag.severity !== 'info')
  const maxSeverity = flags.reduce((max, flag) => Math.max(max, severityRank(flag.severity)), 0)
  const hasEnoughData = Boolean(position && terrain && snowMax !== null)

  if (!hasEnoughData && !actionable.length) {
    return {
      status: 'missing',
      label: 'データ不足',
      summary: '地点・地平線・NEDO積雪の取得後に一次確認できます。',
      flags,
    }
  }

  if (maxSeverity >= 3) {
    return {
      status: 'danger',
      label: '要注意',
      summary: 'Solar Pro入力前に重点確認が必要な項目があります。',
      flags,
    }
  }

  if (maxSeverity >= 2) {
    return {
      status: 'watch',
      label: '要確認',
      summary: 'Solar Pro入力前に確認しておきたい項目があります。',
      flags,
    }
  }

  return {
    status: 'ok',
    label: '通常',
    summary: '取得済みデータ上、大きな注意項目はありません。',
    flags,
  }
}

export function primaryVerdictReasons(verdict, limit = 3) {
  const flags = verdict?.flags || []
  const priority = flags
    .filter((flag) => flag.severity !== 'info')
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  const source = priority.length ? priority : flags
  return source.slice(0, limit)
}
