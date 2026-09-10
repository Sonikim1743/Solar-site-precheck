import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCapacityCsv, summarizeGridFlowDirection, findPublishedGridConnections, matchPowerGridCapacity } from '../src/services/gridCapacity.js'
import { parsePowerGridElements } from '../shared/powerGrid.js'

test('CSV preserves negative flow and distinguishes dashes from zero', () => {
  const header = '送電線No,送電線名,電圧（kV）,予想潮流(MW),空容量（当該設備）(MW),設備容量(MW),運用容量値(MW),潮流方向'
  for (const negative of ['-24', '－24', '−24']) {
    const { lines } = parseCapacityCsv(`更新日\n${header}\n広④L104,東城線,66,${negative},－,47,47,東城（変）→帝釈川（変）`, 'test.csv')
    assert.equal(lines[0].expectedFlowMw, -24)
    assert.equal(lines[0].availableCapacityMw, null)
    assert.equal(lines[0].operatingCapacityMw, 47)
    assert.equal(summarizeGridFlowDirection(lines[0]).expectedLabel, '帝釈川（変） → 東城（変）')
  }
  assert.equal(parseCapacityCsv(`${header}\n1,A,66,0,0,47,47,A→B`, '').lines[0].availableCapacityMw, 0)
  assert.equal(summarizeGridFlowDirection({ flowDirection: '→' }).status, 'missing')
  assert.match(summarizeGridFlowDirection({ flowDirection: 'A→B', expectedFlowMw: 0 }).expectedLabel, /未確定/)
})

test('connections use complete endpoint names, not shared substrings', () => {
  const line = { no: '1', flowDirection: '東城（変）→帝釈川（変）' }
  const other = { no: '2', flowDirection: '庄原（変）→東城（変）' }
  const result = findPublishedGridConnections(line, { lines: [line, other, { no: '3', flowDirection: '新東城（変）→A' }], substations: [{ name: '東城変電所' }] })
  assert.deepEqual(result[0].lines, [other])
  assert.equal(result[0].substations.length, 1)
})

test('same name at conflicting known voltages is not a capacity match', () => {
  const result = matchPowerGridCapacity({ lines: [{ name: '東城線', voltageKv: 22 }] }, { lines: [{ name: '東城線', voltageKv: 66 }] })
  assert.equal(result.lineMatches.length, 0)
})

test('single circuit supplies missing way metadata; multiple circuits remain ambiguous', () => {
  const way = { type: 'way', id: 1, tags: { power: 'line' }, geometry: [{ lat: 35, lon: 133 }, { lat: 35.01, lon: 133 }] }
  const relation = { type: 'relation', id: 2, tags: { route: 'power', name: '東城線', voltage: '66000' }, members: [{ type: 'way', ref: 1 }] }
  assert.equal(parsePowerGridElements([way, relation], 35, 133).lines[0].name, '東城線')
  assert.equal(parsePowerGridElements([way, relation, { ...relation, id: 3 }], 35, 133).lines[0].name, '東城線')
  assert.match(parsePowerGridElements([way, relation, { ...relation, id: 3, tags: { ...relation.tags, name: '別の線' } }], 35, 133).lines[0].name, /名称未記載/)
})

test('multipolygon substation has a usable reference position', () => {
  const relation = { type: 'relation', id: 4, tags: { power: 'substation', name: '東城変電所' }, members: [{ role: 'outer', geometry: [{ lat: 35, lon: 133 }, { lat: 35.01, lon: 133 }] }] }
  assert.equal(parsePowerGridElements([relation], 35, 133).substations[0].name, '東城変電所')
})
