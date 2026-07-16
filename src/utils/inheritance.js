function normalizeText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t　]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function toHalfWidthDigits(value) {
  return String(value || '').replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
}

function compactExcerpt(lines, start, size = 12) {
  return normalizeText(lines.slice(start, start + size).join('\n'))
}

function pickField(excerpt, label) {
  const pattern = new RegExp(`${label}[：:\\s]*([^\\n,、]+)`)
  const match = excerpt.match(pattern)
  return match?.[1]?.trim() || ''
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function lineReceiptNumber(line) {
  return toHalfWidthDigits(String(line || '').match(/第\s*([0-9０-９]+)\s*号/)?.[1] || '')
}

function isReceiptHeaderLine(line) {
  const text = normalizeText(line)
    .replace(/[┃│｜【】]/g, ' ')
    .replace(/\s+/g, '')
  if (!/第[0-9０-９]+号/.test(text)) return false
  if (!/受付/.test(text)) return false
  if (/(法律|法務省令|政令|省令|規則|告示|許可|認可|第[0-9０-９]+条|第[0-9０-９]+項)/.test(text)) return false
  return /[0-9０-９]{1,2}月[0-9０-９]{1,2}日受付/.test(text) ||
    /受付[（(]?(単独|共有|共同|連先)/.test(text) ||
    /(所有権|相続|抹消|保存|移転|登記|土地|建物)/.test(text)
}

function cleanRegistryAddress(value) {
  return String(value || '')
    .split(/[│┃┠┗┏┯┼┨┓]/)[0]
    .replace(/\s+(?:の変更・更正|無償名義).*$/, '')
    .trim()
}

function parseRegistrySummary(excerpt) {
  const flat = normalizeText(excerpt)
    .replace(/[┃│｜]/g, ' ')
    .replace(/[【】]/g, ' ')
    .replace(/\s+/g, ' ')
  const receiptNumber = isReceiptHeaderLine(flat)
    ? toHalfWidthDigits(flat.match(/第\s*([0-9０-９]+)\s*号/)?.[1] || '')
    : ''
  const dateMatch = flat.match(/([0-9０-９]+)\s*月\s*([0-9０-９]+)\s*日\s*受付/)
  const receiptDate = dateMatch
    ? `${toHalfWidthDigits(dateMatch[1])}月${toHalfWidthDigits(dateMatch[2])}日`
    : ''
  const ownershipMode = flat.match(/[（(]\s*(単独|共有|共同)\s*[）)]/)?.[1] || ''
  const registrationCause = flat.match(/(所有権移転[・･・\s]*相続|所有権移転|相続)/)?.[1]?.replace(/\s+/g, '') || ''
  const propertyType = flat.match(/(?:既[）)]\s*)?(土地|建物)/)?.[1] || ''
  const landText = flat.match(/(?:既[）)]\s*)?土地\s*(.+)/)?.[1] || ''
  const extraMatch = landText.match(/\s*外\s*([0-9０-９]+)\s*(?:件|筆)?/)
  const addressSource = extraMatch ? landText.slice(0, extraMatch.index) : landText
  const registryAddress = cleanRegistryAddress(addressSource
    .split(/\s+(?:所在|地番|地目|地積|相続人|所有者|取得者|承継人|第\s*[0-9０-９]+\s*号|土地\s)/)[0]
    .trim())
  const extraCount = extraMatch?.[1] ? Number(toHalfWidthDigits(extraMatch[1])) : 0

  return {
    receiptNumber,
    receiptDate,
    ownershipMode,
    registrationCause,
    propertyType,
    registryAddress,
    extraCount,
  }
}

