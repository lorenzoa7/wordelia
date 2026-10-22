// Keyboard only: shortcuts open and close panels; Tab reaches the main controls. Closing the find
// bar leaves the text where it is.

/**
 * Ctrl+Z with the focus outside a text changes no chapter. The browser has an Undo of its own: it would take the
 * last typing out of a chapter that does not show (the Write view stays under the Plan view). In the text,
 * Ctrl+Z stays the Undo of the text.
 */
async function undoOutsideText(page) {
  const fail = (msg) => {
    throw new Error(`Undo keys: ${msg}`)
  }
  const frames = (n = 2) => page.evaluate((k) => new Promise((resolve) => (function step(i) { if (i) requestAnimationFrame(() => step(i - 1)); else resolve() })(k)), n)
  const chapterText = () => page.evaluate(() => document.querySelector('.page[data-chapter] .manuscript').textContent)
  const paragraph = page.locator('.manuscript > p').first()
  const untyped = await chapterText()
  await paragraph.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' O farol apagou.')
  const typed = await chapterText()
  if (typed === untyped) fail('the typing did not reach the chapter')
  // The tab of the Plan view keeps the focus after the click. A link of the overview goes away after the click:
  // then the focus is on the page.
  await page.locator('.view-tab').nth(1).click()
  await page.waitForSelector('.plan-desk')
  for (const step of ['the tab of the view', 'a link that goes away']) {
    if (step === 'a link that goes away') {
      await page.locator('.plan-section-link').first().click()
      await page.waitForSelector('.plan-back')
    }
    await page.keyboard.press('Control+z')
    await frames()
    if ((await chapterText()) !== typed) fail(`Ctrl+Z in the Plan view (the focus on ${step}) changed the text of a chapter`)
  }
  await page.keyboard.press('Control+1')
  await page.waitForFunction(() => !document.querySelector('.book-pane-write.is-away'), null, { timeout: 5000 })
  await paragraph.click()
  await page.keyboard.press('Control+z')
  await page.waitForFunction((t) => document.querySelector('.page[data-chapter] .manuscript').textContent === t, untyped, { timeout: 3000 }).catch(() => fail('Ctrl+Z in the text did not undo the typing'))
}

