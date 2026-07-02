import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { PSM, createWorker } from 'tesseract.js'
import { thirdMeshCenter } from './nedo.js'
import {
  elevationCandidatesFromOcrText,
  meshCandidatesFromOcrText,
  rateCandidatesFromOcrText,
  selectConsistentRates,
  validateRateSummaries,
} from './nedoValidation.js'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function cropCanvas(source, leftRatio, topRatio, widthRatio, heightRatio) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * widthRatio)
  canvas.height = Math.round(source.height * heightRatio)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(
    source,
    Math.round(source.width * leftRatio),
    Math.round(source.height * topRatio),
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvas
}

function preparedCropCanvas(
  source,
  leftRatio,
  topRatio,
  widthRatio,
  heightRatio,
  targetWidth,
  targetHeight,
  threshold = null,
) {
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(
    source,
    Math.round(source.width * leftRatio),
    Math.round(source.height * topRatio),
    Math.round(source.width * widthRatio),
    Math.round(source.height * heightRatio),
    0,
    0,
    canvas.width,
    canvas.height,
  )
  if (threshold !== null) {
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let index = 0; index < image.data.length; index += 4) {
      const gray = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114
      const value = gray > threshold ? 255 : 0
      image.data[index] = value
      image.data[index + 1] = value
      image.data[index + 2] = value
    }
    context.putImageData(image, 0, 0)
  }
  return canvas
}

function preparedCropRect(source, left, top, right, bottom, xMargin, yMargin, targetWidth, targetHeight, threshold = null) {
  const width = right - left
  const height = bottom - top
  return preparedCropCanvas(
    source,
    (left + width * xMargin) / source.width,
    (top + height * yMargin) / source.height,
    width * (1 - xMargin * 2) / source.width,
    height * (1 - yMargin * 2) / source.height,
    targetWidth,
    targetHeight,
    threshold,
  )
}

function groupCenters(values) {
  const groups = []
  values.forEach((value) => {
    if (!groups.length || value > groups.at(-1).at(-1) + 1) groups.push([value])
    else groups.at(-1).push(value)
  })
  return groups.map((group) => Math.round(group.reduce((total, value) => total + value, 0) / group.length))
}

function darkPixel(data, offset) {
  return data[offset] < 120 && data[offset + 1] < 120 && data[offset + 2] < 120
}

function horizontalLines(canvas, fromRatio = 0, toRatio = 1) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const rows = []
  const start = Math.max(0, Math.floor(canvas.height * fromRatio))
  const end = Math.min(canvas.height, Math.ceil(canvas.height * toRatio))
  for (let y = start; y < end; y += 1) {
    let dark = 0
    const rowOffset = y * canvas.width * 4
    for (let x = 0; x < canvas.width; x += 1) {
      if (darkPixel(image.data, rowOffset + x * 4)) dark += 1
    }
    if (dark > canvas.width * .25) rows.push(y)
  }
  return { centers: groupCenters(rows), image }
}

function detectHeaderLayout(canvas) {
  const { centers, image } = horizontalLines(canvas, .05, .30)
  if (!centers.length) throw new Error('帳票1ページ目の見出し位置を検出できませんでした。')
  const y = centers[0]
  const xs = []
  const rowOffset = y * canvas.width * 4
  for (let x = 0; x < canvas.width; x += 1) {
    if (darkPixel(image.data, rowOffset + x * 4)) xs.push(x)
  }
  if (!xs.length) throw new Error('帳票1ページ目の見出し幅を検出できませんでした。')
  return { left: xs[0], right: xs.at(-1), y }
}

function detectSnowGrid(canvas) {
  const { centers, image } = horizontalLines(canvas)
  if (centers.length < 2) throw new Error('最終ページの積雪行を検出できませんでした。')
  const top = centers.at(-2)
  const bottom = centers.at(-1)
  const innerTop = top + 2
  const innerBottom = bottom - 2
  const columns = []
  for (let x = 0; x < canvas.width; x += 1) {
    let dark = 0
    for (let y = innerTop; y < innerBottom; y += 1) {
      if (darkPixel(image.data, (y * canvas.width + x) * 4)) dark += 1
    }
    if (dark > (innerBottom - innerTop) * .65) columns.push(x)
  }
  const vertical = groupCenters(columns)
  if (vertical.length !== 19) {
    throw new Error(`積雪表の列を正しく検出できませんでした（検出 ${vertical.length}列 / 必要 19列）。`)
  }
  return { top, bottom, vertical }
}

