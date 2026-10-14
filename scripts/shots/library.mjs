export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.waitForTimeout(500)
  await page.locator('.titlebar-logo').click()
  await page.waitForTimeout(1200)
  await shot('with-book')
  await page.locator('.library-actions .btn-ribbon').click()
  await page.waitForTimeout(700)
  await shot('new-book')
}
