import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { configurePdfJs, isMobileSafari, pdfLoadOptions } from './pdfCompat.js'
import { analyzeInheritanceText, normalizeInheritanceText, summarizeInheritanceReceipts } from '../utils/inheritance.js'

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

async function extractInheritancePdf(file, onProgress, options = {}) {
  await configurePdfJs()
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument(pdfLoadOptions(data, options.pdfOptions)).promise
  const pages = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress(`${pageNumber}/${pdf.numPages}ページのテキストを確認中…`)
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = normalizeInheritanceText(textLinesFromPdfItems(content.items))
    pages.push({ pageNumber, text, charCount: text.length })
  }

  const fullTextLength = pages.reduce((total, page) => total + page.charCount, 0)
  if (fullTextLength < 20) {
    throw new Error('PDFからテキストを取得できませんでした。スキャンPDFの場合はOCR対応が必要です。')
  }

  return {
    fileName: file.name,
    pageCount: pdf.numPages,
    textLength: fullTextLength,
    pages,
    receiptSummary: summarizeInheritanceReceipts(pages),
    results: analyzeInheritanceText(pages),
  }
}

export async function readInheritancePdf(file, onProgress = () => {}) {
  try {
    return await extractInheritancePdf(file, onProgress)
  } catch (error) {
    if (!isMobileSafari()) throw error

    onProgress('iPhone Safari互換モードで再解析しています…')
    try {
      return await extractInheritancePdf(file, onProgress, {
        pdfOptions: {
          disableRange: true,
          disableStream: true,
          disableAutoFetch: true,
          isImageDecoderSupported: false,
          useWasm: false,
          stopAtErrors: false,
        },
      })
    } catch (safeError) {
      throw new Error([
        'iPhone Safariのブラウザ内解析でPDFを読み取れませんでした。',
        '可能であればPortable / Local版、またはPCブラウザで再試行してください。',
        `通常解析: ${error.message || '失敗'}`,
        `Safari互換解析: ${safeError.message || '失敗'}`,
      ].join(' '))
    }
  }
}

export async function readInheritancePdfOnServer(file, onProgress = () => {}) {
  onProgress('PDFをローカルサーバーで解析しています…')
  const response = await fetch('/api/inheritance-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      'X-File-Name': encodeURIComponent(file.name || '相続資料.pdf'),
    },
    body: file,
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || 'ローカルサーバーでPDFを解析できませんでした。')
  }

  return response.json()
}

export function shouldPreferServerPdfParsing() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const vendor = navigator.vendor || ''
  const isApple = /Apple/.test(vendor) || /iPad|iPhone|iPod/.test(ua)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return isApple && isSafari
}
