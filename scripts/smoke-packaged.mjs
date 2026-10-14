// Start the packaged app (release/win-unpacked) and take a screenshot of the library.
import { _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const userData = await mkdtemp(join(tmpdir(), 'wordelia-smoke-'))
const app = await electron.launch({
  executablePath: resolve('release/win-unpacked/Wordelia.exe'),
  env: { ...process.env, WORDELIA_E2E: '1', WORDELIA_MOCK_AI: '1', WORDELIA_USER_DATA: userData }
})
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.waitForTimeout(2500)
await page.screenshot({ path: resolve('test-results/shots/packaged-home.png') })
console.log('title:', await page.title(), '| logo:', await page.locator('.library-hero .logo').count())
await app.close()
await rm(userData, { recursive: true, force: true })
