export const PCS_PRESETS = Object.freeze([
  {
    id: 'huawei-50ktl-jpm0',
    maker: 'HUAWEI',
    model: 'SUN2000-50KTL-JPM0',
    capacityKw: 50,
    inputCircuits: 12,
    defaultParallelPerPcs: 12,
    note: '最大入力ポート 12',
  },
  {
    id: 'huawei-125ktl-jph0',
    maker: 'HUAWEI',
    model: 'SUN2000-125KTL-JPH0',
    capacityKw: 125,
    inputCircuits: 18,
    defaultParallelPerPcs: 18,
    note: '最大入力ポート 18',
  },
])

export const MODULE_PRESETS = Object.freeze([
  {
    id: 'jinko-655',
    maker: 'JINKO SOLAR',
    model: 'JKM655N-66QL6-BDV-F1-JP',
    powerW: 655,
    seriesSearchLimit: 18,
    lengthMm: 2382,
    widthMm: 1134,
  },
  {
    id: 'jinko-720',
    maker: 'JINKO SOLAR',
    model: 'JKM720N-66HL5-BDV',
    powerW: 720,
    seriesSearchLimit: 18,
    lengthMm: 2384,
    widthMm: 1303,
  },
])

function finitePositiveNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function integerAtLeast(value, min, fallback = min) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number >= min ? number : fallback
}

function calculateSeriesFrame({
  pcsCount,
  maxParallelPerPcs,
  moduleCount,
  seriesCount,
}) {
  const maxStrings = pcsCount * maxParallelPerPcs
  const maxCircuitModules = maxStrings * seriesCount
  const isEnough = maxCircuitModules >= moduleCount
  const shortageModules = isEnough ? 0 : moduleCount - maxCircuitModules
  const spareModuleSlots = isEnough ? maxCircuitModules - moduleCount : 0
  const connectedModules = isEnough ? moduleCount : maxCircuitModules

  return {
    seriesCount,
    maxStrings,
    maxCircuitModules,
    connectedModules,
    spareModuleSlots,
    shortageModules,
    isEnough,
  }
}

export function buildSeriesRecommendations({
  pcsCount,
  maxParallelPerPcs,
  moduleCount,
  seriesSearchLimit = 18,
}) {
  const normalizedPcsCount = integerAtLeast(pcsCount, 1, 1)
  const normalizedParallel = integerAtLeast(maxParallelPerPcs, 1, 1)
  const normalizedModuleCount = integerAtLeast(moduleCount, 0, 0)
  const maxSeries = integerAtLeast(seriesSearchLimit, 1, 18)
  const targetSeries = normalizedModuleCount > 0
    ? Math.ceil(normalizedModuleCount / (normalizedPcsCount * normalizedParallel))
    : 1
  const candidateSeries = Array.from(new Set([
    Math.max(1, targetSeries - 1),
    Math.max(1, targetSeries),
    Math.min(maxSeries, Math.max(1, targetSeries + 1)),
  ])).filter((series) => series <= maxSeries)

  const options = candidateSeries.map((series) => calculateSeriesFrame({
      pcsCount: normalizedPcsCount,
      maxParallelPerPcs: normalizedParallel,
      moduleCount: normalizedModuleCount,
      seriesCount: series,
    }))

  const valid = options
    .filter((option) => option.isEnough)
    .sort((a, b) => (
      a.spareModuleSlots - b.spareModuleSlots ||
      a.seriesCount - b.seriesCount
    ))

  return {
    options,
    recommended: valid[0] || options[options.length - 1] || null,
  }
}

export function calculateCircuitPlan({
  pcsCount,
  pcsCapacityKw,
  maxParallelPerPcs,
  moduleCount,
  modulePowerW,
  seriesSearchLimit,
}) {
  const normalizedPcsCount = integerAtLeast(pcsCount, 1, 1)
  const normalizedParallel = integerAtLeast(maxParallelPerPcs, 1, 1)
  const normalizedModuleCount = integerAtLeast(moduleCount, 0, 0)
  const normalizedPcsCapacityKw = finitePositiveNumber(pcsCapacityKw, 0)
  const normalizedModulePowerW = finitePositiveNumber(modulePowerW, 0)
  const recommendations = buildSeriesRecommendations({
    pcsCount: normalizedPcsCount,
    maxParallelPerPcs: normalizedParallel,
    moduleCount: normalizedModuleCount,
    seriesSearchLimit,
  })
  const recommendedSeriesCount = recommendations.recommended?.seriesCount || 1
  const frame = calculateSeriesFrame({
    pcsCount: normalizedPcsCount,
    maxParallelPerPcs: normalizedParallel,
    moduleCount: normalizedModuleCount,
    seriesCount: recommendedSeriesCount,
  })
  const dcCapacityKw = normalizedModuleCount * normalizedModulePowerW / 1000
  const acCapacityKw = normalizedPcsCount * normalizedPcsCapacityKw
  const dcAcRatio = acCapacityKw > 0 ? dcCapacityKw / acCapacityKw * 100 : 0

  return {
    pcsCount: normalizedPcsCount,
    pcsCapacityKw: normalizedPcsCapacityKw,
    maxParallelPerPcs: normalizedParallel,
    moduleCount: normalizedModuleCount,
    modulePowerW: normalizedModulePowerW,
    seriesCount: recommendedSeriesCount,
    recommendedSeriesCount,
    seriesRecommendations: recommendations.options,
    dcCapacityKw,
    acCapacityKw,
    dcAcRatio,
    maxStrings: frame.maxStrings,
    maxCircuitModules: frame.maxCircuitModules,
    connectedModules: frame.connectedModules,
    spareModuleSlots: frame.spareModuleSlots,
    shortageModules: frame.shortageModules,
    isEnough: frame.isEnough,
  }
}
