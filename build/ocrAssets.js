import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const tesseractPackage = require.resolve('tesseract.js/package.json')
const workerRoot = dirname(tesseractPackage)
const coreRoot = dirname(createRequire(tesseractPackage).resolve('tesseract.js-core/package.json'))
const languageRoot = dirname(require.resolve('@tesseract.js-data/eng/package.json'))

export const ocrAssets = [
  ['ocr/tesseract-7/worker.min.js', join(workerRoot, 'dist/worker.min.js')],
  // NEDO always uses OEM 1 (LSTM only). Include every supported CPU variant.
  ...['lstm', 'simd-lstm', 'relaxedsimd-lstm'].map((variant) => [
    `ocr/tesseract-7/tesseract-core-${variant}.wasm.js`, join(coreRoot, `tesseract-core-${variant}.wasm.js`),
  ]),
  ['ocr/eng-1/4.0.0_best_int/eng.traineddata.gz', join(languageRoot, '4.0.0_best_int/eng.traineddata.gz')],
  ['ocr/tesseract-7/LICENSE.txt', join(workerRoot, 'LICENSE.md')],
  ['ocr/tesseract-7/CORE-LICENSE.txt', join(coreRoot, 'LICENSE')],
]

export function localOcrAssets() {
  return {
    name: 'local-ocr-assets',
    generateBundle() {
      for (const [fileName, sourcePath] of ocrAssets) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(sourcePath) })
      }
    },
    configureServer(server) {
      const assets = new Map(ocrAssets.map(([url, path]) => [`/${url}`, path]))
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url, 'http://localhost').pathname
        if (!pathname.startsWith('/ocr/')) return next()
        const path = assets.get(pathname)
        if (!path) { response.writeHead(404); response.end('Not found'); return }
        response.writeHead(200, {
          'Content-Type': pathname.endsWith('.js') ? 'text/javascript' : 'application/octet-stream',
          'Cache-Control': 'no-cache',
        })
        response.end(readFileSync(path))
      })
    },
  }
}
