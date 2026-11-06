import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('3D entry precedes supplementary checks and the first screen has no record bar', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const terrain = app.indexOf('<details id="terrain-area"')
  const supplement = app.indexOf('<CandidateWorkflow ')
  const records = app.indexOf('<ReviewRecordsPanel ')
  const report = app.indexOf('<section className="report-section"')
  assert.ok(terrain > 0 && terrain < supplement)
  assert.ok(records > report && report > supplement)
  assert.match(app, /<h1>3D地形分析<\/h1>/)
  assert.match(app, /<TerrainAreaPanel preferredView="3d"/)
  assert.match(app, />記録を保存<\/button>/)
  assert.match(app, /solar-workspace" hidden=\{activePage !== 'solar'\}/)
})

test('supplementary checks start closed without hiding the existing 3D function', async () => {
  const source = await readFile(new URL('../src/components/CandidateWorkflow.jsx', import.meta.url), 'utf8')
  const tag = source.match(/return <details[^>]+>/)?.[0]
  assert.ok(tag)
  assert.doesNotMatch(tag, /\bopen\b/)
  assert.match(source, /地平線・積雪・規制の補足確認/)
})
