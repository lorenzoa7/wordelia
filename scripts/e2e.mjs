// Run the end-to-end scenarios against the built app (npm run e2e builds it first).
//
//   npm run e2e                    all scenarios, some at the same time
//   npm run e2e -- --changed       only the scenarios for the files that changed since main
//   npm run e2e -- pages zoom      only these scenarios
//   npm run e2e -- --workers 2     how many apps run at the same time (default 4)
//   npm run e2e -- --shard 2/3     one part of the list (the CI runs the parts on separate machines)
//   npm run e2e -- --list          print the scenarios that would run, and stop
//
// A scenario fails when its script fails or when the page logs an error. A failed scenario runs
// once more, alone, at the end: a pass then is reported as unstable, a second failure fails the run.
import { spawn, execSync } from 'node:child_process'
import { cpus } from 'node:os'

/**
 * Every scenario: its arguments for scripts/shot.mjs, the parts of the app that it checks, and
 * about how many seconds it takes (to balance the parts of the CI).
 */
const SCENARIOS = [
  { args: ['home'], areas: ['library'], s: 3 },
  { args: ['book'], areas: ['editor', 'shell'], s: 11 },
  { args: ['export'], areas: ['export'], s: 11 },
  { args: ['persist'], areas: ['editor', 'store'], s: 4 },
  { args: ['history'], areas: ['history', 'store'], s: 8 },
  { args: ['settings'], areas: ['settings'], s: 12 },
  { args: ['settings-shortcuts'], areas: ['settings', 'actions'], s: 10 },
  { args: ['settings-rules'], areas: ['settings'], s: 7 },
  { args: ['dark', '--dark'], areas: ['shell'], s: 7 },
  { args: ['library'], areas: ['library'], s: 6 },
  { args: ['newbook'], areas: ['library', 'store'], s: 5 },
  { args: ['resize'], areas: ['shell'], s: 4 },
  { args: ['today'], areas: ['editor'], s: 4 },
  { args: ['keyboard'], areas: ['shell', 'actions'], s: 6 },
  { args: ['paste'], areas: ['editor'], s: 4 },
  { args: ['reorder'], areas: ['shell', 'store'], s: 5 },
  { args: ['external'], areas: ['store', 'editor'], s: 8 },
  { args: ['panels'], areas: ['shell'], s: 10 },
  { args: ['plannav'], areas: ['plan'], s: 8 },
  { args: ['chat', '--en'], areas: ['chat'], s: 40 },
  { args: ['chatview'], areas: ['chat'], s: 58 },
  { args: ['pages', '--en'], areas: ['editor'], s: 7 },
  { args: ['reveal'], areas: ['editor', 'chat'], s: 12 },
  { args: ['reopen'], areas: ['editor', 'store'], s: 9 },
  { args: ['pagebreak', '--en'], areas: ['editor'], s: 6 },
  { args: ['selmenu', '--en'], areas: ['editor', 'actions'], s: 6 },
  { args: ['zoom', '--en'], areas: ['editor'], s: 10 },
  { args: ['longtitle', '--en'], areas: ['editor'], s: 5 },
  { args: ['ctrlenter', '--en'], areas: ['editor'], s: 9 },
  { args: ['newpage', '--en', '--motion'], areas: ['editor'], s: 8 },
  { args: ['typewriter', '--en'], areas: ['editor'], s: 10 },
  { args: ['graph', '--en'], areas: ['plan'], s: 34 },
  { args: ['graph', '--en', '--dark'], areas: ['plan'], s: 33 },
  { args: ['switchbook'], areas: ['shell', 'store'], s: 12 },
  // Pixel positions of the font on screen: they depend on the machine, so not in CI.
  { args: ['icons'], areas: ['shell'], s: 8, local: true },
  { args: ['shell'], areas: ['shell', 'settings', 'plan'], s: 15 }
]

/**
 * Which parts of the app a changed file touches. The first rule that matches wins. 'all' runs every
 * scenario; [] runs none (docs). A file that no rule matches runs every scenario, to be safe.
 */
