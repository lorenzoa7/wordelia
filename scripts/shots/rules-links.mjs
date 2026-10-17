// The ways to reach the writing rules: the book menu and Settings → This book.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.locator('.titlebar-book').click()
  await page.waitForTimeout(400)
  await shot('book-menu')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+,')
  await page.waitForTimeout(500)
  await page.locator('.settings-tab').nth(1).click()
  await page.waitForTimeout(400)
  await shot('book-tab')
  await page.locator('button', { hasText: 'Edit writing rules' }).click()
  await page.waitForTimeout(700)
  await shot('rules-page')
}
