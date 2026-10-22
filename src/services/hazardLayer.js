import { loadHazardTile, createHazardTileTracker } from './hazardTiles.js'
import { hazardStatus } from '../utils/regulatoryLayers.js'

export const HAZARD_PANE = 'regulatory-hazard-tiles'

// The factory keeps the Leaflet lifecycle testable without mounting React.
export function createHazardLayerClass(L) {
  return L.TileLayer.extend({
    initialize(props) {
      L.TileLayer.prototype.initialize.call(this, '', {
        pane: HAZARD_PANE, minZoom: 2, maxNativeZoom: 17, maxZoom: 21,
        noWrap: true, keepBuffer: 0, bounds: [[20, 120], [50, 155]], opacity: props.opacity,
        attribution: '<a href="https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html" target="_blank" rel="noopener noreferrer">出典：ハザードマップポータルサイト（透過合成・拡大表示）</a>'+(props.prefecture==='34'?'／広島土砂：土砂災害ポータルひろしま、DoboX（CC BY）':''),
      })
      this.props = props
      this.urls = new Map()
      this.callback = props.onStatus
    },
    onAdd(map) {
      this.tracker = createHazardTileTracker(states => this.callback?.(hazardStatus(states)))
      L.TileLayer.prototype.onAdd.call(this, map)
    },
    createTile(coords, done) {
      const tile = document.createElement('img')
      const key = this._tileCoordsToKey(coords), job = this.tracker.begin(key)
      tile.alt = ''; tile.setAttribute('role', 'presentation')
      const complete = (state, error) => {
        if (state === 'error' || state === 'unavailable') tile.style.visibility = 'hidden'
        if (this.tracker.finish(key, job, state)) done(error || null, tile)
      }
      loadHazardTile(this.props.id, coords, { prefecture: this.props.prefecture, signal: job.controller.signal }).then(result => {
        if (job.controller.signal.aborted) return
        if (result.state === 'unavailable') { complete('unavailable'); return }
        const url = URL.createObjectURL(result.blob); this.urls.set(key, url)
        tile.onload = () => complete('ready')
        tile.onerror = () => complete('error', Error('PNG表示失敗'))
        tile.src = url
      }).catch(error => { if (!job.controller.signal.aborted) complete('error', error) })
      return tile
    },
    _abortLoading() {
      // Leaflet 1.9's TileLayer abort path replaces image callbacks and deletes
      // unfinished old-zoom tiles directly, bypassing our _removeTile cleanup.
      // Retire those jobs through our cleanup before Leaflet touches the image.
      for (const [key, tile] of Object.entries(this._tiles)) {
        if (tile.coords.z !== this._tileZoom && !tile.loaded) this._removeTile(key)
      }
      L.TileLayer.prototype._abortLoading.call(this)
    },
    _removeTile(key) {
      this.tracker?.remove(key)
      const url = this.urls.get(key)
      if (url) URL.revokeObjectURL(url)
      this.urls.delete(key)
      L.TileLayer.prototype._removeTile.call(this, key)
    },
    onRemove(map) {
      this.tracker.stop()
      L.TileLayer.prototype.onRemove.call(this, map)
      for (const url of this.urls.values()) URL.revokeObjectURL(url)
      this.urls.clear()
    },
  })
}
