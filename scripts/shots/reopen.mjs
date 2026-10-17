// Close the book and open it again at once: no page error.
export default async function ({ page, openBook }) {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.stack || e)))
  await openBook()
  await page.waitForTimeout(600)
  for (const wait of [150, 20, 0]) {
    await page.evaluate(() => window.__wordelia.book.getState().close())
    await openBook()
    await page.waitForTimeout(wait)
  }
  // Close without waiting, then open in the same moment.
  await page.evaluate(() => void window.__wordelia.book.getState().close())
  await openBook()
  await page.waitForTimeout(30)
  await page.evaluate(() => void window.__wordelia.book.getState().close())
  await page.waitForTimeout(10)
  await openBook()
  await page.waitForTimeout(800)
  const mounted = await page.evaluate(() => document.querySelectorAll('.manuscript').length)
  console.log('mounted editors:', mounted, 'errors:', errors.length)
  if (errors.length) {
    console.log(errors[0])
    throw new Error('page error after reopen')
  }
}
