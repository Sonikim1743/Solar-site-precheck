import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join, resolve, relative, sep } from 'node:path'
import { createRequire } from 'node:module'
import { zipSync, unzipSync } from 'fflate'
import { verifyBrowserAssets } from './verifyBrowserAssets.js'

// A release must be made from committed source. Never substitute a dirty-tree bypass.
const root = process.cwd()
const run = (file, args = [], env = {}) => execFileSync(process.execPath, [file, ...args], { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
run('work/assert-clean-tree.mjs')
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const tests = (await readdir('tests')).filter((name) => name.endsWith('.test.mjs')).map((name) => `tests/${name}`)
execFileSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], { stdio: 'inherit' })
const version = JSON.parse(await readFile('package.json', 'utf8')).version.replace(/\.0$/, '')
const buildDate = process.env.VITE_BUILD_DATE || new Date().toISOString().slice(0, 10)
await mkdir('outputs', { recursive: true })
// Unique output directory: no recursive deletion or overwriting previous releases.
const output = await mkdtemp(resolve('outputs', `v${version}-${buildDate}-`))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const copy = async (source, dest) => { await mkdir(resolve(dest, '..'), { recursive: true }); await cp(source, dest, { recursive: true }) }
async function files(directory, prefix = '') {
  const result = {}
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${entry.name}`)
    const key = prefix + entry.name
    if (entry.isDirectory()) Object.assign(result, await files(join(directory, entry.name), `${key}/`))
    else result[key] = await readFile(join(directory, entry.name))
  }
  return result
}

run('build/buildRuntimeServer.js')
const require = createRequire(import.meta.url)
const { build: bundle } = require(createRequire(require.resolve('vite/package.json')).resolve('esbuild'))
const packages = []
for (const target of ['cloudflare', 'portable']) {
  const directory = join(output, target)
  await mkdir(directory)
  const dist = join(directory, 'dist')
  run('node_modules/vite/bin/vite.js', ['build', '--configLoader', 'runner', '--outDir', dist], {
    VITE_BUILD_DATE: buildDate, VITE_BUILD_TARGET: target, VITE_DISABLE_SW: '1',
    VITE_PDF_LIMIT_MB: target === 'cloudflare' ? '20' : '80', VITE_MIN_REQUIRED_RUNTIME: '1.2',
  })
  // Only remove known generated artifacts inside this newly created package.
  for (const name of ['templates', 'sw.js']) {
    const artifact = resolve(dist, name)
    if (!artifact.startsWith(resolve(output) + sep) || !artifact.startsWith(resolve(dist) + sep)) throw new Error('Unsafe artifact path')
    await rm(artifact, { recursive: name === 'templates', force: true })
  }
  console.log(await verifyBrowserAssets(dist))
  run('work/verify-csp-hosts.mjs', [dist])
  await copy('RELEASE_UPDATE_GUIDE.md', join(directory, 'RELEASE_UPDATE_GUIDE.md'))
  await copy('docs/DEPLOYMENT_PACKAGE.md', join(directory, 'README.md'))
  await copy('docs/DEPLOYMENT_PACKAGE.md', join(directory, 'docs/DEPLOYMENT_PACKAGE.md'))
  await copy('work/preflight-release.mjs', join(directory, 'work/preflight-release.mjs'))
  if (target === 'cloudflare') {
    await copy('functions', join(directory, 'functions'))
    await copy('shared', join(directory, 'shared'))
    await copy('wrangler.pages.toml', join(directory, 'wrangler.toml'))
    const entries = (await readdir(join(directory, 'functions/api'))).filter((name) => name.endsWith('.js'))
    for (const entry of entries) await bundle({ entryPoints: [join(directory, 'functions/api', entry)], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022' })
  } else {
    for (const file of ['RUN_PORTABLE.cmd', 'UPDATE_APP_FROM_RELEASE.cmd', 'UPDATE_APP_FROM_RELEASE.ps1', 'work/serve-dist.mjs', 'work/inheritance-server.mjs']) {
      await copy(file, join(directory, file))
    }
    await copy('tmp/power-grid-runtime/power-grid-server.mjs', join(directory, 'work/power-grid-server.mjs'))
    for (const name of ['pdf.mjs', 'pdf.worker.mjs']) await copy(`node_modules/pdfjs-dist/legacy/build/${name}`, join(directory, 'work/pdfjs', name))
  }
  const contents = await files(directory)
  for (const name of Object.keys(contents)) {
    if (name.endsWith('.spt') || name === 'dist/sw.js' || name.startsWith('.git/')) throw new Error(`Private or stale artifact: ${name}`)
  }
  const bundleName = Object.keys(contents).find((name) => /^dist\/assets\/index-[\w-]+\.js$/.test(name))?.split('/').pop()
  if (!bundleName) throw new Error('Missing main bundle')
  const manifest = { app: 'Solar Site Precheck', version, buildDate, sourceCommit, target, bundleName, files: Object.fromEntries(Object.entries(contents).map(([name, bytes]) => [name, sha256(bytes)])) }
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(join(directory, 'release-manifest.json'), manifestBytes)
  contents['release-manifest.json'] = manifestBytes
  run('work/assert-clean-tree.mjs')
  const archive = zipSync(contents, { level: 6 })
  const packageName = target === 'portable' ? `SolarSitePrecheck_v${version}_release_light.zip` : `SolarSitePrecheck_v${version}_${buildDate}_cloudflare.zip`
  const path = join(output, packageName)
  await writeFile(path, archive)
  const unpacked = unzipSync(await readFile(path))
  if (Object.keys(unpacked).length !== Object.keys(contents).length) throw new Error('ZIP file count mismatch')
  for (const [name, bytes] of Object.entries(contents)) {
    if (sha256(unpacked[name] || new Uint8Array()) !== sha256(bytes)) throw new Error(`ZIP mismatch: ${name}`)
  }
  const packageHash = sha256(archive)
  const metadata = {
    app: 'Solar Site Precheck', version, buildDate, sourceCommit, target,
    buildId: `${version}-${buildDate}-${packageHash.slice(0, 12)}`, packageName,
    zipUrl: `https://raw.githubusercontent.com/Sonikim1743/Solar-site-precheck/main/release/latest/${packageName}`,
    sha256: packageHash, etag: packageHash.slice(0, 16), bundleName, minRequiredRuntime: '1.2',
    notes: target === 'portable' ? 'Local update: keep runtime/node.exe. Same-origin power API, local OCR assets, manual PDF, 66/77kV progressive search.' : 'Cloudflare Pages: deploy from extracted root including functions and shared. Not a dashboard drag-and-drop ZIP.',
    sizeBytes: archive.length,
  }
  await writeFile(join(output, `${target}-metadata.json`), JSON.stringify(metadata, null, 2) + '\n')
  packages.push({ ...metadata, path: relative(root, path).split(sep).join('/') })
}
// Do not update tracked release/latest until both targets are successfully verified.
const portable = packages.find((item) => item.target === 'portable')
await copy(portable.path, join('release/latest', portable.packageName))
await copy(join(output, 'portable-metadata.json'), 'release/latest/latest-version.json')
run('work/verify-release-metadata.mjs')
await writeFile(join(output, 'packages.json'), JSON.stringify(packages, null, 2) + '\n')
console.log(JSON.stringify({ output, packages }, null, 2))
