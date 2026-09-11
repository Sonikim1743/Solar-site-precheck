import test from 'node:test'
import assert from 'node:assert/strict'
import { exampleReviewRecord, parseReviewRecord, validateReviewRecord, createReviewRecord, MAX_REVIEW_BYTES, reviewRecordFilename } from '../src/utils/reviewRecord.js'
import { thirdMeshCode, thirdMeshCenter } from '../src/services/nedo.js'
import { escapeCsv } from '../src/utils/csv.js'

const fresh = () => exampleReviewRecord('1.25')
function complete() {
  const record = fresh(), position = record.candidate.position
  record.kind = 'review'; record.candidate.memo = '案件メモ\n条件は再確認'; record.results.elevation = { value: 0, source: '国土地理院 DEM5A' }
  record.results.generation = { inputs: { ...position, ...record.inputs.generation }, annualKwh: 60000, monthly: Array.from({length:12}, (_,i)=>({month:i+1,kwh:5000})), source: 'PVGIS 5.3 / PVGIS-ERA5', sourceUrl: 'https://untrusted.invalid/', fetchedAt: '2026-08-01T00:00:00Z', period: '2005–2023' }
  record.results.terrain = { position, samples: [{ bearing: 0, direction: '北', angle: 2, terrainAngle: 0, profile: [{ distance: 250, elevation: 3, source:'DEM5A', angle:2, terrainAngle:0, effectiveElevation:23, obstructionHeight:20 }] }], radius: '250m〜5km' }
  record.results.terrainSection = { rangeMeters:100, intervalMeters:100, lines:['東西断面','南北断面'].map(label=>({label,points:[{...position,distance:-100,elevation:0},{...position,distance:0,elevation:1},{...position,distance:100,elevation:3}]})) }
  const id = thirdMeshCode(position.lat, position.lon), center = thirdMeshCenter(id)
  record.results.snowStation = { ...center, id, name:'3次メッシュ '+id, latDeg:34, latMin:54, lonDeg:133, lonMin:30, elevation:0, mode:'nedo-web', verified:true, validationVersion:2, snow10cm:{monthly:Array(12).fill(.1),annual:.1,winter:.1,spring:.1,summer:.1,autumn:.1}, source:{name:'NEDO MONSOLA-11',statisticalPeriod:'1981-2009'}, verification:{method:'Web照合',correctedColumns:[],disagreementColumns:[]} }
  record.gridNotes = [{id:'test-1',title:'試験設備',text:'公表空容量: 0 MW\n資料更新日: 2026-07-01\n<script>alert(1)</script>',position,recordedAt:'2026-08-01T00:01:00Z'}]
  return record
}
test('incomplete example record can be saved and reopened without fabricated results',()=>{
  const value = fresh(); value.inputs.generation.angle = ''; value.candidate.name = ''
  const result = parseReviewRecord('\uFEFF'+JSON.stringify(value))
  assert.equal(result.inputs.generation.angle,'')
  assert.equal(result.results.generation,null); assert.equal(result.results.elevation.value,null)
  assert.equal(result.kind,'example')
  assert.equal(result.candidate.name,'')
  assert.ok(reviewRecordFilename(result).endsWith('.precheck.json'))
})
test('all persisted results reopen with original dates, conditions, missing values and zero',()=>{
  const result = parseReviewRecord(JSON.stringify(complete()))
  assert.equal(result.results.generation.fetchedAt,'2026-08-01T00:00:00.000Z')
  assert.equal(result.results.generation.annualKwh,60000)
  assert.equal(result.results.generation.period,'2005–2023')
  assert.equal(result.results.elevation.value,0)
  assert.equal(result.results.terrain.samples[0].distance,null)
  assert.equal(result.results.terrainSection.lines[0].summary.elevationDiff,3)
  assert.match(result.gridNotes[0].text,/0 MW/)
  assert.deepEqual(parseReviewRecord(JSON.stringify(result)),result)
})
test('a manually edited NEDO month retains original seasonal totals and manual status',()=>{
  const value = complete(); value.results.snowStation.mode = 'manual-corrected'
  value.results.snowStation.snow10cm.monthly[0] = .8
  const station = validateReviewRecord(value).results.snowStation
  assert.equal(station.mode,'manual-corrected'); assert.equal(station.snow10cm.monthly[0],.8); assert.equal(station.snow10cm.annual,.1)
  value.results.snowStation.mode = 'nedo-web'; assert.throws(()=>validateReviewRecord(value))
})
test('malformed or incompatible files fail before becoming a candidate',()=>{
  assert.throws(()=>parseReviewRecord('{bad'),/JSON/)
  assert.throws(()=>parseReviewRecord(' '.repeat(MAX_REVIEW_BYTES+1)),/2MB/)
  for(const change of [x=>x.format='other', x=>x.schemaVersion=99, x=>x.candidate.position.lat='34', x=>x.savedAt='not-date',x=>x.inputs.snowBase=2,x=>x.candidate.memo='x'.repeat(20001)]) {
    const record=fresh();change(record);assert.throws(()=>validateReviewRecord(record))
  }
})
test('wrong candidate or conditions, incomplete months and invalid nested values are rejected',()=>{
  for(const change of [
    x=>x.results.generation.inputs.lon=134,
    x=>x.inputs.generation.peakpower=100,
    x=>x.results.generation.monthly[0].month=2,
    x=>x.results.generation.monthly[0].kwh=-1,
    x=>x.results.generation.monthly[0].kwh='5000',
    x=>x.results.generation.annualKwh=50000,
    x=>x.results.terrain.samples[0].profile[0].distance='250',
    x=>x.results.terrainSection.lines[0].points[1].lon=134,
    x=>x.results.snowStation.id='53393599',
    x=>x.gridNotes[0].position={lat:35,lon:133},
  ]) {const record=complete();change(record);assert.throws(()=>validateReviewRecord(record))}
})
test('zero generation remains a calculated result',()=>{
  const value=complete();value.results.generation.annualKwh=0;value.results.generation.monthly.forEach(row=>row.kwh=0)
  assert.equal(validateReviewRecord(value).results.generation.annualKwh,0)
})
test('record parsing whitelists fields and reconstructs trusted URLs without executing notes',()=>{
  const value=complete();value.secret='ignored';value.results.generation.html='<img onerror=alert(1)>';value.candidate.url='javascript:alert(1)'
  const clean=validateReviewRecord(value)
  assert.equal(clean.secret,undefined);assert.equal(clean.candidate.url,undefined);assert.equal(clean.results.generation.html,undefined)
  assert.equal(new URL(clean.results.generation.sourceUrl).origin,'https://re.jrc.ec.europa.eu')
  assert.match(clean.gridNotes[0].text,/<script>/)
})
test('createReviewRecord captures the exact candidate input and memo in the export contract',()=>{
  const value=fresh()
  const record=createReviewRecord({report:{position:value.candidate.position,appVersion:'1.25',siteName:'保存名',memo:'未確認条件',fieldMemo:'現地へ',elevation:0,obstructionHeight:20,snowBase:.95},generationDraft:value.inputs.generation})
  assert.equal(record.candidate.name,'保存名');assert.equal(record.candidate.memo,'未確認条件');assert.equal(record.results.elevation.value,0)
})
test('imported text stays text in spreadsheet exports while negative numbers stay numeric',()=>{
  assert.equal(escapeCsv('=HYPERLINK("bad")'),"\"'=HYPERLINK(\"\"bad\"\")\"")
  assert.equal(escapeCsv(' +cmd'),"\"' +cmd\"")
  assert.equal(escapeCsv('-10.5'),'"-10.5"');assert.equal(escapeCsv(-10.5),'"-10.5"')
})
