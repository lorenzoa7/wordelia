// The library: the book card with its pages, and the new book dialog.
// The card shows "≈ N pages", an estimate from the page size, the margins and the typography of the book
// (src/shared/export/pages.ts). It must stay within 10% of the pages that the Write view shows.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot, openBook, book, work }) {
  const fail = (what) => {
    throw new Error(`Library scenario: ${what}`)
  }
  // A long, real-looking chapter: the text of the sample book 14 times, with scene breaks.
  const dir = join(book, 'manuscript')
  const bodies = await Promise.all((await readdir(dir)).sort().map(async (f) => (await readFile(join(dir, f), 'utf8')).replace(/^---[\s\S]*?---\s*/, '')))
  const all = bodies.join('\n\n* * *\n\n')
  const long = Array.from({ length: 14 }, (_, i) => all + (i % 3 === 2 ? '\n\n* * *\n\n' : '\n\n')).join('')
  await writeFile(join(dir, 'Um capítulo longo.md'), `---\nid: ch_long\ntitle: Um capítulo longo\n---\n${long}`)

  await openBook()
  // The pages on screen: each chapter is a sheet, and each page gap starts a new page. A chapter far from the
  // screen has no editor, so go to each one and wait until its page gaps do not change.
  const sheets = await page.locator('.desk [data-chapter]').count()
  let screen = 0
  for (let i = 0; i < sheets; i++) {
    const sheet = page.locator('.desk [data-chapter]').nth(i)
    await sheet.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await sheet.locator('.manuscript').waitFor({ timeout: 10000 })
    let last = -1
    let gaps = 0
    for (let still = 0; still < 3; ) {
      await page.waitForTimeout(250)
      gaps = await sheet.locator('.pm-page-gap').count()
      still = gaps === last ? still + 1 : 0
      last = gaps
    }
    screen += gaps + 1
  }

  await page.locator('.titlebar-logo').click()
  await page.waitForSelector('.book-card-pages', { timeout: 10000 })
  await page.waitForTimeout(800)
  const card = await page.locator('.book-card-pages').first().innerText()
  const estimate = Number(card.replace(/[^\d]/g, ''))
  console.log(JSON.stringify({ sheets, screen, card, estimate }))
  // The editor counted the pages of the book: the card shows the exact number, without "≈".
  if (!/^\d+ pages$/.test(card)) fail(`the card says "${card}"`)
  if (estimate !== screen) fail(`the card says ${estimate} pages; the Write view shows ${screen}`)
  await shot('with-book')
  await page.locator('.book-card').first().screenshot({ path: 'test-results/shots/library-zoom-card.png' })

  // A card of an older version has no pages: the library reads the book and adds them.
  const libraryFile = join(work, 'userdata', 'library.json')
  const items = JSON.parse(await readFile(libraryFile, 'utf8'))
  for (const it of items) delete it.pages
  await writeFile(libraryFile, JSON.stringify(items))
  await page.evaluate(() => window.__wordelia.app.getState().refreshLibrary())
  await page.waitForTimeout(400)
  const again = await page.locator('.book-card-pages').first().innerText()
  console.log(JSON.stringify({ olderCard: again }))
  // Not counted by the editor yet: an estimate, with "≈", near the pages on screen.
  const guess = Number(again.replace(/[^\d]/g, ''))
  if (!/^≈ \d+ pages$/.test(again) || Math.abs(guess - screen) > Math.max(1, screen * 0.1)) fail(`a card without pages shows "${again}"; the Write view shows ${screen}`)

  // The card in Portuguese (Brazil), as the author uses the app.
  await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ language: 'pt-BR' }))
  await page.waitForTimeout(400)
  const pt = await page.locator('.book-card-pages').first().innerText()
  console.log(JSON.stringify({ pt }))
  if (pt !== `≈ ${estimate} páginas`) fail(`the Portuguese card says "${pt}"`)
  await shot('with-book-pt')
  await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ language: 'en' }))
  await page.waitForTimeout(300)

  await page.locator('.library-actions .btn-ribbon').click()
  await page.waitForTimeout(700)
  await shot('new-book')
}
