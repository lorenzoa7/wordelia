export default async function ({ page, shot }) {
  await page.waitForSelector('.welcome', { timeout: 10000 })
  await page.waitForTimeout(800)
  await shot('step1')
  await page.locator('.welcome .btn-ribbon').click()
  await page.waitForTimeout(4000)
  await shot('step2')
}
