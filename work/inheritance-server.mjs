import { existsSync } from 'node:fs'

function normalizeText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t　]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

let pdfModulePromise = null

function pdfWorkerSrc() {
  const portableWorker = new URL('./pdfjs/pdf.worker.mjs', import.meta.url)
  if (existsSync(portableWorker)) return portableWorker.href
  return new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href
}

function installPdfNodePolyfills() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init) {
        const values = Array.isArray(init) ? init : []
        this.a = values[0] ?? 1
        this.b = values[1] ?? 0
        this.c = values[2] ?? 0
        this.d = values[3] ?? 1
        this.e = values[4] ?? 0
        this.f = values[5] ?? 0
        this.m11 = this.a
        this.m12 = this.b
        this.m21 = this.c
        this.m22 = this.d
        this.m41 = this.e
        this.m42 = this.f
      }

      multiply() {
        return this
      }

      translate() {
        return this
      }

      scale() {
        return this
      }

      rotate() {
        return this
      }

      inverse() {
        return this
      }
    }
  }

  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {}
  }

  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
      constructor(data, width, height) {
        this.data = data
        this.width = width
        this.height = height
      }
    }
  }
}

async function loadPdfJs() {
  if (!pdfModulePromise) {
    installPdfNodePolyfills()
    pdfModulePromise = import('./pdfjs/pdf.mjs')
      .catch(async (portableError) => {
        try {
          return await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs')
        } catch (fallbackError) {
          throw new Error([
            'PDF.jsの読込に失敗しました。',
            `portable: ${portableError?.message || portableError}`,
            `fallback: ${fallbackError?.message || fallbackError}`,
          ].join(' '))
        }
      })
      .then((module) => {
        if (module.GlobalWorkerOptions) {
          module.GlobalWorkerOptions.workerSrc = pdfWorkerSrc()
        }
        return module
      })
  }
  return pdfModulePromise
}

function toHalfWidthDigits(value) {
  return String(value || '').replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
}

function cleanRegistryAddress(value) {
  return String(value || '')
    .split(/[│┃┠┗┏┯┼┨┓]/)[0]
    .replace(/\s+(?:の変更・更正|無償名義).*$/, '')
    .trim()
}

function compactExcerpt(lines, start, size = 12) {
  return normalizeText(lines.slice(start, start + size).join('\n'))
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

function lineReceiptNumber(line) {
  return toHalfWidthDigits(String(line || '').match(/第\s*([0-9０-９]+)\s*号/)?.[1] || '')
}

function textLinesFromPdfItems(items) {
  const rows = []

  items.forEach((item, index) => {
    const text = item.str || ''
    if (!text.trim()) return
    const x = item.transform?.[4] ?? 0
    const y = item.transform?.[5] ?? -index
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < 2)
    if (!row) {
      row = { y, parts: [] }
      rows.push(row)
    }
    row.parts.push({ x, text })
  })

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.parts
      .sort((a, b) => a.x - b.x)
      .map((part) => part.text)
      .join(''))
    .join('\n')
}

function extractReceiptBlocks(pages) {
  const blocks = []
  const seen = new Set()
  let sequence = 0

  pages.forEach((page) => {
    const lines = normalizeText(page.text).split('\n').map((line) => line.trim()).filter(Boolean)
    const receiptIndexes = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /第\s*[0-9０-９]+\s*号/.test(line) && /受付/.test(line))
      .map(({ index }) => index)

    receiptIndexes.forEach((startIndex, localIndex) => {
      const nextReceiptIndex = receiptIndexes[localIndex + 1] ?? lines.length
      const excerpt = normalizeText(lines.slice(startIndex, nextReceiptIndex).join('\n'))
      const parsed = parseRegistrySummary(excerpt)
      const key = `${page.pageNumber}-${parsed.receiptNumber || sequence}-${startIndex}`
      if (seen.has(key)) return
      seen.add(key)
      blocks.push({
        pageNumber: page.pageNumber,
        sequence: sequence++,
        excerpt,
        ...parsed,
      })
    })
  })

  return blocks
}

