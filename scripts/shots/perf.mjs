// Typing speed in a long chapter. Set IMPORT_FILE to a DOCX of a real book, or PERF_BOOK to a book
// folder (a copy is opened).
import { cp } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, work }) {
  const file = process.env.IMPORT_FILE
  const folder = process.env.PERF_BOOK
  if (!file && !folder) throw new Error('Set IMPORT_FILE or PERF_BOOK')
  if (folder) {
    const copy = join(work, 'perf-book')
    await cp(folder, copy, { recursive: true })
    await page.evaluate((p) => window.__wordelia.openBook(p), copy)
  } else {
    await page.evaluate((p) => window.__wordelia.importFile(p), file)
    await page.waitForSelector('.import-chapters', { timeout: 30000 })
    // Planning build off: only typing is measured.
    await page.locator('.dialog .switch').click()
    await page.locator('.dialog-foot .btn-primary').click()
  }
  await page.waitForSelector('.manuscript', { timeout: 30000 })
  // The longest chapter
  const words = await page.locator('.chapter-item-words').allInnerTexts()
  const longest = words.map((w) => Number.parseFloat(w) * (w.endsWith('k') ? 1000 : 1)).reduce((best, n, i, arr) => (n > arr[best] ? i : best), 0)
  await page.locator('.chapter-item').nth(longest).click()
  await page.waitForTimeout(1500)
  // Each chapter has its own editor: click in the one of the longest chapter.
  const id = await page.evaluate(() => window.__wordelia.book.getState().activeChapterId)
  await page.locator(`.page[data-chapter="${id}"] .manuscript p`).nth(20).click()
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
  const pages = await page.evaluate((cid) => document.querySelectorAll(`.page[data-chapter="${cid}"] .pm-page-gap`).length + 1, id)
  // Time of one pagination measure of this chapter
  const measure = await page.evaluate(async () => {
    const t = performance.now()
    document.execCommand('insertText', false, ' ')
    await new Promise((r) => setTimeout(r, 400))
    return performance.now() - t - 400
  })
  console.log(JSON.stringify({ pages, measureMs: +measure.toFixed(1) }))
  console.log(JSON.stringify({ chars: text.length, msTotal: typed, msPerChar: +(typed / text.length).toFixed(1), frameAfterKey: +frame.toFixed(1) }))
}
