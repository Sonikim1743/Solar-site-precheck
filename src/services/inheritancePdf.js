import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { configurePdfJs, pdfLoadOptions } from './pdfCompat.js'
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

export async function readInheritancePdf(file, onProgress = () => {}) {
  await configurePdfJs()
  const data = await file.arrayBuffer()
  const pdf = await getDocument(pdfLoadOptions(data)).promise
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
