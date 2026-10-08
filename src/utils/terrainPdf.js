import { terrainGeometryKey } from './terrainArea.js'
import { measureParcelReview } from './parcelReview.js'
import { terrainSlopeDistribution, formatTerrainSlopeArea } from './terrainSlopeDistribution.js'

const PAGE_MM = [420, 297]
const DPI = 240
const PX_PER_MM = DPI / 25.4
const FONT = 'Meiryo, "Noto Sans JP", "Hiragino Kaku Gothic ProN", sans-serif'
const INK = '#273f35', MUTED = '#617569', LINE = '#cad8cf'
const encoder = new TextEncoder()
const fail = message => { throw new Error(`地形PDF：${message}`) }
const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim()
const numeric = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString('ja-JP', { maximumFractionDigits: digits }) : '—'

// Browser font/image encoders can leave their promises pending indefinitely.
// Bound each wait as well as the complete export, and detach all listeners.
function boundedWait(promise, signal, message) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (handler, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', aborted)
      handler(value)
    }
    const aborted = () => finish(reject, signal.reason || new Error('地形PDFの作成を中止しました。'))
    const timer = setTimeout(() => finish(reject, new Error(message)), 15000)
    signal.addEventListener('abort', aborted, { once: true })
    // Attach both handlers even when already aborted, so a late rejection is handled.
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error))
    if (signal.aborted) aborted()
  })
}

function jpegSize(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) fail('ページ画像がJPEGではありません。')
  let offset = 2
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 255) fail('JPEGの構造が不正です。')
    while (bytes[offset] === 255) offset++
    const marker = bytes[offset++]
    if (marker === 218 || marker === 217) break
    if (marker === 1 || marker >= 208 && marker <= 215) continue
    const length = bytes[offset] * 256 + bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) fail('JPEGの長さが不正です。')
    if ([192, 193, 194].includes(marker)) {
      if (length < 8 || bytes[offset + 2] !== 8 || bytes[offset + 7] !== 3) fail('ページ画像は8bit RGB JPEGで作成してください。')
      return { height: bytes[offset + 3] * 256 + bytes[offset + 4], width: bytes[offset + 5] * 256 + bytes[offset + 6] }
    }
    offset += length
  }
  fail('JPEGの画像寸法を確認できません。')
}

// Pure, dependency-free PDF writer. All PDF syntax is ASCII; Japanese lives in
// the two browser-rendered JPEG pages. Byte counts include raw image bytes.
export function createTerrainPdfBytes(pages) {
  if (!Array.isArray(pages) || pages.length !== 2) fail('A3横2ページの画像が必要です。')
  for (const page of pages) {
    const size = jpegSize(page?.bytes)
    if (!Number.isInteger(page.width) || !Number.isInteger(page.height) || page.width < 1 || page.height < 1 || page.width > 16000 || page.height > 16000 || size.width !== page.width || size.height !== page.height) fail('ページ画像の寸法が一致しません。')
  }
  const chunks = [], offsets = [0]
  let length = 0
  const add = value => { const bytes = typeof value === 'string' ? encoder.encode(value) : value; chunks.push(bytes); length += bytes.length }
  const object = (id, head, stream) => {
    offsets[id] = length
    add(`${id} 0 obj\n${head}`)
    if (stream) { add('\nstream\n'); add(stream); add('\nendstream') }
    add('\nendobj\n')
  }
  const [width, height] = PAGE_MM.map(value => (value * 72 / 25.4).toFixed(6))
  add('%PDF-1.4\n')
  add(new Uint8Array([37, 226, 227, 207, 211, 10]))
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>')
  pages.forEach((page, index) => {
    const id = 3 + index * 3
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`)
    object(id + 1, `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>`, page.bytes)
    const content = encoder.encode(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`)
    object(id + 2, `<< /Length ${content.length} >>`, content)
  })
  const xref = length
  add('xref\n0 9\n0000000000 65535 f \n')
  for (let id = 1; id <= 8; id++) add(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  add(`trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const result = new Uint8Array(length)
  let cursor = 0
  for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.length }
  return result
}

export function terrainPdfFileName(report, now = new Date()) {
  const chars = Array.from(String(report?.siteName || report?.placeLabel || '候補地').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/[.\s]+$/g, '').trim()).slice(0, 64)
  // Leave room for the Japanese prefix/date on filesystems with a 255-byte limit.
  while (encoder.encode(chars.join('')).length > 180) chars.pop()
  const name = chars.join('') || '候補地'
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return `地形参考図_${name}_${date}.pdf`
}

const SVG_STYLES = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'font-family', 'font-size', 'font-style', 'font-weight', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'paint-order', 'color', 'visibility', 'display', 'clip-path', 'clip-rule', 'filter']

function localSvgValue(value) {
  return value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g, (_, quote, target) => {
    const hash = target.lastIndexOf('#')
    if (hash < 0 || !target.slice(hash + 1).match(/^[A-Za-z0-9_.:\-]+$/)) fail('図に外部画像または参照が含まれています。')
    if (hash > 0 && target.slice(0, hash) !== document.URL.split('#')[0]) fail('図の外部参照は保存できません。')
    return `url(#${target.slice(hash + 1)})`
  })
}

