// Actions for one book and actions for all books (Settings → Actions): the two groups, a new book action,
// the shortcut checks across the groups, "Use in" in the two directions, the main action, a shortcut that
// both groups have (the book action wins inside its book), the book file, and the interface in Portuguese.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot, openBook, book }) {
  const fail = (what) => {
    throw new Error(`Book actions: ${what}`)
  }
  const state = () =>
    page.evaluate(() => ({
      global: window.__wordelia.app.getState().settings.actions.map((a) => `${a.name}|${a.shortcut ?? ''}|${a.builtIn}`),
      book: window.__wordelia.book.getState().actions.map((a) => `${a.name}|${a.shortcut ?? ''}|${a.builtIn}`)
    }))
  const group = (name) => page.locator('.actions-group').filter({ has: page.locator('.actions-group-head', { hasText: name }) })
  const items = async (name) => (await group(name).locator('.action-item').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim())
  const record = async (keys) => {
    await page.locator('.shortcut-box').click()
    await page.keyboard.press(keys)
    await page.waitForTimeout(250)
    const error = page.locator('.shortcut-error')
    const text = (await error.count()) ? await error.innerText() : null
    if (text) await page.keyboard.press('Escape')
    return text
  }

  await openBook()
  await page.keyboard.press('Control+,')
  await page.waitForTimeout(500)
  await page.getByRole('tab', { name: 'Actions', exact: true }).click()
  await page.waitForTimeout(300)
  const start = { all: await items('All books'), empty: await group('This book').locator('.actions-empty').innerText() }
  await shot('groups')
  if (start.all.length !== 4) fail(`All books has ${start.all.length} actions`)

  // A new action for this book: the next free shortcut, a name, instructions.
  await page.getByRole('button', { name: 'New action for this book' }).click()
  await page.waitForTimeout(300)
  const name = page.getByRole('textbox', { name: 'Action name' })
  await name.fill('Narrator voice')
  await page.getByRole('textbox', { name: 'Instructions' }).fill('Keep the dry voice of the narrator. Short sentences.')
  await page.getByRole('textbox', { name: 'Instructions' }).blur()
  await page.waitForTimeout(300)
  const created = await state()
  await shot('book-action')
  if (created.book.join() !== 'Narrator voice|Alt+5|false') fail(`the new book action is ${created.book.join()}`)
  if (created.global.length !== 4) fail('the new book action went to the settings')

  // The book folder keeps it.
  await page.waitForTimeout(800)
  const file = JSON.parse(await readFile(join(book, 'ai', 'actions.json'), 'utf8'))
  if (file.actions?.[0]?.name !== 'Narrator voice') fail(`ai/actions.json has ${JSON.stringify(file)}`)

  // The shortcut checks see the two groups.
  const bookTakesGlobal = await record('Alt+2')
  await group('All books').locator('.action-item', { hasText: 'Tighten' }).click()
  await page.waitForTimeout(250)
  const globalTakesBook = await record('Alt+5')
  if (!/Alt\+2.*Tighten/.test(bookTakesGlobal ?? '')) fail(`Alt+2 was not refused for the book action: ${bookTakesGlobal}`)
  if (!/Alt\+5.*Narrator voice/.test(globalTakesBook ?? '')) fail(`Alt+5 was not refused for a global action: ${globalTakesBook}`)

  // Use in → This book: ask first, then the action goes to the book, as it is (built in, with its shortcut).
  await group('All books').locator('.action-item', { hasText: "Show, don't tell" }).click()
  await page.waitForTimeout(250)
  await page.getByRole('radio', { name: 'This book' }).click()
  await page.waitForTimeout(300)
  await shot('move-confirm')
  await page.getByRole('button', { name: 'Use only in this book' }).click()
  await page.waitForTimeout(400)
  const moved = await state()
  const lists = { all: await items('All books'), book: await items('This book') }
  await shot('moved-to-book')
  if (moved.global.some((a) => a.startsWith("Show, don't tell"))) fail('the moved action is still in the settings')
  if (!moved.book.includes("Show, don't tell|Alt+4|true")) fail(`the moved action is not in the book: ${moved.book.join()}`)
  if ((await page.getByRole('radio', { name: 'This book' }).getAttribute('aria-checked')) !== 'true') fail('the moved action is not selected')

  // Use in → All books: no question. The built-in action is as before.
  await page.getByRole('radio', { name: 'All books' }).click()
  await page.waitForTimeout(400)
  const back = await state()
  if (!back.global.includes("Show, don't tell|Alt+4|true") || back.book.length !== 1) fail(`the action did not go back: ${JSON.stringify(back)}`)

  // The main action stays for all books.
  await group('All books').locator('.action-item', { hasText: 'Polish' }).click()
  await page.waitForTimeout(250)
  const mainLocked = await page.getByRole('radio', { name: 'This book' }).isDisabled()
  const mainHint = await page.locator('.action-form .field-hint').last().innerText()
  await shot('main-action')
  if (!mainLocked) fail('the main action can move to the book')

  // A book from another computer: its action has Alt+2, like Tighten. Inside this book, Alt+2 runs the book action.
  await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    s.setActions(s.actions.map((a) => ({ ...a, shortcut: 'Alt+2' })))
  })
  await group('All books').locator('.action-item', { hasText: 'Tighten' }).click()
  await page.waitForTimeout(300)
  const over = { key: await group('All books').locator('.action-key.is-off').innerText(), hint: await page.locator('.shortcut-over').innerText() }
  await shot('shortcut-in-book')
  if (over.key !== 'Alt+2' || !/In this book, Alt\+2 runs “Narrator voice”/.test(over.hint)) fail(`the shared shortcut does not show: ${JSON.stringify(over)}`)
  // The keyboard list of General shows the shortcuts that work in this book.
  await page.getByRole('tab', { name: 'General', exact: true }).click()
  await page.waitForTimeout(300)
  const keys = await page.locator('.shortcut-row').allInnerTexts()
  const keyList = keys.map((k) => k.replace(/\s+/g, ' ').trim()).filter((k) => /Alt\+2|Tighten|Narrator/.test(k))
  if (keyList.join() !== 'Narrator voice Alt+2') fail(`the keyboard list shows ${keyList.join()}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // The selection menu lists the book action, and Alt+2 runs it.
  const p = page.locator('.manuscript p').nth(2)
  await p.click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.waitForSelector('.selection-menu .sel-more', { state: 'visible' })
  await page.locator('.selection-menu .sel-more').click()
  await page.waitForSelector('[role="menu"]', { state: 'visible' })
  await page.waitForTimeout(300)
  const menu = (await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim())
  await shot('selection-menu')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  if (!menu.some((m) => m.startsWith('Narrator voice') && m.includes('Alt+2'))) fail(`the menu has no book action: ${menu.join(' / ')}`)
  if (menu.some((m) => m.startsWith('Tighten') && m.includes('Alt+2'))) fail('the menu shows Alt+2 for Tighten')
  // On the paragraph of the cursor: the first one.
  await page.evaluate(() => window.__wordelia.editor().commands.focus('start'))
  await page.keyboard.press('Alt+2')
  await page.waitForSelector('.review-accept', { timeout: 15000 })
  const label = await page.locator('.review-label').innerText()
  await shot('runs-book-action')
  await page.keyboard.press('Escape')
  if (!label.startsWith('Narrator voice')) fail(`Alt+2 ran ${label}`)

  // The book actions come back when the book opens again.
  await page.waitForTimeout(800)
  const reopened = await page.evaluate(async (path) => {
    await window.__wordelia.book.getState().close()
    await window.__wordelia.openBook(path)
    return window.__wordelia.book.getState().actions.map((a) => `${a.name}|${a.shortcut}`)
  }, book)
  if (reopened.join() !== 'Narrator voice|Alt+2') fail(`after a new open the book has ${reopened.join()}`)
  await page.waitForTimeout(500)

  // The interface in Portuguese.
  await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ language: 'pt-BR' }))
  await page.keyboard.press('Control+,')
  await page.waitForTimeout(500)
  await page.getByRole('tab', { name: 'Ações', exact: true }).click()
  await page.waitForTimeout(300)
  await page.locator('.actions-group').last().locator('.action-item').first().click()
  await page.waitForTimeout(300)
  await shot('pt-book-action')
  await page.locator('.actions-group').first().locator('.action-item').nth(1).click()
  await page.waitForTimeout(300)
  await page.getByRole('radio', { name: 'Este livro' }).click()
  await page.waitForTimeout(300)
  await shot('pt-move-confirm')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  console.log(JSON.stringify({ start, created: created.book, bookTakesGlobal, globalTakesBook, lists, mainHint, over, keyList, menu, label, reopened }))
}
