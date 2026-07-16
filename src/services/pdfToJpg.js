import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { configurePdfJs, pdfLoadOptions } from './pdfCompat.js'

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

function normalizeRotation(value) {
  const normalized = Number(value) % 360
  return ((normalized + 360) % 360)
}

function drawTextOverlay(canvas, overlay = {}) {
  const text = String(overlay.text || '').trim()
  if (!text) return
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const xRatio = Number.isFinite(overlay.x) ? overlay.x : 0.5
  const yRatio = Number.isFinite(overlay.y) ? overlay.y : 0.5
  const x = Math.max(0, Math.min(canvas.width, canvas.width * xRatio))
  const y = Math.max(0, Math.min(canvas.height, canvas.height * yRatio))
  const baseSize = Number.isFinite(overlay.size) ? overlay.size : 28
  const scale = Math.max(0.7, Math.min(1.8, Math.min(canvas.width, canvas.height) / 900))
  const fontSize = Math.max(14, Math.min(96, Math.round(baseSize * scale)))
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 4)
  if (!lines.length) return

  context.save()
  context.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Yu Gothic", "Meiryo", sans-serif`
  context.textBaseline = 'top'
  context.textAlign = 'center'
  const lineHeight = Math.round(fontSize * 1.28)
  const textBlockHeight = lineHeight * lines.length
  context.translate(x, y)
  context.lineWidth = Math.max(2, Math.round(fontSize * 0.09))
  context.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  context.fillStyle = 'rgba(20, 35, 30, 0.92)'
  lines.forEach((line, index) => {
    const yOffset = index * lineHeight - textBlockHeight / 2
    context.strokeText(line, 0, yOffset)
    context.fillText(line, 0, yOffset)
  })
  context.restore()
}

async function blobToUint8Array(blob) {
  return new Uint8Array(await blob.arrayBuffer())
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('貼り付け画像を読み込めませんでした。'))
    image.src = src
  })
}

function fitRectContain(boxWidth, boxHeight, contentWidth, contentHeight) {
  const safeBoxWidth = Math.max(1, boxWidth)
  const safeBoxHeight = Math.max(1, boxHeight)
  const safeContentWidth = Math.max(1, contentWidth)
  const safeContentHeight = Math.max(1, contentHeight)
  const boxAspect = safeBoxWidth / safeBoxHeight
  const contentAspect = safeContentWidth / safeContentHeight
  if (boxAspect > contentAspect) {
    const height = safeBoxHeight
    const width = height * contentAspect
    return { width, height }
  }
  const width = safeBoxWidth
  const height = width / contentAspect
  return { width, height }
}

async function drawImageOverlay(canvas, overlay = {}) {
  if (!overlay.src) return
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const image = await loadImageElement(overlay.src)
  const x = Math.max(0, Math.min(1, Number.isFinite(overlay.x) ? overlay.x : 0.1))
  const y = Math.max(0, Math.min(1, Number.isFinite(overlay.y) ? overlay.y : 0.1))
  const widthRatio = Math.max(0.02, Math.min(1, Number.isFinite(overlay.width) ? overlay.width : 0.25))
  const heightRatio = Math.max(0.02, Math.min(1, Number.isFinite(overlay.height) ? overlay.height : 0.18))
  const left = x * canvas.width
  const top = y * canvas.height
  const width = widthRatio * canvas.width
  const height = heightRatio * canvas.height
  const imageWidth = image.naturalWidth || image.width || 1
  const imageHeight = image.naturalHeight || image.height || 1
  const fitted = fitRectContain(width, height, imageWidth, imageHeight)
  const rotation = normalizeRotation(Number.isFinite(overlay.rotation) ? overlay.rotation : 0)
  context.save()
  context.translate(left + width / 2, top + height / 2)
  if (rotation) {
    context.rotate((rotation * Math.PI) / 180)
  }
  context.drawImage(image, -fitted.width / 2, -fitted.height / 2, fitted.width, fitted.height)
  context.restore()
}

