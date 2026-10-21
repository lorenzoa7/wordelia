// Keyboard only: shortcuts open and close panels; Tab reaches the main controls. Closing the find
// bar leaves the text where it is.
export default async function ({ app, page, shot, openBook }) {
  await openBook()
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