function snapshotSvg(svg, widthMm, checkDeadline) {
  checkDeadline()
  if (svg.querySelector('image, foreignObject, script, use, iframe, style')) fail('図の形式に対応していません。')
  const clone = svg.cloneNode(true)
  const originals = [svg, ...svg.querySelectorAll('*')], copies = [clone, ...clone.querySelectorAll('*')]
  originals.forEach((node, index) => {
    if (index % 64 === 0) checkDeadline()
    const style = getComputedStyle(node)
    copies[index].removeAttribute('style')
    for (const property of SVG_STYLES) {
      const value = style.getPropertyValue(property)
      if (value) copies[index].style.setProperty(property, localSvgValue(value))
    }
    for (const attribute of [...copies[index].attributes]) if (/^on/i.test(attribute.name)) copies[index].removeAttribute(attribute.name)
  })
  const viewBox = svg.viewBox.baseVal
  if (!(viewBox.width > 0 && viewBox.height > 0)) fail('図の表示寸法を確認できません。')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(Math.ceil(widthMm * PX_PER_MM)))
  clone.setAttribute('height', String(Math.ceil(widthMm * PX_PER_MM * viewBox.height / viewBox.width)))
  return { xml: new XMLSerializer().serializeToString(clone), ratio: viewBox.height / viewBox.width }
}

async function loadSvg(snapshot, signal) {
  const image = new Image()
  const url = URL.createObjectURL(new Blob([snapshot.xml], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    await boundedWait(new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('地形図をPDF用画像に変換できませんでした。'))
      image.src = url
    }), signal, '地形図の画像化に時間がかかっています。再試行してください。')
    return image
  } catch (error) {
    image.removeAttribute('src')
    throw error
  } finally {
    image.onload = null; image.onerror = null
    URL.revokeObjectURL(url)
  }
}

function drawText(ctx, value, x, y, width, { size = 3.5, lineHeight = 5.2, weight = 400, color = INK, maxLines = 100, ellipsis = false } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  const lines = []
  for (const paragraph of String(value || '').split('\n')) {
    let line = ''
    for (const char of Array.from(paragraph)) {
      if (line && ctx.measureText(line + char).width > width) { lines.push(line); line = '' }
      line += char
    }
    lines.push(line)
  }
  if (lines.length > maxLines) {
    if (!ellipsis) fail('説明がページに収まりません。候補地メモを短くして再試行してください。')
    lines.length = maxLines
    while (ctx.measureText(lines.at(-1) + '…').width > width) lines[lines.length - 1] = Array.from(lines.at(-1)).slice(0, -1).join('')
    lines[lines.length - 1] += '…'
  }
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight))
  return y + lines.length * lineHeight
}

function rule(ctx, x, y, width) { ctx.strokeStyle = LINE; ctx.lineWidth = .25; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.stroke() }
function heading(ctx, label, x, y, width) { ctx.fillStyle = '#eef3ef'; ctx.fillRect(x, y, width, 8); drawText(ctx, label, x + 2, y + 1.5, width - 4, { size: 4, weight: 700, maxLines: 1 }); return y + 11 }

