import test from 'node:test'
import assert from 'node:assert/strict'
import { searchAddress } from '../src/services/gsi.js'

const search = (query, titles) => searchAddress(query, { fetchImpl: async url => {
  assert.equal(new URL(url).searchParams.get('q'), query)
  return { ok: true, json: async () => titles.map(title => ({ properties: { title }, geometry: { coordinates: [135, 35] } })) }
} })

test('a lot-number query returning only the district is a name mismatch, even with one result', async () => {
  const result = await search('合成県合成市試験町2057', ['合成県合成市試験町'])
  assert.equal(result.length, 1)
  assert.equal(result[0].nameMatchesQuery, false)
  assert.equal(result[0].title, '合成県合成市試験町')
})

test('name matches normalize spacing and full-width digits without claiming parcel accuracy', async () => {
  const result = await search(' 合成県 合成市試験町２０５７－１ ', ['合成県合成市試験町2057-1'])
  assert.equal(result[0].nameMatchesQuery, true)
  const alternatives = await search('合成市', ['合成市', '別の合成市'])
  assert.deepEqual(alternatives.map(r => r.nameMatchesQuery), [true, false])
})

test('a missing title cannot be substituted with the query and mistaken for a name match', async () => {
  assert.deepEqual(await search('合成市試験町1', [undefined, null, '']), [])
})
