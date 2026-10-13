export const TERRAIN_LABEL_LAYOUT_LIMITS = Object.freeze({ labels: 30, distance: 140, margin: 3, minWidth: 36 })
const DEFAULT_VIEWPORT = Object.freeze({ left: 25, top: 35, right: 775, bottom: 430 })
const finite = Number.isFinite

function hasNumber(label) {
  return (typeof label?.number === 'string' && Boolean(label.number.trim())) || (typeof label?.number === 'number' && finite(label.number))
}

// screen is SVG textAnchor="middle" and the baseline, not a top-left point.
// Reserve the white halo as well as 14px numeric / full-width glyphs.
export function terrainLabelBounds(number, screen) {
  const value = String(number)
  if (value.length > 256) return null
  let glyphWidth = 0
  for (const char of value) glyphWidth += char.codePointAt(0) <= 0x7f ? 8 : 14
  const width = Math.max(TERRAIN_LABEL_LAYOUT_LIMITS.minWidth, glyphWidth + 6)
  return { left: screen[0] - width / 2, top: screen[1] - 16, right: screen[0] + width / 2, bottom: screen[1] + 4 }
}

function candidateOffsets() {
  const values = [[0, 0]], seen = new Set(['0,0']), maximum = TERRAIN_LABEL_LAYOUT_LIMITS.distance
  const add = (x, y) => {
    if (Math.hypot(x, y) > maximum + 1e-7) return
    const key = `${x},${y}`
    if (!seen.has(key)) { seen.add(key); values.push([x, y]) }
  }
  for (const distance of [14, 28, 42, 56, 70, 90, 112, 140]) {
    for (const [x, y] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]) add(x * distance, y * distance)
  }
  // The bounded grid fills gaps between radial candidates in dense clusters.
  for (let y = -maximum; y <= maximum; y += 14) for (let x = -maximum; x <= maximum; x += 14) add(x, y)
  return values.sort((a, b) => (a[0] ** 2 + a[1] ** 2) - (b[0] ** 2 + b[1] ** 2) || a[1] - b[1] || a[0] - b[0])
}
const OFFSETS = candidateOffsets()

function fits(box, viewport, occupied) {
  if (box.left < viewport.left || box.right > viewport.right || box.top < viewport.top || box.bottom > viewport.bottom) return false
  const margin = TERRAIN_LABEL_LAYOUT_LIMITS.margin
  return !occupied.some(other => box.left < other.right + margin && box.right > other.left - margin && box.top < other.bottom + margin && box.bottom > other.top - margin)
}

// Caller order is priority order (e.g. file parcels before public references).
// Never move source XYZ or invent a cadastral number. Unplaced entries are kept
// for the caller's compact list instead of disappearing behind collision skips.
export function layoutTerrainLabels(labels, viewport = DEFAULT_VIEWPORT) {
  const result = { labels: [], unplaced: [] }, occupied = []
  if (!Array.isArray(labels)) return result
  const validViewport = viewport && ['left', 'top', 'right', 'bottom'].every(key => finite(viewport[key])) && viewport.right > viewport.left && viewport.bottom > viewport.top
  let considered = 0
  for (const label of labels) {
    if (!hasNumber(label)) continue
    if (!validViewport || !Array.isArray(label.screen) || label.screen.length !== 2 || !label.screen.every(finite) || considered >= TERRAIN_LABEL_LAYOUT_LIMITS.labels) {
      result.unplaced.push(label)
      continue
    }
    considered++
    const originalBounds = terrainLabelBounds(label.number, label.screen)
    if (!originalBounds || originalBounds.right - originalBounds.left > viewport.right - viewport.left || originalBounds.bottom - originalBounds.top > viewport.bottom - viewport.top) {
      result.unplaced.push(label)
      continue
    }
    let placed = false
    for (const [dx, dy] of OFFSETS) {
      const screen = [label.screen[0] + dx, label.screen[1] + dy]
      const box = terrainLabelBounds(label.number, screen)
      if (!fits(box, viewport, occupied)) continue
      occupied.push(box)
      result.labels.push({ ...label, screen, anchorScreen: [...label.screen], displaced: dx !== 0 || dy !== 0 })
      placed = true
      break
    }
    if (!placed) result.unplaced.push(label)
  }
  return result
}