const RULES = [
  [/^(docs\/|.*\.md$|LICENSE|\.gitignore|resources\/|build\/)/, []],
  [/^\.github\//, []],
  [/^scripts\/shots\/([\w-]+)\.mjs$/, 'scenario'],
  [/^src\/renderer\/src\/features\/editor\//, ['editor']],
  [/^src\/renderer\/src\/features\/(chat)\//, ['chat']],
  [/^src\/(main\/ai|shared\/prompts|shared\/proposals)\//, ['chat']],
  [/^src\/renderer\/src\/features\/(plan|graph)\//, ['plan']],
  [/^src\/shared\/planning\//, ['plan']],
  [/^src\/renderer\/src\/features\/settings\//, ['settings']],
  [/^src\/(renderer\/src\/features\/actions|shared\/ai)\//, ['actions', 'settings']],
  [/^src\/renderer\/src\/features\/(library|onboarding)\//, ['library']],
  [/^src\/(renderer\/src\/features\/export|main\/export|shared\/export)\//, ['export']],
  [/^src\/renderer\/src\/features\/history\//, ['history']],
  [/^src\/shared\/markdown\//, ['editor', 'store', 'export']],
  [/^src\/(main\/book|shared\/book\.ts|renderer\/src\/stores\/(book|saver)\.ts)/, ['store', 'editor']],
  [/^src\/renderer\/src\/(features\/(book|write)|app)\//, ['shell']],
  [/\.test\.ts$/, []]
]

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const value = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const workers = Math.max(1, Number(value('--workers') ?? Math.min(4, Math.floor(cpus().length / 3)) ?? 2))
const shard = value('--shard')
const names = argv.filter((a, i) => !a.startsWith('--') && !['--workers', '--shard'].includes(argv[i - 1]))

function changedFiles() {
  const run = (cmd) => {
    try {
      return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').map((l) => l.trim()).filter(Boolean)
    } catch {
      return []
    }
  }
  const base = run('git merge-base HEAD origin/main')[0] ?? run('git merge-base HEAD main')[0] ?? 'HEAD'
  return [...new Set([...run(`git diff --name-only ${base}`), ...run('git ls-files --others --exclude-standard')])]
}

function forChanged(files) {
  const areas = new Set()
  const named = new Set()
  for (const f of files) {
    const rule = RULES.find(([re]) => re.test(f))
    if (!rule) return { all: true, why: f }
    const [re, what] = rule
    if (what === 'scenario') named.add(f.match(re)[1])
    else for (const a of what) areas.add(a)
  }
  return { all: false, list: SCENARIOS.filter((sc) => named.has(sc.args[0]) || sc.areas.some((a) => areas.has(a))) }
}

let list = process.env.CI ? SCENARIOS.filter((sc) => !sc.local) : SCENARIOS
if (names.length) {
  list = SCENARIOS.filter((sc) => names.includes(sc.args[0]))
  const unknown = names.filter((n) => !SCENARIOS.some((sc) => sc.args[0] === n))
  if (unknown.length) {
    console.log(`Unknown scenario(s): ${unknown.join(', ')}`)
    process.exit(1)
  }
} else if (flag('--changed')) {
  const files = changedFiles()
  const r = forChanged(files)
  if (r.all) console.log(`Changed files touch the whole app (${r.why}): all scenarios run.`)
  else list = r.list
  console.log(`${files.length} changed file(s) → ${list.length} scenario(s)`)
}

// One part of the list: the longest scenarios first, each to the part with the least time so far.
if (shard) {
  const [k, n] = shard.split('/').map(Number)
  const parts = Array.from({ length: n }, () => ({ s: 0, items: [] }))
  for (const sc of [...list].sort((a, b) => b.s - a.s)) {
    const part = parts.reduce((min, p) => (p.s < min.s ? p : min))
    part.s += sc.s
    part.items.push(sc)
  }
  list = parts[k - 1].items
}

if (flag('--list')) {
  for (const sc of list) console.log(sc.args.join(' '))
  process.exit(0)
}
if (!list.length) {
  console.log('No scenario to run.')
  process.exit(0)
}

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/shot.mjs', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('close', (code) => resolve({ code, out }))
  })
}

const isBad = (code, out) => code !== 0 || /\[renderer (error|pageerror)\]|Error:|-error\.png|saved: false|saved:\s*false/.test(out)
// The output of a failed scenario, without the lines of saved screenshots: its measures help to find the cause.
const errorLines = (out) =>
  out
    .split('\n')
    .filter((l) => l.trim() && !/^saved /.test(l) && !/^\s+at /.test(l))
    .slice(-40)
    .join('\n')

const started = Date.now()
const failed = []
const queue = [...list]
/** Two apps that start at the same moment can fail to launch: start them some time apart. */
let nextLaunch = 0
async function launchSlot() {
  const now = Date.now()
  const wait = Math.max(0, nextLaunch - now)
  nextLaunch = Math.max(now, nextLaunch) + 1200
  if (wait) await new Promise((r) => setTimeout(r, wait))
}
async function worker() {
  for (let sc = queue.shift(); sc; sc = queue.shift()) {
    await launchSlot()
    const t = Date.now()
    const { code, out } = await run(sc.args)
    const bad = isBad(code, out)
    console.log(`${bad ? '✗' : '✓'} ${sc.args.join(' ')} (${((Date.now() - t) / 1000).toFixed(1)} s)`)
    if (bad) failed.push({ sc, out })
  }
}
console.log(`${list.length} scenario(s), ${Math.min(workers, list.length)} at the same time`)
await Promise.all(Array.from({ length: Math.min(workers, list.length) }, worker))

// A second chance, alone: a scenario that fails only when the computer is busy is unstable, not broken.
const broken = []
const unstable = []
for (const { sc, out } of failed) {
  const again = await run(sc.args)
  if (isBad(again.code, again.out)) {
    broken.push(sc)
    console.log(`\n✗ ${sc.args.join(' ')} failed two times:\n${errorLines(again.out)}`)
  } else {
    unstable.push(sc)
    console.log(`\n! ${sc.args.join(' ')} failed at first and passed alone (unstable):\n${errorLines(out)}`)
  }
}

const took = ((Date.now() - started) / 1000).toFixed(0)
if (broken.length) {
  console.log(`\n${broken.length} scenario(s) failed (${took} s)`)
  process.exit(1)
}
console.log(`\nAll ${list.length} scenarios passed (${took} s)${unstable.length ? `; unstable: ${unstable.map((sc) => sc.args[0]).join(', ')}` : ''}`)
