// The app shell of version 0.5: the title bar, the sidebar toggles, the AI warning, the
// dropdowns, the page margins, the daily goal and the button that updates the notes.
// Usage: node scripts/shot.mjs shell [--en] [--dark]
export default async function ({ page, shot, openBook }) {
  const fail = (msg) => {
    throw new Error(msg)
  }
  const ui = () => page.evaluate(() => window.__wordelia.app.getState().settings.ui)
  const manifest = () => page.evaluate(() => window.__wordelia.book.getState().manifest)
  const sidebarWidth = () => page.locator('.book-sidebar').evaluate((el) => Math.round(el.getBoundingClientRect().width))

  await openBook()
  await page.waitForTimeout(400)

  // 1. Title bar: the wordmark at the far left, no sidebar button and no AI badge while the AI is ready.
  const first = await page.locator('.titlebar-left > *').first().getAttribute('class')
  if (!first?.includes('titlebar-logo')) fail(`The title bar does not start with the wordmark: ${first}`)
  if (await page.locator('.titlebar .sidebar-toggle').count()) fail('The sidebar button is still in the title bar')
  await page.waitForTimeout(1800)
  if (await page.locator('.provider-badge').count()) fail('The AI badge shows while the AI is ready')
  await shot('titlebar')

  // An expired login: a warning shows, and a click opens Settings → AI.
  await page.evaluate(() => {
    const app = window.__wordelia.app
    app.setState({ status: { ...app.getState().status, 'claude-code': { provider: 'claude-code', installed: true, loggedIn: false, reason: 'expired' } } })
  })
  await page.waitForSelector('.provider-badge', { timeout: 4000 })
  await shot('ai-warning')
  await page.locator('.provider-badge').click()
  await page.waitForTimeout(500)
  const tab = (await page.locator('.settings-tab[data-state="active"]').innerText()).trim()
  if (tab !== 'AI') fail(`The AI warning opened "${tab}", not AI`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  // No chat route: "Connect an AI".
  await page.evaluate(() => {
    const app = window.__wordelia.app
    const s = app.getState().settings
    app.setState({ settings: { ...s, routes: { ...s.routes, chat: null } } })
  })
  await page.waitForFunction(() => document.querySelector('.provider-badge')?.textContent.includes('Connect an AI'), null, { timeout: 4000 })
  // The AI is ready again: the warning goes away.
  await page.evaluate(() => {
    const app = window.__wordelia.app
    const s = app.getState().settings
    app.setState({
      settings: { ...s, routes: { ...s.routes, chat: { provider: 'claude-code', model: 'opus' } } },
      status: { ...app.getState().status, 'claude-code': { provider: 'claude-code', installed: true, loggedIn: true } }
    })
  })
  await page.waitForTimeout(300)
  if (await page.locator('.provider-badge').count()) fail('The AI warning stays after the AI is ready again')

  // 5. The sidebar toggle: in the sidebar header, and at the top-left corner of the page when hidden.
  for (const view of ['write', 'plan']) {
    await page.keyboard.press(view === 'write' ? 'Control+1' : 'Control+2')
    await page.waitForTimeout(600)
    await page.locator('.book-sidebar .sidebar-toggle').click()
    await page.waitForTimeout(700)
    if ((await sidebarWidth()) > 4 || (await ui()).sidebarOpen) fail(`The header button did not hide the sidebar (${view})`)
    const corner = await page.locator('.sidebar-show').boundingBox()
    const main = await page.locator('.book-main').boundingBox()
    if (!corner || corner.x - main.x > 16 || corner.y - main.y > 16) fail(`The show button is not at the top-left corner (${view})`)
    await shot(`${view}-sidebar-hidden`)
    await page.locator('.sidebar-show .icon-btn').click()
    await page.waitForTimeout(700)
    if ((await sidebarWidth()) < 200) fail(`The show button did not show the sidebar (${view})`)
    if (await page.locator('.sidebar-show').count()) fail(`The show button stays with the sidebar open (${view})`)
  }

  // 4. The button that updates the notes from the chapters, with a tooltip that says what it does.
  const sync = page.locator('.sync-btn')
  const label = (await sync.innerText()).replace(/\s+/g, ' ')
  if (!/^Sync/.test(label.trim())) fail(`The sync button says "${label}"`)
  await sync.hover()
  await page.waitForSelector('.sync-tip', { timeout: 3000 })
  const tip = await page.locator('.sync-tip').innerText()
  if (!/accept or reject each change/.test(tip) || !/does not change the manuscript/.test(tip)) fail(`The sync tooltip says "${tip}"`)
  await shot('plan-sync-tooltip')
  await page.mouse.move(700, 600)
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(500)

  // 2. A dropdown opens only from its own box: not from its label, not from the empty row beside it.
  await page.keyboard.press('Control+,')
  await page.waitForTimeout(600)
  // A CSS locator: an open dropdown hides the rest of the page from the accessibility tree.
  const select = page.locator('.select[aria-label="Interface language"]')
  const box = await select.boundingBox()
  const row = await page.locator('.field', { has: select }).boundingBox()
  await page.mouse.click(row.x + row.width - 12, box.y + box.height / 2)
  await page.waitForTimeout(300)
  if ((await select.getAttribute('data-state')) === 'open') fail('A click beside the Language box opened it')
  await page.getByText('Interface language', { exact: true }).click()
  await page.waitForTimeout(300)
  if ((await select.getAttribute('data-state')) === 'open') fail('A click on the Language label opened the box')
  await select.click()
  await page.waitForTimeout(300)
  if ((await select.getAttribute('data-state')) !== 'open') fail('A click on the Language box did not open it')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  // The same for a switch row: a click in the empty middle of the row does not flip it.
  const spell = await page.evaluate(() => window.__wordelia.app.getState().settings.editor.spellcheck)
  const spellRow = await page.locator('.field', { hasText: 'Spell check' }).boundingBox()
  await page.mouse.click(spellRow.x + spellRow.width / 2, spellRow.y + spellRow.height / 2)
  await page.waitForTimeout(300)
  if ((await page.evaluate(() => window.__wordelia.app.getState().settings.editor.spellcheck)) !== spell) fail('A click beside the Spell check switch flipped it')

  // 7. The daily goal is a number box: Enter and leaving the box save it; the arrows step by 50.
  const goal = page.getByRole('spinbutton', { name: /Daily goal/ })
  await goal.click()
  await goal.fill('1234')
  await goal.press('Enter')
  await page.waitForTimeout(300)
  const goalNow = () => page.evaluate(() => window.__wordelia.app.getState().settings.editor.dailyGoal)
  if ((await goalNow()) !== 1234) fail(`The daily goal is ${await goalNow()}, not 1234`)
  await goal.press('ArrowUp')
  await page.waitForTimeout(300)
  if ((await goalNow()) !== 1250) fail(`ArrowUp made the goal ${await goalNow()}, not 1250`)
  await goal.fill('250000')
  await page.locator('.settings-panes').click({ position: { x: 5, y: 5 } })
  await page.waitForTimeout(300)
  if ((await goalNow()) !== 100000) fail(`The goal was not limited to 100000: ${await goalNow()}`)
  await goal.fill('')
  await goal.blur()
  await page.waitForTimeout(300)
  if ((await goalNow()) !== 0) fail(`An empty goal is ${await goalNow()}, not 0`)
  await goal.fill('750')
  await goal.press('Enter')
  await page.waitForTimeout(300)
  await shot('settings-general')

  // 3. Page margins in centimeters; the book keeps millimeters (Left = inner, Right = outer).
  await page.locator('.settings-tab').nth(3).click()
  await page.waitForTimeout(500)
  await page.locator('.margins').scrollIntoViewIfNeeded()
  const margin = (side) => page.getByRole('spinbutton', { name: new RegExp(`^${side} margin`) })
  await margin('Top').fill('2,5')
  await margin('Top').blur()
  await margin('Left').fill('1.2')
  await margin('Left').press('Enter')
  await margin('Right').press('ArrowUp')
  await margin('Bottom').fill('99')
  await margin('Bottom').press('Enter')
  await page.waitForTimeout(400)
  const mg = (await manifest()).export.margins
  if (mg.top !== 25 || mg.inner !== 12 || mg.outer !== 15 || mg.bottom !== 100) fail(`The margins are ${JSON.stringify(mg)}`)
  // A dropdown in the same tab opens only from its box.
  const size = page.locator('.select.page-size')
  const sizeRow = await page.locator('.page-setup').boundingBox()
  const sizeBox = await size.boundingBox()
  await page.mouse.click(sizeBox.x + sizeBox.width / 2, sizeRow.y + 4)
  await page.waitForTimeout(300)
  if ((await size.getAttribute('data-state')) === 'open') fail('A click on the Page size label opened the box')
  await shot('settings-margins')
  console.log(JSON.stringify({ margins: mg, goal: await goalNow() }))
}
