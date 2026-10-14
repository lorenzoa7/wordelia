export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.waitForTimeout(600)
  await page.locator('.manuscript p').first().click()
  await page.keyboard.press('Home')
  await page.keyboard.type('Naquela noite, ')
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
