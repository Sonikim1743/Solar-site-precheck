function validPosition(position) {
  return Number.isFinite(position?.lat) && Number.isFinite(position?.lon)
    && Math.abs(position.lat) <= 90 && Math.abs(position.lon) <= 180
}

export function decimalCoordinateText(position) {
  return validPosition(position) ? `${position.lat}, ${position.lon}` : ''
}

export function googleMapsLinks(position) {
  if (!validPosition(position)) return { mapUrl: '', streetViewUrl: '' }
  const coordinates = `${position.lat},${position.lon}`
  const map = new URL('https://www.google.com/maps/search/')
  map.search = new URLSearchParams({ api: '1', query: coordinates }).toString()
  const street = new URL('https://www.google.com/maps/@')
  street.search = new URLSearchParams({ api: '1', map_action: 'pano', viewpoint: coordinates }).toString()
  return { mapUrl: map.href, streetViewUrl: street.href }
}

// Manual lookup only: Mapion's map URL does not convert or return a MAPCODE.
export function mapionMapcodeUrl(position) {
  if (!validPosition(position) || position.lat < 20 || position.lat > 50 || position.lon < 120 || position.lon > 155) return ''
  return new URL(`https://www.mapion.co.jp/m2/${position.lat},${position.lon},19`).href
}

export async function copyDecimalCoordinates(position, clipboard) {
  const text = decimalCoordinateText(position)
  if (!text) return { status: 'error', text: '', message: '先に有効な地点を選択してください。' }
  try {
    if (typeof clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable')
    await clipboard.writeText(text)
    return { status: 'success', text, message: '緯度・経度（十進度）をコピーしました。' }
  } catch {
    return { status: 'error', text, message: `コピーできませんでした。次の座標を選択してコピーしてください：${text}` }
  }
}
