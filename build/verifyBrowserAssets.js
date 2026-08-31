import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ocrAssets } from './ocrAssets.js'

export async function verifyBrowserAssets(directory = 'dist') {
  const read = (name) => readFile(resolve(directory, name))
  const pdf = await read('manual/site-operation-guide-v1.23.pdf')
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Operation manual is not a PDF')
  for (const [name, source] of ocrAssets) {
    const [deployed, original] = await Promise.all([read(name), readFile(source)])
    if (!deployed.equals(original)) throw new Error(`Missing or outdated OCR asset: ${name}`)
  }
  const policy = (await read('_headers')).toString()
  if (!/script-src[^;]*'wasm-unsafe-eval'/.test(policy)) throw new Error('OCR WebAssembly is blocked by CSP')
  if (/https:\/\/cdn\.jsdelivr\.net/.test(policy)) throw new Error('OCR should not require a CDN CSP exception')
  await read('404.html')
  return `Manual PDF (${pdf.length} bytes) and ${ocrAssets.length} self-hosted OCR assets verified`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(await verifyBrowserAssets(process.argv[2] || 'dist')) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
