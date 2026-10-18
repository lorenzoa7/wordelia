// Exact page counts: the chapter list shows the pages of each chapter (the white sheets), the page
// numbers go on from one chapter to the next, and the library card gets the exact total.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.waitForTimeout(2500)
  const r = await page.evaluate(() => {
    const sheets = [...document.querySelectorAll('.page[data-chapter]')]
    return {
      onScreen: sheets.map((s) => s.querySelectorAll('.pm-page-gap').length + 1),
      resets: sheets.map((s) => s.style.counterReset),
      numbers: sheets.map((s) => s.querySelectorAll('.pm-page-num').length),
      list: [...document.querySelectorAll('.chapter-item-words')].map((e) => parseInt(e.textContent, 10))
    }
  })
  console.log(JSON.stringify(r))
  await shot('numbers')
  if (r.list.join() !== r.onScreen.join()) throw new Error('The chapter list does not show the pages on screen')
  if (r.numbers.join() !== r.onScreen.join()) throw new Error('A page has no number')
  if (r.resets[1] !== `page ${r.onScreen[0]}`) throw new Error('The page numbers of chapter 2 do not go on from chapter 1')
  const total = r.onScreen.reduce((a, b) => a + b, 0)
  await page.waitForTimeout(2000)
  await page.evaluate(() => window.__wordelia.book.getState().close())
  await page.waitForTimeout(1200)
  const card = await page.evaluate(async () => {
    await window.__wordelia.app.getState().refreshLibrary()
    const it = window.__wordelia.app.getState().library[0]
    return { pages: it.pages, exact: it.pagesExact, text: document.querySelector('.book-card-pages')?.textContent }
  })
  console.log('library card:', JSON.stringify(card), 'pages on screen:', total)
  if (card.pages !== total || !card.exact || card.text.includes('≈')) throw new Error('The library card does not show the exact pages')
}
