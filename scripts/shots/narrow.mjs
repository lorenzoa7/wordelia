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
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(700)
  await shot('plan')
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
