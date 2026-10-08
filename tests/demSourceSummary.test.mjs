import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyDemSource, summarizeDemSources } from '../src/utils/reportTerrain.js'

test('DEM1A laser data is a 1m family, never a 5m laser observation', () => {
  const source = '国土地理院 DEM1A（航空レーザ・1m級） PNG・双線形補間'
  assert.equal(classifyDemSource(source), 'dem1')
  const result = summarizeDemSources([source, source])
  assert.equal(result.dem1, 2)
  assert.equal(result.dem5, 0)
  assert.equal(result.total, 2)
  assert.equal(result.shouldWarn, false)
})

test('5A/B/C retain the 5m family without treating all laser measurements as 5m', () => {
  for (const type of ['DEM5A（航空レーザ・5m級）', 'DEM5B（写真測量・5m級）', 'DEM5C（写真測量・5m級）', '5A', '5B', '5C']) assert.equal(classifyDemSource(type), 'dem5')
  assert.equal(classifyDemSource('航空レーザ測量'), 'unknown')
  assert.equal(classifyDemSource('基盤地図情報'), 'unknown')
})

test('JSON fallback hsrc can distinguish 1m, 5m and 10m and is not itself a missing PNG observation', () => {
  for (const [hsrc, expected] of [['1m（レーザ）', 'dem1'], ['5m（レーザ）', 'dem5'], ['5m（写真測量）', 'dem5'], ['10m（火山）', 'dem10']]) {
    assert.equal(classifyDemSource(`国土地理院 標高JSON API（PNG未取得時） / ${hsrc}`), expected)
  }
  assert.equal(classifyDemSource('国土地理院 標高JSON API（PNG未取得時）'), 'unknown')
  assert.equal(classifyDemSource('手動入力'), 'unknown')
})

test('missing observations cannot dilute the share of acquired 10m data', () => {
  const result = summarizeDemSources([...Array(4).fill('国土地理院 DEM（10m級） PNG・双線形補間'), ...Array(6).fill('標高データなし')])
  assert.equal(result.total, 4)
  assert.equal(result.dem10, 4)
  assert.equal(result.missing, 6)
  assert.equal(result.shouldWarn, true)
  assert.match(result.detail, /比率対象外/)
})

test('families are mutually exclusive and an all-missing report never claims a measured DEM family', () => {
  const mixed = summarizeDemSources(['DEM1A（航空レーザ）', 'DEM5A 基盤地図情報', 'DEM10B', '出典不明', '未取得'])
  assert.equal(mixed.total, 4)
  assert.equal(mixed.dem1 + mixed.dem5 + mixed.dem10 + mixed.unknown, mixed.total)
  assert.equal(mixed.missing, 1)
  const empty = summarizeDemSources(['標高データなし', '未取得', '—'])
  assert.equal(empty.total, 0)
  assert.equal(empty.dem1 + empty.dem5 + empty.dem10, 0)
  assert.equal(empty.shouldWarn, false)
})
