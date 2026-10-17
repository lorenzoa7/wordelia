// Page zoom: Ctrl+= and Ctrl+- change the zoom by steps, Ctrl+0 resets it, Ctrl+wheel zooms.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.waitForTimeout(1200)
  const state = () =>
    page.evaluate(() => ({
      zoom: window.__wordelia.app.getState().settings.ui.zoom,
      page: Math.round(document.querySelector('.page').getBoundingClientRect().width),
      badge: document.querySelector('.zoom-badge')?.textContent ?? null
    }))
  const start = await state()
  await page.keyboard.press('Control+Equal')
  await page.waitForTimeout(150)
  const zin = await state()
  await shot('zoom-in')
  await page.keyboard.press('Control+Minus')
  await page.keyboard.press('Control+Minus')
  await page.waitForTimeout(150)
  const zout = await state()
  await page.keyboard.press('Control+0')
  await page.waitForTimeout(150)
  const reset = await state()
  const box = await page.locator('.desk').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 300)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -120)
  await page.keyboard.up('Control')
  await page.waitForTimeout(150)
  const wheel = await state()
  console.log(JSON.stringify({ start, zin, zout, reset, wheel }))
  if (!(zin.zoom > start.zoom && zin.page > start.page && zin.badge === '110%')) throw new Error('Ctrl+= did not zoom in')
  if (!(zout.zoom < start.zoom)) throw new Error('Ctrl+- did not zoom out')
  if (reset.zoom !== 1) throw new Error('Ctrl+0 did not reset')
  if (!(wheel.zoom > 1)) throw new Error('Ctrl+wheel did not zoom')
  // A page holds the same text at every zoom.
  const pageEnd = () =>
    page.evaluate(() => {
      const m = document.querySelector('.manuscript')
      const g = m.querySelector('.pm-page-gap')
      const r = document.createRange()
      r.setStart(m, 0)
      r.setEndBefore(g)
      return r.toString().slice(-40)
    })
  await page.keyboard.press('Control+0')
  await page.waitForTimeout(800)
  const at100 = await pageEnd()
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+Equal')
  await page.waitForTimeout(800)
  const at150 = await pageEnd()
  console.log('page 1 ends at 100%:', JSON.stringify(at100), 'at 150%:', JSON.stringify(at150))
  if (at100 !== at150) throw new Error('Page 1 holds other text at another zoom')
  await page.keyboard.press('Control+0')
}
