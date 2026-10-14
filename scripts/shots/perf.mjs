// Typing speed in a long chapter. Set IMPORT_FILE to a DOCX of a real book.
export default async function ({ page }) {
  const file = process.env.IMPORT_FILE
  if (!file) throw new Error('Set IMPORT_FILE')
  await page.evaluate((p) => window.__wordelia.importFile(p), file)
  await page.waitForSelector('.import-chapters', { timeout: 30000 })
  // Planning build off: only typing is measured.
  await page.locator('.dialog .switch').click()
  await page.locator('.dialog-foot .btn-primary').click()
  await page.waitForSelector('.manuscript', { timeout: 30000 })
  // The longest chapter
  const words = await page.locator('.chapter-item-words').allInnerTexts()
  const longest = words.map((w) => Number.parseFloat(w) * (w.endsWith('k') ? 1000 : 1)).reduce((best, n, i, arr) => (n > arr[best] ? i : best), 0)
  await page.locator('.chapter-item').nth(longest).click()
  await page.waitForTimeout(1500)
  await page.locator('.manuscript p').nth(20).click()
  const text = 'Uma frase nova para medir a velocidade de digitação no capítulo longo. '
  const t0 = Date.now()
  await page.keyboard.type(text, { delay: 0 })
  const typed = Date.now() - t0
  // Time for one frame after a keystroke
  const frame = await page.evaluate(async () => {
    const t = performance.now()
    document.execCommand('insertText', false, 'x')
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    return performance.now() - t
  })
  await page.waitForTimeout(1500)
  console.log(JSON.stringify({ chars: text.length, msTotal: typed, msPerChar: +(typed / text.length).toFixed(1), frameAfterKey: +frame.toFixed(1) }))
}
