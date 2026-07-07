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
    const count = Array.isArray(json.results) ? json.results.length : 0
    if (!count) throw new Error('resultCount is 0')
    return `resultCount=${count}`
  })
} else {
  console.log('SKIP sample PDF POST: pass a PDF path as the second argument to enable it.')
}
