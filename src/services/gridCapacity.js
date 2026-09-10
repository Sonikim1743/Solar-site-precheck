import { unzipSync } from 'fflate'
import { CHUGOKU_GRID_AREAS, findChugokuGridAreaById } from './chugokuGridSources.js'

export function decodeJapaneseCsv(bytes) {
  const candidates = []
  for (const label of ['utf-8', 'shift_jis']) {
    try {
      const text = new TextDecoder(label).decode(bytes)
      const keywordScore = (text.match(/送電線|変電所|空容量|電圧|N-1/g) || []).length
      const replacementPenalty = (text.match(/\uFFFD/g) || []).length * 8
      const mojibakePenalty = (text.match(/[縺繧譁髮]/g) || []).length * 2
      candidates.push({ text, score: keywordScore - replacementPenalty - mojibakePenalty })
    } catch {
      // Try the next decoder. Older browsers may not expose every label.
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]?.text || new TextDecoder().decode(bytes)
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }
  row.push(cell)
  rows.push(row)
  return rows
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/[（）]/g, (match) => (match === '（' ? '(' : ')'))
    .replace(/\s+/g, '')
    .trim()
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[（）()［\]\[\]【】「」『』]/g, '')
    .replace(/変電所|送電線|支線|線路/g, '')
    .replace(/\s+/g, '')
    .trim()
}

function parseNumberCell(value) {
  const text = String(value ?? '').normalize('NFKC').replace(/,/g, '').replace(/[−－]/g, '-').trim()
  if (!text) return null
  const match = text.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const number = Number(match[0])
  return Number.isFinite(number) ? number : null
}

function findHeaderIndex(headers, patterns) {
  const normalizedPatterns = patterns.map(normalizeHeader)
  return headers.findIndex((header) => {
    const normalized = normalizeHeader(header)
    return normalizedPatterns.some((pattern) => normalized.includes(pattern))
  })
}

function getCell(headers, row, patterns) {
  const index = findHeaderIndex(headers, patterns)
  return index >= 0 ? row[index] : ''
}

export function parseCapacityCsv(text, sourceFile) {
  const rows = parseCsv(text).filter((row) => row.some((cell) => String(cell || '').trim()))
  const headerIndex = rows.findIndex((row) => row.some((cell) => /送電線No|変電所\s*No|変電所名/.test(String(cell || ''))))
  if (headerIndex < 0) return { lines: [], substations: [], updatedAt: '' }

  const updatedAt = rows[0]?.[0]?.trim() || ''
  const headers = rows[headerIndex]
  const type = headers.some((header) => String(header || '').includes('送電線名')) ? 'line' : 'substation'
  const records = []

  for (const row of rows.slice(headerIndex + 1)) {
    const name = getCell(headers, row, type === 'line' ? ['送電線名'] : ['変電所名']).trim()
    if (!name) continue
    records.push({
      type,
      sourceFile,
      updatedAt,
      no: getCell(headers, row, type === 'line' ? ['送電線No'] : ['変電所No', '変電所 No']).trim(),
      name,
      normalizedName: normalizeName(name),
      voltageKv: parseNumberCell(getCell(headers, row, type === 'line' ? ['電圧(kV)', '電圧（kV）'] : ['電圧(一次)', '電圧(一次)（kV）'])),
      secondaryVoltageKv: type === 'substation' ? parseNumberCell(getCell(headers, row, ['電圧(二次)', '電圧(二次)（kV）'])) : null,
      expectedFlowMw: parseNumberCell(getCell(headers, row, ['予想潮流'])),
      circuitCount: parseNumberCell(getCell(headers, row, ['回線数'])),
      installedCapacityMw: parseNumberCell(getCell(headers, row, ['設備容量'])),
      operatingCapacityMw: parseNumberCell(getCell(headers, row, ['運用容量値'])),
      capacityConstraint: getCell(headers, row, ['運用容量制約要因']).trim(),
      controlledEquipment: getCell(headers, row, ['平常時出力制御が必要となりうる設備(当該設備)']).trim(),
      controlledUpstream: getCell(headers, row, ['平常時出力制御が必要となりうる設備(上位系']).trim(),
      availableCapacityMw: parseNumberCell(getCell(headers, row, ['空容量(当該設備)', '空容量（当該設備）'])),
      upstreamAvailableCapacityMw: parseNumberCell(getCell(headers, row, ['空容量(上位系', '空容量（上位系'])),
      nMinusOne: getCell(headers, row, ['N-1電制適用可否']).trim(),
      nMinusOneAmountMw: parseNumberCell(getCell(headers, row, ['N-1電制適用可能量'])),
      flowDirection: getCell(headers, row, ['潮流方向']).trim(),
      outputControlPossibility: getCell(headers, row, ['平常時出力制御の可能性']).trim(),
      notes: getCell(headers, row, ['備考']).trim(),
    })
  }

  return {
    updatedAt,
    lines: type === 'line' ? records : [],
    substations: type === 'substation' ? records : [],
  }
}

