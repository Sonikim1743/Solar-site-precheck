function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length
}

export function meshCandidatesFromOcrText(text) {
  const digits = String(text).replace(/\D/g, '')
  const candidates = []
  for (let index = 0; index <= digits.length - 8; index += 1) {
    const value = digits.slice(index, index + 8)
    const firstLat = Number(value.slice(0, 2))
    const firstLon = Number(value.slice(2, 4))
    const secondLat = Number(value[4])
    const secondLon = Number(value[5])
    if (firstLat >= 30 && firstLat <= 68 && firstLon >= 22 && firstLon <= 54 && secondLat <= 7 && secondLon <= 7) {
      candidates.push(value)
    }
  }
  return [...new Set(candidates)]
}

export function elevationCandidatesFromOcrText(text) {
  const candidates = new Set()
  const groups = String(text).match(/\d+/g) || []
  groups.forEach((group) => {
    for (let length = 1; length <= Math.min(4, group.length); length += 1) {
      const value = Number(group.slice(-length))
      if (Number.isInteger(value) && value >= 0 && value <= 3000) candidates.add(value)
    }
  })
  return [...candidates]
}

export function rateCandidatesFromOcrText(text) {
  const normalized = String(text).replace(',', '.').replace(/[^\d.]/g, '')
  const decimal = normalized.match(/([01])\.(\d{2,4})/)
  if (decimal) {
    const whole = decimal[1]
    const fraction = decimal[2]
    const fractions = new Set()
    if (fraction.length === 2) fractions.add(fraction)
    else {
      for (let first = 0; first < fraction.length - 1; first += 1) {
        for (let second = first + 1; second < fraction.length; second += 1) {
          fractions.add(`${fraction[first]}${fraction[second]}`)
        }
      }
    }
    return [...fractions]
      .map((value) => Number(`${whole}.${value}`))
      .filter((value) => value >= 0 && value <= 1)
  }
  const digits = normalized.replace(/\D/g, '')
  if (digits.length === 2 || digits.length === 3) {
    const value = Number(digits) / 100
    return value >= 0 && value <= 1 ? [value] : []
  }
  return []
}

export function rateFromOcrText(text) {
  return rateCandidatesFromOcrText(text)[0] ?? null
}

function aggregateCandidates(readings) {
  const values = new Map()
  readings.forEach((reading) => {
    if (!Number.isFinite(reading.value)) return
    const key = reading.value.toFixed(2)
    const current = values.get(key) || {
      value: reading.value,
      votes: 0,
      maxConfidence: 0,
      readings: [],
    }
    current.votes += 1
    current.maxConfidence = Math.max(current.maxConfidence, reading.confidence || 0)
    current.readings.push(reading)
    values.set(key, current)
  })
  return [...values.values()]
}

function candidateReward(candidate) {
  return candidate.votes * 2 + candidate.maxConfidence / 100
}

export function validateRateSummaries(rates) {
  const monthly = rates.slice(0, 12)
  const summaries = [
    ['年', rates[12], average(monthly)],
    ['冬', rates[13], average([monthly[11], monthly[0], monthly[1]])],
    ['春', rates[14], average(monthly.slice(2, 5))],
    ['夏', rates[15], average(monthly.slice(5, 8))],
    ['秋', rates[16], average(monthly.slice(8, 11))],
  ]
  const inconsistent = summaries.filter(([, actual, expected]) => Math.abs(actual - expected) > 0.015)
  if (inconsistent.length) {
    throw new Error(`積雪出現率のOCR結果が月別値と一致しません（${inconsistent.map(([label]) => label).join('・')}）。原本を確認してください。`)
  }
}

export function selectConsistentRates(readingGroups) {
  const options = readingGroups.map(aggregateCandidates)
  if (options.some((items) => !items.length)) throw new Error('積雪出現率を読み取れない列があります。')
  const selected = Array(17).fill(null)
  const seasons = [
    [[11, 0, 1], 13],
    [[2, 3, 4], 14],
    [[5, 6, 7], 15],
    [[8, 9, 10], 16],
  ]

  seasons.forEach(([monthIndexes, summaryIndex]) => {
    let best = null
    for (const first of options[monthIndexes[0]]) {
      for (const second of options[monthIndexes[1]]) {
        for (const third of options[monthIndexes[2]]) {
          for (const summary of options[summaryIndex]) {
            const derived = average([first.value, second.value, third.value])
            const score = [first, second, third, summary].reduce((total, item) => total + candidateReward(item), 0) -
              Math.abs(derived - summary.value) * 1000
            if (!best || score > best.score) best = { score, values: [first, second, third], summary }
          }
        }
      }
    }
    monthIndexes.forEach((monthIndex, index) => { selected[monthIndex] = best.values[index] })
    selected[summaryIndex] = best.summary
  })

  const annualAverage = average(selected.slice(0, 12).map((item) => item.value))
  selected[12] = options[12].reduce((best, candidate) => {
    const score = candidateReward(candidate) - Math.abs(annualAverage - candidate.value) * 1000
    return !best || score > best.score ? { score, candidate } : best
  }, null).candidate

  const rates = selected.map((item) => item.value)
  validateRateSummaries(rates)
  const originalValues = readingGroups.map((readings) => readings.find((reading) => reading.variant === 'original')?.value)
  const correctedColumns = rates.reduce((columns, value, index) => {
    if (Number.isFinite(originalValues[index]) && Math.abs(value - originalValues[index]) > 0.001) columns.push(index + 1)
    return columns
  }, [])
  return {
    rates,
    correctedColumns,
    disagreementColumns: options.reduce((columns, items, index) => {
      if (items.length > 1) columns.push(index + 1)
      return columns
    }, []),
  }
}
