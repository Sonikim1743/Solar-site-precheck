import test from 'node:test'
import assert from 'node:assert/strict'
import { terrainMapLayers } from '../src/utils/terrainMap.js'
import { terrainPointToLocal } from '../src/utils/terrainArea.js'

test('local metre terrain reaches Leaflet with finite geographical bounds and unchanged contours', () => {
  const origin = { lat: 35, lon: 135 }
  const localPaths = [[[-40, -30], [0, 0], [50, 60]]]
  const result = terrainMapLayers({ grid: { origin, step: 5, xMin: -50, yMin: -50, width: 21, height: 21 }, contours: [{ level: 100, paths: localPaths }] })
  assert.ok(result.bounds.flat().every(Number.isFinite))
  assert.ok(result.bounds[0][0] < origin.lat && result.bounds[1][0] > origin.lat)
  assert.ok(result.bounds[0][1] < origin.lon && result.bounds[1][1] > origin.lon)
  const feature = result.contours.features[0]
  assert.equal(feature.properties.major, true)
  for (let i = 0; i < localPaths[0].length; i++) {
    const [lon, lat] = feature.geometry.coordinates[0][i]
    const point = terrainPointToLocal({ lon, lat }, origin)
    assert.ok(Math.hypot(point[0] - localPaths[0][i][0], point[1] - localPaths[0][i][1]) < .00001)
  }
})
