import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCoordinateLink, savedWorkspaceUrl, loadCoordinateWorkspaceDraft, saveCoordinateWorkspaceDraft } from '../src/utils/coordinateLink.js'

test('no coordinates leaves the saved workspace route available', () => {
  for (const query of ['', '?design=simple', '?address=example', '?latitudex=34']) {
    assert.deepEqual(parseCoordinateLink(query), { status: 'none', key: 'draft' })
  }
})

test('valid decimal coordinate links preserve precise latitude and longitude', () => {
  assert.deepEqual(parseCoordinateLink('?lat=34.4089&lon=133.2049&design=simple').position, { lat: 34.4089, lon: 133.2049 })
  assert.equal(parseCoordinateLink('?lat=34.408900&lon=133.204900').key, parseCoordinateLink('?lon=133.2049&lat=34.4089').key)
  assert.equal(parseCoordinateLink('?lat=20&lon=120').status, 'valid')
  assert.equal(parseCoordinateLink('?lat=50&lon=155').status, 'valid')
  assert.equal(parseCoordinateLink('?lat=34.123456789012&lon=133.123456789012').position.lat, 34.123456789012)
})

test('partial, empty, ambiguous, nondecimal and outside-coverage links are rejected', () => {
  for (const query of [
    '?lat=34', '?lon=133', '?lat=&lon=133', '?lat=34&lon=', '?lat=%20&lon=133',
    '?lat=null&lon=133', '?lat=NaN&lon=133', '?lat=Infinity&lon=133',
    '?lat=0x22&lon=133', '?lat=3.4e1&lon=133', '?lat=34abc&lon=133',
    '?lat=34,4&lon=133', '?lat=34&lon=133&lat=35', '?lat=34&lon=133&lon=133',
    '?lat=19.99&lon=133', '?lat=50.01&lon=133', '?lat=34&lon=119.99', '?lat=34&lon=155.01',
    '?lat=133&lon=34', '?lat=-34&lon=133', '?lat=34&lon=-133',
  ]) assert.equal(parseCoordinateLink(query).status, 'invalid', query)
})

test('coordinate navigation keys separate workspaces without reacting to hash or display options', () => {
  assert.notEqual(parseCoordinateLink('?lat=34&lon=133').key, parseCoordinateLink('?lat=35&lon=134').key)
  assert.equal(parseCoordinateLink('?lat=34&lon=133&design=simple').key, parseCoordinateLink('?lat=34&lon=133').key)
  assert.notEqual(parseCoordinateLink('?lat=bad&lon=133').key, parseCoordinateLink('?lat=other&lon=133').key)
})

test('return link removes every coordinate parameter and preserves the app origin and display mode', () => {
  assert.equal(savedWorkspaceUrl('http://127.0.0.1:5297/?lat=34&lon=133&lat=35&design=simple#generation'),
    'http://127.0.0.1:5297/?design=simple#site-select')
})

test('direct links, reloads, different points and history never read or replace the saved draft', () => {
  const original = '{"position":{"lat":35,"lon":135},"memo":"合成保存メモ","parcelReview":{"polygons":[[1,2],[3,4]]},"terrain":{"source":"synthetic"}}'
  let saved = original, reads = 0, writes = 0
  const load = () => { reads++; return JSON.parse(saved) }
  const storage = { setItem(key, value) { assert.equal(key, 'test-draft'); writes++; saved = value } }
  const first = '?lat=34.4089&lon=133.2049'
  // Two loads of the same URL model refresh/new-tab; returning to a previous
  // key models history. Each uses a fresh seed, with no old shapes/results.
  for (const query of [first, first, '?lat=34.4859&lon=133.3628', first, '?lat=bad&lon=133', '?lat=34']) {
    const link = parseCoordinateLink(query)
    assert.deepEqual(loadCoordinateWorkspaceDraft(link, load), {})
    assert.equal(saveCoordinateWorkspaceDraft(link, storage, 'test-draft', { position: link.position, memo: 'temporary changes' }), false)
    assert.equal(saved, original)
  }
  assert.equal(reads, 0)
  assert.equal(writes, 0)
  const normal = parseCoordinateLink('')
  assert.deepEqual(loadCoordinateWorkspaceDraft(normal, load), JSON.parse(original))
  assert.equal(reads, 1)
  const updated = { ...JSON.parse(original), memo: '通常作業の更新' }
  assert.equal(saveCoordinateWorkspaceDraft(normal, storage, 'test-draft', updated), true)
  assert.deepEqual(JSON.parse(saved), updated)
  assert.equal(writes, 1)
})

test('coordinate workspaces remain usable even when persistent storage cannot be accessed', () => {
  const blocked = () => { throw new Error('storage must not be accessed') }
  for (const query of ['?lat=34&lon=133', '?lat=invalid&lon=133']) {
    const link = parseCoordinateLink(query)
    assert.deepEqual(loadCoordinateWorkspaceDraft(link, blocked), {})
    assert.equal(saveCoordinateWorkspaceDraft(link, { setItem: blocked }, 'test-draft', {}), false)
  }
})
