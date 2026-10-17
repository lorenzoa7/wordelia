// A chat proposal shown in the text: the chapter opens, the passage scrolls into view, and Accept applies it.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.waitForTimeout(800)
  const result = await page.evaluate(() => {
    window.__decision = null
    const s = window.__wordelia.book.getState()
    const ch = s.chapters[1]
    return window.__reveal(ch.id, 'O homem do bote azul dormiu por dois dias.', 'O homem do bote azul dormiu dois dias inteiros.', (ok) => (window.__decision = ok))
  })
  console.log('found:', result)
  await page.waitForSelector('.review-accept', { timeout: 5000 })
  await page.waitForTimeout(600)
  await shot('review')
  await page.waitForTimeout(1000)
  console.log('store active:', await page.evaluate(() => window.__activeEditor.getState().active?.chapterId ?? null), 'ids:', await page.evaluate(() => window.__wordelia.book.getState().chapters.map((c) => c.id).join(',')))
  console.log('status:', await page.locator('.status-bar').innerText())
  console.log('active editor starts with:', await page.evaluate(() => window.__wordelia.editor()?.getText().slice(0, 30)))
  const label = await page.locator('.review-label').innerText()
  console.log('label:', label.split('\n')[0])
  await page.locator('.review-accept').click()
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => ({ decision: window.__decision, text: document.querySelectorAll('.manuscript')[1].innerText.slice(0, 80) }))
  console.log(JSON.stringify(after))
  if (after.decision !== true || !after.text.includes('dois dias inteiros')) throw new Error('The proposal was not applied from the text')
  const missing = await page.evaluate(() => window.__reveal(window.__wordelia.book.getState().chapters[0].id, 'Texto que não existe no capítulo', 'x', () => {}))
  console.log('missing text gives:', missing)
}
