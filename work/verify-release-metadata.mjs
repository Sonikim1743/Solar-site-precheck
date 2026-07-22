import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const releaseDir = join(process.cwd(), 'release', 'latest')
const metadataPath = join(releaseDir, 'latest-version.json')

function fail(message) {
  console.error(`Release metadata check failed: ${message}`)
  process.exit(1)
}

const rawMetadata = await readFile(metadataPath)
if (rawMetadata[0] === 0xef && rawMetadata[1] === 0xbb && rawMetadata[2] === 0xbf) {
  fail('latest-version.json must not start with a UTF-8 BOM')
}

let metadata
try {
  metadata = JSON.parse(rawMetadata.toString('utf8'))
} catch (error) {
  fail(`latest-version.json is not valid JSON (${error.message})`)
}

const requiredFields = [
  'app',
  'version',
  'buildDate',
  'buildId',
  'packageName',
  'zipUrl',
  'sha256',
  'etag',
  'bundleName',
  'minRequiredRuntime',
  'sizeBytes',
]

for (const field of requiredFields) {
  if (metadata[field] === undefined || metadata[field] === null || metadata[field] === '') {
    fail(`missing field: ${field}`)
  }
}

if (!/^index-[\w-]+\.js$/.test(metadata.bundleName)) {
  fail(`bundleName should be the built main bundle, got ${metadata.bundleName}`)
}

if (!metadata.zipUrl.endsWith(`/release/latest/${metadata.packageName}`)) {
  fail('zipUrl does not point to release/latest/packageName')
}

const zipPath = join(releaseDir, metadata.packageName)
const zip = await readFile(zipPath)
const zipInfo = await stat(zipPath)
const sha256 = createHash('sha256').update(zip).digest('hex')

if (sha256 !== metadata.sha256) {
  fail(`sha256 mismatch: json=${metadata.sha256} actual=${sha256}`)
}

if (Number(metadata.sizeBytes) !== zipInfo.size) {
  fail(`sizeBytes mismatch: json=${metadata.sizeBytes} actual=${zipInfo.size}`)
}

if (!metadata.sha256.startsWith(metadata.etag)) {
  fail('etag should be a prefix of sha256')
}

if (!zip.includes(Buffer.from(metadata.bundleName, 'utf8'))) {
  fail(`release ZIP does not contain bundleName ${metadata.bundleName}`)
}

if (zip.includes(Buffer.from('templates/Kaihatu.spt', 'utf8'))) {
  fail('internal Solar Pro report template must not be included in the public light ZIP')
}

console.log(`Release metadata OK: ${metadata.packageName} ${metadata.sha256}`)
