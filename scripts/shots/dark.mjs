export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.waitForTimeout(400)
  await shot('write')
  await page.locator('.composer-input').fill('Can you improve the opening paragraph?')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.proposal', { timeout: 15000 })
  await page.waitForTimeout(1500)
  await shot('chat')
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(700)
  await shot('plan')
}