function buildSimplePdfFromJpegs(pages) {
  const encoder = new TextEncoder()
  const parts = []
  const offsets = [0]
  let byteLength = 0

  function appendText(text) {
    const bytes = encoder.encode(text)
    parts.push(bytes)
    byteLength += bytes.length
  }

  function appendBytes(bytes) {
    parts.push(bytes)
    byteLength += bytes.length
  }

  function addObject(id, bodyParts) {
    offsets[id] = byteLength
    appendText(`${id} 0 obj\n`)
    for (const part of bodyParts) {
      if (typeof part === 'string') appendText(part)
      else appendBytes(part)
    }
    appendText('\nendobj\n')
  }

  appendText('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')

  const pageIds = pages.map((_, index) => 3 + index * 3)
  const kids = pageIds.map((id) => `${id} 0 R`).join(' ')
  addObject(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
  addObject(2, [`<< /Type /Pages /Kids [ ${kids} ] /Count ${pages.length} >>`])

  pages.forEach((page, index) => {
    const pageId = pageIds[index]
    const imageId = pageId + 1
    const contentId = pageId + 2
    const width = Math.max(1, Math.round(page.width))
    const height = Math.max(1, Math.round(page.height))
    const drawCommand = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`
    const drawBytes = encoder.encode(drawCommand)

    addObject(pageId, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    ])
    addObject(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      page.jpeg,
      '\nendstream',
    ])
    addObject(contentId, [
      `<< /Length ${drawBytes.length} >>\nstream\n`,
      drawBytes,
      '\nendstream',
    ])
  })

  const xrefOffset = byteLength
  const objectCount = 2 + pages.length * 3
  appendText(`xref\n0 ${objectCount + 1}\n`)
  appendText('0000000000 65535 f \n')
  for (let id = 1; id <= objectCount; id += 1) {
    appendText(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  }
  appendText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  return new Blob(parts, { type: 'application/pdf' })
}

async function renderPageToCanvas(pdf, pageNumber, scale, rotation = 0) {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale, rotation: normalizeRotation(rotation) })
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
  await configurePdfJs()
  const previewScale = options.previewScale ?? 0.7
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument(pdfLoadOptions(data)).promise
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

async function writeBlobToFileHandle(fileHandle, blob) {
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
}

export async function savePdfPagesAsJpg(file, pageNumbers, onProgress = () => {}, options = {}) {
  await configurePdfJs()
  const scale = options.scale ?? 2.4
  const quality = options.quality ?? 0.92
  const baseName = safeFileName(options.fileNameBase || file.name)
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument(pdfLoadOptions(data)).promise
  const selected = pageNumbers.length ? pageNumbers : Array.from({ length: pdf.numPages }, (_, index) => index + 1)

  for (let index = 0; index < selected.length; index += 1) {
    const pageNumber = selected[index]
    onProgress(`${index + 1}/${selected.length}ページをJPGに保存中…`)
    const canvas = await renderPageToCanvas(pdf, pageNumber, scale)
    const blob = await canvasToJpegBlob(canvas, quality)
    const suffix = pdf.numPages > 1 ? `_p${String(pageNumber).padStart(2, '0')}` : ''
    const fileName = `${baseName}${suffix}.jpg`
    if (options.fileHandle && selected.length === 1) await writeBlobToFileHandle(options.fileHandle, blob)
    else if (options.directoryHandle) await writeBlobToDirectory(options.directoryHandle, fileName, blob)
    else downloadBlob(blob, fileName)
    canvas.width = 1
    canvas.height = 1
  }

  return selected.length
}

export async function savePdfPagesAsPdf(file, pageNumbers, pageRotations = {}, onProgress = () => {}, options = {}) {
  await configurePdfJs()
  const scale = options.scale ?? 2
  const quality = options.quality ?? 0.92
  const baseName = safeFileName(options.fileNameBase || file.name)
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument(pdfLoadOptions(data)).promise
  const selected = pageNumbers.length ? pageNumbers : Array.from({ length: pdf.numPages }, (_, index) => index + 1)
  const pages = []

  for (let index = 0; index < selected.length; index += 1) {
    const pageNumber = selected[index]
    const rotation = normalizeRotation(pageRotations[pageNumber] || 0)
    onProgress(`${index + 1}/${selected.length}ページをPDF用に準備中…`)
    const outputCanvas = await renderPageToCanvas(pdf, pageNumber, scale, rotation)
    const imageAnnotations = options.imageOverlay?.annotations?.[pageNumber] || []
    for (const annotation of imageAnnotations) {
      await drawImageOverlay(outputCanvas, annotation)
    }
    const annotations = options.textOverlay?.annotations?.[pageNumber] || []
    annotations.forEach((annotation) => drawTextOverlay(outputCanvas, annotation))
    const jpeg = await blobToUint8Array(await canvasToJpegBlob(outputCanvas, quality))
    pages.push({
      width: outputCanvas.width,
      height: outputCanvas.height,
      jpeg,
    })
    outputCanvas.width = 1
    outputCanvas.height = 1
  }

  const blob = buildSimplePdfFromJpegs(pages)
  const fileName = `${baseName}_selected.pdf`
  if (options.fileHandle) await writeBlobToFileHandle(options.fileHandle, blob)
  else downloadBlob(blob, fileName)
  return selected.length
}

export async function savePreparedPdfPagesAsPdf(pageItems, pageRotations = {}, onProgress = () => {}, options = {}) {
  await configurePdfJs()
  const scale = options.scale ?? 2
  const quality = options.quality ?? 0.92
  const selected = Array.from(pageItems || []).filter((item) => item?.file && item?.sourcePageNumber)
  if (!selected.length) throw new Error('保存するページを選択してください。')
  const pdfCache = new Map()
  const pages = []

  async function getPdf(file) {
    if (pdfCache.has(file)) return pdfCache.get(file)
    const data = new Uint8Array(await file.arrayBuffer())
    const pdf = await getDocument(pdfLoadOptions(data)).promise
    pdfCache.set(file, pdf)
    return pdf
  }

  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index]
    const pageId = item.pageNumber
    const rotation = normalizeRotation(pageRotations[pageId] || 0)
    onProgress(`${index + 1}/${selected.length}ページをPDF用に準備中…`)
    const pdf = await getPdf(item.file)
    const outputCanvas = await renderPageToCanvas(pdf, item.sourcePageNumber, scale, rotation)
    const imageAnnotations = options.imageOverlay?.annotations?.[pageId] || []
    for (const annotation of imageAnnotations) {
      await drawImageOverlay(outputCanvas, annotation)
    }
    const annotations = options.textOverlay?.annotations?.[pageId] || []
    annotations.forEach((annotation) => drawTextOverlay(outputCanvas, annotation))
    const jpeg = await blobToUint8Array(await canvasToJpegBlob(outputCanvas, quality))
    pages.push({
      width: outputCanvas.width,
      height: outputCanvas.height,
      jpeg,
    })
    outputCanvas.width = 1
    outputCanvas.height = 1
  }

  const blob = buildSimplePdfFromJpegs(pages)
  const fileName = `${safeFileName(options.fileNameBase || 'PDFまとめ')}.pdf`
  if (options.fileHandle) await writeBlobToFileHandle(options.fileHandle, blob)
  else downloadBlob(blob, fileName)
  return selected.length
}

export async function saveMergedPdfFilesAsPdf(files, onProgress = () => {}, options = {}) {
  await configurePdfJs()
  const scale = options.scale ?? 1.8
  const quality = options.quality ?? 0.9
  const inputFiles = Array.from(files || []).filter((file) => file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || ''))
  if (inputFiles.length < 2) throw new Error('結合するPDFを2つ以上選択してください。')
  const pages = []
  let totalPages = 0

  for (let fileIndex = 0; fileIndex < inputFiles.length; fileIndex += 1) {
    const file = inputFiles[fileIndex]
    onProgress(`${fileIndex + 1}/${inputFiles.length}ファイル目を読み込んでいます…`)
    const data = new Uint8Array(await file.arrayBuffer())
    const pdf = await getDocument(pdfLoadOptions(data)).promise
    totalPages += pdf.numPages
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(`${fileIndex + 1}/${inputFiles.length}ファイル目 ${pageNumber}/${pdf.numPages}ページを結合準備中…`)
      const canvas = await renderPageToCanvas(pdf, pageNumber, scale)
      const jpeg = await blobToUint8Array(await canvasToJpegBlob(canvas, quality))
      pages.push({
        width: canvas.width,
        height: canvas.height,
        jpeg,
      })
      canvas.width = 1
      canvas.height = 1
    }
  }

  const blob = buildSimplePdfFromJpegs(pages)
  const fileName = `${safeFileName(options.fileNameBase || 'PDFまとめ')}.pdf`
  if (options.fileHandle) await writeBlobToFileHandle(options.fileHandle, blob)
  else downloadBlob(blob, fileName)
  return { fileCount: inputFiles.length, pageCount: totalPages }
}

export async function saveImageFilesAsPdf(files, onProgress = () => {}, options = {}) {
  const inputFiles = Array.from(files || []).filter((file) => /^image\//i.test(file?.type || '') || /\.(jpe?g|png|webp)$/i.test(file?.name || ''))
  if (!inputFiles.length) throw new Error('PDFに変換する画像を選択してください。')
  const quality = options.quality ?? 0.92
  const pages = []

  for (let index = 0; index < inputFiles.length; index += 1) {
    const file = inputFiles[index]
    onProgress(`${index + 1}/${inputFiles.length}枚目の画像をPDF用に準備中…`)
    const src = URL.createObjectURL(file)
    try {
      const image = await loadImageElement(src)
      const maxSide = options.maxSide ?? 2200
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height))
      const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
      const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.fillStyle = '#fff'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      const jpeg = await blobToUint8Array(await canvasToJpegBlob(canvas, quality))
      pages.push({ width, height, jpeg })
      canvas.width = 1
      canvas.height = 1
    } finally {
      URL.revokeObjectURL(src)
    }
  }

  const blob = buildSimplePdfFromJpegs(pages)
  const fileName = `${safeFileName(options.fileNameBase || '画像PDF')}.pdf`
  if (options.fileHandle) await writeBlobToFileHandle(options.fileHandle, blob)
  else downloadBlob(blob, fileName)
  return inputFiles.length
}
