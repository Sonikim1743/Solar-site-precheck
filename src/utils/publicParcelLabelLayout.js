import { publicParcelLabelAnchor, publicParcelNumber } from './publicParcelLayer.js'

export const PUBLIC_PARCEL_LABEL_LIMITS = Object.freeze({ candidates: 81, insideOffset: 90, leaderLength: 96, lineWidth: 180, lines: 4, lineHeight: 14 })

const insideRings = (point, rings) => {
  let inside = false
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
const containsBox = (bounds, box) => !bounds || (box.minX >= bounds.minX && box.minY >= bounds.minY && box.maxX <= bounds.maxX && box.maxY <= bounds.maxY)

function leaderTilesCovered(start, end, bbox) {
  // The painter only discovers labels via their text box in a 16px-buffered
  // tile query. Do not emit a long leader into a canvas that cannot find it.
  const minX = Math.floor(Math.min(start.x, end.x) / 256), maxX = Math.floor(Math.max(start.x, end.x) / 256)
  const minY = Math.floor(Math.min(start.y, end.y) / 256), maxY = Math.floor(Math.max(start.y, end.y) / 256)
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
    if (bbox.minX > (x + 1) * 256 + 16 || bbox.maxX < x * 256 - 16 || bbox.minY > (y + 1) * 256 + 16 || bbox.maxY < y * 256 - 16) return false
  }
  return true
}

function wrapNumber(text, measureText) {
  if (typeof text !== 'string' || !text || text.length > 60 || /[\u0000-\u001f\u007f]/.test(text) || typeof measureText !== 'function') return null
  const lines = []; let line = ''
  // Wrap without ellipsis, separators or altered parcel digits. Joining these
  // lines reproduces the source number exactly, including surrogate pairs.
  for (const character of Array.from(text)) {
    const width = measureText(line + character)
    if (!Number.isFinite(width) || width < 0) return null
    if (width > PUBLIC_PARCEL_LABEL_LIMITS.lineWidth) {
      if (!line || lines.length >= PUBLIC_PARCEL_LABEL_LIMITS.lines - 1) return null
      lines.push(line); line = character
      const singleWidth = measureText(line)
      if (!Number.isFinite(singleWidth) || singleWidth > PUBLIC_PARCEL_LABEL_LIMITS.lineWidth) return null
    } else line += character
  }
  lines.push(line)
  return lines
}

// Protomaps place() returns drawn labels, NOT alternative placements. Select a
// single non-colliding candidate here before returning it to that renderer.
export function layoutPublicParcelLabel({ geometry, text, measureText, collides, bounds } = {}) {
  if (typeof collides !== 'function') return null
  if (!Array.isArray(geometry) || geometry.some(ring => !Array.isArray(ring))) return null
  const sourceAnchor = publicParcelLabelAnchor(geometry)
  const lines = sourceAnchor && wrapNumber(text, measureText)
  if (!lines) return null
  const widths = lines.map(measureText)
  if (!widths.every(width => Number.isFinite(width) && width >= 0)) return null
  const halfWidth = (Math.max(...widths) + 6) / 2
  const halfHeight = (lines.length * PUBLIC_PARCEL_LABEL_LIMITS.lineHeight + 2) / 2
  const directions = [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, 1], [-1, -1], [1, 1]]
  const candidates = [{ ...sourceAnchor, internal: true }]
  for (const distance of [18, 36, 60, PUBLIC_PARCEL_LABEL_LIMITS.insideOffset]) for (const [dx, dy] of directions) {
    const length = Math.hypot(dx, dy)
    const point = { x: sourceAnchor.x + distance * dx / length, y: sourceAnchor.y + distance * dy / length, internal: true }
    if (insideRings(point, geometry)) candidates.push(point)
  }
  for (const gap of [4, 12, 24, 48, 72, PUBLIC_PARCEL_LABEL_LIMITS.leaderLength]) for (const [dx, dy] of directions) {
    const diagonal = dx && dy ? Math.SQRT1_2 : 1
    candidates.push({ x: sourceAnchor.x + dx * (halfWidth + gap * diagonal), y: sourceAnchor.y + dy * (halfHeight + gap * diagonal), internal: false })
  }
  for (const point of candidates.slice(0, PUBLIC_PARCEL_LABEL_LIMITS.candidates)) {
    const bbox = { minX: point.x - halfWidth, minY: point.y - halfHeight, maxX: point.x + halfWidth, maxY: point.y + halfHeight }
    if (!containsBox(bounds, bbox) || collides(bbox)) continue
    const inside = point.internal || insideRings(point, geometry)
    const end = { x: Math.max(bbox.minX, Math.min(bbox.maxX, sourceAnchor.x)), y: Math.max(bbox.minY, Math.min(bbox.maxY, sourceAnchor.y)) }
    // Keep label rectangles collision-free, including multiline numbers.
    // Leaders are not collision rectangles: that would hide clustered numbers
    // again, but every touched canvas must be able to discover the text box.
    const leader = inside ? null : { start: { ...sourceAnchor }, end }
    if (leader && !leaderTilesCovered(leader.start, leader.end, bbox)) continue
    return { text, lines, sourceAnchor: { ...sourceAnchor }, anchor: { x: point.x, y: point.y }, bbox, leader, lineHeight: PUBLIC_PARCEL_LABEL_LIMITS.lineHeight }
  }
  return null
}

// Kept independent of Leaflet/React so the actual renderer can be exercised
// with its installed collision index and a synthetic canvas in regression tests.
export class ParcelNumberSymbolizer {
  place(layout, geometry, feature) {
    const number = publicParcelNumber(feature)
    if (!number) return undefined
    const font = '600 12px sans-serif'
    layout.scratch.font = font
    const world = 256 * 2 ** layout.zoom
    const placement = layoutPublicParcelLabel({
      geometry, text: number, measureText: text => layout.scratch.measureText(text).width,
      collides: bbox => layout.index.bboxCollides(bbox, layout.order),
      bounds: Number.isFinite(world) ? { minX: 0, minY: 0, maxX: world, maxY: world } : undefined,
    })
    if (!placement) return undefined
    // Keep the renderer's Point class, and never mutate source MVT geometry.
    const anchor = geometry[0][0].clone()
    anchor.x = placement.anchor.x; anchor.y = placement.anchor.y
    return [{ anchor, bboxes: [placement.bbox], sourceAnchor: placement.sourceAnchor, number,
      draw: ctx => {
        ctx.globalAlpha = 1
        ctx.font = font
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'
        ctx.lineJoin = 'round'
        if (placement.leader) {
          const { start, end } = placement.leader
          const composite = ctx.globalCompositeOperation
          ctx.globalCompositeOperation = 'destination-over'
          ctx.beginPath()
          ctx.moveTo(start.x - anchor.x, start.y - anchor.y)
          ctx.lineTo(end.x - anchor.x, end.y - anchor.y)
          ctx.strokeStyle = '#b8eeee'; ctx.lineWidth = 1
          ctx.stroke()
          ctx.beginPath(); ctx.arc(start.x - anchor.x, start.y - anchor.y, 1.5, 0, Math.PI * 2)
          ctx.fillStyle = '#b8eeee'; ctx.fill()
          ctx.globalCompositeOperation = composite || 'source-over'
        }
        ctx.lineWidth = 3
        ctx.strokeStyle = '#163a38'
        ctx.fillStyle = '#e9ffff'
        placement.lines.forEach((line, index) => {
          const y = (index - (placement.lines.length - 1) / 2) * placement.lineHeight
          ctx.strokeText(line, 0, y)
          ctx.fillText(line, 0, y)
        })
      },
    }]
  }
}
