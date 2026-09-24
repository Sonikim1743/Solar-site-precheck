import test from 'node:test'
import assert from 'node:assert/strict'
import { exampleReviewRecord, parseReviewRecord } from '../src/utils/reviewRecord.js'
import { setReviewParcel, createEmptyParcelReview, measureParcelReview } from '../src/utils/parcelReview.js'
import { geonexParcelUrl, parcelReviewCsvRows } from '../src/utils/parcelPresentation.js'
import { readCadastreGeoJson } from '../src/services/cadastre.js'

const square = (x, y, size = .001) => ({ type: 'Polygon', coordinates: [[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]] })
const parcel = (id, x) => ({ type: 'Feature', id, properties: { 地番: id, 市区町村名: '試験市', 大字名: '試験地区', owner: 'not exported' }, geometry: square(x,34.9) })
const source = { fileName: 'synthetic-test.geojson', importedAt: '2026-09-24T00:00:00.000Z' }

test('imported files cannot impersonate an internally restored review parcel', async () => {
  const feature = parcel('42',133.5)
  feature.properties.__parcelReviewId = 'forged-key'
  feature.properties.__parcelSourceName = 'another-file.geojson'
  const data = await readCadastreGeoJson({name:source.fileName,size:100}, {type:'FeatureCollection',features:[feature]})
  assert.equal(data.features[0].properties.__parcelReviewId,undefined)
  assert.equal(data.features[0].properties.__parcelSourceName,undefined)
  assert.equal(data.features[0].properties.__parcelId,'42')
})

test('legacy schema 1 records reopen without invented parcel geometry', () => {
  const old = exampleReviewRecord('1.25'); old.schemaVersion = 1; delete old.candidate.parcelReview
  const opened = parseReviewRecord(JSON.stringify(old))
  assert.equal(opened.schemaVersion,2)
  assert.deepEqual(opened.candidate.parcelReview,createEmptyParcelReview())
  assert.equal(opened.candidate.name,old.candidate.name)
})
test('schema 2 retains target/reference/boundary/exclusions, provenance and calculated area on reopen', () => {
  const record = exampleReviewRecord('1.27')
  let review = setReviewParcel(createEmptyParcelReview(),parcel('100-1',133.5),'target',source)
  review = setReviewParcel(review,parcel('100-2',133.501),'reference',source)
  review.boundary = square(133.5,34.9,.0008)
  review.exclusions = [square(133.5002,34.9002,.0002)]
  record.candidate.parcelReview = review
  const reopened = parseReviewRecord(JSON.stringify(record))
  assert.deepEqual(reopened.candidate.parcelReview,review)
  assert.deepEqual(measureParcelReview(reopened.candidate.parcelReview),measureParcelReview(review))
  assert.equal(reopened.candidate.parcelReview.parcels[0].info.owner,undefined)
  assert.equal(reopened.results.generation,null)
})
test('bad saved parcel geometry fails the whole record before restoration', () => {
  const record = exampleReviewRecord('1.27')
  record.candidate.parcelReview.boundary = {type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}
  assert.throws(()=>parseReviewRecord(JSON.stringify(record)),/筆界/)
})
test('external confirmation encodes address as path data and never guesses missing lot identity', () => {
  assert.equal(geonexParcelUrl(null),'https://geonex-maps.com/')
  const url = new URL(geonexParcelUrl({municipality:'試験市',area:'地区/東?',number:'2-3#x'}))
  assert.equal(url.origin,'https://geonex-maps.com'); assert.equal(url.search,''); assert.equal(url.hash,'')
  assert.equal(decodeURIComponent(url.pathname),'/p/試験市 地区/東? 2-3#x')
})
test('CSV includes reference source without counting it in the target area', () => {
  const review = setReviewParcel(createEmptyParcelReview(),parcel('2',133.5),'reference',source)
  const rows=parcelReviewCsvRows(review,measureParcelReview(review))
  assert.equal(rows.find(row=>row[0]==='対象筆数')[1],0)
  assert.equal(rows.find(row=>row[0]==='除外後の検討面積(m²)')[1],0)
  assert.equal(rows.find(row=>row[0]==='筆1 元ファイル')[1],source.fileName)
})
