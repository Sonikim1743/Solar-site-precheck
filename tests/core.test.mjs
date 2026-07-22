import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import { parseCoordinateInput, toDegreeMinutes } from '../src/utils/coordinates.js'
import { escapeCsv } from '../src/utils/csv.js'
import { detectRuntimeEnvironment, pdfLimitMb } from '../src/utils/buildInfo.js'
import { analyzeInheritanceText, summarizeInheritanceReceipts } from '../src/utils/inheritance.js'
import {
  OBSTRUCTION_ELEVATIONS_HEADER,
  buildObstructionElevationsCsv,
  interpolateHorizonElevations,
  southerlyOrientedAzimuth,
} from '../src/utils/obstructionElevations.js'
import { snowRateLevel } from '../src/utils/snowRates.js'
import { interpolateHorizonAngle, peakSolarWindowReference, solarPositionAtHour } from '../src/utils/solarWindow.js'
import { evaluateSiteVerdict, primaryVerdictReasons } from '../src/utils/verdict.js'
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

test('runtime environment helpers classify deployment targets', () => {
  assert.equal(detectRuntimeEnvironment({ hostname: 'solar-site-precheck.pages.dev' }), 'Cloudflare Pages')
  assert.equal(detectRuntimeEnvironment({ hostname: '127.0.0.1' }), 'Portable / Local')
  assert.equal(detectRuntimeEnvironment({ hostname: '192.168.1.20' }), 'Portable LAN')
  assert.equal(pdfLimitMb('Cloudflare Pages'), '20')
  assert.equal(pdfLimitMb('Portable / Local'), '80')
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

test('public deployment metadata and headers are explicit', () => {
  assert.ok(existsSync('public/robots.txt'))
  assert.ok(existsSync('public/sitemap.xml'))
  const headers = readFileSync('public/_headers', 'utf8')
  assert.match(headers, /Content-Security-Policy:/)
  assert.match(headers, /Strict-Transport-Security:/)
  assert.match(headers, /Permissions-Policy:/)
})

test('search placeholder does not mix mismatched address and coordinates', () => {
  const app = readFileSync('src/App.jsx', 'utf8')
  assert.doesNotMatch(app, /岡山県真庭市 \/ 34\.8617, 133\.2433/)
  assert.match(app, /広島県庄原市東城町帝釈宇山 \/ 34\.8617, 133\.2433/)
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
      '第１４３０号 】 ３月 ３日受付（共有） 所有権移転・相続',
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

test('inheritance text analyzer keeps receipt order and reads compact extra-count notation', () => {
  const results = analyzeInheritanceText([{
    pageNumber: 1,
    text: [
      '第１００１号 】 １月 ５日受付（単独） 所有権移転・相続',
      '既）土地 庄原市A町１００ 外２',
      '第１００２号 】 １月 ６日受付（単独） 所有権移転・相続',
      '既）土地 庄原市B町２００ 外 ３件',
    ].join('\n'),
  }])
  assert.equal(results.length, 2)
  assert.equal(results[0].receiptDate, '1月5日')
  assert.equal(results[0].registryAddress, '庄原市A町１００')
  assert.equal(results[0].extraCount, 2)
  assert.equal(results[1].receiptDate, '1月6日')
  assert.equal(results[1].registryAddress, '庄原市B町２００')
  assert.equal(results[1].extraCount, 3)
})

test('inheritance text analyzer reads PDF.js reconstructed rows without spaces', () => {
  const results = analyzeInheritanceText([{
    pageNumber: 1,
    text: [
      '┃【第１４２７号】３月２日受付（単独）所有権移転・相続│┃',
      '┃既）土地安芸高田市美土里町本郷４０８８－４外８│┃',
      '┃│┃',
      '┠───────────────────────────────────────────┼────┨',
      '┃【第１４２９号】３月２日受付（単独）所有権移転・相続│┃',
      '┃既）土地庄原市西本町１丁目１７５－３外２１│┃',
    ].join('\n'),
  }])
  assert.equal(results[0].registryAddress, '安芸高田市美土里町本郷４０８８－４')
  assert.equal(results[0].extraCount, 8)
  assert.equal(results[1].registryAddress, '庄原市西本町１丁目１７５－３')
  assert.equal(results[1].extraCount, 21)
})

test('inheritance text analyzer does not drop later receipt blocks', () => {
  const rows = []
  for (let index = 1; index <= 120; index += 1) {
    rows.push(`┃【第${String(1000 + index)}号】３月１８日受付（単独）所有権移転・相続│┃`)
    rows.push(`┃既）土地庄原市テスト町${index}外${index}│┃`)
  }
  const results = analyzeInheritanceText([{ pageNumber: 1, text: rows.join('\n') }])
  assert.equal(results.length, 120)
  assert.equal(results[119].registryAddress, '庄原市テスト町120')
  assert.equal(results[119].extraCount, 120)
})

test('inheritance receipt summary checks first, last and missing numbers', () => {
  const summary = summarizeInheritanceReceipts([{
    pageNumber: 1,
    text: [
      '┃【第１４１８号】３月２日受付（単独）抹消登記│┃',
      '┃既）土地三次市三次町１│┃',
      '┃【第１４１９号】３月２日受付（単独）所有権移転・相続│┃',
      '┃既）土地三次市三次町２外１│┃',
      '┃【第１４２１号】３月２日受付（単独）所有権移転・相続│┃',
      '┃既）土地三次市三次町３外２│┃',
    ].join('\n'),
  }])
  assert.equal(summary.firstNumber, 1418)
  assert.equal(summary.lastNumber, 1421)
  assert.equal(summary.expectedCount, 4)
  assert.equal(summary.readCount, 3)
  assert.equal(summary.missingCount, 1)
  assert.deepEqual(summary.missingNumbers, [1420])
  assert.equal(summary.isContinuous, false)
})

test('inheritance receipt summary explains missing numbers by black-box or withdrawn rows', () => {
  const summary = summarizeInheritanceReceipts([{
    pageNumber: 1,
    text: [
      '┃【第１７５５号】３月１２日受付（単独）所有権移転・相続│┃',
      '┃既）土地庄原市東本町１丁目４外１１│┃',
      '┃【第１７５６号】■■■■■■■■■■■■取下│┃',
      '┃■■■■ ■■■■■■■■■■■■■■■■■■■■■■■│┃',
      '┃【第１７５７号】３月１２日受付（連先）所有権の保存（申請）│┃',
      '┃既）土地安芸高田市高宮町来女木１１４４２－４│┃',
    ].join('\n'),
  }])
  assert.equal(summary.missingCount, 1)
  assert.equal(summary.explainedMissingCount, 1)
  assert.equal(summary.unexplainedMissingCount, 0)
  assert.equal(summary.missingExplanationMatches, true)
  assert.equal(summary.missingDetails[0].label, '黒塗り・取下')
})

test('inheritance receipt summary ignores legal article numbers in ordinary registry PDFs', () => {
  const summary = summarizeInheritanceReceipts([{
    pageNumber: 1,
    text: [
      '不動産登記法（平成１６年法律第１２３号）第１４条第１項',
      '不動産登記規則（平成１７年法務省令第１８号）',
      '昭和６３年法務省令第３７号',
      '受付年月日 令和８年３月２日',
      '順位番号 13917 所有権移転',
      '土地 庄原市高野町南',
    ].join('\n'),
  }])
  assert.equal(summary.firstNumber, null)
  assert.equal(summary.lastNumber, null)
  assert.equal(summary.expectedCount, 0)
  assert.equal(summary.readCount, 0)
  assert.equal(summary.missingCount, 0)
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
  assert.equal(result.points.length, 7)
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

test('site verdict stays data-missing until core precheck data exists', () => {
  const verdict = evaluateSiteVerdict({})
  assert.equal(verdict.status, 'missing')
  assert.equal(verdict.label, 'データ不足')
  assert.ok(verdict.flags.some((flag) => flag.title === '地平線未分析'))
})

test('site verdict flags horizon, mesh boundary and snow risks without deciding project feasibility', () => {
  const verdict = evaluateSiteVerdict({
    position: { lat: 35, lon: 135 },
    terrain: { maxAngle: 6, samples: [{ bearing: 180, angle: 6 }] },
    snowStation: { snow10cm: { monthly: [0, 0.02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    meshBoundary: { isNearBoundary: true, minDistanceMeters: 72 },
    demSummary: { level: 'high', shouldWarn: false },
    terrainSection: { lines: [{ summary: { elevationDiff: 1 } }] },
  })
  assert.equal(verdict.status, 'watch')
  assert.equal(verdict.label, '要確認')
  assert.ok(verdict.flags.some((flag) => flag.title === '地平線確認'))
  assert.ok(verdict.flags.some((flag) => flag.title === '3次メッシュ境界'))
  assert.ok(primaryVerdictReasons(verdict).length <= 3)
})

test('site verdict escalates to caution when winter sun or snow is critical', () => {
  const verdict = evaluateSiteVerdict({
    position: { lat: 35, lon: 135 },
    terrain: { maxAngle: 1, samples: [{ bearing: 180, angle: 1 }] },
    solarReference: { status: 'danger', message: '冬至9〜15時に干渉可能性があります。' },
    snowStation: { snow10cm: { monthly: [0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    meshBoundary: { isNearBoundary: false, minDistanceMeters: 180 },
    demSummary: { level: 'high', shouldWarn: false },
    terrainSection: { lines: [{ summary: { elevationDiff: 0 } }] },
  })
  assert.equal(verdict.status, 'danger')
  assert.equal(verdict.label, '要注意')
  assert.ok(verdict.flags.some((flag) => flag.title === '冬季太陽高度'))
  assert.ok(verdict.flags.some((flag) => flag.title === '積雪注意'))
})

test('Solar Pro obstruction CSV interpolates horizon values every 1 degree', () => {
  const rows = interpolateHorizonElevations([
    { bearing: 0, angle: 0 },
    { bearing: 90, angle: 9 },
    { bearing: 180, angle: 18 },
    { bearing: 270, angle: 9 },
  ])
  assert.equal(rows.length, 361)
  assert.equal(rows[0].elevation, 0)
  assert.equal(rows[360].elevation, rows[0].elevation)
  assert.ok(Math.abs(rows[45].elevation - 4.5) < 1e-12)
  assert.ok(Math.abs(rows[135].elevation - 13.5) < 1e-12)
})

test('Solar Pro obstruction CSV uses southerly oriented azimuth conversion', () => {
  assert.equal(southerlyOrientedAzimuth(0), -180)
  assert.equal(southerlyOrientedAzimuth(90), -90)
  assert.equal(southerlyOrientedAzimuth(180), 0)
  assert.equal(southerlyOrientedAzimuth(270), 90)
  assert.equal(southerlyOrientedAzimuth(360), 180)
})

test('Solar Pro obstruction CSV keeps the verified sample structure', () => {
  const sample = readFileSync('tests/fixtures/ObstructionElevations.csv', 'utf8')
  const sampleLines = sample.split(/\r?\n/)
  const csv = buildObstructionElevationsCsv({
    samples: [
      { bearing: 0, angle: 3.7 },
      { bearing: 45, angle: 5.0 },
      { bearing: 90, angle: 2.2 },
      { bearing: 135, angle: 1.7 },
      { bearing: 180, angle: 3.1 },
      { bearing: 225, angle: 7.4 },
      { bearing: 270, angle: 5.1 },
      { bearing: 315, angle: 7.1 },
    ],
    position: { lat: 34.8617, lon: 133.2433 },
    sessionName: 'テスト候補地',
  })
  const lines = csv.split(/\r?\n/)
  assert.equal(lines[0], sampleLines[0])
  assert.equal(lines[6], '')
  assert.equal(lines[7], sampleLines[7])
  assert.equal(lines[8], '')
  assert.equal(lines[9], 'begin data')
  assert.equal(lines[10], OBSTRUCTION_ELEVATIONS_HEADER)
  assert.equal(lines[10], sampleLines[10])
  assert.equal(lines.filter((line) => /^\d+,/.test(line)).length, 361)
  assert.equal(lines[2], 'Latitude:,34.8617')
  assert.equal(lines[3], 'Longitude:,133.2433')
  assert.equal(lines[11].split(',')[4], lines[371].split(',')[4])
})

test('Solar Pro obstruction CSV is not generated without horizon results', () => {
  assert.equal(buildObstructionElevationsCsv({ samples: [], position: { lat: 35, lon: 135 } }), null)
  assert.equal(buildObstructionElevationsCsv({ samples: [{ bearing: 0, angle: null }], position: { lat: 35, lon: 135 } }), null)
})
