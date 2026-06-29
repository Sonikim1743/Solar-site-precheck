export function escapeCsv(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}
