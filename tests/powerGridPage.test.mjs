import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { pageFromHash } from '../src/utils/pageRoutes.js'

test('power grid remains available from tools with its route, candidate and saved results', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /lazy\(\(\) => import\('\.\/components\/PowerGridPage.jsx'\)\)/)
  assert.equal(pageFromHash('#power-grid'), 'power')
  const navigation = app.match(/<nav className="workspace-nav"[\s\S]*?<\/nav>/)?.[0]
  const tools = navigation?.match(/<details className="workspace-tools">[\s\S]*?<\/details>/)?.[0]
  assert.ok(tools, 'the tools menu is available')
  assert.match(tools, /onClick=\{\(\) => switchPage\('power'\)\}>系統確認<\/button>/)
  assert.doesNotMatch(navigation.replace(tools, ''), /系統確認/, 'power grid is not an always-visible header action')
  assert.doesNotMatch(app, /className="power-page-link"|この地点の系統を確認/, 'there is no duplicate action beneath the map')
  const page = app.match(/<PowerGridPage\b[\s\S]*?\/>\s*<\/Suspense>/)?.[0]
  assert.ok(page, 'the existing grid page remains mounted on its route')
  for (const prop of ['position={position}', 'powerGrid={powerGrid}', 'generation={generation}', 'savedGridNotes={gridNotes}']) {
    assert.ok(page.includes(prop), `${prop} is handed to the grid page`)
  }
  assert.match(page, /onBack=\{\(\) => switchPage\('solar'\)\}/)
  assert.doesNotMatch(app, /\{!simpleDesign && powerPanel\}/)
})
