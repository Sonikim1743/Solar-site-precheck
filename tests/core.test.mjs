import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import { parseCoordinateInput, toDegreeMinutes } from '../src/utils/coordinates.js'
import { escapeCsv } from '../src/utils/csv.js'
import { analyzeInheritanceText } from '../src/utils/inheritance.js'
import { snowRateLevel } from '../src/utils/snowRates.js'
import { interpolateHorizonAngle, peakSolarWindowReference, solarPositionAtHour } from '../src/utils/solarWindow.js'
import { DETAILED_HORIZON_DIRECTIONS, HORIZON_DIRECTIONS, createHorizonDirections, recalculateTerrainObstruction } from '../src/services/gsi.js'
import { adjacentThirdMeshes, productionFactor, thirdMeshBoundaryDistance, thirdMeshCenter, thirdMeshCode } from '../src/services/nedo.js'
import { selectConsistentRates, validateRateSummaries } from '../src/services/nedoValidation.js'

test('thirdMeshCode matches known Tokyo Tower mesh', () => {
  assert.equal(thirdMeshCode(35.658584, 139.745431), '53393599')
})

test('thirdMeshCenter returns a center inside the same mesh', () => {
  const center = thirdMeshCenter('53393599')
  assert.ok(center)
  assert.equal(thirdMeshCode(center.lat, center.lon), '53393599')
})

test('thirdMeshCode rejects coordinates outside Japan working range', () => {
  assert.equal(thirdMeshCode(10, 139), '')
  assert.equal(thirdMeshCode(35, 170), '')
  assert.equal(thirdMeshCode(Number.NaN, 139), '')
})

test('thirdMeshBoundaryDistance warns near third mesh edge', () => {
  const near = thirdMeshBoundaryDistance(35, 139)
  assert.ok(near.isNearBoundary)
  assert.equal(Math.round(near.minDistanceMeters), 0)

  const center = thirdMeshCenter('53393599')
  const far = thirdMeshBoundaryDistance(center.lat, center.lon)
  assert.ok(!far.isNearBoundary)
  assert.ok(far.minDistanceMeters > 100)
})

test('adjacentThirdMeshes returns neighboring third mesh codes', () => {
  const neighbors = adjacentThirdMeshes('53393599')
  assert.equal(neighbors.length, 8)
  assert.ok(neighbors.some((item) => item.direction === '北'))
  assert.ok(neighbors.every((item) => /^\d{8}$/.test(item.mesh)))
  assert.ok(neighbors.every((item) => item.mesh !== '53393599'))
})

test('coordinate parser accepts decimal, Google Maps, degree-minute and DMS formats', () => {
  assert.deepEqual(parseCoordinateInput('34.8617, 133.2433'), { lat: 34.8617, lon: 133.2433 })
  assert.deepEqual(parseCoordinateInput('https://maps.google.com/@34.8617,133.2433,18z'), { lat: 34.8617, lon: 133.2433 })

  const dm = parseCoordinateInput('北緯 34度 51.7分 / 東経 133度 14.6分')
  assert.ok(Math.abs(dm.lat - 34.8616666667) < 1e-9)
  assert.ok(Math.abs(dm.lon - 133.2433333333) < 1e-9)

  const dms = parseCoordinateInput('34°51\'42"N 133°14\'36"E')
  assert.ok(Math.abs(dms.lat - 34.8616666667) < 1e-9)
  assert.ok(Math.abs(dms.lon - 133.2433333333) < 1e-9)
})

test('coordinate parser returns null for unusable text', () => {
  assert.equal(parseCoordinateInput('住所だけで座標なし'), null)
  assert.equal(parseCoordinateInput(''), null)
})

test('degree-minute formatter keeps Japanese Solar Pro style', () => {
  assert.equal(toDegreeMinutes(34.8617, 'lat', 1), '北緯 34度 51.7分')
  assert.equal(toDegreeMinutes(133.2433, 'lon', 1), '東経 133度 14.6分')
})

test('NEDO rate summaries validate monthly, annual and seasonal consistency', () => {
  const rates = [
    0.33, 0.25, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0.06,
    0.05, 0.21, 0, 0, 0,
  ]
  assert.doesNotThrow(() => validateRateSummaries(rates))
})

test('NEDO rate summaries reject inconsistent OCR results', () => {
  const rates = [
    0.33, 0.25, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0.06,
    0.99, 0.21, 0, 0, 0,
  ]
  assert.throws(() => validateRateSummaries(rates), /一致しません/)
})

test('selectConsistentRates keeps a coherent single-candidate OCR set', () => {
  const rates = [
    0.33, 0.25, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0.06,
    0.05, 0.21, 0, 0, 0,
  ]
  const readingGroups = rates.map((value, index) => [
    { value, confidence: 90, variant: 'original', column: index + 1 },
  ])
  const result = selectConsistentRates(readingGroups)
  assert.deepEqual(result.rates, rates)
  assert.deepEqual(result.correctedColumns, [])
  assert.deepEqual(result.disagreementColumns, [])
})

