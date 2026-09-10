import { handlePowerGridRequest } from '../functions/api/power-grid.js'
import { handleGenerationRequest } from '../functions/api/pv-generation.js'

export async function powerGridMiddleware(request, response, next) {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname
  if (!['/api/power-grid', '/api/pv-generation'].includes(pathname)) return next()
  try {
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > 512) {
        response.writeHead(413, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: 'Request too large' }))
        return
      }
      chunks.push(chunk)
    }
    const handler = pathname === '/api/pv-generation' ? handleGenerationRequest : handlePowerGridRequest
    const result = await handler(new Request(`http://${request.headers.host}${request.url}`, {
      method: request.method,
      headers: request.headers,
      ...(['GET', 'HEAD'].includes(request.method) ? {} : { body: Buffer.concat(chunks) }),
    }))
    response.writeHead(result.status, Object.fromEntries(result.headers))
    response.end(await result.text())
  } catch {
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify({ error: '公開地図データを取得できませんでした。' }))
  }
}