function frame(ctx, model, page) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ...PAGE_MM)
  drawText(ctx, '候補地・詳細設計前の参考検討', 12, 9, 340, { size: 3, color: MUTED })
  drawText(ctx, page === 1 ? '等高線・勾配と検討範囲' : '実DEMの3D地形と確認事項', 12, 17, 337, { size: 6.5, weight: 700, maxLines: 1 })
  drawText(ctx, `地形参考図 / ${page} of 2`, 356, 17, 52, { size: 3.2, maxLines: 1 })
  drawText(ctx, model.name, 12, 29, 396, { size: 4, maxLines: 2, ellipsis: true })
  rule(ctx, 12, 43, 396)
  rule(ctx, 12, 271, 396)
  drawText(ctx, `${model.coordinates}範囲：地図上の参考図形`, 12, 274, 210, { size: 2.8, maxLines: 1 })
  drawText(ctx, `取得 ${model.fetchedAt} / Solar Site Precheck v${model.appVersion}`, 225, 274, 183, { size: 2.8, maxLines: 1, ellipsis: true })
  drawText(ctx, '画像形式PDF（文字検索・選択不可）。編集用データは検討記録に保存してください。', 12, 282, 396, { size: 2.7, color: MUTED, maxLines: 1 })
}

function pageOne(ctx, model, images) {
  frame(ctx, model, 1)
  ctx.drawImage(images[0], 12, 51, 260, 260 * model.snapshots[0].ratio)
  drawText(ctx, model.captions[0], 12, 225, 260, { size: 3, lineHeight: 4.3, maxLines: 3 })
  let y = heading(ctx, '範囲内の参考値', 280, 49, 128)
  for (const [label, value] of model.values) {
    drawText(ctx, label, 282, y, 124, { size: 3, color: MUTED, maxLines: 1 })
    drawText(ctx, value, 282, y + 4.5, 124, { size: 4.7, weight: 700, maxLines: 1 })
    rule(ctx, 280, y + 10.5, 128); y += 12
  }
  y = drawText(ctx, model.observation, 280, y + 2, 128, { size: 3.6, lineHeight: 5.2, maxLines: 4 }) + 4
  y = heading(ctx, '勾配の分布（10m幅で見た局所勾配）', 280, y, 128)
  for (const [label, value] of model.bins) {
    drawText(ctx, label, 282, y, 45, { size: 3.2, maxLines: 1 })
    drawText(ctx, value, 331, y, 75, { size: 3.4, weight: 700, maxLines: 1 })
    rule(ctx, 280, y + 5.7, 128); y += 7
  }
  y = drawText(ctx, model.distributionSummary, 280, y + 2, 128, { size: 2.9, lineHeight: 4.3, maxLines: 2 })
  y = drawText(ctx, model.denominator, 280, y + 2, 128, { size: 2.9, lineHeight: 4.3, maxLines: 3 })
  drawText(ctx, model.coverage, 280, y + 2, 128, { size: 2.9, lineHeight: 4.3, maxLines: 3 })
  heading(ctx, '範囲の扱い', 12, 242, 396)
  drawText(ctx, model.scope, 14, 253, 392, { size: 3.4, lineHeight: 5, maxLines: 3 })
}

