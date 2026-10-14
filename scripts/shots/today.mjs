export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.locator('.manuscript p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Ele contou as ondas, uma por uma, até perder a conta e dormir sentado.')
  await page.waitForTimeout(1200)
  const t = await page.locator('.today').innerText()
  console.log('today:', t)
  await page.locator('.status-bar').screenshot({ path: 'test-results/shots/today-status.png' })
  if (!/\+1\d today/.test(t)) throw new Error('Daily count is wrong: ' + t)
}
