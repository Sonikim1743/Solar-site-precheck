export const GENERATION_SOURCE = 'PVGIS 5.3 / PVGIS-ERA5'
export const GENERATION_DOCS = 'https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en'

function horizonInputs(value) {
  const fail = () => { throw new Error('地形地平線は北から時計回りの8個または36個の数値（0〜90°）を空白なしで指定してください。') }
  let values
  if (Array.isArray(value)) values = Array.from(value)
  else if (typeof value === 'string') {
    if (/\s/.test(value)) fail()
    const tokens = value.split(',')
    if (tokens.some(token => !/^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token))) fail()
    values = tokens.map(Number)
  } else fail()
  if (![8, 36].includes(values.length) || values.some(angle => typeof angle !== 'number' || !Number.isFinite(angle) || angle < 0 || angle > 90)) fail()
  return values
}

export function generationInputs(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('発電量の計算条件を確認してください。')
  const ranges = { lat: [20, 46], lon: [122, 154], peakpower: [0.1, 100000], loss: [0, 99], angle: [0, 90], aspect: [-180, 180] }
  const inputs = {}
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const raw = values[key]
    if (raw === null || raw === undefined || String(raw).trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) < min || Number(raw) > max) throw new Error('緯度経度・設備容量・損失・角度の入力範囲を確認してください。')
    inputs[key] = Number(raw)
  }
  if (Object.prototype.hasOwnProperty.call(values, 'userhorizon')) inputs.userhorizon = horizonInputs(values.userhorizon)
  return inputs
}

export function generationUrl(values) {
  const inputs = generationInputs(values)
  const params = { ...inputs, outputformat: 'json', raddatabase: 'PVGIS-ERA5', pvtechchoice: 'crystSi', mountingplace: 'free', usehorizon: '1' }
  if (inputs.userhorizon) params.userhorizon = inputs.userhorizon.join(',')
  return 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?' + new URLSearchParams(params)
}

export function parseGeneration(payload, values) {
  const inputs = generationInputs(values)
  const annualKwh = payload?.outputs?.totals?.fixed?.E_y
  const months = payload?.outputs?.monthly?.fixed
  if (!Number.isFinite(annualKwh) || annualKwh < 0 || !Array.isArray(months) || months.length !== 12 || new Set(months.map(row => row.month)).size !== 12 || months.some(row => !Number.isInteger(row.month) || row.month < 1 || row.month > 12 || !Number.isFinite(row.E_m) || row.E_m < 0)) throw new Error('発電量の応答が不完全です。再計算してください。')
  return { inputs, annualKwh, monthly: months.map(row => ({ month: row.month, kwh: row.E_m })).sort((a, b) => a.month - b.month), source: GENERATION_SOURCE, sourceUrl: generationUrl(inputs), docsUrl: GENERATION_DOCS, period: [payload.inputs?.meteo_data?.year_min, payload.inputs?.meteo_data?.year_max].filter(Number.isFinite).join('–'), fetchedAt: new Date().toISOString() }
}

export function generationAtPosition(result, position) {
  return Boolean(result && position && result.inputs?.lat === position.lat && result.inputs?.lon === position.lon)
}
