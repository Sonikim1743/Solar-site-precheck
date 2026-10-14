import { simpleReviewReportRows } from './simpleReviewReport.js'
import { terrainReportTitle } from './terrainReportTitle.js'
import { terrainReportNotes } from './terrainReportNotes.js'
import { terrainReportLayouts, terrainLayoutReportRows, terrainLayoutReportConditions } from './terrainLayoutReport.js'
import { isMapParcel } from './mapParcelSelection.js'
import { terrainGeometryKey } from './terrainArea.js'
import { measureParcelReview } from './parcelReview.js'
import { terrainSlopeDistribution, formatTerrainSlopeArea, TERRAIN_SLOPE_COLORS } from './terrainSlopeDistribution.js'
import { terrainDrawingViewport, terrainDrawingScaleBar, TERRAIN_DRAWING_PHOTO_EXTENT } from './terrainDrawingViewport.js'

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
// the browser-rendered JPEG pages (one drawing or two to four report pages). Byte counts include raw image bytes.
export function createTerrainPdfBytes(pages) {
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > 5) fail('A3横1〜5ページの画像が必要です。')
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
  object(2, `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  pages.forEach((page, index) => {
    const id = 3 + index * 3
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`)
    object(id + 1, `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>`, page.bytes)
    const content = encoder.encode(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`)
    object(id + 2, `<< /Length ${content.length} >>`, content)
  })
  const xref = length
  const objectCount = 3 + pages.length * 3
  add(`xref\n0 ${objectCount}\n0000000000 65535 f \n`)
  for (let id = 1; id < objectCount; id++) add(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  add(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const result = new Uint8Array(length)
  let cursor = 0
  for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.length }
  return result
}

export function terrainPdfFileName(report, now = new Date()) {
  const chars = Array.from(terrainReportTitle(report).replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/[.\s]+$/g, '').trim()).slice(0, 64)
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

export const isInlineTerrainImage = href => /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(href || '')

function snapshotSvg(svg, widthMm, checkDeadline, drawingOnly = false) {
  checkDeadline()
  if (svg.querySelector('foreignObject, script, use, iframe, style') || [...svg.querySelectorAll('image')].some(image => !isInlineTerrainImage(image.getAttribute('href')))) fail('図の形式に対応していません。')
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
  if (drawingOnly) clone.querySelector('.terrain-area-svg-legend')?.remove()
  const ratio = viewBox.height / viewBox.width
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(Math.ceil(widthMm * PX_PER_MM)))
  clone.setAttribute('height', String(Math.ceil(widthMm * PX_PER_MM * ratio)))
  return { xml: new XMLSerializer().serializeToString(clone), ratio }
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
  drawText(ctx, model.titles[page - 1], 12, 17, 337, { size: 6.5, weight: 700, maxLines: 1 })
  drawText(ctx, `地形参考図 / ${page} of ${model.pageCount}`, 356, 17, 52, { size: 3.2, maxLines: 1 })
  drawText(ctx, model.name, 12, 29, 396, { size: Math.min(4,760 / Math.max(1,Array.from(model.name).length)), maxLines: 2 })
  rule(ctx, 12, 43, 396)
  rule(ctx, 12, 271, 396)
  drawText(ctx, `${model.coordinates}範囲：地図上の参考図形`, 12, 274, 210, { size: 2.8, maxLines: 1 })
  drawText(ctx, `取得 ${model.fetchedAt} / Solar Site Precheck v${model.appVersion}`, 225, 274, 183, { size: 2.8, maxLines: 1, ellipsis: true })
  drawText(ctx, `資料・条件・限界：最終ページ（${model.pageCount}ページ）の注記を参照。`, 12, 282, 396, { size: 2.7, color: MUTED, maxLines: 1 })
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
  y = heading(ctx, '勾配の分布（セル交差面積）', 280, y, 128)
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
    ctx.drawImage(images[index], x, 55, 192, 192 * model.snapshots[index].ratio)
    drawText(ctx, model.captions[index], x, 184, 192, { size: 3, lineHeight: 4.3, maxLines: 2 })
  }
  const current = model.layoutSheets.find(sheet => !sheet.comparison)
  if (current) {
    drawText(ctx, '実DEM地形 · 配置前', 12, 47, 192, { size: 4, weight: 700, maxLines: 1 })
    drawText(ctx, '参考配置3D · 適用済み', 216, 47, 192, { size: 4, weight: 700, maxLines: 1 })
    current.rows[0].forEach(([label,value], index) => {
      const x = 12 + index * 80.8
      drawText(ctx, label, x, 202, 75, { size: 3.2, color: MUTED, maxLines: 1 })
      drawText(ctx, value, x, 210, 75, { size: 5.6, weight: 700, maxLines: 1 })
      rule(ctx, x, 222, 75)
    })
  }
  drawText(ctx, current ? '同じ視点35° · 高さ1:1 · 適用条件・出典・仮定：注1・2・3・5（最終ページ）' : '固定視点35° / 145° · 高さ1:1 · 資料・計算と確認事項：注1・2（最終ページ）', 12, 242, 396, { size: 3.5, maxLines: 1 })

}

function pageLayout(ctx, model, images, sheet, index) {
  frame(ctx, model, index + 3)
  const offset = 3 + index * 2
  sheet.snapshots.forEach((snapshot, i) => {
    const x = sheet.comparison ? 12 + i * 204 : i === 0 ? 12 : 280
    const width = sheet.comparison ? 192 : i === 0 ? 250 : 128
    ctx.drawImage(images[offset + i], x, 49, width, width * snapshot.ratio)
  })
  sheet.rows.forEach((rows, i) => {
    const x = sheet.comparison ? 12 + i * 204 : 280, width = sheet.comparison ? 192 : 128
    let y = sheet.comparison ? 177 : 137
    rows.forEach(([label, value]) => {
      drawText(ctx, label, x, y, width * .56, { size: 3.2, maxLines: 1 })
      drawText(ctx, value, x + width * .57, y, width * .43, { size: sheet.comparison ? 4.4 : 4.8, weight: 700, maxLines: 1 })
      rule(ctx, x, y + 6.1, width); y += sheet.comparison ? 8.1 : 12
    })
  })
  if (sheet.difference) drawText(ctx, sheet.difference, 12, 224, 396, { size: 5, lineHeight: 7, weight: 700, maxLines: 2 })
  drawText(ctx, sheet.legend, 12, 244, 396, { size: 3.4, maxLines: 1 })
  drawText(ctx, sheet.reference, 12, 251, 396, { size: 3.3, maxLines: 1 })
  if (sheet.warning) drawText(ctx, sheet.warning, 12, 258, 396, { size: 3.1, maxLines: 2 })

}

function pageDrawing(ctx, model, images) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ...PAGE_MM)
  ctx.strokeStyle = '#222'; ctx.lineWidth = .3; ctx.strokeRect(6, 5, 408, 286)
  const sheet = model.layoutSheets[0], layout = sheet.layouts[0], o = layout.options, d = model.drawingDistribution
  // Equal printed image areas; each north-up view has its own exact scale.
  // No site-name header: the two maps occupy the main A3 page area.
  for(let i=0;i<2;i++){
    const x=i?214:8
    drawText(ctx,i?'地形・勾配・地番':'参考モジュール配置',x+3,7,192,{size:3.5,weight:700,maxLines:1})
    ctx.drawImage(images[i],x,12,198,198*model.snapshots[i].ratio)
  }
  drawText(ctx,`DEM標高 ${model.values[1][1]} · 北上・縮尺は各図の目盛`,11,196,193,{size:3,maxLines:1})
  drawText(ctx,`分母：穴・除外後 ${numeric(d.totalAreaM2,0)} m² / 勾配確認 ${numeric(d.coveragePercent)}%`,11,202,193,{size:2.95,maxLines:1})
  const legend=[...d.bins.map((b,i)=>({label:b.max===90?'30°以上':`${b.min}–${b.max}°未満`,percent:b.percent,color:TERRAIN_SLOPE_COLORS[i]})),{label:'未確認 / NoData',percent:d.unknownPercent,color:'#eef0ed'}]
  legend.forEach((b,i)=>{
    const x=217+i*38
    ctx.fillStyle=b.color;ctx.fillRect(x,197,5,3.2);ctx.strokeStyle='#7b887c';ctx.lineWidth=.15;ctx.strokeRect(x,197,5,3.2)
    drawText(ctx,b.label,x+6,196.5,32,{size:2.85,maxLines:1})
    drawText(ctx,`${numeric(b.percent)}%`,x+6,202,32,{size:3.7,weight:700,maxLines:1})
  })
  rule(ctx,6,211,408);rule(ctx,6,235,408)
  const metric=(label,value,unit,x)=>{
    drawText(ctx,label,x,214,126,{size:3.5,color:MUTED,maxLines:1})
    drawText(ctx,value,x,220,105,{size:9,weight:700,maxLines:1})
    const offset=ctx.measureText(value).width
    drawText(ctx,unit,x+offset+3,227,Math.max(20,126-offset-3),{size:4,weight:700,maxLines:1})
  }
  metric(`使用架台（個別除外 ${layout.disabledRacks?.length||0}）`,numeric(layout.rackCount,0),'架台',11)
  metric('モジュール枚数',numeric(layout.moduleCount,0),'枚',148)
  metric('DC容量',numeric(layout.dcKw,2),'kW',285)
  const tableRows = [
    [['モジュール型式', 'JKM720N-66HL5-BDV'], ['出力 / 外形', '720W / 2.384 × 1.303m']],
    [['モジュール傾斜', `${numeric(o.tiltDeg)}°（水平から）`], ['配置方位 / 地形除外', `${numeric(o.azimuthDeg)}° / ${o.slopeLimitDeg}°未満`]],
    [['アレイ間左右間隔', `${numeric(o.rackGapM)}m`], ['アレイ間前後間隔', `${numeric(o.rowGapM)}m`]],
    [['境界からの離隔距離', `${numeric(o.setbackM)}m`], ['モジュール間隔', `${numeric(o.moduleGapM*1000,0)}mm`]],
    [['モジュール高さ', `${numeric(o.minClearanceM)}m`], ['架台構成 / 開始位置', `4段 × ${o.minColumns === o.maxColumns ? o.minColumns : `${o.minColumns}〜${o.maxColumns}`}列 / ${numeric(o.scanOffsetUM,2)}, ${numeric(o.scanOffsetVM,2)}m`]],
    [['AC参考容量', `約 ${numeric(layout.acRangeKw?.[0],0)}〜${numeric(layout.acRangeKw?.[1],0)} kW`], ['配置方式 / 取得日', `${layout.stats?.autoSearch?.mode==='south-fixed'?'真南固定・探索内最多':'方位探索 / 適用案'} / ${model.fetchedAt.split(' ')[0]}`]],
  ]
  tableRows.forEach((pairs, row) => pairs.forEach(([label, value], column) => {
    const x = 8 + column * 202, y = 236 + row * 6.3
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 66, 6.3)
    ctx.strokeStyle = '#222'; ctx.lineWidth = .2; ctx.strokeRect(x, y, 202, 6.3)
    ctx.beginPath(); ctx.moveTo(x+66,y); ctx.lineTo(x+66,y+6.3); ctx.stroke()
    drawText(ctx, label, x+3, y+1.4, 60, { size: 3.05, weight: 700, maxLines: 1 })
    drawText(ctx, value, x+69, y+1.4, 129, { size: 3.3, maxLines: 1 })
  }))
  drawText(ctx,`出典：国土地理院 DEM・標準地図・航空写真${model.mapReference?' / AMX公開地図2024 https://source.coop/smartmaps/amx-2024-04':' / 範囲・地番資料は報告書の出典参照'} 。${sheet.fenceOn?'一点鎖線＝仮フェンス（1.2m）。':''}`,11,276,397,{size:2.65,maxLines:1})
  drawText(ctx,`${model.mapReference?'地図表示境界の参考領域・原本全筆未確認。':'地図上の参考図形・測量筆界未確認。'}セル${model.gridStep}m・4点平均の勾配を交差面積で集計。四区分＋未確認＝100%。境界外約10m以上は表示のみ。`,11,281,397,{size:2.65,maxLines:1})
  const missing=[model.contextStatus!=='ready'?'周辺地図の一部または全部が未取得。':'',model.noParcelMetadata?'地番資料なし・地番未取得。':'',model.missingParcels?`地番未記載 ${model.missingParcels}区域。`:'',model.unplacedParcels?`図上に収まらない地番：${model.unplacedParcels}。`:''].join('')
  drawText(ctx,`${missing}参考図・施工可否未確認。配置方位は北0°時計回り、モジュール傾斜は水平から。取得日は標高の測量日ではありません。`,11,286,397,{size:2.65,maxLines:1,ellipsis:true})
}

function pageSimpleResults(ctx, model) {
  frame(ctx, model, model.pageCount - 1)
  const split = Math.ceil(model.simpleRows.length / 2)
  for (const [index, rows] of [model.simpleRows.slice(0,split),model.simpleRows.slice(split)].entries()) {
    const x = index ? 216 : 12
    let y = 49
    for (const [label,value] of rows) {
      ctx.fillStyle = '#fff'; ctx.fillRect(x,y,192,14); ctx.strokeStyle='#829b8c';ctx.lineWidth=.2;ctx.strokeRect(x,y,192,14)
      drawText(ctx,label,x+2,y+2,58,{size:3.1,weight:700,maxLines:3,lineHeight:3.7})
      drawText(ctx,value,x+63,y+2,127,{size:3.2,maxLines:3,lineHeight:3.7})
      y += 14
    }
    if(y>267)fail('一括解析の取得結果がページに収まりません。')
  }
}

function pageNotes(ctx, model) {
  frame(ctx, model, model.pageCount)
  const hasLayout = model.layoutSheets.length > 0
  const columns = hasLayout ? [model.notes.filter(note => ['1','2','5'].includes(note.id)), model.notes.filter(note => ['3','4'].includes(note.id))] : [model.notes.filter(note => note.id === '1'), model.notes.filter(note => note.id !== '1')]
  columns.forEach((notes, index) => {
    const x = index === 0 ? 12 : 216
    let y = 49
    for (const note of notes) {
      y = heading(ctx, `注${note.id}　${note.title}`, x, y, 192)
      y = drawText(ctx, note.body, x + 2, y, 188, { size: 3.4, lineHeight: 4.7, maxLines: 100 }) + 8
    }
    if (y > 267) fail('注記が最終ページに収まりません。説明量を確認してください。')
  })
}

function modelFromElement(report, element, checkDeadline) {
  const analysis = report?.terrainArea
  let geometry
  try { geometry = measureParcelReview(report?.parcelReview).geometry } catch { geometry = null }
  if (!analysis || !geometry || analysis.geometryKey !== terrainGeometryKey(geometry)) fail('範囲と地形結果が一致しません。現在の範囲を再計算してください。')
  if (!element?.isConnected) fail('地形図面を表示してから保存してください。')
  const sheets = [...element.querySelectorAll('.terrain-report-sheet')]
  const svgs = [...element.querySelectorAll('.terrain-area-figure svg')].slice(0, 3)
  const layoutReport = terrainReportLayouts(analysis, report.terrainPreview)
  const layoutSheets = [...element.querySelectorAll('.terrain-layout-report')]
  const expectedLayouts = [...(layoutReport.current ? [[layoutReport.current]] : []), ...(layoutReport.comparison ? [layoutReport.comparison.layouts] : [])]
  if (sheets.length !== layoutReport.totalPages || layoutSheets.length !== expectedLayouts.length) fail('配置図面のページ数が更新されました。開き直してください。')
  const layoutModels = layoutSheets.map((sheet, sheetIndex) => {
    const layouts = expectedLayouts[sheetIndex], drawings = [...sheet.querySelectorAll('.terrain-area-figure svg')]
    const valueGroups = [...sheet.querySelectorAll('.terrain-layout-report-values')]
    if (drawings.length !== 2 || valueGroups.length !== layouts.length) fail('配置図・数量の表示が不足しています。')
    layouts.forEach((layout, index) => {
      const shown = [...valueGroups[index].querySelectorAll(':scope > div')].map(row => [text(row.querySelector('dt')), text(row.querySelector('dd'))])
      if (JSON.stringify(shown) !== JSON.stringify(terrainLayoutReportRows(layout)) || layout.moduleCount !== layout.racks.reduce((sum, rack) => sum + rack.modules.length, 0) || Math.abs(layout.dcKw - layout.moduleCount * layout.options.modulePowerW / 1000) > 1e-8 || (layouts.length === 2 ? Number(drawings[index].querySelector('[data-layout-racks]')?.getAttribute('data-layout-racks')) !== layout.rackCount : Number(drawings[1].getAttribute('data-layout-modules')) !== layout.moduleCount)) fail('配置の枚数・容量・図が計算結果と一致しません。')
    })
    return { layouts, fenceOn: layouts.length === 1 ? Boolean(layoutReport.fence?.rails?.length) : layoutReport.comparisonFences.some(fence=>fence?.rails?.length), comparison: layouts.length === 2, rows: layouts.map(terrainLayoutReportRows), snapshots: layouts.length === 2 ? drawings.map(svg => snapshotSvg(svg, 192, checkDeadline)) : [], conditions: terrainLayoutReportConditions(layouts[0]), difference: text(sheet.querySelector('.terrain-layout-report-difference')), legend: text(sheet.querySelector('.terrain-layout-report-legend')), reference: text(sheet.querySelector('.terrain-report-note-reference')), warning: text(sheet.querySelector('.terrain-report-warning')), source: text(sheet.querySelector('.terrain-layout-report-source')), limit: [text(sheet.querySelector('.terrain-layout-report-limit')), text(sheet.querySelector('.terrain-report-warning'))].filter(Boolean).join(' '), save: text(sheet.querySelector('.terrain-layout-report-save')) }
  })
  if (sheets.length < 2 || svgs.length !== 3) fail('A3横2ページの地形図面を表示してから保存してください。')
  const rows = selector => [...element.querySelectorAll(selector)].map(row => [text(row.querySelector('dt,th')), text(row.querySelector('dd,td'))])
  const values = rows('.terrain-report-values > div')
  const s = analysis.summary
  const expected = [`${numeric(s.polygonAreaM2, 0)} m²`, `${numeric(s.minElevation)}–${numeric(s.maxElevation)} m`, `${numeric(s.heightRange)} m`, `${numeric(s.medianSlope)}°`, `${numeric(s.p90Slope)}°`]
  // Do not combine an old report argument with the DOM of a newer analysis.
  if (values.length !== 5 || values.some((row, index) => row[1] !== expected[index])) fail('表示と計算結果が更新されました。地形図面を開き直してください。')
  const distribution = terrainSlopeDistribution(analysis), bins = rows('.terrain-report-bins tbody > tr')
  const expectedBins = distribution.bins.map(bin => [bin.max === 90 ? `${bin.min}°以上` : `${bin.min}–${bin.max}°未満`, `${Number.isFinite(bin.percent) ? `${numeric(bin.percent)}%` : '未計算'} / ${formatTerrainSlopeArea(bin.areaM2)}`])
  expectedBins.push(['未確認 / NoData', `${numeric(distribution.unknownPercent)}% / ${formatTerrainSlopeArea(distribution.unknownAreaM2)}`])
  if (bins.length !== expectedBins.length || bins.some((row, index) => row[0] !== expectedBins[index][0] || row[1] !== expectedBins[index][1])) fail('勾配の割合・推定面積の表示が計算結果と一致しません。地形図面を開き直してください。')
  const distributionSummary = text(element.querySelector('.terrain-report-distribution-summary'))
  const expectedDistributionSummary = `有効範囲（除外後）：${formatTerrainSlopeArea(distribution.totalAreaM2)}${distribution.unknownAreaM2 === null || distribution.unknownAreaM2 > 0 ? ` / 未計算：${formatTerrainSlopeArea(distribution.unknownAreaM2)}` : ''}`
  if (distributionSummary !== expectedDistributionSummary) fail('推定面積の集計表示が更新されました。地形図面を開き直してください。')
  const notes = terrainReportNotes(report, layoutReport)
  const shownNotes = [...element.querySelectorAll('.terrain-report-footnote')]
  const plain = value => value.replace(/\s+/g, ' ').trim()
  if (shownNotes.length !== notes.length || notes.some((note, index) => shownNotes[index].getAttribute('data-note') !== note.id || text(shownNotes[index].querySelector('p')) !== plain(note.body))) fail('注記・計算条件が更新されました。図面を開き直してください。')
  const simpleRows = simpleReviewReportRows(report.simpleReview)
  if (JSON.stringify(rows('.simple-report-values > div')) !== JSON.stringify(simpleRows)) fail('一括解析の代表点・条件・取得結果が一致しません。')
  const sourceDate = new Date(analysis.fetchedAt)
  return {
    titles: sheets.map(sheet => text(sheet.querySelector('h2'))), pageCount: sheets.length, layoutSheets: layoutModels, notes,
    simpleRows: simpleReviewReportRows(report.simpleReview),
    name: terrainReportTitle(report),
    coordinates: report.position ? `地点 N${report.position.lat.toFixed(6)} / E${report.position.lon.toFixed(6)} · ` : '',
    appVersion: String(report.appVersion || '—'),
    fetchedAt: Number.isFinite(sourceDate.getTime()) ? sourceDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '未記録',
    snapshots: [...svgs.map((svg, index) => snapshotSvg(svg, index === 0 ? 260 : 192, checkDeadline)), ...layoutModels.filter(sheet => sheet.comparison).flatMap(sheet => sheet.snapshots)],
    captions: [...element.querySelectorAll('.terrain-area-figure figcaption')].map(text), values,
    bins,
    observation: text(element.querySelector('.terrain-report-observation')),
    distributionSummary,
    denominator: text(element.querySelector('.terrain-report-distribution-note')),
    coverage: `有効範囲：標高 ${numeric(s.coveragePercent)}% / 勾配 ${numeric(s.slopeCoveragePercent)}%。${s.coveragePercent < 100 || s.slopeCoveragePercent < 100 ? '欠測を除いた参考値です。' : ''}注1参照。`,
    scope: text(element.querySelector('.terrain-report-bottom-note > span')),

  }
}

export async function exportTerrainAreaPdf({ report, element, drawingOnly = false }) {
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
    if (drawingOnly) {
      const pair=element?.querySelector('.terrain-drawing-export-source')
      if(pair&&pair.dataset.contextStatus!=='loading'&&pair.dataset.contextStatus!=='ready')pair.dispatchEvent(new Event('terrain-drawing-context-retry'))
      await boundedWait(new Promise(resolve => { const poll = () => { if (controller.signal.aborted || !element?.isConnected || element.querySelector('.terrain-drawing-export-source')?.dataset.contextStatus !== 'loading') resolve(); else setTimeout(poll, 50) }; poll() }), controller.signal, '航空写真の取得が完了しませんでした。再試行してください。')
      if(pair?.dataset.contextStatus!=='ready')fail('航空写真または周辺地図を取得できませんでした。前回のPDFは保持しています。通信を確認して再試行してください。')
    }
    // Capture matching text, computed SVG styles and geometry as one snapshot.
    const model = modelFromElement(report, element, checkDeadline)
    if (drawingOnly) {
      if (!terrainReportLayouts(report.terrainArea, report.terrainPreview).current) fail('適用済みの参考配置がありません。先に参考配置を計算してください。')
      const pair = element.querySelector('.terrain-drawing-export-source')
      if(!pair)fail('単独配置図の2つの図面が表示されていません。')
      const plans = [...pair.querySelectorAll('svg')]
      if(plans.length!==2 || plans.some(p=>p.dataset.geometryKey!==report.terrainArea.geometryKey) || plans[1].querySelector('[data-layout-racks]')) fail('2つの図の対象範囲・配置を確認できません。')
      const expectedViews=[terrainDrawingViewport(report.terrainArea.grid),terrainDrawingViewport(report.terrainArea.grid,10,TERRAIN_DRAWING_PHOTO_EXTENT)]
      if(plans.some((p,i)=>{const v=expectedViews[i],bar=terrainDrawingScaleBar(v,expectedViews[0]),m=Number(p.dataset.scaleM),px=Number(p.dataset.scalePx);return p.dataset.viewport!==JSON.stringify([v.west,v.south,v.east,v.north])||!Number.isFinite(m)||!Number.isFinite(px)||m<=0||px<=0||Math.abs(m-bar.meters)>1e-7||Math.abs(px-bar.pixelLength)>1e-7})) fail('各図の表示範囲と縮尺目盛が一致しません。')
      const photos=[...plans[1].querySelectorAll('image')]
      if(pair.dataset.photoContextStatus!=='ready'||plans[1].dataset.contextLayer!=='seamlessphoto'||!photos.length||photos.some(image=>image.getAttribute('data-context-layer')!=='seamlessphoto'||!/^data:image\/jpeg;base64,/.test(image.getAttribute('href')||'')))fail('右図の周辺航空写真が準備できていません。再試行してください。')
      model.snapshots = plans.map(plan=>snapshotSvg(plan, 198, checkDeadline, true))
      model.drawingDistribution = terrainSlopeDistribution(report.terrainArea)
      model.gridStep = report.terrainArea.grid.step
      model.mapReference = report.parcelReview.parcels.some(isMapParcel)
      model.contextStatus = pair.dataset.contextStatus
      model.missingParcels = Number(pair.dataset.missingParcels)||0
      model.noParcelMetadata = pair.dataset.noParcelMetadata==='true'
      model.unplacedParcels = pair.dataset.unplacedParcels
    }
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
    for (const draw of (drawingOnly ? [pageDrawing] : [pageOne, pageTwo, ...model.layoutSheets.filter(sheet => sheet.comparison).map((sheet, index) => (ctx, model, images) => pageLayout(ctx, model, images, sheet, index)), ...(model.simpleRows.length ? [pageSimpleResults] : []), pageNotes])) {
      checkDeadline()
      draw(ctx, model, images)
      checkDeadline()
      const jpeg = await boundedWait(new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('地形PDFのページ画像を作成できませんでした。')), 'image/jpeg', .95)), controller.signal, '地形PDFのページ画像を作成できませんでした（時間切れ）。')
      const buffer = await boundedWait(jpeg.arrayBuffer(), controller.signal, '地形PDFの画像データを読み込めませんでした（時間切れ）。')
      checkDeadline()
      pages.push({ bytes: new Uint8Array(buffer), width: canvas.width, height: canvas.height })
    }
    const result = { blob: new Blob([createTerrainPdfBytes(pages)], { type: 'application/pdf' }), fileName: drawingOnly ? terrainPdfFileName(report).replace('地形参考図_', '参考配置図_') : terrainPdfFileName(report) }
    checkDeadline()
    return { ...result, pageCount: pages.length }
  } finally {
    clearTimeout(timer)
    controller.abort()
    for (const image of images) image?.removeAttribute('src')
    if (canvas) { canvas.width = 1; canvas.height = 1 }
  }
}
