import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { pageFromHash } from '../src/utils/pageRoutes.js'

test('power grid has its own lazy route and candidate handoff', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /lazy\(\(\) => import\('\.\/components\/PowerGridPage.jsx'\)\)/)
  assert.equal(pageFromHash('#power-grid'), 'power')
  assert.match(app, /この地点の系統を確認/)
  assert.doesNotMatch(app, /\{!simpleDesign && powerPanel\}/)
})
