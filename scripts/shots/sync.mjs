// The planning sync runs in the background. The sync button shows a spinner and the progress; the
// chat does not open and does not change its thread. Cancel stops the sync. At the end, a card in
// the Plan sidebar shows the result: Review opens the sync thread in the chat, Accept all and Reject
// all decide every change (Reject all has Undo). An error shows in the card. When no chapter changed,
// the button is off and its tooltip says so. Away from the Plan view, a toast tells the result.
// Usage: node scripts/shot.mjs sync [--en] [--dark]   (I18N_LANG=pt-BR or es for another interface language)
export default async function ({ app, page, shot, openBook }) {
  const fail = (what) => {
    throw new Error(`Sync scenario: ${what}`)
  }
  const english = !process.env.I18N_LANG
  if (process.env.I18N_LANG) {
    await page.evaluate((l) => window.__wordelia.app.getState().updateSettings({ language: l }), process.env.I18N_LANG)
  }
  const englishBook = process.argv.includes('--en')
  const slow = (ms) => app.evaluate((_e, v) => (process.env.WORDELIA_MOCK_DELAY = String(v)), ms)
  const chat = () =>
    page.evaluate(() => {
      const c = window.__wordelia.chat.getState()
      return { active: c.activeThreadId, blank: c.blank?.id ?? null, list: c.listOpen, open: window.__wordelia.app.getState().settings.ui.chatOpen }
    })
  const same = (a, b) => a.active === b.active && a.blank === b.blank && a.list === b.list && a.open === b.open
  const setUi = (ui) => page.evaluate((u) => window.__wordelia.app.getState().setUi(u), ui)
  const syncThread = () => page.evaluate(() => window.__wordelia.book.getState().threads.find((t) => t.id === 'th_planning_sync') ?? null)
  const sync = page.locator('.sync-btn')
  const card = page.locator('.sync-card')

  await openBook()
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(600)
  if (await sync.getAttribute('aria-disabled')) fail('the button is off, but the chapters were never synced')
  if ((await page.locator('.sync-count').innerText()).trim() !== '2') fail('the button does not count 2 changed chapters')

  // 1. The sync runs in the background, with the chat closed: the chat stays closed.
  await setUi({ chatOpen: false })
  await page.waitForTimeout(300)
  const closed = await chat()
  await slow(90)
  await sync.click()
  await page.waitForSelector('.sync-btn.is-running', { timeout: 5000 })
  const label = (await page.locator('.sync-btn .sync-label').innerText()).trim()
  if (english && label !== 'Syncing…') fail(`the running button says "${label}"`)
  const progress = await page.locator('.sync-progress').innerText()
  if (english && !/^(Reading 2 chapters…|Writing the changes…|\d+ changes? so far…)$/.test(progress.trim())) fail(`the progress says "${progress}"`)
  await page.waitForTimeout(400)
  await shot('running')
  if (!same(await chat(), closed)) fail(`the chat changed while the sync runs: ${JSON.stringify(await chat())}`)

  // 2. Cancel, before the first change is complete: nothing to review, the chapters still wait.
  await page.locator('.sync-cancel').click()
  await page.waitForSelector('.sync-btn:not(.is-running)', { timeout: 5000 })
  await page.waitForTimeout(300)
  if (await card.count()) fail('a card shows after a cancel without changes')
  if (await sync.getAttribute('aria-disabled')) fail('after a cancel, the button is off')
  if ((await page.locator('.sync-count').innerText()).trim() !== '2') fail('after a cancel, the chapters do not wait any more')
  await shot('cancelled')

  // 3. A full sync, with the chat open on a new thread: the chat keeps its thread.
  await setUi({ chatOpen: true })
  await page.waitForTimeout(400)
  const open = await chat()
  await slow(30)
  await sync.click()
  await page.waitForSelector('.sync-progress[data-step="writing"]:not([data-found="0"])', { timeout: 10000 })
  await shot('running-found')
  await card.waitFor({ timeout: 20000 })
  await page.waitForTimeout(400)
  if (!same(await chat(), open)) fail(`the chat changed with the sync: ${JSON.stringify(await chat())} (before: ${JSON.stringify(open)})`)
  const title = (await card.locator('.sync-card-title').innerText()).trim()
  if (english && title !== '2 changes proposed to the notes') fail(`the card says "${title}"`)
  const notes = await card.locator('.sync-card-notes').innerText()
  const visitor = englishBook ? 'The Visitor' : 'O Visitante'
  if (!notes.includes(visitor) || !notes.includes('Elias')) fail(`the card names "${notes}"`)
  if ((await sync.getAttribute('aria-disabled')) !== 'true') fail('after the sync, the button is not off')
  await shot('result')

  // 4. Review opens the sync thread in the chat, at its proposals.
  await page.locator('.sync-review').click()
  await page.waitForSelector('.chat-panel .msg-bulk', { timeout: 5000 })
  await page.waitForTimeout(500)
  const review = await chat()
  if (review.active !== 'th_planning_sync' || !review.open || review.list || review.blank) fail(`Review did not open the sync thread: ${JSON.stringify(review)}`)
  await shot('review')

  // 5. Reject all: the card goes away; Undo brings the changes back.
  await page.locator('.sync-reject-all').click()
  await page.waitForTimeout(300)
  if (await card.count()) fail('the card stays after Reject all')
  const states = async () => Object.values((await syncThread()).messages.at(-1).hunks ?? {})
  if ((await states()).filter((s) => s === 'rejected').length !== 2) fail('Reject all did not reject the two changes')
  await page.locator('.toast-action').last().click()
  await card.waitFor({ timeout: 3000 })
  if ((await states()).some((s) => s !== 'pending')) fail('Undo did not bring the changes back')

  // 6. Accept all: the notes change, the card goes away.
  await page.locator('.sync-accept-all').click()
  await page.waitForFunction(
    (name) => {
      const s = window.__wordelia.book.getState()
      const elias = s.entries.find((e) => e.name === 'Elias')
      return s.entries.some((e) => e.name === name) && /blue boat|bote azul/.test(elias?.body ?? '')
    },
    visitor,
    { timeout: 5000 }
  )
  await page.waitForTimeout(400)
  if (await card.count()) fail('the card stays after Accept all')
  await shot('accepted')

  // 7. Up to date: the button is off, its tooltip says so, and a click does nothing.
  const replies = (await syncThread()).messages.length
  await page.mouse.move(700, 600)
  await sync.hover()
  await page.waitForSelector('.sync-tip', { timeout: 3000 })
  const tip = await page.locator('.sync-tip').innerText()
  if (english && !/Up to date: no chapter changed/.test(tip)) fail(`the tooltip of the off button says "${tip}"`)
  await shot('up-to-date')
  // Playwright waits for a button with aria-disabled: force the click, as a person can click it.
  await sync.click({ force: true })
  await page.waitForTimeout(400)
  if ((await page.locator('.sync-btn.is-running').count()) || (await syncThread()).messages.length !== replies) fail('the off button started a sync')
  await page.mouse.move(700, 600)

  // 8. An error shows in the card: no AI is connected.
  const routes = await page.evaluate(() => window.__wordelia.app.getState().settings.routes)
  await page.evaluate(() => {
    const app = window.__wordelia.app
    const s = app.getState().settings
    app.setState({ settings: { ...s, routes: { ...s.routes, chat: null, sync: null } } })
    window.__wordelia.book.getState().setSyncState({ chapters: {}, syncedAt: null })
  })
  await page.waitForTimeout(300)
  await sync.click()
  await page.waitForSelector('.sync-card.is-error', { timeout: 3000 })
  const error = await card.innerText()
  if (english && (!error.includes('The sync stopped.') || !error.includes('Connect an AI first.') || !error.includes('Open settings'))) fail(`the error card says "${error}"`)
  await page.waitForTimeout(300)
  await shot('error')
  await page.evaluate((r) => {
    const app = window.__wordelia.app
    app.setState({ settings: { ...app.getState().settings, routes: r } })
  }, routes)
  await page.locator('.sync-card-close').click()
  await page.waitForTimeout(300)
  if (await card.count()) fail('the close button did not close the card')

  // 9. Away from the Plan view, a toast tells the result; its Review opens the sync thread.
  await page.evaluate(() => window.__wordelia.chat.getState().setListOpen(true))
  await setUi({ chatOpen: false })
  await slow(40)
  await sync.click()
  await page.waitForSelector('.sync-btn.is-running', { timeout: 5000 })
  await page.keyboard.press('Control+1')
  const toast = page.locator('.toast', { has: page.locator('.toast-action') })
  await toast.waitFor({ timeout: 20000 })
  const text = (await toast.innerText()).replace(/\s+/g, ' ')
  if (english && !/2 changes proposed to the notes.*Review/.test(text)) fail(`the toast says "${text}"`)
  await page.waitForTimeout(300)
  await shot('toast')
  await toast.locator('.toast-action').click()
  await page.waitForSelector('.chat-panel .msg-bulk', { timeout: 5000 })
  const fromToast = await chat()
  if (fromToast.active !== 'th_planning_sync' || !fromToast.open || fromToast.list) fail(`Review in the toast did not open the sync thread: ${JSON.stringify(fromToast)}`)
  await slow(12)
  console.log('sync ok')
}