export async function parseGridCapacityFile(file) {
  if (!file) throw new Error('公開空容量CSV ZIPを選択してください。')
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const lowerName = file.name.toLowerCase()
  const dataset = {
    fileName: file.name,
    loadedAt: new Date().toISOString(),
    updatedAt: '',
    lines: [],
    substations: [],
  }

  if (lowerName.endsWith('.zip')) {
    const entries = unzipSync(bytes)
    for (const [entryName, entryBytes] of Object.entries(entries)) {
      if (!entryName.toLowerCase().endsWith('.csv')) continue
      const parsed = parseCapacityCsv(decodeJapaneseCsv(entryBytes), entryName)
      dataset.lines.push(...parsed.lines)
      dataset.substations.push(...parsed.substations)
      if (!dataset.updatedAt && parsed.updatedAt) dataset.updatedAt = parsed.updatedAt
    }
  } else if (lowerName.endsWith('.csv')) {
    const parsed = parseCapacityCsv(decodeJapaneseCsv(bytes), file.name)
    dataset.lines.push(...parsed.lines)
    dataset.substations.push(...parsed.substations)
    dataset.updatedAt = parsed.updatedAt
  } else {
    throw new Error('CSVまたはZIP形式の公開空容量資料を選択してください。')
  }

  if (!dataset.lines.length && !dataset.substations.length) {
    throw new Error('公開空容量資料を読み取れませんでした。中国電力NWのCSV ZIP形式を確認してください。')
  }

  return normalizeCapacityDataset(dataset)
}

function normalizeCapacityDataset(dataset) {
  const normalized = {
    fileName: dataset?.fileName || '中国電力NW 公開空容量DB',
    loadedAt: dataset?.loadedAt || new Date().toISOString(),
    updatedAt: dataset?.updatedAt || '',
    source: dataset?.source || 'chugoku-grid-db',
    areas: Array.isArray(dataset?.areas) ? dataset.areas : [],
    areaId: dataset?.areaId || '',
    areaLabel: dataset?.areaLabel || '',
    sourceUrl: dataset?.sourceUrl || '',
    officialSourceUrl: dataset?.officialSourceUrl || dataset?.pdfUrl || '',
    officialMappingUrl: dataset?.officialMappingUrl || dataset?.mappingUrl || '',
    lines: Array.isArray(dataset?.lines) ? dataset.lines : [],
    substations: Array.isArray(dataset?.substations) ? dataset.substations : [],
  }
  if (!normalized.lines.length && !normalized.substations.length) {
    throw new Error('公開空容量DBに読み取れるデータがありません。')
  }
  return normalized
}

export async function loadBundledChugokuGridCapacity(areaId = '') {
  const area = findChugokuGridAreaById(areaId)
  const targetUrl = area
    ? `/data/grid-capacity/chugoku/${area.id}.json`
    : '/data/grid-capacity/chugoku/index.json'
  // A schema revision also bypasses older service-worker cache entries.
  const response = await fetch(`${targetUrl}?schema=2`, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`中国電力NW公開空容量DBを取得できませんでした（HTTP ${response.status}）。`)
  }
  const dataset = normalizeCapacityDataset(await response.json())
  return area
    ? {
      ...dataset,
      areaId: dataset.areaId || area.id,
      areaLabel: dataset.areaLabel || area.label,
      sourceArea: area,
      sourceUrl: dataset.sourceUrl || area.dataUrl,
      officialSourceUrl: dataset.officialSourceUrl || area.pdfUrl,
      officialMappingUrl: dataset.officialMappingUrl || area.mappingUrl,
    }
    : dataset
}

