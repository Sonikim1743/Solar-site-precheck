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

function parseRegistrySummary(excerpt) {
  const flat = normalizeText(excerpt)
    .replace(/[┃│｜]/g, ' ')
    .replace(/[【】]/g, ' ')
    .replace(/\s+/g, ' ')
  const receiptNumber = toHalfWidthDigits(flat.match(/第\s*([0-9０-９]+)\s*号/)?.[1] || '')
  const dateMatch = flat.match(/([0-9０-９]+)\s*月\s*([0-9０-９]+)\s*日\s*受付/)
  const receiptDate = dateMatch
    ? `${toHalfWidthDigits(dateMatch[1])}月${toHalfWidthDigits(dateMatch[2])}日`
    : ''
  const ownershipMode = flat.match(/[（(]\s*(単独|共有|共同)\s*[）)]/)?.[1] || ''
  const registrationCause = flat.match(/(所有権移転[・･・\s]*相続|所有権移転|相続)/)?.[1]?.replace(/\s+/g, '') || ''
  const propertyType = flat.match(/(?:既[）)]\s*)?(土地|建物)/)?.[1] || ''
  const landText = flat.match(/(?:既[）)]\s*)?土地\s+(.+)/)?.[1] || ''
  const extraMatch = landText.match(/\s*外\s*([0-9０-９]+)\s*(?:件|筆)?/)
  const addressSource = extraMatch ? landText.slice(0, extraMatch.index) : landText
  const registryAddress = addressSource
    .split(/\s+(?:所在|地番|地目|地積|相続人|所有者|取得者|承継人|第\s*[0-9０-９]+\s*号|土地\s)/)[0]
    .trim()
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

export function analyzeInheritanceText(pages) {
  const results = []
  const seen = new Set()
  let sequence = 0

  pages.forEach((page) => {
    const lines = normalizeText(page.text).split('\n').map((line) => line.trim()).filter(Boolean)
    const receiptIndexes = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /第\s*[0-9０-９]+\s*号/.test(line) && /受付/.test(line))
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
      if (!/(土地|地番|地目|地積)/.test(excerpt)) return
      const key = `${page.pageNumber}:${index}:${excerpt.slice(0, 120)}`
      if (seen.has(key)) return
      seen.add(key)

      const registry = parseRegistrySummary(excerpt)
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
        sequence: sequence++,
        pageNumber: page.pageNumber,
        lineNumber: index + 1,
        scanOrder,
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
  })

  return results
    .sort((a, b) => a.sequence - b.sequence)
    .slice(0, 80)
}

export function normalizeInheritanceText(text) {
  return normalizeText(text)
}
