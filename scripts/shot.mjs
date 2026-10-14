// Launch the built app with Playwright and save screenshots.
// Usage: node scripts/shot.mjs [scenario] (scenarios live in scripts/shots/)
import { _electron as electron } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const scenario = process.argv[2] ?? 'home'
const outDir = resolve('test-results/shots')
await mkdir(outDir, { recursive: true })

const app = await electron.launch({
  args: [resolve('out/main/index.js')],
  env: { ...process.env, WORDELIA_E2E: '1' }
})
const page = await app.firstWindow()
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[renderer ${m.type()}]`, m.text())
})
page.on('pageerror', (e) => console.log('[renderer pageerror]', e.message))
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(800)

const shot = async (name) => {
  const file = resolve(outDir, `${scenario}-${name}.png`)
  await page.screenshot({ path: file })
  console.log('saved', file)
}

try {
  const mod = await import(pathToFileURL(resolve(`scripts/shots/${scenario}.mjs`)).href)
  await mod.default({ app, page, shot })
} catch (err) {
  if (err.code === 'ERR_MODULE_NOT_FOUND') await shot('main')
  else {
    console.error(err)
    await shot('error')
  }
}
await app.close()
