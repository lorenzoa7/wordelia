// Ctrl+Enter makes a page break: the text after the cursor starts on a new page, and the cursor
// goes there. Shift+Enter line breaks count as lines. Every page keeps the same height.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.waitForTimeout(1200)
  // Height of a page and of the space between two sheets, from the CSS of the desk
  const geo = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.desk-inner'))
    const n = (k) => parseFloat(s.getPropertyValue(k))
    return { pageH: n('--page-mt') + n('--page-content-h') + n('--page-mb'), gap: n('--page-gap') }
  })
  const check = async (label) => {
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

  // The page break is saved in the Markdown, and Backspace at the start of the new page removes it.
  for (let i = 0; i < 40; i++) await page.keyboard.press('Backspace')
  // The first Backspace at the start of the new page selects the page break and shows its mark.
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(300)
  const marked = await page.evaluate(() => {
    const el = document.querySelector('.page-break.ProseMirror-selectednode')
    return el ? getComputedStyle(el, '::after').content : null
  })
  console.log('page break mark:', marked)
  if (!marked || marked === 'none') throw new Error('The first Backspace did not show the page break as selected')
  await shot('page-break-selected')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(900)
  const end = await check('after Backspace')
  if (end !== before) throw new Error('Backspace did not remove the page break')
  await page.keyboard.press('Control+Enter')
  await page.waitForTimeout(800)
  const md = await page.evaluate(() => window.__wordelia.book.getState().chapters[0].body)
  if (!md.includes('<!-- page break -->')) throw new Error('The page break is not in the Markdown')
}
