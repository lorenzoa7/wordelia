// An action's change: the bar sits above the passage, and the three views of the change switch at once.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.waitForTimeout(600)
  // Select the second paragraph and run the main action (the scripted AI answers).
  await page.evaluate(() => {
    const ed = window.__wordelia.editor()
    let from = 0
    let to = 0
    let n = 0
    ed.state.doc.forEach((node, pos) => {
      if (node.type.name === 'paragraph' && ++n === 2) {
        from = pos + 1
        to = pos + 1 + node.content.size
      }
    })
    ed.commands.focus()
    ed.commands.setTextSelection({ from, to })
  })
  const id = await page.evaluate(() => window.__wordelia.app.getState().settings.defaultActionId)
  await page.evaluate((a) => window.__wordelia.runAction(a), id)
  await page.waitForSelector('.review-bar .review-accept', { timeout: 15000 })
  await page.waitForTimeout(300)
  const place = await page.evaluate(() => {
    const bar = document.querySelector('.review-bar').getBoundingClientRect()
    const r = document.querySelector('.manuscript .ai-range').getBoundingClientRect()
    return { barBottom: Math.round(bar.bottom), passageTop: Math.round(r.top) }
  })
  console.log('bar and passage:', JSON.stringify(place))
  if (Math.abs(place.passageTop - place.barBottom) > 30) throw new Error('The review bar is not next to the passage')
  const look = () =>
    page.evaluate(() => ({
      del: document.querySelectorAll('.manuscript .ai-del').length,
      ins: document.querySelectorAll('.manuscript .ai-ins').length,
      stacked: document.querySelectorAll('.manuscript .ai-ins-stacked').length,
      hidden: document.querySelectorAll('.manuscript .ai-hide').length,
      onlyNew: document.querySelectorAll('.manuscript .ai-ins-new').length
    }))
  const words = await look()
  await shot('words')
  await page.locator('.review-view').nth(1).click()
  await page.waitForTimeout(250)
  const stacked = await look()
  await shot('stacked')
  await page.locator('.review-view').nth(2).click()
  await page.waitForTimeout(250)
  const onlyNew = await look()
  await shot('new')
  const saved = await page.evaluate(() => window.__wordelia.app.getState().settings.editor.diffView)
  console.log(JSON.stringify({ words, stacked, onlyNew, saved }))
  if (!(words.del > 0 && words.ins > 0)) throw new Error('No word diff')
  if (!(stacked.stacked === 1 && stacked.del > 0)) throw new Error('No stacked view')
  if (!(onlyNew.onlyNew === 1 && onlyNew.hidden > 0 && onlyNew.del === 0)) throw new Error('No new-text view')
  if (saved !== 'new') throw new Error('The view was not saved as the default')
  await page.locator('.review-view').nth(0).click()
}
