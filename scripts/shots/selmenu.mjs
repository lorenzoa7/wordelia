// The menu of more actions opens next to its button in the selection bubble, not in a corner, and
// it never covers the selected text: it opens away from the text.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.waitForTimeout(1200)
  const p = page.locator('.manuscript p').nth(2)
  await p.click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.waitForSelector('.selection-menu .sel-more', { state: 'visible' })
  await page.waitForTimeout(300)
  await page.locator('.selection-menu .sel-more').click()
  await page.waitForSelector('[role="menu"]', { state: 'visible' })
  await page.waitForTimeout(400)
  const pos = await page.evaluate(() => {
    const b = document.querySelector('.selection-menu .sel-more').getBoundingClientRect()
    const m = document.querySelector('[role="menu"]').getBoundingClientRect()
    const sel = [...window.getSelection().getRangeAt(0).getClientRects()].filter((r) => r.width > 1)
    const covers = sel.some((r) => r.left < m.right && r.right > m.left && r.top < m.bottom && r.bottom > m.top)
    return {
      button: [Math.round(b.left), Math.round(b.top), Math.round(b.bottom)],
      menu: [Math.round(m.left), Math.round(m.top), Math.round(m.right), Math.round(m.bottom)],
      covers,
      bubbleVisible: getComputedStyle(document.querySelector('.selection-menu')).visibility
    }
  })
  console.log(JSON.stringify(pos))
  await shot('open')
  const nextToButton = Math.abs(pos.menu[3] - pos.button[1]) <= 20 || Math.abs(pos.menu[1] - pos.button[2]) <= 20
  if (!nextToButton || pos.menu[2] < pos.button[0]) throw new Error('The menu is not next to its button')
  if (pos.covers) throw new Error('The menu covers the selected text')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => ({ focused: document.activeElement?.classList.contains('ProseMirror'), selected: window.getSelection()?.toString().length }))
  console.log('after Escape:', JSON.stringify(after))
  if (!after.focused || !after.selected) throw new Error('The text lost the focus or the selection')
}
