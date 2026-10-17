// A long chapter title wraps in the page heading; the first page starts lower and stays full.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.waitForTimeout(1000)
  const id = await page.evaluate(() => window.__wordelia.book.getState().chapters[0].id)
  await page.evaluate((cid) => window.__wordelia.book.getState().renameChapter(cid, 'The Storm That Came from the North on the Night Elias Saw the Blue Boat'), id)
  await page.waitForTimeout(1200)
  const r = await page.evaluate(() => {
    const t = document.querySelector('.chapter-title')
    return { lines: Math.round(t.clientHeight / parseFloat(getComputedStyle(t).lineHeight)), cut: t.scrollHeight > t.clientHeight + 1, value: t.value.length }
  })
  console.log(JSON.stringify(r))
  await shot('heading')
  if (r.cut || r.lines < 2) throw new Error('The long title does not wrap')
}
