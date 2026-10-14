import test from 'node:test'
import assert from 'node:assert/strict'
import {terrainElevationLabel} from '../src/utils/terrainElevationLabel.js'
test('site elevation shows DEM endpoints and their exact difference independently of display metadata',()=>{
  assert.equal(terrainElevationLabel({minElevation:524.45,maxElevation:531.54,heightRange:999,heightScale:2}),'敷地標高 最低点 524.5m / 最高点 531.5m / 高低差 7.1m')
  assert.match(terrainElevationLabel({minElevation:0,maxElevation:0}),/高低差 0.0m/)
  for(const summary of [null,{}, {minElevation:null,maxElevation:null},{minElevation:0,maxElevation:NaN}]){
    assert.match(terrainElevationLabel(summary),/確認不可/)
    assert.doesNotMatch(terrainElevationLabel(summary),/0.0m/)
  }
})
