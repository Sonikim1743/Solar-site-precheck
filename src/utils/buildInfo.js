export const APP_VERSION = '1.22'
export const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'dev'
export const BUILD_TARGET = typeof __BUILD_TARGET__ !== 'undefined' ? __BUILD_TARGET__ : 'local'
export const PDF_LIMIT_MB = typeof __PDF_LIMIT_MB__ !== 'undefined' && __PDF_LIMIT_MB__ ? String(__PDF_LIMIT_MB__) : ''
export const MIN_REQUIRED_RUNTIME = typeof __MIN_REQUIRED_RUNTIME__ !== 'undefined' ? __MIN_REQUIRED_RUNTIME__ : '1.2'

export function detectRuntimeEnvironment(location = globalThis?.location) {
  if (!location?.hostname) return '不明'
  const host = location.hostname
  if (host.endsWith('.pages.dev')) return 'Cloudflare Pages'
  if (host === 'localhost' || host === '127.0.0.1') return 'Portable / Local'
  if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return 'Portable LAN'
  return 'Web配信'
}

export function currentBundleName(documentRef = globalThis?.document) {
  if (!documentRef?.querySelector) return '—'
  const script = documentRef.querySelector('script[type="module"][src*="/assets/index-"]')
  if (script?.src) return script.src.split('/').pop()
  return '—'
}

export function pdfLimitMb(environment = detectRuntimeEnvironment()) {
  if (PDF_LIMIT_MB) return PDF_LIMIT_MB
  return environment === 'Cloudflare Pages' ? '20' : '80'
}
