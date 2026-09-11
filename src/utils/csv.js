export function escapeCsv(value) {
  let cell = String(value ?? '')
  // User-authored/imported text must not become a spreadsheet formula.
  if (typeof value === 'string' && (/^[\t\r\n]/.test(cell) || (/^\s*[=+@-]/.test(cell) && !/^\s*-?\d+(?:\.\d+)?\s*$/.test(cell)))) cell = "'" + cell
  return '"' + cell.replaceAll('"', '""') + '"'
}
