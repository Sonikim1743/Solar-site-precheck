import { generationInputs, parseGeneration } from './generation.js'

const inputKeys = ['lat', 'lon', 'peakpower', 'loss', 'angle', 'aspect']
const fail = label => { throw new Error(`比較計算の${label}を確認してください。`) }
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const isNumber = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

function positionKey(position) {
  if (!isObject(position) || !isNumber(position.lat, 20, 46) || !isNumber(position.lon, 122, 154)) fail('候補地の座標')
  return `${position.lat.toFixed(7)},${position.lon.toFixed(7)}`
}

function normalizedDate(value, label) {
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) fail(label)
  return new Date(value).toISOString()
}

function hasMissingData(value) {
  return value.missing === true || value.partial === true || (value.missingCount != null && (!isNumber(value.missingCount, 0, 1e6) || value.missingCount > 0))
}

export function scenarioHorizon(terrain, position) {
  const expectedKey = positionKey(position)
  if (!isObject(terrain) || !isObject(terrain.position)) fail('地形地平線と候補地の対応')
  positionKey(terrain.position)
  if (terrain.position.lat !== position.lat || terrain.position.lon !== position.lon || (terrain.positionKey != null && terrain.positionKey !== expectedKey)) fail('地形地平線と候補地の対応')
  if (hasMissingData(terrain) || !Array.isArray(terrain.samples) || ![8, 36].includes(terrain.samples.length)) fail('地形地平線の全方位データ')
  const samples = Array.from(terrain.samples)
  if (samples.some(sample => !isObject(sample) || !isNumber(sample.bearing, 0, 359.999999) || !isNumber(sample.terrainAngle, 0, 90) || hasMissingData(sample))) fail('地形地平線の欠測・地形角')
  samples.sort((a, b) => a.bearing - b.bearing)
  const step = 360 / samples.length
  for (const [index, sample] of samples.entries()) {
    if (sample.bearing !== index * step) fail('地形地平線の方位間隔（北0°から時計回り）')
    if (sample.profile != null && (!Array.isArray(sample.profile) || sample.profile.length === 0 || Array.from(sample.profile).some(point => !isObject(point) || hasMissingData(point) || !isNumber(point.terrainAngle, 0, 90)))) fail('地形地平線の断面欠測')
  }
  // The combined angle includes an assumed tree height and must not be used here.
  return samples.map(sample => sample.terrainAngle)
}

function normalizeResult(value, label, requireHorizon = false) {
  if (!isObject(value) || !isObject(value.inputs) || inputKeys.some(key => typeof value.inputs[key] !== 'number' || !Number.isFinite(value.inputs[key]))) fail(`${label}の計算条件`)
  const inputs = generationInputs(value.inputs)
  if (requireHorizon && !inputs.userhorizon) fail('地形比較のuserhorizon')
  if (!Array.isArray(value.monthly) || Array.from(value.monthly).some(row => !isObject(row))) fail(`${label}の月別値`)
  const normalized = parseGeneration({ outputs: { totals: { fixed: { E_y: value.annualKwh } }, monthly: { fixed: value.monthly.map(row => ({ month: row.month, E_m: row.kwh })) } } }, inputs)
  const monthlyTotal = normalized.monthly.reduce((total, row) => total + row.kwh, 0)
  const roundingTolerance = .12 + normalized.annualKwh * Number.EPSILON * 24
  if (!Number.isFinite(monthlyTotal) || Math.abs(monthlyTotal - normalized.annualKwh) > roundingTolerance) fail(`${label}の年間・月別値の一致`)
  if (monthlyTotal === 0 && normalized.annualKwh !== 0) fail(`${label}の年間・月別値の一致`)
  if (typeof value.period !== 'string' || value.period.length > 80) fail(`${label}の資料期間`)
  return { ...normalized, period: value.period, fetchedAt: normalizedDate(value.fetchedAt, `${label}の取得日時`) }
}

function normalizeSnow(value) {
  if (value == null) return null
  if (!isObject(value) || !Array.isArray(value.rates) || value.rates.length !== 12 || Array.from(value.rates).some(rate => !isNumber(rate, 0, 1))) fail('積雪出現率（12か月・0〜1）')
  if (!isNumber(value.weight, 0, 100)) fail('積雪の仮定損失率（0〜100%）')
  if (typeof value.mesh !== 'string' || !/^\d{8}$/.test(value.mesh)) fail('積雪資料の3次メッシュ')
  if (typeof value.source !== 'string' || !value.source.trim() || value.source.length > 1000) fail('積雪資料の出典')
  return { rates: [...value.rates], weight: value.weight, mesh: value.mesh, source: value.source }
}

export function buildGenerationScenario(base, { snow = null, terrain = null, calculatedAt = new Date().toISOString() } = {}) {
  const baseline = normalizeResult(base, '基準結果')
  const terrainResult = terrain == null ? null : normalizeResult(terrain, '地形比較結果', true)
  if (terrainResult && inputKeys.some(key => terrainResult.inputs[key] !== baseline.inputs[key])) fail('基準結果と地形比較結果の条件一致')
  if (terrainResult && terrainResult.period !== baseline.period) fail('基準結果と地形比較結果の資料期間一致')
  const snowInputs = normalizeSnow(snow)
  const reference = terrainResult || baseline
  const monthly = reference.monthly.map(row => {
    const lossRate = snowInputs ? snowInputs.rates[row.month - 1] * snowInputs.weight / 100 : 0
    return { month: row.month, kwh: row.kwh * (1 - lossRate) }
  })
  const referenceMonthlyTotal = reference.monthly.reduce((total, row) => total + row.kwh, 0)
  const adjustedMonthlyTotal = monthly.reduce((total, row) => total + row.kwh, 0)
  // Preserve PVGIS's independent annual rounding while zero/full loss remains exact.
  const annualKwh = referenceMonthlyTotal === 0 ? 0 : reference.annualKwh * (adjustedMonthlyTotal / referenceMonthlyTotal)
  const differenceKwh = annualKwh - baseline.annualKwh
  const differencePercent = baseline.annualKwh === 0 ? null : differenceKwh / baseline.annualKwh * 100
  if (!Number.isFinite(annualKwh) || !Number.isFinite(differenceKwh) || (differencePercent !== null && !Number.isFinite(differencePercent))) fail('計算結果')
  return { version: 1, snow: snowInputs, terrain: terrainResult, annualKwh, monthly, differenceKwh, differencePercent, calculatedAt: normalizedDate(calculatedAt, '比較の計算日時') }
}
