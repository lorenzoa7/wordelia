// Enter at the end of a page: the new paragraph starts on the next page at once, with no
// frame where it shows under the last line of the page.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.waitForTimeout(1500)
  const setup = await page.evaluate(() => {
    const ed = window.__wordelia.editor()
    const gap = document.querySelector('.manuscript .pm-page-gap:not(.is-inline)')
    if (!ed || !gap) return null
    const pos = ed.view.posAtDOM(gap, 0)
    // The gap sits between two blocks: pos - 1 is the end of the paragraph before it.
    const end = pos - 1
    ed.commands.focus()
    ed.commands.setTextSelection(end)
    return { pos, end, gaps: document.querySelectorAll('.manuscript .pm-page-gap').length }
  })
  if (!setup) throw new Error('No block page break in the sample chapter')
  await page.waitForTimeout(300)
  await page.keyboard.press('End')
  // Press Enter and read the layout in the same task: no timers ran yet.
  const now = await page.evaluate(() => {
    const ed = window.__wordelia.editor()
    const target = ed.view.dom
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    return new Promise((resolve) =>
      queueMicrotask(() =>
        queueMicrotask(() => {
          const head = ed.state.selection.head
          const coords = ed.view.coordsAtPos(head)
          const gaps = [...document.querySelectorAll('.manuscript .pm-page-gap')]
          const firstGap = gaps[0].getBoundingClientRect()
          resolve({ caretTop: Math.round(coords.top), gapBottom: Math.round(firstGap.bottom), gaps: gaps.length })
        })
      )
    )
  })
  console.log('before:', JSON.stringify(setup), 'after Enter:', JSON.stringify(now))
  if (now.caretTop < now.gapBottom) throw new Error('The new paragraph is still on the first page right after Enter')
  await shot('after-enter')
}
