// Side panels: drag an edge to resize, past the minimum to close, from the window edge to open.
export default async function ({ page, shot, openBook }) {
  await openBook()
  const width = (sel) => page.locator(sel).evaluate((el) => Math.round(el.getBoundingClientRect().width))
  const ui = () => page.evaluate(() => window.__wordelia.app.getState().settings.ui)
  const drag = async (sel, dx) => {
    const box = await page.locator(sel).boundingBox()
    const x = box.x + box.width / 2
    const y = box.y + 400
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx, y, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(600)
  }

  // Resize the sidebar: the width is kept in the settings.
  await drag('.sidebar-resizer', 64)
  const wide = await width('.book-sidebar')
  if (wide < 310 || (await ui()).sidebarWidth !== wide) throw new Error(`Sidebar resize failed: ${wide}`)
  await shot('sidebar-wide')

  // Drag the sidebar edge far to the left: it snaps closed and keeps its width for later.
  await drag('.sidebar-resizer', -260)
  if ((await width('.book-sidebar')) > 4 || (await ui()).sidebarOpen) throw new Error('Sidebar did not close')

  // Drag the chat edge far to the right: it closes too. Only the page is left.
  await drag('.chat-resizer', 330)
  if ((await width('.book-chat')) > 4 || (await ui()).chatOpen) throw new Error('Chat did not close')
  await shot('page-only')

  // Drag the closed sidebar out of the window edge: it snaps open and follows the pointer.
  await drag('.sidebar-resizer', 180)
  const back = await width('.book-sidebar')
  if (back < 200 || !(await ui()).sidebarOpen) throw new Error(`Sidebar did not open: ${back}`)

  // A click on the closed chat edge opens the chat.
  const edge = await page.locator('.chat-resizer').boundingBox()
  await page.mouse.click(edge.x + 2, edge.y + 400)
  await page.waitForTimeout(600)
  const chat = await width('.book-chat')
  if (chat < 320 || !(await ui()).chatOpen) throw new Error(`Chat did not open: ${chat}`)
  await shot('both-open')

  // The toggle buttons and shortcuts still work.
  await page.keyboard.press('Control+Backslash')
  await page.waitForTimeout(600)
  if ((await width('.book-sidebar')) > 4) throw new Error('Ctrl+\\ did not close the sidebar')
  // A hidden sidebar: the button at the top-left corner of the page shows it.
  await page.locator('.sidebar-show .icon-btn').click()
  await page.waitForTimeout(600)
  if ((await width('.book-sidebar')) < 200) throw new Error('The show button did not open the sidebar')
  // The button in the sidebar header hides it.
  await page.locator('.book-sidebar .sidebar-toggle').click()
  await page.waitForTimeout(600)
  if ((await width('.book-sidebar')) > 4) throw new Error('The hide button did not close the sidebar')
  await page.locator('.sidebar-show .icon-btn').click()
  await page.waitForTimeout(600)
  console.log(JSON.stringify({ wide, back, chat, ui: await ui() }))
}
