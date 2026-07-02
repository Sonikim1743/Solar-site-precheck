import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function nedoMonsolaProxy() {
  async function handler(request, response, next) {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1:5173')
    if (requestUrl.pathname !== '/api/nedo-monsola') {
      next()
      return
    }
    const mesh = requestUrl.searchParams.get('mesh') || ''
    if (!/^\d{8}$/.test(mesh)) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Invalid mesh code')
      return
    }
    try {
      const nedoResponse = await fetch(`https://domessolar.infop.nedo.go.jp/appww/cgi-bin/monsola.cgi?m=${mesh}`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!nedoResponse.ok) throw new Error(`NEDO HTTP ${nedoResponse.status}`)
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      response.end(await nedoResponse.text())
    } catch (error) {
      response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end(error.message)
    }
  }

  return {
    name: 'nedo-monsola-proxy',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig({
  plugins: [react(), nedoMonsolaProxy()],
  define: {
    __BUILD_DATE__: JSON.stringify(process.env.VITE_BUILD_DATE || new Date().toISOString().slice(0, 10)),
  },
  build: {
    target: ['es2020', 'safari14'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
})
