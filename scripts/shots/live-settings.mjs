// Live check of the AI settings: provider status, versions and update hints.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.keyboard.press('Control+,')
  await page.waitForTimeout(700)
  await page.locator('.settings-tab', { hasText: 'AI' }).click()
  // The status checks run the CLIs; give them time.
  await page.waitForTimeout(12000)
  await shot('ai')
}
