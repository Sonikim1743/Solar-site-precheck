import { build } from 'vite'
import { resolve } from 'node:path'

// Separate output only: never ship the diagnostic page in the application build.
await build({
  configLoader: 'runner',
  build: {
    outDir: 'tmp/browser-smoke',
    rollupOptions: { input: [resolve('tests/browser/ocr-smoke.html'), resolve('tests/browser/grid-smoke.html'), resolve('tests/browser/report-smoke.html')] },
  },
})
