export function normalizeDisplayText(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/\u3000/g, ' ')
    .replace(/[ \t\r\n]+/g, ' ')
    .trim()
}
