import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function safeFileName(name) {
  return String(name || 'drawing')
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim() || 'drawing'
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('JPG画像を作成できませんでした。'))
    }, 'image/jpeg', quality)
  })
}

async function renderPageToCanvas(pdf, pageNumber, scale) {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: context, viewport }).promise
  return canvas
}

export async function preparePdfJpgPreview(file, onProgress = () => {}, options = {}) {
  const previewScale = options.previewScale ?? 0.7
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const pages = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress(`${pageNumber}/${pdf.numPages}ページのプレビューを作成中…`)
    const canvas = await renderPageToCanvas(pdf, pageNumber, previewScale)
    pages.push({
      pageNumber,
      previewUrl: canvas.toDataURL('image/jpeg', 0.82),
      width: canvas.width,
      height: canvas.height,
    })
    canvas.width = 1
    canvas.height = 1
  }

  return {
    file,
    baseName: safeFileName(file.name),
    pageCount: pdf.numPages,
    pages,
  }
}

async function writeBlobToDirectory(directoryHandle, fileName, blob) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
}

export async function savePdfPagesAsJpg(file, pageNumbers, onProgress = () => {}, options = {}) {
  const scale = options.scale ?? 2.4
  const quality = options.quality ?? 0.92
  const baseName = safeFileName(file.name)
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const selected = pageNumbers.length ? pageNumbers : Array.from({ length: pdf.numPages }, (_, index) => index + 1)

  for (let index = 0; index < selected.length; index += 1) {
    const pageNumber = selected[index]
    onProgress(`${index + 1}/${selected.length}ページをJPGに保存中…`)
    const canvas = await renderPageToCanvas(pdf, pageNumber, scale)
    const blob = await canvasToJpegBlob(canvas, quality)
    const suffix = pdf.numPages > 1 ? `_p${String(pageNumber).padStart(2, '0')}` : ''
    const fileName = `${baseName}${suffix}.jpg`
    if (options.directoryHandle) await writeBlobToDirectory(options.directoryHandle, fileName, blob)
    else downloadBlob(blob, fileName)
    canvas.width = 1
    canvas.height = 1
  }

  return selected.length
}
