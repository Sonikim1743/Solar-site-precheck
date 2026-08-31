import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { readInheritancePdfOnServer } from './inheritance-server.mjs'
import { powerGridMiddleware } from './power-grid-server.mjs'

const root = resolve(process.env.DIST_DIR || 'dist')
const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 5173)
const maxPdfUploadBytes = 80 * 1024 * 1024

function loadRootHeaders() {
  const headersPath = join(root, '_headers')
  if (!existsSync(headersPath)) return {}
  const headers = {}
  let inRootBlock = false
  for (const line of readFileSync(headersPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '/*') {
      inRootBlock = true
      continue
    }
    if (!inRootBlock) continue
    if (!trimmed) break
    const separator = trimmed.indexOf(':')
    if (separator <= 0) continue
    headers[trimmed.slice(0, separator)] = trimmed.slice(separator + 1).trim()
  }
  return headers
}

const rootHeaders = loadRootHeaders()

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
  '.pdf': 'application/pdf',
}

function findCurrentChunk(prefix) {
  const assetsDir = join(root, 'assets')
  if (!existsSync(assetsDir)) return null
  try {
    const match = readdirSync(assetsDir)
      .filter((name) => name.startsWith(prefix) && /\.js$/.test(name))
      .sort()
      .at(-1)
    return match ? join(assetsDir, match) : null
  } catch {
    return null
  }
}

function fileForUrl(url) {
  const pathname = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname)
  const requested = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const candidate = resolve(join(root, requested))
  if (candidate !== root && !candidate.startsWith(`${root}\\`) && !candidate.startsWith(`${root}/`)) return null
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  const chunkMatch = pathname.match(/^\/assets\/(index|nedoWeb|nedoPdf|nedoValidation|pdfToJpg|inheritancePdf|pdfCompat)-[A-Za-z0-9_-]+\.(?:js|jsf|mjs)$/)
  if (chunkMatch) return findCurrentChunk(`${chunkMatch[1]}-`)
  if (/^\/assets\/pdfToJpg-[A-Za-z0-9_-]+\.jsf?$/.test(pathname)) return findCurrentChunk('pdfToJpg-')
  if (/^\/(?:assets|data|icons|screenshots|templates|manual|ocr)\//.test(pathname)) return null
  return join(root, 'index.html')
}

function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > maxPdfUploadBytes) {
        request.destroy()
        rejectBody(new Error('PDFファイルが大きすぎます。80MB以下のファイルを選択してください。'))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolveBody(Buffer.concat(chunks)))
    request.on('error', rejectBody)
  })
}

createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${host}:${port}`)
  if (requestUrl.pathname === '/api/power-grid') {
    await powerGridMiddleware(request, response, () => {})
    return
  }
  if (requestUrl.pathname === '/api/inheritance-pdf') {
    if (request.method !== 'POST') {
      response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Method not allowed')
      return
    }
    try {
      const fileName = decodeURIComponent(request.headers['x-file-name'] || '相続資料.pdf')
      const buffer = await readRequestBody(request)
      const result = await readInheritancePdfOnServer(buffer, fileName)
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      response.end(JSON.stringify(result))
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end(error.message || 'PDF解析に失敗しました。')
    }
    return
  }

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
    ...rootHeaders,
    'Content-Type': types[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  createReadStream(file).pipe(response)
}).listen(port, host, () => {
  console.log(`Solar Site Precheck: http://${host}:${port}/`)
})
