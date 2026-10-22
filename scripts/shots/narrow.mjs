// The smallest window (980 × 640) with a long book title: the title bar must not overlap.
export default async function ({ app, page, shot, openBook }) {
  // Some layouts settle one frame after a resize (a ResizeObserver): wait for the condition that the
  // checks below look for, then measure. When it never comes, the checks fail with the details.
  const settled = (check, arg) => page.waitForFunction(check, arg, { timeout: 3000 }).then(
    () => {},
    () => {}
  )
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(980, 640))
  await page.waitForTimeout(400)
  await shot('library')
  await openBook()
  await page.evaluate(() => window.__wordelia.book.getState().updateManifest({ title: 'O Farol de Santa Ilha e Outras Histórias do Mar do Norte' }))
  await page.waitForTimeout(400)
  await shot('write')
  const overlap = await page.evaluate(() => {
    const a = document.querySelector('.titlebar-book').getBoundingClientRect()
    const b = document.querySelector('.view-switch').getBoundingClientRect()
    const c = document.querySelector('.titlebar-right').getBoundingClientRect()
    return { bookRight: Math.round(a.right), tabsLeft: Math.round(b.left), tabsRight: Math.round(b.right), rightLeft: Math.round(c.left) }
  })
  console.log(JSON.stringify(overlap))
  if (overlap.bookRight > overlap.tabsLeft) throw new Error('The book title overlaps the view tabs')
  // A hidden sidebar: the show button at the corner and the editor toolbar do not overlap.
  await page.keyboard.press('Control+Backslash')
  await page.waitForTimeout(700)
  await shot('write-sidebar-hidden')
  const clear = await page.evaluate(() => {
    const a = document.querySelector('.sidebar-show').getBoundingClientRect()
    const b = document.querySelector('.toolbar').getBoundingClientRect()
    return a.right <= b.left || a.bottom <= b.top
  })
  if (!clear) throw new Error('The show sidebar button overlaps the editor toolbar')
  await page.keyboard.press('Control+Backslash')
  await page.waitForTimeout(700)
  // The page always fits between the two panels: no sideways scroll, no cut text.
  for (const width of [980, 1100, 1280]) {
    await app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setSize(w, 640), width)
    await page.waitForFunction((w) => Math.abs(innerWidth - w) < 40, width)
    await settled(() => {
      const desk = document.querySelector('.desk')
      const sheet = document.querySelector('.page[data-chapter]').getBoundingClientRect()
      return desk.scrollWidth - desk.clientWidth <= 1 && sheet.right <= desk.getBoundingClientRect().left + desk.clientWidth
    })
    const fit = await page.evaluate(() => {
      const desk = document.querySelector('.desk')
      const sheet = document.querySelector('.page[data-chapter]').getBoundingClientRect()
      const box = desk.getBoundingClientRect()
      return { sideways: desk.scrollWidth - desk.clientWidth, pageRight: Math.round(sheet.right), deskRight: Math.round(box.left + desk.clientWidth) }
    })
    console.log(`page at ${width} px:`, JSON.stringify(fit))
    if (fit.sideways > 1 || fit.pageRight > fit.deskRight) throw new Error(`The page does not fit at ${width} px`)
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(980, 640))
  await page.waitForTimeout(400)
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(700)
  await shot('plan')
  // The Plan header fits in Portuguese too: the title wraps by line, not one word per line, and the
  // switch is not cut.
  await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ language: 'pt-BR' }))
  await page.waitForTimeout(500)
  const head = await page.evaluate(() => {
    const h1 = document.querySelector('.plan-hero h1')
    const sw = document.querySelector('.plan-hero .plan-switch').getBoundingClientRect()
    const scroll = document.querySelector('.plan-scroll')
    const room = scroll.getBoundingClientRect().left + scroll.clientWidth - parseFloat(getComputedStyle(scroll).paddingRight)
    const range = document.createRange()
    range.selectNodeContents(h1)
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
    return { lines, switchRight: Math.round(sw.right), room: Math.round(room) }
  })
  console.log('plan header (pt-BR):', JSON.stringify(head))
  await shot('plan-pt')
  if (head.lines > 2 || head.switchRight > head.room + 1) throw new Error('The Plan header does not fit')
  await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ language: 'en' }))
  await page.waitForTimeout(400)
  // A toast: delete the last chapter.
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(500)
  const item = page.locator('.chapter-item').last()
  await item.hover()
  await item.locator('.chapter-item-menu button').click()
  await page.locator('[role="menuitem"]').last().click()
  await page.waitForTimeout(400)
  await shot('confirm')
  await page.locator('.dialog-foot .btn-ribbon').click()
  await page.waitForTimeout(600)
  await shot('toast')

  // The update badge, then the AI warning too, in each language and at each width: the tools on the right
  // never cover the view tabs, and never go under the window buttons. (They keep only their icons when they
  // do not fit.)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('app:update', { state: 'ready', version: '9.9.9' }))
  await page.waitForSelector('.update-badge')
  for (const warning of [false, true]) {
    if (warning) {
      await page.evaluate(() => {
        const a = window.__wordelia.app
        a.setState({ status: { ...a.getState().status, 'claude-code': { provider: 'claude-code', installed: false, loggedIn: false } } })
      })
      await page.waitForSelector('.provider-badge', { timeout: 5000 })
    }
    for (const lang of ['en', 'pt-BR', 'es']) {
      await page.evaluate((l) => window.__wordelia.app.getState().updateSettings({ language: l }), lang)
      for (const w of [980, 1100, 1200, 1440]) {
        await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 700), w)
        await page.waitForFunction((width) => Math.abs(innerWidth - width) < 40, w)
        await page.waitForFunction((l) => document.documentElement.lang === l, lang)
        await settled(() => {
          const r = (sel) => document.querySelector(sel).getBoundingClientRect()
          const tools = [...document.querySelectorAll('.titlebar-right > *')].map((el) => el.getBoundingClientRect())
          const controls = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--window-controls-w'))
          return r('.view-switch').right <= Math.min(...tools.map((b) => b.left)) && Math.max(...tools.map((b) => b.right)) <= innerWidth - controls
        })
        const m = await page.evaluate(() => {
          const r = (sel) => document.querySelector(sel).getBoundingClientRect()
          const tools = [...document.querySelectorAll('.titlebar-right > *')].map((el) => el.getBoundingClientRect())
          const controls = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--window-controls-w'))
          return {
            bookRight: Math.round(r('.titlebar-book').right),
            tabsLeft: Math.round(r('.view-switch').left),
            tabsRight: Math.round(r('.view-switch').right),
            toolsLeft: Math.round(Math.min(...tools.map((b) => b.left))),
            toolsRight: Math.round(Math.max(...tools.map((b) => b.right))),
            limit: Math.round(innerWidth - controls)
          }
        })
        const where = `${lang} at ${w} px${warning ? ' with the AI warning' : ''}`
        if (m.tabsRight > m.toolsLeft) throw new Error(`The update badge covers the view tabs (${where}): ${JSON.stringify(m)}`)
        if (m.bookRight > m.tabsLeft) throw new Error(`The book title covers the view tabs (${where})`)
        if (m.toolsRight > m.limit) throw new Error(`The title bar tools go under the window buttons (${where})`)
      }
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(980, 640))
    await page.waitForFunction(() => innerWidth < 1000)
    await shot(warning ? 'titlebar-es-update-warning' : 'titlebar-es-update')
  }
}
