// The pages of the manuscript: page breaks, the next chapter while scrolling, a narrow window.
// PAGES_BOOK=<book folder> uses another book (a copy is opened); the default is the sample book.
import { cp } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ app, page, shot, openBook, work }) {
  if (process.env.PAGES_BOOK) {
    const copy = join(work, 'pages-book')
    await cp(process.env.PAGES_BOOK, copy, { recursive: true })
    await page.evaluate((p) => window.__wordelia.openBook(p), copy)
  } else {
    await openBook()
  }
  await page.waitForTimeout(1500)
  await shot('top')
  const info = await page.evaluate(() => {
    const gaps = [...document.querySelectorAll('.pm-page-gap')]
    const sheets = [...document.querySelectorAll('.page[data-chapter]')]
    return { gaps: gaps.length, inline: gaps.filter((g) => g.classList.contains('is-inline')).length, sheets: sheets.length, mounted: document.querySelectorAll('.manuscript').length }
  })
  console.log('layout:', JSON.stringify(info))
  // Scroll to the first page break.
  await page.evaluate(() => {
    const desk = document.querySelector('.desk')
    const gap = document.querySelector('.pm-page-gap')
    if (desk && gap) desk.scrollBy({ top: gap.getBoundingClientRect().top - desk.getBoundingClientRect().top - 300 })
  })
  await page.waitForTimeout(500)
  await shot('first-break')
  // Scroll to the start of the second chapter.
  await page.evaluate(() => {
    const desk = document.querySelector('.desk')
    const second = document.querySelectorAll('.page[data-chapter]')[1]
    if (desk && second) desk.scrollBy({ top: second.getBoundingClientRect().top - desk.getBoundingClientRect().top - 200 })
  })
  await page.waitForTimeout(900)
  await shot('chapter-boundary')
  const active = await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    return { active: s.chapters.find((c) => c.id === s.activeChapterId)?.title, mounted: document.querySelectorAll('.manuscript').length }
  })
  console.log('after scroll:', JSON.stringify(active))
  // A narrow window: the page keeps its width and the desk scrolls sideways.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 900))
  await page.waitForTimeout(800)
  await shot('narrow')
  const widths = await page.evaluate(() => {
    const desk = document.querySelector('.desk')
    const pg = document.querySelector('.page')
    return { desk: desk?.clientWidth, scrollWidth: desk?.scrollWidth, page: pg?.getBoundingClientRect().width }
  })
  console.log('narrow:', JSON.stringify(widths))
}
