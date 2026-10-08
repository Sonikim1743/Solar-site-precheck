// GSI's current PMTiles archive; the older Z/X/Y archive stopped updates in 2023.
// https://github.com/gsi-cyberjapan/optimal_bvmap
export const GSI_PLACE_NAMES_URL = 'https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles'
export const GSI_PLACE_NAMES_ATTRIBUTION = '<a href="https://github.com/gsi-cyberjapan/optimal_bvmap" target="_blank" rel="noreferrer">国土地理院 最適化ベクトルタイル（試験公開）</a>'

// These are Leaflet's 256px zoom levels, one greater than GSI's vector zoom.
// Anno classification: https://maps.gsi.go.jp/help/pdf/vector/optbv_featurecodes.pdf
export function gsiPlaceNameCategory(zoom, feature) {
  if (!Number.isFinite(zoom) || zoom < 5 || zoom > 21) return null
  const text = feature?.props?.vt_text
  if (typeof text !== 'string' || !text.trim() || text.length > 80) return null
  const code = Number(feature.props.vt_code)
  if (code === 140 && zoom >= 7 && zoom <= 11) return 'prefecture'
  if (code === 110 && zoom >= 9) return 'municipality'
  if ([210, 220].includes(code) && zoom >= 14) return 'local'
  if (code === 800 && zoom >= 18) return 'localDetail'
  return null
}

export function gsiPlaceNameLayerOptions(protomaps, pane) {
  const { CenteredTextSymbolizer, Padding } = protomaps
  const labelRules = [
    ['prefecture', 17, 5],
    ['municipality', 16, 4],
    ['local', 13, 3],
    ['localDetail', 13, 3],
  ].map(([category, size, padding]) => ({
    dataSource: 'gsi',
    dataLayer: 'Anno',
    filter: (zoom, feature) => gsiPlaceNameCategory(zoom, feature) === category,
    symbolizer: new Padding(padding, new CenteredTextSymbolizer({
      labelProps: ['vt_text'],
      font: `600 ${size}px "Yu Gothic", Meiryo, sans-serif`,
      fill: '#20384e',
      stroke: '#fff',
      width: 2,
      maxLineChars: 30,
    })),
  }))
  return {
    pane,
    minZoom: 5,
    maxZoom: 21,
    noWrap: true,
    bounds: [[20, 122], [46, 154]],
    attribution: GSI_PLACE_NAMES_ATTRIBUTION,
    sources: { gsi: { url: GSI_PLACE_NAMES_URL, levelDiff: 1, maxDataZoom: 16 } },
    paintRules: [],
    labelRules,
    tileDelay: 5,
  }
}

export function observeGsiPlaceNameStatus(layer, onStatus) {
  let callback = onStatus, active = false, lastState = null
  const errors = new Set()
  const report = state => {
    if ((!active && state !== 'off') || state === lastState) return
    lastState = state
    callback?.({ state, message: state === 'error' ? '地名を取得できません。標準地図でも確認できます。' : '' })
  }
  layer.setStatusCallback = value => { callback = value }
  // The renderer deliberately catches tile errors. Observe the same request,
  // without a second fetch, so failures can still reach the compact map notice.
  const view = layer.views.get('gsi')
  const getDisplayTile = view.getDisplayTile.bind(view)
  view.getDisplayTile = async coords => {
    const key = `${coords.x}:${coords.y}:${coords.z}`
    try {
      const tile = await getDisplayTile(coords)
      errors.delete(key)
      return tile
    } catch (error) {
      if (error.name !== 'AbortError') { errors.add(key); report('error') }
      throw error
    }
  }
  layer.on('add', () => { active = true; report('loading') })
  layer.on('loading', () => report('loading'))
  layer.on('load', () => {
    const keys = Object.values(layer._tiles || {}).map(tile => `${tile.coords.x}:${tile.coords.y}:${tile.coords.z}`)
    report(keys.some(key => errors.has(key)) ? 'error' : 'ready')
    if (errors.size > 128) for (const key of errors) if (!keys.includes(key)) errors.delete(key)
  })
  layer.on('remove', () => {
    active = false
    for (const request of view.tileCache.source.zoomaborts || []) request.controller.abort()
    report('off')
  })
}
