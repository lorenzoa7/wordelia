// Ctrl+Enter makes a page break: the text after the cursor starts on a new page, and the cursor
// goes there. Shift+Enter line breaks count as lines. Every page keeps the same height. Backspace
// and Ctrl+Enter work like Google Docs: the author's steps at the end of a chapter are below.
export default async function ({ page, shot, openBook }) {
  // The machine may ask for reduced motion (CI servers do): then no new page comes in, and this
  // scenario counts them.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openBook()
  await page.waitForTimeout(1200)
  // Each new page that comes in (its gap has a veil that fades out) and each page that goes (its
  // space stays for a moment after the text, pagination.ts)
  await page.evaluate(() => {
    window.__arrivals = 0
    window.__departures = 0
    // ProseMirror may draw these widgets again: count only when one shows and none was there.
    let arriving = false
    let leaving = false
    const root = document.querySelector('.manuscript')
    new MutationObserver(() => {
      const a = Boolean(root.querySelector('.pm-page-gap > .pm-page-veil'))
      const l = Boolean(root.querySelector('.pm-page-leave'))
      if (a && !arriving) window.__arrivals++
      if (l && !leaving) window.__departures++
      arriving = a
      leaving = l
    }).observe(root, { childList: true, subtree: true })
  })
  // Height of a page and of the space between two sheets, from the CSS of the desk
  const geo = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.desk-inner'))
    const n = (k) => parseFloat(s.getPropertyValue(k))
    return { pageH: n('--page-mt') + n('--page-content-h') + n('--page-mb'), gap: n('--page-gap') }
  })
  const check = async (label) => {
    // A page that goes keeps its space for a moment: measure after that.
    await page.waitForFunction(() => !document.querySelector('.pm-page-leave'), null, { timeout: 5000 })
    const r = await page.evaluate(() => {
      const sheet = document.querySelector('.page[data-chapter]')
      return { height: sheet.getBoundingClientRect().height, gaps: sheet.querySelectorAll('.pm-page-gap').length }
    })
    const pages = r.gaps + 1
    const expected = pages * geo.pageH + (pages - 1) * geo.gap
    console.log(label, JSON.stringify({ pages, height: Math.round(r.height), expected: Math.round(expected) }))
    if (Math.abs(r.height - expected) > 3) throw new Error(`${label}: a page grew (${Math.round(r.height)} px, expected ${Math.round(expected)} px)`)
    return pages
  }
  const before = await check('start')

  // Ctrl+Enter in the middle of the second paragraph.
  const p = page.locator('.manuscript').first().locator('p').nth(1)
  await p.click()
  await page.keyboard.press('Home')
  // Between two words of the first line of the paragraph
  await p.evaluate((el) => {
    const ed = window.__wordelia.editor()
    const pos = ed.view.posAtDOM(el.firstChild, 9)
    ed.commands.setTextSelection(pos)
  })
  await page.keyboard.press('Control+Enter')
  await page.waitForTimeout(700)
  const afterBreak = await check('after Ctrl+Enter')
  const caret = await page.evaluate(() => {
    const ed = window.__wordelia.editor()
    const top = ed.view.coordsAtPos(ed.state.selection.head).top
    const gap = document.querySelector('.page-break + .pm-page-gap, .page-break ~ .pm-page-gap')
    return { caretTop: Math.round(top), gapBottom: gap ? Math.round(gap.getBoundingClientRect().bottom) : null, md: ed.storage ? null : null }
  })
  console.log('caret:', JSON.stringify(caret))
  if (afterBreak < before) throw new Error('Ctrl+Enter removed a page')
  if (caret.gapBottom === null || caret.caretTop < caret.gapBottom) throw new Error('The page break did not start a new page, or the cursor is not on it')
  await shot('page-break')

  // Many Shift+Enter line breaks: new pages come, no page grows.
  for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+Enter')
  await page.waitForTimeout(900)
  const afterLines = await check('after 40 line breaks')
  if (afterLines <= afterBreak) throw new Error('Line breaks did not make new pages')
  await shot('line-breaks')

  // Backspace at the start of the new page removes the page break at once: nothing is selected.
  for (let i = 0; i < 40; i++) await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(600)
  if (await page.evaluate(() => document.querySelector('.ProseMirror-selectednode'))) throw new Error('Backspace selected the page break')
  const end = await check('after Backspace')
  if (end !== before) throw new Error('Backspace did not remove the page break')

  // The author's steps at the end of the chapter.
  const where = () =>
    page.evaluate(() => {
      const ed = window.__wordelia.editor()
      return { head: ed.state.selection.head, size: ed.state.doc.content.size, node: ed.state.selection.constructor.name, arrivals: window.__arrivals, departures: window.__departures }
    })
  const step = async (key, label, pages) => {
    await page.keyboard.press(key)
    await page.waitForTimeout(600)
    const n = await check(label)
    const w = await where()
    console.log('  ', JSON.stringify(w))
    if (n !== pages) throw new Error(`${label}: ${n} pages, expected ${pages}`)
    return w
  }
  await page.keyboard.press('Control+End')
  await page.waitForTimeout(300)
  const textEnd = await where()
  const base = await check('end of the chapter')
  let w = await step('Control+Enter', '1. Ctrl+Enter', base + 1)
  if (w.arrivals !== textEnd.arrivals + 1) throw new Error('1. The new page did not come in')
  // Backspace on the empty new page: the page goes, and the cursor goes back to the end of the text.
  w = await step('Backspace', '2. Backspace on the empty page', base)
  if (w.head !== textEnd.head || w.size !== textEnd.size) throw new Error(`2. The cursor is at ${w.head} of ${w.size}, not at the end of the text (${textEnd.head} of ${textEnd.size})`)
  if (w.departures !== textEnd.departures + 1) throw new Error('2. The page did not go out')
  // Ctrl+Enter again: the new page comes in again. Ctrl+Enter on the empty page: one more page.
  w = await step('Control+Enter', '3. Ctrl+Enter again', base + 1)
  if (w.arrivals !== textEnd.arrivals + 2) throw new Error('3. The new page did not come in the second time')
  w = await step('Control+Enter', '4. Ctrl+Enter on the empty page', base + 2)
  if (w.arrivals !== textEnd.arrivals + 3) throw new Error('4. The second new page did not come in')
  await shot('two-empty-pages')
  // Backspace two times: the two pages go, one at a time, and the cursor is at the end of the text.
  w = await step('Backspace', '5. Backspace', base + 1)
  if (w.departures !== textEnd.departures + 2) throw new Error('5. The page did not go out')
  w = await step('Backspace', '6. Backspace', base)
  if (w.departures !== textEnd.departures + 3) throw new Error('6. The page did not go out')
  if (w.head !== textEnd.head || w.size !== textEnd.size) throw new Error(`6. The cursor is at ${w.head} of ${w.size}, not at the end of the text`)

  // The page break is saved in the Markdown.
  await page.keyboard.press('Control+Enter')
  await page.waitForTimeout(800)
  const md = await page.evaluate(() => window.__wordelia.book.getState().chapters[0].body)
  if (!md.includes('<!-- page break -->')) throw new Error('The page break is not in the Markdown')
}