export function extractReceiptBlocks(pages) {
  const blocks = []
  const seen = new Set()
  let sequence = 0

  pages.forEach((page) => {
    const lines = normalizeText(page.text).split('\n').map((line) => line.trim()).filter(Boolean)
    const receiptIndexes = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => isReceiptHeaderLine(line))
      .map(({ index }) => index)
    const scanIndexes = receiptIndexes.length
      ? receiptIndexes
      : lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => /(受付|土地|所在|地番|地目|地積)/.test(line))
        .map(({ index }) => index)

    scanIndexes.forEach((index, scanOrder) => {
      const nextReceiptIndex = receiptIndexes.find((nextIndex) => nextIndex > index)
      const end = nextReceiptIndex || Math.min(lines.length, index + 10)
      const excerpt = receiptIndexes.length
        ? normalizeText(lines.slice(index, end).join('\n'))
        : compactExcerpt(lines, Math.max(0, index - 1), 8)
      const key = `${page.pageNumber}:${index}:${excerpt.slice(0, 120)}`
      if (seen.has(key)) return
      seen.add(key)

      const registry = parseRegistrySummary(excerpt)
      if (!registry.receiptNumber && receiptIndexes.length) return

      blocks.push({
        sequence: sequence++,
        pageNumber: page.pageNumber,
        lineNumber: index + 1,
        scanOrder,
        excerpt,
        ...registry,
      })
    })
  })

  return blocks.sort((a, b) => a.sequence - b.sequence)
}

function classifyUnmatchedReceiptLine(line) {
  const hasBlackBox = /■{2,}|█{2,}|黒塗|墨塗/.test(line)
  const hasWithdrawn = /取下|却下|取止|取扱中止/.test(line)
  const hasReceiptText = /受付/.test(line)

  if (hasBlackBox && hasWithdrawn) return { type: 'black-withdrawn', label: '黒塗り・取下' }
  if (hasBlackBox) return { type: 'black-box', label: '黒塗り' }
  if (hasWithdrawn) return { type: 'withdrawn', label: '取下等' }
  if (!hasReceiptText) return { type: 'no-receipt-text', label: '受付文字なし' }
  return { type: 'format-issue', label: '表示形式違い' }
}

export function classifyMissingReceiptNumbers(pages, missingNumbers) {
  const missingSet = new Set(missingNumbers.map(Number))
  const candidates = []

  pages.forEach((page) => {
    const lines = normalizeText(page.text).split('\n').map((line) => line.trim()).filter(Boolean)
    lines.forEach((line, index) => {
      const receiptNumber = Number(lineReceiptNumber(line))
      if (!missingSet.has(receiptNumber)) return
      const classification = classifyUnmatchedReceiptLine(line)
      candidates.push({
        receiptNumber,
        pageNumber: page.pageNumber,
        lineNumber: index + 1,
        line,
        ...classification,
      })
    })
  })

  const byNumber = new Map()
  candidates.forEach((candidate) => {
    if (!byNumber.has(candidate.receiptNumber)) byNumber.set(candidate.receiptNumber, candidate)
  })

  return missingNumbers.map((number) => byNumber.get(number) || {
    receiptNumber: number,
    type: 'not-found',
    label: '原文行未検出',
    line: '',
  })
}

export function summarizeInheritanceReceipts(pages) {
  const blocks = extractReceiptBlocks(pages)
  const numbers = blocks
    .filter((block) => block.receiptNumber)
    .map((block) => Number(block.receiptNumber))
    .filter(Number.isFinite)
  const uniqueNumbers = [...new Set(numbers)].sort((a, b) => a - b)
  const firstNumber = uniqueNumbers[0] || null
  const lastNumber = uniqueNumbers.at(-1) || null
  const expectedCount = firstNumber && lastNumber ? lastNumber - firstNumber + 1 : 0
  const missingNumbers = []

  if (firstNumber && lastNumber) {
    const numberSet = new Set(uniqueNumbers)
    for (let number = firstNumber; number <= lastNumber; number += 1) {
      if (!numberSet.has(number)) missingNumbers.push(number)
    }
  }
  const missingDetails = classifyMissingReceiptNumbers(pages, missingNumbers)
  const explainedMissingCount = missingDetails.filter((item) => item.type !== 'not-found').length
  const missingBreakdown = missingDetails.reduce((summary, item) => ({
    ...summary,
    [item.label]: (summary[item.label] || 0) + 1,
  }), {})

  return {
    firstNumber,
    lastNumber,
    expectedCount,
    readCount: uniqueNumbers.length,
    blockCount: blocks.length,
    missingCount: missingNumbers.length,
    missingNumbers: missingNumbers.slice(0, 30),
    missingDetails: missingDetails.slice(0, 30),
    explainedMissingCount,
    unexplainedMissingCount: missingNumbers.length - explainedMissingCount,
    missingBreakdown,
    missingExplanationMatches: missingNumbers.length === explainedMissingCount,
    isContinuous: expectedCount > 0 && missingNumbers.length === 0 && uniqueNumbers.length === expectedCount,
  }
}

