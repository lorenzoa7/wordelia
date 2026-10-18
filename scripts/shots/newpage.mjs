// A new page grows in one time: typing after it, and the page measures, do not start its animation again.
export default async function ({ page, openBook }) {
  await openBook()
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    window.__anim = 0
    document.addEventListener('animationstart', (e) => {
      if (e.target.classList?.contains('pm-page-gap')) window.__anim++
    }, true)
  })
  // The end of the chapter, then new lines until a new page comes.
  const last = page.locator('.manuscript').first().locator('p').last()
  await last.click()
  await page.keyboard.press('Control+End')
  const pages = () => page.evaluate(() => document.querySelector('.manuscript').querySelectorAll('.pm-page-gap').length)
  const start = await pages()
  for (let i = 0; i < 40 && (await pages()) === start; i++) {
    await page.keyboard.press('Enter')
    await page.keyboard.type('Linha.')
  }
  if ((await pages()) === start) throw new Error('No new page came')
  // More typing on the new page: several measures run.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Enter')
    await page.keyboard.type('Mais uma linha.')
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(600)
  const n = await page.evaluate(() => window.__anim)
  console.log('page animations started:', n)
  if (n !== 1) throw new Error(`The new page animation started ${n} times`)
}
