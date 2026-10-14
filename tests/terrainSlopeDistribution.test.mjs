import assert from 'node:assert/strict'
import { test } from 'node:test'
import { terrainSlopeDistribution, formatTerrainSlopeArea } from '../src/utils/terrainSlopeDistribution.js'

const shares = [80.7, 14.9, 4.4, 0, 0].map((percent, index) => ({ min: index * 5, max: index === 4 ? null : (index + 1) * 5, percent }))

test('full-coverage slope shares convert the effective polygon area without changing source values', () => {
  const summary = { polygonAreaM2: 4495, insideCount: 200, slopeValidCount: 200, slopeBins: shares }
  const before = structuredClone(summary)
  const result = terrainSlopeDistribution(summary)
  assert.equal(result.totalAreaM2, 4495)
  assert.equal(result.unknownAreaM2, 0)
  assert.equal(formatTerrainSlopeArea(result.bins[0].areaM2), '約3,627 m²')
  assert.ok(Math.abs(result.bins.reduce((total, bin) => total + bin.areaM2, 0) - 4495) < 1e-9)
  assert.equal(result.bins[3].areaM2, 0)
  assert.deepEqual(summary, before)
})

test('partial coverage leaves unknown area out of all slope classes', () => {
  const result = terrainSlopeDistribution({ polygonAreaM2: 4000, insideCount: 100, slopeValidCount: 75, slopeCoveragePercent: 100, slopeBins: shares })
  assert.equal(result.coveragePercent, 75, 'the valid point ratio takes precedence over a rounded or stale percentage')
  assert.equal(result.classifiedAreaM2, 3000)
  assert.equal(result.unknownAreaM2, 1000)
  assert.ok(Math.abs(result.bins[0].areaM2 - 2421) < 1e-9)
  assert.ok(Math.abs(result.bins.reduce((total, bin) => total + bin.areaM2, 0) + result.unknownAreaM2 - 4000) < 1e-9)
})

test('an area-integrated summary keeps the same denominator rather than applying node coverage a second time',()=>{
 const bins=[{min:0,max:5,areaM2:50,percent:50},{min:5,max:10,areaM2:25,percent:25},{min:10,max:15,areaM2:0,percent:0},{min:15,max:20,areaM2:0,percent:0},{min:20,max:null,areaM2:0,percent:0}]
 const result=terrainSlopeDistribution({polygonAreaM2:100,insideCount:100,slopeValidCount:90,slopeBins:bins})
 assert.equal(result.coveragePercent,75);assert.equal(result.unknownPercent,25)
 assert.equal(result.bins[0].percent,50);assert.equal(result.bins[1].areaM2,25)
 assert.equal(result.bins.reduce((n,b)=>n+b.percent,0)+result.unknownPercent,100)
})

test('missing coverage and missing bins do not produce invented zero areas', () => {
  const noCoverage = terrainSlopeDistribution({ polygonAreaM2: 4000, slopeBins: shares })
  assert.equal(noCoverage.classifiedAreaM2, null)
  assert.ok(noCoverage.bins.every(bin => bin.areaM2 === null))
  const noSlopes = terrainSlopeDistribution({ polygonAreaM2: 4000, slopeCoveragePercent: 0 })
  assert.equal(noSlopes.unknownAreaM2, 4000)
  assert.ok(noSlopes.bins.every(bin => bin.percent === null && bin.areaM2 === null))
  assert.equal(terrainSlopeDistribution(null).totalAreaM2, null)
})

test('bin matching is independent of order and area conversion does not use grid equivalent area', () => {
  const result = terrainSlopeDistribution({ polygonAreaM2: 399, sampledAreaM2: 625, validAreaM2: 625, slopeCoveragePercent: 100, slopeBins: [...shares].reverse() })
  assert.equal(result.totalAreaM2, 399)
  assert.equal(result.bins[0].percent, 80.7)
  assert.ok(Math.abs(result.bins[0].areaM2 - 321.993) < 1e-9)
})

test('invalid area, coverage and shares remain uncalculated; small positive areas remain visible', () => {
  const result = terrainSlopeDistribution({ polygonAreaM2: -2, slopeCoveragePercent: 101, slopeBins: [{ min: 0, max: 10, percent: -1 }] })
  assert.equal(result.totalAreaM2, null)
  assert.equal(result.coveragePercent, null)
  assert.equal(result.bins[0].percent, null)
  assert.equal(formatTerrainSlopeArea(null), '未計算')
  assert.equal(formatTerrainSlopeArea(0), '0 m²')
  assert.equal(formatTerrainSlopeArea(.4), '1 m²未満')
})
