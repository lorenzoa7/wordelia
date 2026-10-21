// The library and its folders.
// - The empty library: a click on the sheet starts the first book.
// - "Open folder" with a folder of notes: the app asks before it makes the folder a book, and offers Import.
// - "Open folder" with a folder inside a book (its manuscript folder): the app opens the book, not a book in the book.
// - The cards of a row have the same height, and the sheets behind a card never hang below it.
// - "Remove from list" has Undo. A card whose folder moved can find the folder again (the same book, by id).
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ app, page, shot, book, work }) {
  const fail = (msg) => {
    throw new Error(`Library cards scenario: ${msg}`)
  }
  /** The next folder dialog chooses this folder. */
  const choose = (path) =>
    app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
    }, path)
  const dialogTitle = () => page.locator('.dialog-title').innerText()
  const openFolder = async (path) => {
    await choose(path)
    await page.locator('.library-actions .btn').nth(1).click()
  }
  const toBook = () => page.waitForFunction(() => window.__wordelia.book.getState().root && document.querySelector('.book-sidebar'), null, { timeout: 20000 })
  /** The cards come in with a short fade (motion, not CSS): wait for it before a measure or a screenshot. */
  const settle = () => page.waitForFunction(() => [...document.querySelectorAll('.book-card, .library-hero')].every((c) => getComputedStyle(c).opacity === '1'))
  const close = async () => {
    await page.locator('.titlebar-logo').click()
    await page.waitForSelector('.library', { timeout: 10000 })
  }

  // The empty library: the sheet is a button.
  await page.waitForSelector('.empty-sheet')
  await shot('empty')
  await page.locator('.empty-sheet').click()
  await page.waitForSelector('.dialog')
  if ((await dialogTitle()) !== 'A new book') fail('a click on the empty sheet does not start a book')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.dialog', { state: 'detached' })

  // A folder of notes is not a book: ask first, and offer Import.
  const notes = join(work, 'Notas')
  await mkdir(notes)
  await writeFile(join(notes, 'Ideias.md'), '# Ideias\n\nUm farol numa ilha.\n')
  await writeFile(join(notes, 'Personagens.md'), 'Elias, o faroleiro. Marta, a visitante.\n')
  await openFolder(notes)
  await page.waitForSelector('.plain-folder')
  if ((await dialogTitle()) !== 'This folder is not a book yet') fail(`the dialog is "${await dialogTitle()}"`)
  if ((await readdir(notes)).includes('wordelia.json')) fail('the folder became a book before the writer said yes')
  await shot('not-a-book')
  await page.locator('.dialog-foot .btn-primary').click()
  await page.waitForSelector('.import-chapters')
  const imported = await page.locator('.import-ch-title').allInnerTexts()
  if (imported.join('|') !== 'Ideias|Personagens') fail(`Import of the folder lists ${imported.join(' / ')}`)
  await page.locator('.dialog-foot .btn-ghost').click()
  await page.waitForSelector('.dialog', { state: 'detached' })
  // The writer says yes: the folder becomes a book.
  await openFolder(notes)
  await page.waitForSelector('.plain-folder')
  await page.locator('.dialog-foot .btn-secondary').click()
  await toBook()
  if (!(await readdir(notes)).includes('wordelia.json')) fail('"Make it a book" did not make a book')
  await page.evaluate(() => window.__wordelia.book.getState().updateManifest({ title: 'As notas do faroleiro de Santa Ilha, com um título muito longo para um cartão de livro' }))
  await close()

  // The manuscript folder of a book: open the book.
  await openFolder(join(book, 'manuscript'))
  await page.waitForSelector('.dialog-foot')
  if ((await dialogTitle()) !== 'This folder is part of a book') fail(`the dialog is "${await dialogTitle()}"`)
  await page.locator('.dialog-foot .btn-primary').click()
  await toBook()
  const root = await page.evaluate(() => window.__wordelia.book.getState().root)
  if (root !== book) fail(`the opened folder is ${root}`)
  if ((await readdir(join(book, 'manuscript'))).includes('wordelia.json')) fail('a book was made inside the book')
  await close()

  // The cards of one row: the same height, and the sheets end with the page.
  await page.waitForSelector('.book-card')
  await settle()
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('.book-card')].map((c) => {
      const card = c.getBoundingClientRect()
      const face = c.querySelector('.book-card-face').getBoundingClientRect()
      return { top: Math.round(card.top), card: Math.round(card.height), face: Math.round(face.height) }
    })
  )
  console.log(JSON.stringify({ cards }))
  if (cards.length !== 2 || cards[0].top !== cards[1].top) fail('the two cards are not in one row')
  if (cards.some((c) => Math.abs(c.card - c.face) > 1)) fail('the sheets behind a card hang below its page')
  if (cards[0].face !== cards[1].face) fail('the cards of a row have different heights')
  await shot('cards')

  // Remove from list, then Undo.
  const card = page.locator('.book-card', { hasText: 'O Farol de Santa Ilha' })
  await card.hover()
  await card.locator('.book-card-menu button').click()
  await page.locator('[role="menuitem"]', { hasText: 'Remove from list' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.book-card').length === 1)
  const removed = await page.locator('.toast-message').last().innerText()
  if (!removed.includes('stay on this computer')) fail(`the toast says "${removed}"`)
  await shot('removed')
  await page.locator('.toast-action', { hasText: 'Undo' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.book-card').length === 2)

  // The folder of the book moves: the card finds it again, and only the same book.
  const moved = `${book} (movido)`
  await rename(book, moved)
  await page.evaluate(() => window.__wordelia.app.getState().refreshLibrary())
  await page.waitForSelector('.book-card.is-missing')
  await settle()
  await shot('missing')
  await choose(notes)
  await page.locator('.book-card.is-missing .book-card-face').click()
  await page.waitForFunction(() => [...document.querySelectorAll('.toast-message')].some((t) => t.textContent.includes('another book')))
  if (!(await page.locator('.book-card.is-missing').count())) fail('another book took the place of the missing one')
  await choose(moved)
  await page.locator('.book-card.is-missing .book-card-face').click()
  await page.waitForSelector('.book-card.is-missing', { state: 'detached', timeout: 10000 })
  const roots = await page.evaluate(() => window.__wordelia.app.getState().library.map((i) => i.root))
  if (!roots.includes(moved)) fail(`the library does not point to the new folder: ${roots.join(' / ')}`)
  await settle()
  await shot('found')
}
