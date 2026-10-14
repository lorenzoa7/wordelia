export default async function ({ shot, page }) {
  await page.waitForTimeout(600)
  await shot('library-empty')
}
