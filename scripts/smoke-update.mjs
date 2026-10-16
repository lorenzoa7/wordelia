// Check the app update against the real GitHub release, without installing anything.
// 1. Build an older unpacked app:  npx electron-builder --win dir -c.extraMetadata.version=0.0.1 --publish never
// 2. Run:                           node scripts/smoke-update.mjs
// The app must find the newest release, download it, and reach the "ready" state.
// WORDELIA_UPDATE_TEST=1 makes sure that nothing is installed when the app closes.
import { _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const userData = await mkdtemp(join(tmpdir(), 'wordelia-update-'))
const app = await electron.launch({
  executablePath: resolve('release/win-unpacked/Wordelia.exe'),
  env: { ...process.env, WORDELIA_UPDATE_TEST: '1', WORDELIA_USER_DATA: userData }
})
const page = await app.firstWindow()
await page.waitForTimeout(2000)
const version = await page.evaluate(() => window.wordelia.invoke('app:version'))
console.log('running version:', version)
await page.evaluate(() => window.wordelia.invoke('app:checkUpdate'))
const t0 = Date.now()
let state = null
while (Date.now() - t0 < 5 * 60_000) {
  state = await page.evaluate(() => window.wordelia.invoke('app:updateState'))
  if (state.state === 'ready' || state.state === 'error' || state.state === 'none') break
  await page.waitForTimeout(2000)
}
console.log('update state:', JSON.stringify(state), `after ${Math.round((Date.now() - t0) / 1000)} s`)
await page.waitForTimeout(500)
await page.screenshot({ path: resolve('test-results/shots/update-ready.png') })
await app.close()
await rm(userData, { recursive: true, force: true })
process.exit(state?.state === 'ready' ? 0 : 1)
