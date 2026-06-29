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
  const landMatch = flat.match(/(?:既[）)]\s*)?土地\s+(.+?)(?:\s+外\s*([0-9０-９]+)|$)/)
  const registryAddress = landMatch?.[1]?.trim() || ''
  const extraCount = landMatch?.[2] ? Number(toHalfWidthDigits(landMatch[2])) : 0

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

  pages.forEach((page) => {
    const lines = normalizeText(page.text).split('\n').map((line) => line.trim()).filter(Boolean)
    lines.forEach((line, index) => {
      if (!/(第\s*[0-9０-９]+\s*号|受付|土地|所在|地番|地目|地積)/.test(line)) return
      const excerpt = compactExcerpt(lines, Math.max(0, index - 1), 8)
      if (!/(土地|地番|地目|地積)/.test(excerpt)) return
      const key = `${page.pageNumber}:${excerpt.slice(0, 120)}`
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
        pageNumber: page.pageNumber,
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
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === '単独相続候補' ? -1 : 1
      return b.score - a.score
    })
    .slice(0, 80)
}

export function normalizeInheritanceText(text) {
  return normalizeText(text)
}
