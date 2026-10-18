// A new page grows in one time. Typing on the new page (ProseMirror draws the page gap again when
// the paragraph around it changes) and the page measures do not start its animation again.
export default async function ({ page, openBook }) {
  // The machine may ask for reduced motion (CI servers do): this scenario checks the animation itself.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openBook()
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    window.__anim = 0
    document.addEventListener('animationstart', (e) => e.target.classList?.contains('pm-page-gap') && window.__anim++, true)
  })
  // Words at the end of the chapter, like a person types them, until a new page comes inside the paragraph.
  const last = page.locator('.manuscript').first().locator('p').last()
  await last.click()
  await page.keyboard.press('Control+End')
  const gaps = () => page.evaluate(() => document.querySelector('.manuscript').querySelectorAll('.pm-page-gap').length)
  const start = await gaps()
  for (let i = 0; i < 400 && (await gaps()) === start; i++) await page.keyboard.type('palavra ', { delay: 20 })
  if ((await gaps()) === start) throw new Error('No new page came')
  const atNewPage = await page.evaluate(() => window.__anim)
  // More letters on the new page, and new lines.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.type('ab', { delay: 30 })
    await page.waitForTimeout(50)
  }
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Enter')
    await page.keyboard.type('Mais uma linha.')
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(500)
  const n = await page.evaluate(() => window.__anim)
  console.log('page animations started: at the new page', atNewPage, '· after more typing', n)
  // Never again after the first time. On CI machines the animation may not run at all (no GPU, slow
  // frames); the local run before each release checks that it runs one time.
  if (n > 1 || (!process.env.CI && n !== 1)) throw new Error(`The new page animation started ${n} times`)
}
