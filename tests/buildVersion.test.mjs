import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {APP_VERSION} from '../src/utils/buildInfo.js'
test('visible app version matches the release package version',()=>{
  const metadata=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'))
  assert.equal(APP_VERSION,metadata.version)
})
