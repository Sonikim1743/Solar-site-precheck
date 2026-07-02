import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const root = resolve('dist')
const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 5173)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
}

function fileForUrl(url) {
  const pathname = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname)
  const requested = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const candidate = resolve(join(root, requested))
  if (candidate !== root && !candidate.startsWith(`${root}\\`) && !candidate.startsWith(`${root}/`)) return null
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  if (/^\/(?:assets|data|icons|screenshots|templates)\//.test(pathname)) return null
  return join(root, 'index.html')
}

createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${host}:${port}`)
  if (requestUrl.pathname === '/api/nedo-monsola') {
    const mesh = requestUrl.searchParams.get('mesh') || ''
    if (!/^\d{8}$/.test(mesh)) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Invalid mesh code')
      return
    }
    fetch(`https://domessolar.infop.nedo.go.jp/appww/cgi-bin/monsola.cgi?m=${mesh}`, {
      signal: AbortSignal.timeout(10000),
    })
      .then((nedoResponse) => {
        if (!nedoResponse.ok) throw new Error(`NEDO HTTP ${nedoResponse.status}`)
        return nedoResponse.text()
      })
      .then((html) => {
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        response.end(html)
      })
      .catch((error) => {
        response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end(error.message)
      })
    return
  }

  const file = fileForUrl(request.url || '/')
  if (!file || !existsSync(file)) {
    response.writeHead(404)
    response.end('Not found')
    return
  }
  response.writeHead(200, {
    'Content-Type': types[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  createReadStream(file).pipe(response)
}).listen(port, host, () => {
  console.log(`Solar Site Precheck: http://${host}:${port}/`)
})
