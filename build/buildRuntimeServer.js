import { build } from 'vite'
import { resolve } from 'node:path'

// Older updaters copy only dist/work. Bundle the server dependency tree into work.
await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: 'tmp/power-grid-runtime',
    minify: false,
    lib: { entry: resolve('work/power-grid-server.mjs'), formats: ['es'], fileName: () => 'power-grid-server.mjs' },
  },
})