export { CHUGOKU_GRID_AREAS }

function nameMatchScore(osmName, capacityName) {
  const osm = normalizeName(osmName)
  const capacity = normalizeName(capacityName)
  if (!osm || !capacity) return 0
  if (osm === capacity) return 60
  if (Math.min(osm.length, capacity.length) >= 3 && (osm.includes(capacity) || capacity.includes(osm))) return 40
  return 0
}

function normalizeEquipmentNo(value) {
  return String(value || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/\s+/g, '')
}

function equipmentMatch(source, capacity) {
  const voltages = source?.voltageValuesKv?.length ? source.voltageValuesKv : [source?.voltageKv].filter(Number.isFinite)
  if (voltages.length && Number.isFinite(capacity?.voltageKv)
    && !voltages.some((value) => Math.abs(value - capacity.voltageKv) <= 0.5)) return null
  const nameScore = nameMatchScore(source?.name, capacity?.name)
  const sourceNo = normalizeEquipmentNo(source?.ref)
  const capacityNo = normalizeEquipmentNo(capacity?.no)
  const numberMatch = Boolean(sourceNo && capacityNo && sourceNo === capacityNo)
  const voltageMatch = Number.isFinite(source?.voltageKv) && Number.isFinite(capacity?.voltageKv)
    && Math.abs(source.voltageKv - capacity.voltageKv) <= 0.5
  if (!numberMatch && nameScore === 0) return null

  const matchedBy = []
  if (numberMatch) matchedBy.push('設備番号')
  if (nameScore === 60) matchedBy.push('名称')
  else if (nameScore === 40) matchedBy.push('名称候補')
  if (voltageMatch) matchedBy.push('電圧')
  const score = (numberMatch ? 70 : 0) + nameScore + (voltageMatch ? 20 : 0)
  const level = (numberMatch || nameScore === 60) && voltageMatch
    ? 'high'
    : (numberMatch || nameScore === 60)
      ? 'medium'
      : 'reference'
  const label = level === 'high'
    ? `${matchedBy.join('・')}一致`
    : level === 'medium'
      ? `${matchedBy.join('・')}一致（電圧要確認）`
      : `${matchedBy.join('・')}による候補`
  return { score, level, label, matchedBy, voltageMatch, numberMatch, nameScore }
}

function sortByDistance(a, b) {
  return (b.match?.score || 0) - (a.match?.score || 0)
    || (a.source?.distanceMeters ?? Infinity) - (b.source?.distanceMeters ?? Infinity)
}

export function matchPowerGridCapacity(powerGridData, capacityDataset, limit = 6) {
  const sourceLines = (powerGridData?.lines || [])
    .filter((line) => Number.isFinite(line.voltageKv) ? line.voltageKv >= 11 && line.voltageKv <= 110 : true)
    .slice(0, 40)
  const sourceSubstations = (powerGridData?.substations || []).slice(0, 40)

  const lineMatches = []
  for (const source of sourceLines) {
    for (const capacity of capacityDataset?.lines || []) {
      const match = equipmentMatch(source, capacity)
      if (match) lineMatches.push({ source, capacity, match })
    }
  }

  const substationMatches = []
  for (const source of sourceSubstations) {
    for (const capacity of capacityDataset?.substations || []) {
      const match = equipmentMatch(source, capacity)
      if (match) substationMatches.push({ source, capacity, match })
    }
  }

  return {
    lineMatches: lineMatches.sort(sortByDistance).slice(0, limit),
    substationMatches: substationMatches.sort(sortByDistance).slice(0, limit),
  }
}

function placeNameTokens(placeLabel) {
  const source = String(placeLabel || '')
    .normalize('NFKC')
    .replace(/\u3000/g, ' ')
    .trim()
  if (!source) return []

  const tokens = []
  const pattern = /([^都道府県市区町村郡\s]+)([都道府県市区町村郡])/g
  let match
  let cursor = 0
  while ((match = pattern.exec(source)) !== null) {
    const [, name, suffix] = match
    cursor = pattern.lastIndex
    if (!/[都道府県]/.test(suffix) && name.length >= 2) {
      const specificity = /[町村区]/.test(suffix) ? 2 : 1
      tokens.push({ value: name, normalized: normalizeName(name), specificity })
    }
  }

  const tail = source.slice(cursor).replace(/\s+/g, '')
  if (tail.length >= 2) {
    tokens.push({ value: tail, normalized: normalizeName(tail), specificity: 3 })
  }

  return [...new Map(tokens.filter((token) => token.normalized).map((token) => [token.normalized, token])).values()]
}

