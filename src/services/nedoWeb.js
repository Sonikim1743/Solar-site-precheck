import { thirdMeshCenter } from './nedo.js'
import { validateRateSummaries } from './nedoValidation.js'

const NEDO_MONSOLA_BASE = 'https://domessolar.infop.nedo.go.jp/appww/cgi-bin/monsola.cgi'

function textContent(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function numbersFromCells(html) {
  return [...String(html).matchAll(/<td[^>]*>\s*([+-]?\d+(?:\.\d+)?)\s*<\/td>/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value))
}

export function parseMonsolaHtml(html, expectedMesh = '') {
  const normalized = String(html)
  const headerText = textContent(normalized)
  const header = headerText.match(/3次メッシュ:\s*(\d{8})\s*地点:\s*([^（]+?)\s*（\s*緯度\s*=\s*(\d+)°\s*([\d.]+)′\s*経度\s*=\s*(\d+)°\s*([\d.]+)′\s*標高\s*=\s*(\d+)\s*m\s*）/)
  if (!header) throw new Error('NEDO MONSOLAページの地点情報を読み取れませんでした。')

  const meshCode = header[1]
  if (expectedMesh && meshCode !== expectedMesh) {
    throw new Error(`候補地点の3次メッシュは ${expectedMesh}、NEDO Webページは ${meshCode} です。候補地点と同じメッシュを確認してください。`)
  }

  const snowRow = normalized.match(/積雪\s*10cm\s*以上\s*<br\s*\/?>\s*の出現率\s*<\/td>([\s\S]*?)<\/tr>/i)
  if (!snowRow) throw new Error('NEDO MONSOLAページから積雪10cm以上の出現率行を読み取れませんでした。')
  const rates = numbersFromCells(snowRow[1])
  if (rates.length < 17) throw new Error(`積雪10cm以上の出現率が不足しています（${rates.length}/17）。`)
  validateRateSummaries(rates.slice(0, 17))

  const center = thirdMeshCenter(meshCode)
  const latDeg = Number(header[3])
  const latMin = Number(header[4])
  const lonDeg = Number(header[5])
  const lonMin = Number(header[6])
  const elevation = Number(header[7])

  return {
    id: meshCode,
    name: `3次メッシュ ${meshCode}`,
    placeName: header[2].trim(),
    lat: Number.isFinite(center?.lat) ? center.lat : latDeg + latMin / 60,
    lon: Number.isFinite(center?.lon) ? center.lon : lonDeg + lonMin / 60,
    latDeg,
    latMin,
    lonDeg,
    lonMin,
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
      name: 'NEDO MONSOLA-11 Web',
      url: `${NEDO_MONSOLA_BASE}?m=${meshCode}`,
      statisticalPeriod: '1981-2009',
      field: '月別の積雪深10cm以上の出現率',
    },
    mode: 'nedo-web',
    verified: true,
    validationVersion: 2,
    verification: {
      method: 'NEDO Web HTML直接取得 + 年・季節集計検証',
      correctedColumns: [],
      disagreementColumns: [],
    },
  }
}

export async function fetchMonsolaWeb(meshCode) {
  if (!/^\d{8}$/.test(String(meshCode))) throw new Error('3次メッシュ番号が不正です。')
  const path = `/api/nedo-monsola?mesh=${encodeURIComponent(meshCode)}`
  let response
  try {
    response = await fetch(path, { cache: 'no-store' })
  } catch {
    throw new Error('NEDO Web取得用のローカル中継に接続できませんでした。RUN_APP.cmdを開き直してから再試行してください。')
  }
  if (!response.ok) {
    throw new Error(`NEDO MONSOLA Webページを取得できませんでした（HTTP ${response.status}）。`)
  }
  const html = await response.text()
  if (!html.includes('NEDO 日射量データベース') && !html.includes('3次メッシュ')) {
    throw new Error('NEDO Web取得用のローカル中継が有効ではありません。RUN_APP.cmdで起動し直してください。')
  }
  return parseMonsolaHtml(html, meshCode)
}