function analyzeInheritanceText(pages) {
  return extractReceiptBlocks(pages).filter((item) => {
    const flat = `${item.ownershipMode} ${item.registrationCause} ${item.propertyType} ${item.excerpt}`
    return /単独/.test(flat) && /所有権移転/.test(flat) && /相続/.test(flat) && /土地/.test(flat)
  })
}

function summarizeInheritanceReceipts(pages) {
  const readNumbers = []
  const missingEvidence = []

  pages.forEach((page) => {
    const lines = normalizeText(page.text).split('\n').map((line) => line.trim()).filter(Boolean)
    lines.forEach((line, index) => {
      const number = lineReceiptNumber(line)
      if (number) readNumbers.push(Number(number))
      if (/黒|■|□|取下|受付/.test(line)) {
        const nearby = compactExcerpt(lines, Math.max(0, index - 2), 5)
        const nearbyNumber = lineReceiptNumber(nearby)
        if (nearbyNumber) {
          missingEvidence.push({
            receiptNumber: Number(nearbyNumber),
            pageNumber: page.pageNumber,
            label: /取下/.test(nearby) ? '取下' : /黒|■|□/.test(nearby) ? '黒塗り' : '表示形式違い候補',
            excerpt: nearby,
          })
        }
      }
    })
  })

  const uniqueNumbers = [...new Set(readNumbers)].sort((a, b) => a - b)
  const firstNumber = uniqueNumbers[0] || null
  const lastNumber = uniqueNumbers[uniqueNumbers.length - 1] || null
  const expectedCount = firstNumber && lastNumber ? lastNumber - firstNumber + 1 : 0
  const missingNumbers = []
  if (firstNumber && lastNumber) {
    const found = new Set(uniqueNumbers)
    for (let number = firstNumber; number <= lastNumber; number += 1) {
      if (!found.has(number)) missingNumbers.push(number)
    }
  }
  const explainedSet = new Set(missingEvidence.map((item) => item.receiptNumber))
  const explainedMissingCount = missingNumbers.filter((number) => explainedSet.has(number)).length
  const missingBreakdown = missingEvidence.reduce((acc, item) => {
    acc[item.label] = (acc[item.label] || 0) + 1
    return acc
  }, {})

  return {
    firstNumber,
    lastNumber,
    expectedCount,
    readCount: uniqueNumbers.length,
    missingCount: missingNumbers.length,
    missingNumbers: missingNumbers.slice(0, 30),
    explainedMissingCount,
    unexplainedMissingCount: Math.max(0, missingNumbers.length - explainedMissingCount),
    missingExplanationMatches: missingNumbers.length === explainedMissingCount,
    missingBreakdown,
    missingDetails: missingEvidence.filter((item) => missingNumbers.includes(item.receiptNumber)).slice(0, 30),
    isContinuous: expectedCount > 0 && missingNumbers.length === 0,
  }
}

export async function readInheritancePdfOnServer(buffer, fileName = '相続資料.pdf') {
  const { getDocument } = await loadPdfJs()
  const data = new Uint8Array(buffer)
  const pdf = await getDocument({
    data,
    disableWorker: true,
    isOffscreenCanvasSupported: false,
    useWorkerFetch: false,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise
  const pages = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = normalizeText(textLinesFromPdfItems(content.items))
    pages.push({ pageNumber, text, charCount: text.length })
  }

  const textLength = pages.reduce((total, page) => total + page.charCount, 0)
  if (textLength < 20) {
    throw new Error('PDFからテキストを取得できませんでした。スキャンPDFの場合はOCR対応が必要です。')
  }

  return {
    fileName,
    pageCount: pdf.numPages,
    textLength,
    pages,
    receiptSummary: summarizeInheritanceReceipts(pages),
    results: analyzeInheritanceText(pages),
    serverParsed: true,
  }
}
