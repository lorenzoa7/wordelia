// The smallest window (980 × 640) with a long book title: the title bar must not overlap.
export default async function ({ app, page, shot, openBook }) {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(980, 640))
  await page.waitForTimeout(400)
  await shot('library')
  await openBook()
  await page.evaluate(() => window.__wordelia.book.getState().updateManifest({ title: 'O Farol de Santa Ilha e Outras Histórias do Mar do Norte' }))
  await page.waitForTimeout(400)
  await shot('write')
  const overlap = await page.evaluate(() => {
    const a = document.querySelector('.titlebar-book').getBoundingClientRect()
    const b = document.querySelector('.view-switch').getBoundingClientRect()
    const c = document.querySelector('.titlebar-right').getBoundingClientRect()
    return { bookRight: Math.round(a.right), tabsLeft: Math.round(b.left), tabsRight: Math.round(b.right), rightLeft: Math.round(c.left) }
  })
  console.log(JSON.stringify(overlap))
  if (overlap.bookRight > overlap.tabsLeft) throw new Error('The book title overlaps the view tabs')
  // A hidden sidebar: the show button at the corner and the editor toolbar do not overlap.
  await page.keyboard.press('Control+Backslash')
  await page.waitForTimeout(700)
  await shot('write-sidebar-hidden')
  const clear = await page.evaluate(() => {
    const a = document.querySelector('.sidebar-show').getBoundingClientRect()
    const b = document.querySelector('.toolbar').getBoundingClientRect()
    return a.right <= b.left || a.bottom <= b.top
  })
  if (!clear) throw new Error('The show sidebar button overlaps the editor toolbar')
  await page.keyboard.press('Control+Backslash')
  await page.waitForTimeout(700)
  // The page always fits between the two panels: no sideways scroll, no cut text.
  for (const width of [980, 1100, 1280]) {
    await app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setSize(w, 640), width)
    await page.waitForTimeout(500)
    const fit = await page.evaluate(() => {
      const desk = document.querySelector('.desk')
      const sheet = document.querySelector('.page[data-chapter]').getBoundingClientRect()
      const box = desk.getBoundingClientRect()
      return { sideways: desk.scrollWidth - desk.clientWidth, pageRight: Math.round(sheet.right), deskRight: Math.round(box.left + desk.clientWidth) }
    })
    console.log(`page at ${width} px:`, JSON.stringify(fit))
    if (fit.sideways > 1 || fit.pageRight > fit.deskRight) throw new Error(`The page does not fit at ${width} px`)
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(980, 640))
  await page.waitForTimeout(400)
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(700)
  await shot('plan')
  // The Plan header fits in Portuguese too: the title wraps by line, not one word per line, and the
  // switch is not cut.
  await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ language: 'pt-BR' }))
  await page.waitForTimeout(500)
  const head = await page.evaluate(() => {
    const h1 = document.querySelector('.plan-hero h1')
    const sw = document.querySelector('.plan-hero .plan-switch').getBoundingClientRect()
    const scroll = document.querySelector('.plan-scroll')
    const room = scroll.getBoundingClientRect().left + scroll.clientWidth - parseFloat(getComputedStyle(scroll).paddingRight)
    const range = document.createRange()
    range.selectNodeContents(h1)
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
    return { lines, switchRight: Math.round(sw.right), room: Math.round(room) }
  })
  console.log('plan header (pt-BR):', JSON.stringify(head))
  await shot('plan-pt')
  if (head.lines > 2 || head.switchRight > head.room + 1) throw new Error('The Plan header does not fit')
  await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ language: 'en' }))
  await page.waitForTimeout(400)
  // A toast: delete the last chapter.
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(500)
  const item = page.locator('.chapter-item').last()
  await item.hover()
  await item.locator('.chapter-item-menu button').click()
  await page.locator('[role="menuitem"]').last().click()
  await page.waitForTimeout(400)
  await shot('confirm')
  await page.locator('.dialog-foot .btn-ribbon').click()
  await page.waitForTimeout(600)
  await shot('toast')
}
