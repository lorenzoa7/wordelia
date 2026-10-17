// The menu of more actions opens under its button in the selection bubble, not in a corner.
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
    return { button: [Math.round(b.left), Math.round(b.bottom)], menu: [Math.round(m.left), Math.round(m.top), Math.round(m.right)], bubbleVisible: getComputedStyle(document.querySelector('.selection-menu')).visibility }
  })
  console.log(JSON.stringify(pos))
  await shot('open')
  if (Math.abs(pos.menu[1] - pos.button[1]) > 20 || pos.menu[2] < pos.button[0]) throw new Error('The menu is not under its button')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => ({ focused: document.activeElement?.classList.contains('ProseMirror'), selected: window.getSelection()?.toString().length }))
  console.log('after Escape:', JSON.stringify(after))
  if (!after.focused || !after.selected) throw new Error('The text lost the focus or the selection')
}