function pageTwo(ctx, model, images) {
  frame(ctx, model, 2)
  for (let index = 1; index <= 2; index++) {
    const x = index === 1 ? 12 : 216
    ctx.drawImage(images[index], x, 49, 192, 192 * model.snapshots[index].ratio)
    drawText(ctx, model.captions[index], x, 176, 192, { size: 3, lineHeight: 4.3, maxLines: 2 })
  }
  let left = heading(ctx, '使用資料と計算条件', 12, 190, 210)
  for (const [label, value] of model.evidence) {
    left = drawText(ctx, label, 14, left, 206, { size: 3.1, weight: 700, lineHeight: 4.5, maxLines: 1 })
    left = drawText(ctx, value, 14, left, 206, { size: 3.05, lineHeight: 4.3, maxLines: 7 }) + 2
  }
  if (left > 265) fail('出典説明が2ページに収まりません。通常の印刷も利用できます。')
  drawText(ctx, '出典 https://maps.gsi.go.jp/development/ichiran.html', 14, Math.max(left, 263), 206, { size: 2.6, maxLines: 1 })
  let right = heading(ctx, '詳細検討へ渡す確認事項', 234, 190, 174)
  for (const check of model.checks) right = drawText(ctx, `・${check}`, 236, right, 170, { size: 3.2, lineHeight: 4.7, maxLines: 2 }) + 1
  right = drawText(ctx, model.limit, 236, right + 1, 170, { size: 3.2, lineHeight: 4.7, maxLines: 3 })
  if (model.memo) drawText(ctx, model.memo, 236, right + 2, 170, { size: 2.85, lineHeight: 4.1, maxLines: Math.max(1, Math.floor((267 - right - 2) / 4.1)), ellipsis: true })
}

function modelFromElement(report, element, checkDeadline) {
  const analysis = report?.terrainArea
  let geometry
  try { geometry = measureParcelReview(report?.parcelReview).geometry } catch { geometry = null }
  if (!analysis || !geometry || analysis.geometryKey !== terrainGeometryKey(geometry)) fail('範囲と地形結果が一致しません。現在の範囲を再計算してください。')
  if (!element?.isConnected) fail('地形図面を表示してから保存してください。')
  const sheets = [...element.querySelectorAll('.terrain-report-sheet')]
  const svgs = [...element.querySelectorAll('.terrain-area-figure svg')]
  if (sheets.length !== 2 || svgs.length !== 3) fail('A3横2ページの地形図面を表示してから保存してください。')
  const rows = selector => [...element.querySelectorAll(selector)].map(row => [text(row.querySelector('dt,th')), text(row.querySelector('dd,td'))])
  const values = rows('.terrain-report-values > div')
  const s = analysis.summary
  const expected = [`${numeric(s.polygonAreaM2, 0)} m²`, `${numeric(s.minElevation)}–${numeric(s.maxElevation)} m`, `${numeric(s.heightRange)} m`, `${numeric(s.medianSlope)}°`, `${numeric(s.p90Slope)}°`]
  // Do not combine an old report argument with the DOM of a newer analysis.
  if (values.length !== 5 || values.some((row, index) => row[1] !== expected[index])) fail('表示と計算結果が更新されました。地形図面を開き直してください。')
  const distribution = terrainSlopeDistribution(s), bins = rows('.terrain-report-bins tbody > tr')
  const expectedBins = distribution.bins.map(bin => [bin.max === 90 ? `${bin.min}°以上` : `${bin.min}–${bin.max}°未満`, `${Number.isFinite(bin.percent) ? `${numeric(bin.percent)}%` : '未計算'} / ${formatTerrainSlopeArea(bin.areaM2)}`])
  if (bins.length !== expectedBins.length || bins.some((row, index) => row[0] !== expectedBins[index][0] || row[1] !== expectedBins[index][1])) fail('勾配の割合・推定面積の表示が計算結果と一致しません。地形図面を開き直してください。')
  const distributionSummary = text(element.querySelector('.terrain-report-distribution-summary'))
  const expectedDistributionSummary = `有効範囲（除外後）：${formatTerrainSlopeArea(distribution.totalAreaM2)}${distribution.unknownAreaM2 === null || distribution.unknownAreaM2 > 0 ? ` / 未計算：${formatTerrainSlopeArea(distribution.unknownAreaM2)}` : ''}`
  if (distributionSummary !== expectedDistributionSummary) fail('推定面積の集計表示が更新されました。地形図面を開き直してください。')
  const evidenceSections = [...element.querySelectorAll('.terrain-report-evidence-layout > section')]
  if (evidenceSections.length !== 2) fail('出典・確認事項が不足しています。')
  const sourceDate = new Date(analysis.fetchedAt)
  return {
    name: String(report.siteName || report.placeLabel || '検討範囲'),
    coordinates: report.position ? `地点 N${report.position.lat.toFixed(6)} / E${report.position.lon.toFixed(6)} · ` : '',
    appVersion: String(report.appVersion || '—'),
    fetchedAt: Number.isFinite(sourceDate.getTime()) ? sourceDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '未記録',
    snapshots: svgs.map((svg, index) => snapshotSvg(svg, index === 0 ? 260 : 192, checkDeadline)),
    captions: [...element.querySelectorAll('.terrain-area-figure figcaption')].map(text), values,
    bins,
    observation: text(element.querySelector('.terrain-report-observation')),
    distributionSummary,
    denominator: text(element.querySelector('.terrain-report-distribution-note')),
    coverage: `有効範囲：標高 ${numeric(s.coveragePercent)}% / 勾配 ${numeric(s.slopeCoveragePercent)}%。${s.coveragePercent < 100 || s.slopeCoveragePercent < 100 ? '欠測を除いた参考値です。' : ''}色分けは施工可否の基準ではありません。`,
    scope: text(element.querySelector('.terrain-report-bottom-note > span')),
    evidence: rows('.terrain-report-evidence > div'),
    checks: [...evidenceSections[1].querySelectorAll('li')].map(text),
    limit: text(evidenceSections[1].querySelector('p:not(.terrain-report-field-memo)')),
    memo: text(element.querySelector('.terrain-report-field-memo')),
  }
}

