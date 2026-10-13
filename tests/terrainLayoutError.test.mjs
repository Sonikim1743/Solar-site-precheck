import test from 'node:test'
import assert from 'node:assert/strict'
import { terrainLayoutErrorGuidance, terrainLayoutResultMatchesOptions } from '../src/utils/terrainLayoutError.js'
import { normalizeTerrainLayoutOptions } from '../src/utils/terrainLayout.js'

test('worker and startup failures propose refresh without asserting that terrain extent is the cause', () => {
  for (const kind of ['worker', 'startup']) {
    const result = terrainLayoutErrorGuidance(kind)
    assert.equal(result.action, 'refresh')
    assert.equal(result.message, '計算処理を開始できませんでした。')
    assert.match(result.hint, /考えられます/)
    assert.match(result.hint, /画面を更新/)
    assert.doesNotMatch(`${result.message}${result.hint}`, /範囲を小さく|範囲が大き|地形の不足/)
  }
})

test('data and calculation failures point to the existing reacquire and spacing controls', () => {
  const data = terrainLayoutErrorGuidance('data')
  assert.equal(data.action, 'reacquire')
  assert.match(data.hint, /地形の「再取得」/)
  const calculation = terrainLayoutErrorGuidance('calculation')
  assert.equal(calculation.action, 'conditions')
  for (const label of ['範囲の形', '地形の取得状態', '架台左右の空き', '前後の空き', '端からの空き']) assert.ok(calculation.hint.includes(label))
  assert.doesNotMatch(calculation.hint, /必ず|施工可能|解決します/)
})

test('only explicit limit categories suggest splitting the range; unknown categories give complete safe guidance', () => {
  for (const kind of ['limit', 'timeout', 'resource']) {
    const result = terrainLayoutErrorGuidance(kind)
    assert.equal(result.action, 'boundary')
    assert.match(result.hint, /範囲を分け/)
  }
  for (const kind of [undefined, null, '', 'other', 'toString', '__proto__', 4, {}, Symbol('kind')]) {
    const result = terrainLayoutErrorGuidance(kind, 'out of memory')
    assert.deepEqual(Object.keys(result).sort(), ['action', 'hint', 'message'])
    assert.equal(result.action, 'refresh')
    assert.ok(result.message.length > 0 && result.hint.length > 0)
    assert.match(result.hint, /画面を更新/)
    assert.doesNotMatch(result.hint, /範囲を分け|上限に達/)
  }
})

test('raw exception content is never echoed or interpreted and returned UI objects are independent', () => {
  const raw = 'Error: <script>alert(1)</script> https://example.invalid/?token=secret\n at worker.js:123'
  const expected = terrainLayoutErrorGuidance('calculation')
  assert.deepEqual(terrainLayoutErrorGuidance('calculation', raw), expected)
  const opaque = Object.freeze({ toString() { throw new Error('untrusted coercion') } })
  assert.deepEqual(terrainLayoutErrorGuidance('calculation', opaque), expected)
  const changed = terrainLayoutErrorGuidance('calculation', raw)
  changed.message = raw
  changed.action = 'unsafe'
  assert.deepEqual(terrainLayoutErrorGuidance('calculation'), expected)
  for (const kind of ['worker', 'startup', 'data', 'calculation', 'limit', 'unknown']) assert.doesNotMatch(JSON.stringify(terrainLayoutErrorGuidance(kind, raw)), /secret|script|example\.invalid|worker\.js/)
})
test('an older worker cannot label below-ten results as a new slope scenario or use incorrect physical dimensions', () => {
  const requested=normalizeTerrainLayoutOptions({slopeLimitDeg:15}), valid={options:{...requested,azimuthDeg:172.5}}
  assert.equal(terrainLayoutResultMatchesOptions(valid,requested),true,'selected bearing may differ from base bearing')
  assert.equal(terrainLayoutResultMatchesOptions({options:{...requested,slopeLimitDeg:10}},requested),false)
  const old={...requested};delete old.slopeLimitDeg
  assert.equal(terrainLayoutResultMatchesOptions({options:old},requested),false)
  assert.equal(terrainLayoutResultMatchesOptions({options:{...requested,moduleWidthM:1.303}},requested),false)
  assert.equal(terrainLayoutResultMatchesOptions(null,requested),false)
})
