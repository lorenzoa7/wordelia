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
  await page.waitForTimeout(600)

  // The gaps follow the zoom in the same frame as the text: right after the key, the first page
  // gap has the same share of the page height as before.
  const share = () =>
    page.evaluate(() => {
      const g = document.querySelector('.manuscript .pm-page-gap')
      const pg = document.querySelector('.page[data-chapter]')
      return g.getBoundingClientRect().height / pg.getBoundingClientRect().width
    })
  const s1 = await share()
  await page.keyboard.press('Control+Equal')
  const s2 = await share()
  console.log('gap share before and right after zoom:', s1.toFixed(4), s2.toFixed(4))
  if (Math.abs(s1 - s2) > 0.004) throw new Error('The page gaps did not follow the zoom at once')
  await page.keyboard.press('Control+0')
  await page.waitForTimeout(600)

  // Zoom in and out at the end of the book: the view stays on the same text.
  const atLine = () =>
    page.evaluate(() => {
      const desk = document.querySelector('.desk')
      const box = desk.getBoundingClientRect()
      const y = box.top + box.height * 0.3
      const x = document.querySelector('.manuscript').getBoundingClientRect().left + 40
      const el = document.elementFromPoint(x, y)
      const text = (el?.closest('p')?.textContent ?? '').slice(0, 40)
      if (!text) console.log('at line:', el?.className, desk.scrollTop, desk.scrollHeight, desk.clientHeight)
      return text || `${el?.tagName}.${el?.className} top=${Math.round(desk.scrollTop)} h=${desk.scrollHeight}`
    })
  await page.evaluate(() => {
    const desk = document.querySelector('.desk')
    const last = [...document.querySelectorAll('.manuscript p')].pop()
    desk.scrollBy({ top: last.getBoundingClientRect().top - desk.getBoundingClientRect().top - desk.clientHeight * 0.3 + 5 })
  })
  await page.waitForTimeout(500)
  const before = await atLine()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+Equal')
  await page.waitForTimeout(500)
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+Minus')
  await page.waitForTimeout(500)
  const after = await atLine()
  console.log('text at the reading line before and after:', JSON.stringify(before), JSON.stringify(after))
  if (before !== after) throw new Error('Zoom in and out moved the view to other text')

  // The zoom menu of the toolbar
  await page.locator('.toolbar-zoom').click()
  await page.locator('[role="menuitemradio"]', { hasText: '150%' }).click()
  await page.waitForTimeout(400)
  const z = await page.evaluate(() => window.__wordelia.app.getState().settings.ui.zoom)
  await shot('toolbar-zoom')
  if (z !== 1.5) throw new Error('The zoom menu did not set the zoom')
  await page.keyboard.press('Control+0')
}