async function renderPage(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber)
  // NEDO reports are image-based. About 300 dpi is needed to distinguish
  // small decimals such as 0.94 from 0.91 reliably.
  const viewport = page.getViewport({ scale: 4.2 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return canvas
}

function normalizeRate(value) {
  if (value > 1 && value <= 100) return value / 100
  return value
}

export async function extractMonsolaPdf(file, onProgress = () => {}, expected = {}) {
  const { mesh: expectedMesh = '', elevation: referenceElevation = null } = expected
  onProgress('PDFを読み込んでいます…')
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  if (pdf.numPages < 2) throw new Error('NEDO帳票のページ構成を確認できませんでした')

  const firstPage = await renderPage(pdf, 1)
  const header = detectHeaderLayout(firstPage)
  const headerWidth = header.right - header.left
  const headerTop = Math.max(0, header.y - firstPage.height * .025)
  const meshCrop = cropCanvas(
    firstPage,
    header.left / firstPage.width,
    headerTop / firstPage.height,
    headerWidth * .24 / firstPage.width,
    (header.y - headerTop) / firstPage.height,
  )
  const elevationCrop = cropCanvas(
    firstPage,
    (header.left + headerWidth * .48) / firstPage.width,
    headerTop / firstPage.height,
    headerWidth * .24 / firstPage.width,
    (header.y - headerTop) / firstPage.height,
  )
  firstPage.width = 1
  firstPage.height = 1

  const lastPage = await renderPage(pdf, pdf.numPages)
  const snowGrid = detectSnowGrid(lastPage)
  const snowCrops = Array.from({ length: 17 }, (_, index) => {
    const left = snowGrid.vertical[index + 1]
    const right = snowGrid.vertical[index + 2]
    return [
      {
        variant: 'original',
        canvas: preparedCropRect(lastPage, left, snowGrid.top, right, snowGrid.bottom, .05, .02, 600, 260),
      },
      {
        variant: 'inner',
        canvas: preparedCropRect(lastPage, left, snowGrid.top, right, snowGrid.bottom, .10, .10, 800, 300),
      },
      {
        variant: 'binary',
        canvas: preparedCropRect(lastPage, left, snowGrid.top, right, snowGrid.bottom, .10, .10, 800, 300, 175),
      },
    ]
  })
  lastPage.width = 1
  lastPage.height = 1
  const worker = await createWorker('eng', 1, {
    logger(message) {
      if (message.status === 'recognizing text') {
        onProgress(`数値を読み取っています… ${Math.round(message.progress * 100)}%`)
      }
    },
  })

  try {
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789.,',
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      preserve_interword_spaces: '1',
    })

    const meshResult = await worker.recognize(meshCrop)
    const elevationResult = await worker.recognize(elevationCrop)
    const meshCandidates = meshCandidatesFromOcrText(meshResult.data.text)
    const meshCode = expectedMesh
      ? meshCandidates.find((candidate) => candidate === expectedMesh)
      : meshCandidates.at(-1)
    if (!meshCode) {
      throw new Error(`候補地点の3次メッシュ（${expectedMesh || '未指定'}）をPDFから確認できませんでした。読取候補: ${meshCandidates.join(', ') || 'なし'}`)
    }
    const meshCenter = thirdMeshCenter(meshCode)

    const rateReadings = []
    for (let index = 0; index < snowCrops.length; index += 1) {
      const readings = []
      for (let variantIndex = 0; variantIndex < snowCrops[index].length; variantIndex += 1) {
        onProgress(`積雪出現率を交差読取中… ${index + 1}/17（${variantIndex + 1}/3）`)
        const { variant, canvas } = snowCrops[index][variantIndex]
        const result = await worker.recognize(canvas)
        const values = rateCandidatesFromOcrText(result.data.text)
        values.forEach((value) => readings.push({
          variant,
          text: result.data.text,
          confidence: result.data.confidence,
          value,
        }))
        canvas.width = 1
        canvas.height = 1
      }
      rateReadings.push(readings)
    }
    const rateSelection = selectConsistentRates(rateReadings)
    const rates = rateSelection.rates.map(normalizeRate)

    const elevationCandidates = elevationCandidatesFromOcrText(elevationResult.data.text)
    const closestElevation = Number.isFinite(referenceElevation)
      ? elevationCandidates.reduce((best, value) => (
          best === null || Math.abs(value - referenceElevation) < Math.abs(best - referenceElevation) ? value : best
        ), null)
      : null
    const elevation = Number.isFinite(closestElevation) && Math.abs(closestElevation - referenceElevation) <= 300
      ? closestElevation
      : null
    const { lat, lon, latDeg, latMin, lonDeg, lonMin } = meshCenter
    validateRateSummaries(rates)
    return {
      id: meshCode,
      name: `3次メッシュ ${meshCode}`,
      latDeg: Number(latDeg),
      latMin: Number(latMin),
      lonDeg: Number(lonDeg),
      lonMin: Number(lonMin),
      lat,
      lon,
      elevation,
      distanceKm: 0,
      snow10cm: {
        monthly: rates.slice(0, 12),
        annual: rates[12],
        winter: rates[13],
        spring: rates[14],
        summer: rates[15],
        autumn: rates[16],
      },
      source: {
        name: 'NEDO MONSOLA-11 PDF帳票',
        url: 'https://www.nedo.go.jp/seika_hyoka/nissharyou.html',
        statisticalPeriod: '1981-2009',
        field: '月別の積雪深10cm以上の出現率',
      },
      mode: 'nedo-pdf',
      verified: true,
      validationVersion: 2,
      verification: {
        method: '3方式OCR + 年・季節集計交差検証',
        correctedColumns: rateSelection.correctedColumns,
        disagreementColumns: rateSelection.disagreementColumns,
        elevationCandidates,
        elevationReference: referenceElevation,
      },
      fileName: file.name,
      ocrText: {
        mesh: meshResult.data.text,
        elevation: elevationResult.data.text,
        rates: rateReadings.map((readings) => readings.map(({ variant, text, confidence }) => ({ variant, text, confidence }))),
      },
    }
  } finally {
    await worker.terminate()
  }
}
