// Typewriter mode: while the author types, the line of the cursor stays at the same height.
export default async function ({ page, openBook }) {
  await openBook()
  await page.waitForTimeout(1000)
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ typewriterScroll: true }))
  const last = page.locator('.manuscript').first().locator('p').last()
  await last.click()
  await page.keyboard.press('End')
  const ys = []
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Enter')
    await page.keyboard.type('Uma linha nova.')
    await page.waitForTimeout(450)
    ys.push(
      await page.evaluate(() => {
        const ed = window.__wordelia.editor()
        const desk = document.querySelector('.desk').getBoundingClientRect()
        return Math.round(((ed.view.coordsAtPos(ed.state.selection.head).top - desk.top) / desk.height) * 100)
      })
    )
  }
  console.log('cursor height on screen (% of the desk):', ys.join(' '))
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ typewriterScroll: false }))
  const tail = ys.slice(4)
  if (tail.some((y) => Math.abs(y - 42) > 8)) throw new Error('Typewriter mode did not keep the line at the same height')
}