export function analyzeInheritanceText(pages) {
  const blocks = extractReceiptBlocks(pages)
  const results = []

  blocks.forEach((block) => {
    const { excerpt } = block
    if (!/(土地|地番|地目|地積)/.test(excerpt)) return
    const registry = block
    const hasLand = /(土地|地番|地目|地積|田|畑|宅地|山林|雑種地)/.test(excerpt)
    const hasInheritance = /(相続|遺産分割|承継|取得)/.test(excerpt)
    const hasSingleSignal = /(単独|全部|単有|持分全部|所有権全部)/.test(excerpt) || registry.ownershipMode === '単独'
    const hasSharedSignal = /(共有|持分|各|共同|二分の一|２分の１|1\/2|三分の一|３分の１|1\/3)/.test(excerpt)
    const personMatches = [...excerpt.matchAll(/(?:相続人|取得者|承継人|所有者)[：:\s]*([^\n,、]+)/g)]
    const heirs = uniqueValues(personMatches.map((match) => match[1]).map((value) => value.replace(/外\d+名.*/, '').trim()))

    let score = 0
    if (hasLand) score += 2
    if (/地番/.test(excerpt)) score += 2
    if (/地目/.test(excerpt)) score += 1
    if (/地積/.test(excerpt)) score += 1
    if (hasInheritance) score += 2
    if (hasSingleSignal) score += 2
    if (registry.receiptNumber) score += 1
    if (registry.registrationCause.includes('相続')) score += 1
    if (registry.propertyType === '土地') score += 1
    if (hasSharedSignal) score -= 4
    if (heirs.length === 1) score += 1

    const status = hasSharedSignal
      ? '要確認（共有・持分表記あり）'
      : score >= 6
        ? '単独相続候補'
        : '要確認'

    const reasons = [
      hasLand && '土地関連語あり',
      hasInheritance && '相続関連語あり',
      hasSingleSignal && '全部・単独系の表記あり',
      hasSharedSignal && '共有・持分系の表記あり',
      heirs.length === 1 && '相続人/取得者らしき氏名が1名',
    ].filter(Boolean)

    results.push({
      sequence: block.sequence,
      pageNumber: block.pageNumber,
      lineNumber: block.lineNumber,
      scanOrder: block.scanOrder,
      status,
      score,
      location: pickField(excerpt, '所在'),
      lotNumber: pickField(excerpt, '地番'),
      landCategory: pickField(excerpt, '地目'),
      area: pickField(excerpt, '地積'),
      receiptNumber: registry.receiptNumber,
      receiptDate: registry.receiptDate,
      ownershipMode: registry.ownershipMode,
      registrationCause: registry.registrationCause,
      propertyType: registry.propertyType,
      registryAddress: registry.registryAddress,
      extraCount: registry.extraCount,
      heirs,
      reasons,
      excerpt,
    })
  })

  return results
    .sort((a, b) => a.sequence - b.sequence)
}

export function normalizeInheritanceText(text) {
  return normalizeText(text)
}
