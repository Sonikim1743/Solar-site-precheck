const baseUrl = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '')
const samplePdf = process.argv[3] || ''

async function check(name, fn) {
  try {
    const result = await fn()
    console.log(`OK  ${name}: ${result}`)
  } catch (error) {
    console.error(`NG  ${name}: ${error.message}`)
    process.exitCode = 1
  }
}

async function status(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options)
  return response
}

await check('main HTML', async () => {
  const response = await status('/')
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const html = await response.text()
  const match = html.match(/\/assets\/index-[^"]+\.js/)
  if (!match) throw new Error('index bundle not found')
  return match[0]
})

await check('operation manual is a PDF, not an SPA fallback', async () => {
  const response = await status('/manual/site-operation-guide-v1.23.pdf')
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('Expected application/pdf')
  const data = new Uint8Array(await response.arrayBuffer())
  if (new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-') throw new Error('PDF signature missing')
  return `${data.length} bytes, PDF signature verified`
})

await check('/api/power-grid validates requests (not SPA HTML)', async () => {
  const response = await status('/api/power-grid', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'lat=invalid',
  })
  if (response.status !== 400 || !response.headers.get('content-type')?.includes('application/json')) throw new Error(`Expected JSON HTTP 400, got ${response.status}`)
  return 'HTTP 400 JSON; power-grid function is installed'
})

await check('/api/nedo-monsola 200', async () => {
  const response = await status('/api/nedo-monsola?mesh=52331366')
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return `HTTP ${response.status}`
})

await check('bad mesh 400', async () => {
  const response = await status('/api/nedo-monsola?mesh=bad')
  if (response.status !== 400) throw new Error(`HTTP ${response.status}`)
  return `HTTP ${response.status}`
})

await check('/api/inheritance-pdf GET 405', async () => {
  const response = await status('/api/inheritance-pdf')
  if (response.status !== 405) throw new Error(`HTTP ${response.status}`)
  return `HTTP ${response.status}`
})

if (samplePdf) {
  const { readFile } = await import('node:fs/promises')
  const { basename } = await import('node:path')
  await check('sample PDF POST', async () => {
    const data = await readFile(samplePdf)
    const response = await status('/api/inheritance-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'X-File-Name': encodeURIComponent(basename(samplePdf)),
      },
      body: data,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    const json = await response.json()
    if (!Array.isArray(json.results)) throw new Error('results array not found')
    if (!json.receiptSummary) throw new Error('receiptSummary not found')
    return `resultCount=${json.results.length}`
  })
} else {
  console.log('SKIP sample PDF POST: pass a PDF path as the second argument to enable it.')
}
