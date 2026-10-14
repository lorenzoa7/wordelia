// Keyboard only: shortcuts open and close panels; Tab reaches the main controls.
export default async function ({ page, shot, openBook }) {
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
