import { execFileSync } from 'node:child_process'

function runGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

let status = ''
try {
  status = runGit(['status', '--porcelain'])
} catch (error) {
  console.error('Git status could not be checked. Release packaging was stopped for safety.')
  console.error(error.stderr?.toString?.().trim() || error.message)
  process.exit(1)
}

if (status) {
  console.error('Release packaging stopped: uncommitted source changes were found.')
  console.error('')
  console.error(status)
  console.error('')
  console.error('Commit and push the source changes first, then run the release package script again.')
  process.exit(1)
}

console.log('Git working tree is clean. Release packaging can continue.')
