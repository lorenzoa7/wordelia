// Run the main scenarios against the built app. Exit with an error if a scenario fails
// or if the page logs an error. Usage: npm run e2e
import { spawn } from 'node:child_process'

const scenarios = [
  ['home'],
  ['book'],
  ['export'],
  ['persist'],
  ['history'],
  ['settings'],
  ['settings-shortcuts'],
  ['settings-rules'],
  ['dark', '--dark'],
  ['library'],
  ['newbook'],
  ['resize'],
  ['today'],
  ['keyboard'],
  ['paste'],
  ['reorder'],
  ['external'],
  ['panels'],
  ['plannav'],
  ['chat', '--en'],
  ['chatview'],
  ['pages', '--en'],
  ['reveal'],
  ['reopen'],
  ['pagebreak', '--en'],
  ['selmenu', '--en'],
  ['zoom', '--en'],
  ['longtitle', '--en'],
  ['graph', '--en'],
  ['graph', '--en', '--dark'],
  ['switchbook'],
  ['icons'],
  ['shell']
]

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/shot.mjs', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('close', (code) => resolve({ code, out }))
  })
}

let failed = 0
for (const args of scenarios) {
  const t = Date.now()
  const { code, out } = await run(args)
  const bad = code !== 0 || /\[renderer (error|pageerror)\]|Error:|-error\.png|saved: false|saved:\s*false/.test(out)
  console.log(`${bad ? '✗' : '✓'} ${args.join(' ')} (${((Date.now() - t) / 1000).toFixed(1)} s)`)
  if (bad) {
    failed++
    console.log(out.split('\n').filter((l) => /error|Error|saved/.test(l)).slice(0, 12).join('\n'))
  }
}
if (failed) {
  console.log(`\n${failed} scenario(s) failed`)
  process.exit(1)
}
console.log('\nAll scenarios passed')
