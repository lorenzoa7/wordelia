// Live check of the AI settings: provider status, versions, models, efforts and update hints.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.keyboard.press('Control+,')
  await page.waitForTimeout(700)
  await page.locator('.settings-tab', { hasText: 'AI' }).click()
  // The status checks run the CLIs; give them time.
  await page.waitForTimeout(15000)
  await shot('ai')
  await page.locator('.settings-panes').evaluate((el) => el.scrollTo({ top: 5000 }))
  await page.waitForTimeout(400)
  await shot('ai-routes')
  await page.locator('.settings-tab', { hasText: 'Actions' }).click()
  await page.waitForTimeout(500)
  await shot('actions')
  const models = await page.evaluate(() => window.__wordelia.app.getState().models)
  const status = await page.evaluate(() => window.__wordelia.app.getState().status)
  const routes = await page.evaluate(() => window.__wordelia.app.getState().settings.routes)
  console.log(JSON.stringify({ status, routes, models }, null, 1).slice(0, 5000))
}
