import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const root = process.cwd()
const servicesDir = join(root, 'src', 'services')
const publicHeadersPath = join(root, 'public', '_headers')
const distHeadersPath = join(process.argv[2] || join(root, 'dist'), '_headers')

function fail(message) {
  console.error(`CSP host check failed: ${message}`)
  process.exitCode = 1
}

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listSourceFiles(path))
    else if (['.js', '.jsx', '.mjs'].includes(extname(entry.name))) files.push(path)
  }
  return files
}

function extractOrigins(text) {
  const origins = new Set()
  for (const match of text.matchAll(/https:\/\/[^\s"'`\\)]+/g)) {
    try {
      origins.add(new URL(match[0]).origin)
    } catch {
      // Ignore documentation fragments that are not complete URLs.
    }
  }
  return origins
}

function extractConnectSources(headers) {
  const policyLine = headers
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith('Content-Security-Policy:'))
  if (!policyLine) throw new Error('Content-Security-Policy header was not found')
  const policy = policyLine.slice(policyLine.indexOf(':') + 1)
  const directive = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('connect-src '))
  if (!directive) throw new Error('connect-src directive was not found')
  return new Set(directive.split(/\s+/).slice(1))
}

async function collectRuntimeFetchOrigins() {
  const files = await listSourceFiles(servicesDir)
  const origins = new Map()
  for (const path of files) {
    const source = await readFile(path, 'utf8')
    // Network access is kept in services. Files without a fetch implementation
    // may contain citation/navigation URLs and do not require connect-src.
    if (!/\bfetch(?:Impl)?\b/.test(source)) continue
    for (const origin of extractOrigins(source)) {
      const owners = origins.get(origin) || []
      owners.push(relative(root, path).replaceAll('\\', '/'))
      origins.set(origin, owners)
    }
  }
  return origins
}

async function verifyHeaders(path, expectedOrigins, label) {
  let headers
  try {
    headers = await readFile(path, 'utf8')
  } catch (error) {
    fail(`${label} could not be read (${error.message})`)
    return
  }

  let connectSources
  try {
    connectSources = extractConnectSources(headers)
  } catch (error) {
    fail(`${label}: ${error.message}`)
    return
  }

  for (const [origin, owners] of expectedOrigins) {
    if (!connectSources.has(origin)) {
      fail(`${label} connect-src is missing ${origin} (used by ${owners.join(', ')})`)
    }
  }
}

const expectedOrigins = await collectRuntimeFetchOrigins()
await verifyHeaders(publicHeadersPath, expectedOrigins, 'public/_headers')
await verifyHeaders(distHeadersPath, expectedOrigins, 'dist/_headers')

if (!process.exitCode) {
  console.log(`CSP connect-src OK: ${[...expectedOrigins.keys()].sort().join(', ')}`)
}
