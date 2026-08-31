import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { ocrAssets } from '../build/ocrAssets.js'
import { NEDO_OCR_OPTIONS } from '../src/services/ocrConfig.js'
import { POWER_GRID_ENDPOINTS } from '../src/services/powerGrid.js'

test('OCR worker, every LSTM CPU variant and English model are self-hosted', () => {
  const names = ocrAssets.map(([name]) => `/${name}`)
  assert.ok(names.includes(NEDO_OCR_OPTIONS.workerPath))
  for (const variant of ['lstm', 'simd-lstm', 'relaxedsimd-lstm']) {
    assert.ok(names.includes(`${NEDO_OCR_OPTIONS.corePath}/tesseract-core-${variant}.wasm.js`))
  }
  assert.ok(names.includes(`${NEDO_OCR_OPTIONS.langPath}/eng.traineddata.gz`))
  for (const [, path] of ocrAssets) assert.ok(readFileSync(path).length > 0)
  assert.match(readFileSync('src/services/nedoPdf.js', 'utf8'), /createWorker\('eng', 1, \{\s*\.\.\.NEDO_OCR_OPTIONS/)
})

test('CSP permits all power endpoints and WebAssembly but not arbitrary eval or CDN', () => {
  const headers = readFileSync('public/_headers', 'utf8')
  const connect = headers.match(/connect-src ([^;]+)/)?.[1].split(/\s+/) || []
  for (const endpoint of POWER_GRID_ENDPOINTS) assert.ok(connect.includes(new URL(endpoint).origin))
  assert.match(headers, /script-src[^;]*'wasm-unsafe-eval'/)
  assert.doesNotMatch(headers, /'unsafe-eval'|cdn\.jsdelivr/)
})

test('manual button uses the packaged PDF and releases must not remove it', () => {
  assert.equal(readFileSync('public/manual/site-operation-guide-v1.23.pdf').subarray(0, 5).toString(), '%PDF-')
  assert.match(readFileSync('src/App.jsx', 'utf8'), /SITE_OPERATION_GUIDE_URL = '\/manual\/site-operation-guide-v1\.23\.pdf'/)
  const release = readFileSync('MAKE_RELEASE_PACKAGE.cmd', 'utf8')
  assert.doesNotMatch(release, /rmdir[^\r\n]*dist\\manual/)
  assert.match(release, /verifyBrowserAssets\.js/)
  const server = readFileSync('work/serve-dist.mjs', 'utf8')
  assert.match(server, /'\.pdf': 'application\/pdf'/)
  assert.match(server, /templates\|manual\|ocr/)
  assert.match(readFileSync('public/404.html', 'utf8'), /資料が見つかりません/)
})
