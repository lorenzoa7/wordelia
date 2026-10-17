// The ways to reach the writing rules: the book menu and Settings → Writing rules.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.locator('.titlebar-book').click()
  await page.waitForTimeout(400)
  await shot('book-menu')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+,')
  await page.waitForTimeout(500)
  await page.locator('.settings-tab').nth(4).click()
  await page.waitForTimeout(500)
  await shot('rules-tab')
}
