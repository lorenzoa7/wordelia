// The first run (run with --fresh). The welcome is a modal dialog: Tab stays in it, Ctrl+, does not open
// Settings behind it, and Esc closes it. A program that is not installed has a button that opens its
// install page, and the row finds the program by itself after the install. "Start writing" with no book
// starts the first book.
export default async function ({ app, page, shot }) {
  const fail = (msg) => {
    throw new Error(`Welcome scenario: ${msg}`)
  }
  await page.waitForSelector('.welcome', { timeout: 10000 })
  /** The steps come in with a short slide (motion, not CSS): wait for it before a screenshot. */
  const settle = () => page.waitForFunction(() => [...document.querySelectorAll('.welcome, .welcome-step')].every((el) => getComputedStyle(el).opacity === '1'))
  // A new install takes the language of the system (src/main/settings.ts). The checks below use English.
  console.log(JSON.stringify({ systemLanguage: await page.evaluate(() => window.__wordelia.app.getState().settings.language) }))
  await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ language: 'en' }))
  await page.waitForFunction(() => document.querySelector('.welcome-title')?.textContent === 'A quiet desk for your book.')
  await settle()
  await shot('step1')

  // Tab and Shift+Tab stay in the dialog.
  const inside = () => page.evaluate(() => document.querySelector('.welcome').contains(document.activeElement))
  for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key)
    if (!(await inside())) fail(`${key} took the focus out of the welcome`)
  }
  // Ctrl+, does not open Settings behind the welcome.
  await page.keyboard.press('Control+,')
  await page.waitForTimeout(300)
  if (await page.locator('.settings-tab').count()) fail('Ctrl+, opened Settings behind the welcome')

  // The second step. Claude Code is not installed (a stub of the status in the main process).
  await app.evaluate(({ ipcMain, shell }) => {
    globalThis.__installed = false
    ipcMain.removeHandler('ai:status')
    ipcMain.handle('ai:status', async (_e, id) =>
      id === 'claude-code' && !globalThis.__installed
        ? { provider: id, installed: false, loggedIn: false, detail: 'Claude Code is not installed.' }
        : { provider: id, installed: true, loggedIn: true, version: 'mock', account: 'test@example.com' }
    )
    shell.openExternal = async (url) => {
      globalThis.__opened = url
    }
  })
  await page.locator('.welcome .btn-ribbon').click()
  await page.evaluate(() => window.__wordelia.app.getState().checkProvider('claude-code'))
  const row = page.locator('.welcome-row').first()
  await row.locator('button', { hasText: 'Install…' }).waitFor({ timeout: 5000 })
  if (!(await inside())) fail('the second step does not take the focus')
  await settle()
  await shot('step2-not-installed')
  await row.locator('button', { hasText: 'Install…' }).click()
  await row.locator('button', { hasText: 'Waiting…' }).waitFor()
  // The page opens through the main process: wait until the stub has the address.
  let opened
  for (let i = 0; i < 50 && !opened; i++) {
    opened = await app.evaluate(() => globalThis.__opened)
    if (!opened) await page.waitForTimeout(100)
  }
  console.log(JSON.stringify({ opened }))
  if (!/^https:\/\/code\.claude\.com\/docs\//.test(opened ?? '')) fail(`Install opened ${opened}`)
  await settle()
  await shot('step2-waiting')
  // The writer installs it: the row finds it by itself.
  await app.evaluate(() => {
    globalThis.__installed = true
  })
  await row.locator('.state-ok').waitFor({ timeout: 15000 })
  await settle()
  await shot('step2-found')

  // Esc closes the welcome.
  await page.keyboard.press('Escape')
  await page.waitForSelector('.welcome', { state: 'detached' })
  if (!(await page.evaluate(() => window.__wordelia.app.getState().settings.onboarded))) fail('Esc did not close the welcome')

  // "Start writing" with an empty library starts the first book.
  await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ onboarded: false }))
  await page.waitForSelector('.welcome')
  await page.locator('.welcome .btn-primary').click()
  await page.waitForSelector('.dialog-title')
  const title = await page.locator('.dialog-title').innerText()
  if (title !== 'A new book') fail(`"Start writing" opened "${title}"`)
  await shot('start-writing')
}