export async function exportTerrainAreaPdf({ report, element }) {
  if (typeof document === 'undefined' || typeof XMLSerializer === 'undefined') fail('ブラウザーで地形図面を開いてください。')
  const controller = new AbortController()
  const timeoutError = new Error('地形PDFの作成が30秒以内に完了しませんでした。図面を開き直して再試行してください。')
  const deadline = Date.now() + 30000
  const timer = setTimeout(() => controller.abort(timeoutError), 30000)
  const checkDeadline = () => {
    // A synchronous SVG snapshot cannot be interrupted by a timer; also check
    // elapsed time while copying nodes and between rendering/encoding steps.
    if (Date.now() >= deadline && !controller.signal.aborted) controller.abort(timeoutError)
    if (controller.signal.aborted) throw controller.signal.reason
  }
  const images = []
  let canvas
  try {
    // Capture matching text, computed SVG styles and geometry before any await.
    const model = modelFromElement(report, element, checkDeadline)
    checkDeadline()
    if (document.fonts?.ready) await boundedWait(document.fonts.ready, controller.signal, '日本語フォントの準備が完了しませんでした。図面を開き直して再試行してください。')
    await Promise.all(model.snapshots.map(async (snapshot, index) => {
      const image = await loadSvg(snapshot, controller.signal)
      if (controller.signal.aborted) { image.removeAttribute('src'); throw controller.signal.reason }
      images[index] = image
    }))
    checkDeadline()
    canvas = document.createElement('canvas')
    canvas.width = Math.round(PAGE_MM[0] * PX_PER_MM); canvas.height = Math.round(PAGE_MM[1] * PX_PER_MM)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) fail('この環境ではPDF用の描画ができません。')
    ctx.scale(PX_PER_MM, PX_PER_MM)
    const pages = []
    for (const draw of [pageOne, pageTwo]) {
      checkDeadline()
      draw(ctx, model, images)
      checkDeadline()
      const jpeg = await boundedWait(new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('地形PDFのページ画像を作成できませんでした。')), 'image/jpeg', .95)), controller.signal, '地形PDFのページ画像を作成できませんでした（時間切れ）。')
      const buffer = await boundedWait(jpeg.arrayBuffer(), controller.signal, '地形PDFの画像データを読み込めませんでした（時間切れ）。')
      checkDeadline()
      pages.push({ bytes: new Uint8Array(buffer), width: canvas.width, height: canvas.height })
    }
    const result = { blob: new Blob([createTerrainPdfBytes(pages)], { type: 'application/pdf' }), fileName: terrainPdfFileName(report) }
    checkDeadline()
    return result
  } finally {
    clearTimeout(timer)
    controller.abort()
    for (const image of images) image?.removeAttribute('src')
    if (canvas) { canvas.width = 1; canvas.height = 1 }
  }
}
