export default async function ({ page, shot, openBook, book }) {
  await openBook()
  await page.waitForTimeout(600)
  await page.locator('.manuscript p').first().click()
  // The start of the chapter (Home goes only to the start of the visual line).
  await page.evaluate(() => window.__wordelia.editor().commands.focus('start'))
  await page.keyboard.type(book.includes('Lighthouse') ? 'That night, ' : 'Naquela noite, ')
  await page.waitForTimeout(600)
  // Switching chapters saves a version.
  await page.locator('.chapter-item').nth(1).click()
  await page.waitForTimeout(600)
  await page.locator('.chapter-item').nth(0).click()
  await page.waitForTimeout(800)
  await page.locator('.status-btn').click()
  await page.waitForSelector('.history-item', { timeout: 10000 })
  await page.locator('.history-item').last().click()
  await page.waitForTimeout(700)
  await shot('dialog')
}