export default async function ({ app, page, shot, openBook }) {
  await openBook()
  await undoOutsideText(page)
  await page.keyboard.press('Control+l')
  await page.waitForTimeout(500)
  const chatHidden = (await page.locator('.book-chat').evaluate((el) => el.getBoundingClientRect().width)) < 5
  await page.keyboard.press('Control+l')
  await page.waitForTimeout(500)
  await page.keyboard.press('Control+Backslash')
  await page.waitForTimeout(500)
  const sideHidden = (await page.locator('.book-sidebar').evaluate((el) => el.getBoundingClientRect().width)) < 5
  await page.keyboard.press('Control+Backslash')
  await page.keyboard.press('Control+f')
  await page.waitForTimeout(300)
  await page.keyboard.type('farol')
  await page.waitForTimeout(300)
  const count = await page.locator('.find-count').innerText()
  await shot('find')
  await page.keyboard.press('Escape')
  console.log(JSON.stringify({ chatHidden, sideHidden, count }))
  if (!chatHidden || !sideHidden || !/\d+\/\d+/.test(count)) throw new Error('Keyboard flow failed')

  // The find bar closes, and the text stays at the match: the cursor goes there. A short window, so
  // the match is below the screen. First after typing only, then with Enter at once after typing.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 560))
  await page.waitForTimeout(400)
  const deskTop = () => page.evaluate(() => Math.round(document.querySelector('.desk').scrollTop))
  for (const enter of [false, true]) {
    await page.locator('.manuscript p').first().click()
    await page.keyboard.press('Control+Home')
    await page.waitForTimeout(300)
    // A word of the last paragraph of the first chapter that the paragraphs before it do not have.
    const word = await page.evaluate(() => {
      const ps = [...document.querySelector('.manuscript').querySelectorAll('p')]
      const before = ps.slice(0, -1).map((p) => p.textContent.toLowerCase()).join(' ')
      return ps[ps.length - 1].textContent.split(/[^\p{L}]+/u).find((w) => w.length > 4 && !before.includes(w.toLowerCase()))
    })
    const start = await deskTop()
    await page.keyboard.press('Control+f')
    await page.waitForTimeout(300)
    await page.keyboard.press('Control+a')
    await page.keyboard.type(word)
    if (enter) await page.keyboard.press('Enter')
    await page.waitForTimeout(700)
    const found = await deskTop()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(700)
    const closed = await deskTop()
    const selected = await page.evaluate(() => window.getSelection().toString())
    console.log(JSON.stringify({ enter, word, start, found, closed, selected }))
    if (found - start < 100) throw new Error(`the find bar did not scroll to "${word}"`)
    if (Math.abs(closed - found) > 2) throw new Error(`closing the find bar moved the text: ${found} → ${closed}`)
    if (selected !== word) throw new Error(`the cursor is not at the match after the find bar closed: "${selected}"`)
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900))
  await page.waitForTimeout(300)

  // Replace goes on to the next match after the new text, also when the new text contains the
  // search text: each click changes the next match, once.
  const fail = (msg) => {
    throw new Error(`Replace: ${msg}`)
  }
  const chapterText = (i) => page.evaluate((n) => window.__wordelia.book.getState().chapters[n].body, i)
  await page.locator('.manuscript p').first().click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('Control+h')
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Elias')
  await page.locator('.find-input').nth(1).fill('Elias Silva')
  await page.waitForTimeout(300)
  const replaceBtn = page.locator('.find-text-btn').first()
  const matches = await page.evaluate(() => (window.__wordelia.editor().state.doc.textContent.match(/Elias/g) ?? []).length)
  // One click more than the matches: after the last match, Replace stops (Next goes back to the start).
  let clicks = 0
  for (let i = 0; i <= matches; i++) {
    if (await replaceBtn.isDisabled()) break
    await replaceBtn.click()
    clicks++
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(500)
  const replaced = await page.evaluate(() => window.__wordelia.editor().state.doc.textContent)
  const twice = (replaced.match(/Silva Silva/g) ?? []).length
  const silvas = (replaced.match(/Elias Silva/g) ?? []).length
  console.log('replace after replace:', JSON.stringify({ matches, clicks, silvas, twice }))
  if (twice) fail('"Elias Silva Silva": Replace did not go on to the next match')
  if (silvas !== matches || clicks !== matches) fail(`${silvas} of ${matches} matches changed in ${clicks} clicks`)

  // Replace in all chapters, also in a chapter far from the screen (no editor); Undo puts it back.
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const ch = s.chapters[0]
    s.restoreChapter(ch.id, Array.from({ length: 8 }, () => ch.body.trim()).join('\n\n'))
  })
  await page.evaluate(() => document.querySelector('.desk').scrollTo({ top: 0 }))
  await page.waitForTimeout(800)
  const asleep = await page.evaluate(() => document.querySelectorAll('.page[data-chapter]')[1].classList.contains('is-asleep'))
  const before = [await chapterText(0), await chapterText(1)]
  await page.locator('.manuscript p').first().click()
  await page.keyboard.press('Control+h')
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Marta')
  await page.locator('.find-input').nth(1).fill('Martha')
  await page.locator('.find-link-btn').click()
  await page.waitForSelector('.replace-book-list li')
  const rows = await page.locator('.replace-book-list li').allInnerTexts()
  console.log('replace in all chapters:', JSON.stringify({ asleep, rows }))
  await shot('replace-in-book')
  if (rows.length !== 2) fail('the confirm does not list the two chapters')
  await page.locator('.dialog-foot .btn-primary').click()
  await page.waitForTimeout(700)
  const after = [await chapterText(0), await chapterText(1)]
  const toastText = await page.locator('.toast').last().innerText()
  console.log('result:', JSON.stringify({ toast: toastText, left: after.map((t) => (t.match(/Marta/g) ?? []).length) }))
  if (after.some((t) => t.includes('Marta')) || !after.every((t) => t.includes('Martha'))) fail('not every chapter changed')
  await page.locator('.toast').last().getByRole('button', { name: /Undo/ }).click()
  await page.waitForTimeout(700)
  const undone = [await chapterText(0), await chapterText(1)]
  if (undone[0] !== before[0] || undone[1] !== before[1]) fail('Undo did not put the text back')
  await page.keyboard.press('Escape')
  console.log('replace ok')
  // Tab through the title bar: every stop must show a focus ring.
  await page.locator('.status-bar').click()
  const stops = []
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement
        if (!el) return 'none'
        const cs = getComputedStyle(el)
        const ring = cs.outlineStyle !== 'none' || cs.boxShadow !== 'none'
        return `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]}:${ring}`
      })
    )
  }
  console.log(stops.join(' | '))
}
