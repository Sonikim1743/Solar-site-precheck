import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { analyzeInheritanceText, normalizeInheritanceText } from '../utils/inheritance.js'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export async function readInheritancePdf(file, onProgress = () => {}) {
  const data = await file.arrayBuffer()
  const pdf = await getDocument({ data }).promise
  const pages = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress(`${pageNumber}/${pdf.numPages}ページのテキストを確認中…`)
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = normalizeInheritanceText(content.items.map((item) => item.str || '').join('\n'))
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
    results: analyzeInheritanceText(pages),
  }
}