/**
 * Official Chugoku NW records do not contain coordinates. When the public map
 * lacks a line/substation name, expose locality-name candidates without
 * presenting them as distance-confirmed matches.
 */
export function findCapacityCandidatesByPlaceName(placeLabel, capacityDataset, limit = 6) {
  const tokens = placeNameTokens(placeLabel)
  const specificTokens = tokens.filter((token) => token.specificity >= 2)
  const requiredTokens = specificTokens.length ? specificTokens : tokens

  const findCandidates = (records) => (records || [])
    .map((capacity) => {
      const name = normalizeName(capacity?.name)
      const matchedTokens = tokens.filter((token) => name.includes(token.normalized))
      if (!matchedTokens.length || !requiredTokens.some((token) => name.includes(token.normalized))) return null
      const score = matchedTokens.reduce((sum, token) => sum + (token.specificity * 20), 0)
      return {
        capacity,
        match: {
          score,
          level: 'reference',
          label: '住所地名候補（距離未確定）',
          matchedBy: matchedTokens.map((token) => token.value),
        },
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.match.score - a.match.score) || a.capacity.name.localeCompare(b.capacity.name, 'ja'))
    .slice(0, limit)

  return {
    tokens: tokens.map((token) => token.value),
    lineCandidates: findCandidates(capacityDataset?.lines),
    substationCandidates: findCandidates(capacityDataset?.substations),
  }
}

export function capacityValueLabel(value) {
  return Number.isFinite(value) ? `${value.toFixed(value % 1 === 0 ? 0 : 1)} MW` : '記載なし'
}

export function capacityValueStatusLabel(value, { upstream = false } = {}) {
  if (!Number.isFinite(value)) return '記載なし'
  if (value === 0) return upstream ? '0 MW（上位系の余裕なし）' : '0 MW（空容量なし）'
  return capacityValueLabel(value)
}

export function summarizeGridFlowDirection(record) {
  const raw = String(record?.flowDirection || '').trim()
  if (!raw || /^[\s→⇒－—–-]+$/.test(raw)) {
    return {
      status: 'missing',
      raw: '',
      from: '',
      to: '',
      label: '記載なし',
      hierarchyLabel: '系統上位・下位は未確定',
    }
  }

  const parts = raw
    .split(/\s*(?:→|⇒|->)\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
  const knownFlow = Number.isFinite(record?.expectedFlowMw) && record.expectedFlowMw !== 0 && parts.length === 2
  const expected = knownFlow ? (record.expectedFlowMw < 0 ? [...parts].reverse() : parts) : []
  return {
    status: 'published',
    raw,
    from: parts.length >= 2 ? parts[0] : '',
    to: parts.length >= 2 ? parts.slice(1).join(' → ') : '',
    label: raw,
    expectedLabel: expected.length ? expected.join(' → ') : '方向未確定（予想潮流が未記載または0）',
    reversed: knownFlow && record.expectedFlowMw < 0,
    hierarchyLabel: '系統上位・下位は未確定',
  }
}

// Compare only complete, explicitly named endpoints, never proximity or substrings.
function endpointKey(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, '').replace(/変電所$|\(変\)$/g, '')
}

export function findPublishedGridConnections(record, dataset) {
  const flow = summarizeGridFlowDirection(record)
  return [flow.from, flow.to].filter(Boolean).map((endpoint) => ({
    endpoint,
    substations: (dataset?.substations || []).filter((item) => endpointKey(item.name) === endpointKey(endpoint)),
    lines: (dataset?.lines || []).filter((item) => {
      if (item === record || (item.no === record.no && item.areaId === record.areaId)) return false
      const other = summarizeGridFlowDirection(item)
      return [other.from, other.to].some((value) => value && endpointKey(value) === endpointKey(endpoint))
    }),
  }))
}
