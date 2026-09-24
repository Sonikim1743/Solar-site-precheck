import assert from 'node:assert/strict'
import test from 'node:test'
import { pageFromHash, hashForPage } from '../src/utils/pageRoutes.js'

test('core analysis and output links stay on the complete main workspace', () => {
  for (const hash of ['', '#site-select', '#site-review', '#site-details', '#simple-horizon', '#simple-snow', '#report-section', '#solar-manual', '#solar-tips']) assert.equal(pageFromHash(hash), 'solar')
})
test('specialist utilities keep their existing routes', () => {
  for (const page of ['generation', 'power', 'pdf', 'inheritance']) assert.equal(pageFromHash(hashForPage(page)), page)
  assert.equal(pageFromHash('#unknown'), 'solar')
})