test('productionFactor subtracts snow occurrence rate from base factor', () => {
  assert.ok(Math.abs(productionFactor(0.95, 0.33) - 0.62) < 1e-12)
})

test('escapeCsv protects commas, quotes and null values', () => {
  assert.equal(escapeCsv('A,B "quoted"'), '"A,B ""quoted"""')
  assert.equal(escapeCsv(null), '""')
})

test('snowRateLevel uses shared visual thresholds', () => {
  assert.equal(snowRateLevel(0), 'none')
  assert.equal(snowRateLevel(0.01), 'notice')
  assert.equal(snowRateLevel(0.5), 'alert')
})

test('horizon direction presets keep simple and detailed analysis modes stable', () => {
  assert.deepEqual(HORIZON_DIRECTIONS.map((item) => item.bearing), [0, 45, 90, 135, 180, 225, 270, 315])
  assert.equal(DETAILED_HORIZON_DIRECTIONS.length, 36)
  assert.equal(DETAILED_HORIZON_DIRECTIONS[0].bearing, 0)
  assert.equal(DETAILED_HORIZON_DIRECTIONS.at(-1).bearing, 350)
  assert.equal(DETAILED_HORIZON_DIRECTIONS.find((item) => item.bearing === 10)?.direction, '')
  assert.equal(DETAILED_HORIZON_DIRECTIONS.find((item) => item.bearing === 270)?.direction, '西')
  assert.deepEqual(createHorizonDirections(90).map((item) => item.bearing), [0, 90, 180, 270])
})

test('serve:dist script points to an existing local server file', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  const script = packageJson.scripts?.['serve:dist'] || ''
  const match = script.match(/node\s+(.+)$/)
  assert.ok(match, 'serve:dist should run a node server file')
  assert.ok(existsSync(match[1]), `${match[1]} should exist`)
})

test('inheritance text analyzer flags land single-inheritance candidates conservatively', () => {
  const results = analyzeInheritanceText([{
    pageNumber: 1,
    text: [
      '第１４２９号 】 ３月 ２日受付（単独） 所有権移転・相続',
      '既）土地 庄原市西本町１丁目１７５－３ 外２１',
      '',
      '土地',
      '所在：広島県三次市甲田町',
      '地番：123番4',
      '地目：田',
      '地積：1200平方メートル',
      '相続人：山田太郎',
      '所有権全部を相続により取得',
      '',
      '土地',
      '所在：広島県三次市乙',
      '地番：555番',
      '共有 持分 ２分の１',
    ].join('\n'),
  }])
  assert.equal(results[0].status, '単独相続候補')
  assert.equal(results[0].receiptNumber, '1429')
  assert.equal(results[0].receiptDate, '3月2日')
  assert.equal(results[0].ownershipMode, '単独')
  assert.equal(results[0].registrationCause, '所有権移転・相続')
  assert.equal(results[0].propertyType, '土地')
  assert.equal(results[0].registryAddress, '庄原市西本町１丁目１７５－３')
  assert.equal(results[0].extraCount, 21)
  assert.ok(results.some((item) => item.status.includes('共有')))
})

test('solar window check compares winter peak sun height against horizon direction', () => {
  const noon = solarPositionAtHour(35, 12)
  assert.ok(noon.altitude > 30)
  assert.ok(noon.azimuth > 170 && noon.azimuth < 190)

  const samples = [
    { bearing: 90, angle: 5 },
    { bearing: 180, angle: 15 },
    { bearing: 270, angle: 5 },
  ]
  assert.equal(interpolateHorizonAngle(samples, 180), 15)
  assert.ok(Math.abs(interpolateHorizonAngle(samples, 135) - 10) < 1e-12)

  const result = peakSolarWindowReference(
    { lat: 35, lon: 135 },
    { samples },
  )
  assert.ok(result)
  assert.equal(result.points.length, 5)
  assert.ok(['ok', 'watch', 'danger'].includes(result.status))
  assert.ok(Number.isFinite(result.tightest.margin))
})

test('tree height changes recalculate horizon angles without dropping terrain result', () => {
  const terrain = {
    radius: 'test',
    obstructionHeight: 10,
    samples: [{
      direction: '南',
      bearing: 180,
      angle: 5,
      terrainAngle: 0,
      profile: [
        { distance: 1000, elevation: 100, angle: 0, terrainAngle: 0 },
        { distance: 1000, elevation: 110, angle: 5, terrainAngle: 0 },
      ],
    }],
  }
  const recalculated = recalculateTerrainObstruction(terrain, 100, 30)
  assert.ok(recalculated)
  assert.equal(recalculated.obstructionHeight, 30)
  assert.equal(recalculated.samples.length, 1)
  assert.equal(recalculated.samples[0].profile[0].obstructionHeight, 30)
  assert.equal(recalculated.samples[0].profile[0].effectiveElevation, 130)
  assert.ok(Number.isFinite(recalculated.maxAngle))
})
