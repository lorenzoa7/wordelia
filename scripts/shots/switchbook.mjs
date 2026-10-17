// Close a book and open another book at once: the new book shows (no view stays invisible).
import { cp } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, openBook, book, work }) {
  const other = join(work, 'other-book')
  await cp(book, other, { recursive: true })
  await openBook()
  await page.waitForTimeout(700)
  for (const wait of [0, 40, 120]) {
    await page.evaluate(() => void window.__wordelia.book.getState().close())
    await page.waitForTimeout(wait)
    await page.evaluate((p) => window.__wordelia.openBook(p), other)
    await page.waitForTimeout(900)
    const v = await page.evaluate(() => [...document.querySelectorAll('.app-view')].map((el) => +getComputedStyle(el).opacity))
    console.log(`wait ${wait} ms: views`, JSON.stringify(v))
    if (!v.length || v.some((o) => o < 0.99)) throw new Error('A view stayed invisible after a book switch')
    await page.evaluate(() => void window.__wordelia.book.getState().close())
    await page.waitForTimeout(wait)
    await openBook()
    await page.waitForTimeout(900)
  }
}
