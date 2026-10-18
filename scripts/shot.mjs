// Launch the built app with Playwright and save screenshots.
// Usage: node scripts/shot.mjs [scenario] [--dark] [--fresh] [--real-ai] [--en] [--visible] [--motion]
// --en uses the English sample book (for the README screenshots); the default is the Portuguese one.
// The window is hidden (transparent, no focus) unless --visible. CSS animations are off unless --motion.
// Scenarios live in scripts/shots/<name>.mjs. The app runs with a fresh data folder
// and a scripted AI (WORDELIA_MOCK_AI=1), so it never touches the user's books or AI.
import { _electron as electron } from '@playwright/test'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const scenario = process.argv[2] ?? 'home'
const dark = process.argv.includes('--dark')
const realAi = process.argv.includes('--real-ai')
const fresh = process.argv.includes('--fresh')
const english = process.argv.includes('--en')
const visible = process.argv.includes('--visible')
const motion = process.argv.includes('--motion')
const outDir = resolve('test-results/shots')
await mkdir(outDir, { recursive: true })
await mkdir(resolve('test-results/exports'), { recursive: true })

const work = await mkdtemp(join(tmpdir(), 'wordelia-shot-'))
const userData = join(work, 'userdata')
await mkdir(userData, { recursive: true })
const settings = fresh ? { theme: dark ? 'dark' : 'light', onboarded: false } : {
  theme: dark ? 'dark' : 'light',
  routes: {
    chat: { provider: 'claude-code', model: 'opus' },
    action: { provider: 'claude-code', model: 'sonnet' },
    sync: { provider: 'claude-code', model: 'opus' },
    background: { provider: 'claude-code', model: 'haiku' }
  },
  onboarded: !fresh,
  // WORDELIA_CLAUDE_BIN: test with another copy of the claude CLI.
  ...(process.env.WORDELIA_CLAUDE_BIN ? { providers: { 'claude-code': { enabled: true, binPath: process.env.WORDELIA_CLAUDE_BIN } } } : {})
}
await writeFile(join(userData, 'settings.json'), JSON.stringify(settings))
const book = join(work, 'books', english ? 'The Lighthouse of Saint Isle' : 'O Farol de Santa Ilha')
await cp(resolve(english ? 'e2e/fixtures/sample-book-en' : 'e2e/fixtures/sample-book'), book, { recursive: true })

const app = await electron.launch({
  args: [resolve('out/main/index.js')],
  env: { ...process.env, WORDELIA_E2E: '1', ...(visible ? { WORDELIA_E2E_VISIBLE: '1' } : {}), WORDELIA_MOCK_AI: realAi ? '' : '1', WORDELIA_USER_DATA: userData, WORDELIA_EXPORT_DIR: resolve('test-results/exports'), WORDELIA_BOOKS_DIR: join(work, 'books') }
})
const page = await app.firstWindow()
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[renderer ${m.type()}]`, m.text())
})
page.on('pageerror', (e) => console.log('[renderer pageerror]', e.message))
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  w.setSize(1440, 900)
  w.center()
})
await page.waitForLoadState('domcontentloaded')
// The first screen is there and its fonts are loaded.
await page.waitForFunction(() => document.querySelector('.app-view, .welcome') && document.fonts.status === 'loaded', null, { timeout: 20000 })
// CSS animations and transitions take no time: the scenarios wait less, and screenshots are never
// taken in the middle of one. Zero, not 1 ms: every element has `transition-property: all` by
// default, so any duration would make every change of size a transition. --motion keeps them.
if (!motion) {
  await page.addStyleTag({
    // A new page that opens (timed in code with a token) takes no time too.
    content: ':root { --dur-page: 0ms !important; } *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }'
  })
}
await page.waitForTimeout(150)

let n = 0
const shot = async (name) => {
  const file = resolve(outDir, `${scenario}${english ? '-en' : ''}${dark ? '-dark' : ''}-${String(++n).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file })
  console.log('saved', file)
}
const openBook = async () => {
  await page.evaluate((p) => window.__wordelia.openBook(p), book)
  // The book is open, its first chapter has an editor, and the pages are measured once.
  await page.waitForFunction(() => document.querySelector('.manuscript') && document.fonts.status === 'loaded', null, { timeout: 20000 })
  await page.waitForTimeout(350)
}

try {
  const mod = await import(pathToFileURL(resolve(`scripts/shots/${scenario}.mjs`)).href)
  await mod.default({ app, page, shot, openBook, book, work })
} catch (err) {
  console.error(err)
  await shot('error')
} finally {
  await app.close().catch(() => {})
  await rm(work, { recursive: true, force: true }).catch(() => {})
}
