import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolvePowerGridIdentities } from '../src/services/powerGridIdentity.js'
const line = { id: 'way/1', ref: '岡⑤F3', name: '名称未記載', voltageKv: 22 }
const record = { no: '岡⑤F3', name: '上水田線', voltageKv: 22 }
test('unique official ID resolves line and summary without mutating input', () => {
  const result = resolvePowerGridIdentities({ lines: [line], summary: { nearestLine: line } }, { lines: [record] })
  assert.equal(result.lines[0].name, '上水田線')
  assert.equal(result.summary.nearestLine.name, '上水田線')
  assert.equal(line.name, '名称未記載')
})
test('missing, ambiguous and conflicting identities are not guessed', () => {
  for (const records of [[record, record], [{ ...record, voltageKv: 66 }], []]) {
    assert.equal(resolvePowerGridIdentities({ lines: [line] }, { lines: records }).lines[0], line)
  }
  assert.equal(resolvePowerGridIdentities({ lines: [{ ...line, ref: '' }] }, { lines: [record] }).lines[0].name, '名称未記載')
})
test('substation identities are resolved independently', () => {
  assert.equal(resolvePowerGridIdentities({ substations: [line] }, { substations: [record] }).substations[0].name, record.name)
})
