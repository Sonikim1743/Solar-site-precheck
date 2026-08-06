import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('app root is protected by the top-level error boundary', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')

  assert.match(source, /<AppErrorBoundary>/)
  assert.match(source, /<App \/>/)
  assert.match(source, /<\/AppErrorBoundary>/)
})

test('PDF tools are loaded as a separate route chunk', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')

  assert.match(source, /lazy\(\(\) => import\('\.\/components\/PdfToolsPage\.jsx'\)\)/)
  assert.match(source, /<Suspense fallback=/)
})
