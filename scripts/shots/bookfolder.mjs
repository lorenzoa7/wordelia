// The files of a book when it opens and closes.
// 1. A wordelia.json with git conflict markers: the book opens with its id, language and chapter order, the
//    damaged file stays as a copy in .wordelia, and a note tells the writer.
// 2. A chapter file that is missing (a sync client did not deliver it yet): its place in the order stays, a note
//    tells the writer, and the chapter comes back in its place when the file arrives.
// 3. A close of the book while some text is not on disk: the same question as the close of the window.
import { chmod, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot, book }) {
  const fail = (msg) => {
    throw new Error(`Book folder scenario: ${msg}`)
  }
  const manifestFile = join(book, 'wordelia.json')
  const open = async () => {
    await page.evaluate((p) => window.__wordelia.openBook(p), book)
    await page.waitForSelector('.manuscript', { timeout: 20000 })
  }
  const close = async () => {
    await page.locator('.titlebar-logo').click()
    await page.waitForSelector('.library', { timeout: 10000 })
  }
  const toastText = () => page.locator('.toast-message').allInnerTexts()
  const dismissToasts = () => page.evaluate(() => document.querySelectorAll('.toast-close').forEach((b) => b.click()))

  // 1. Git conflict markers in the manifest.
  const good = await readFile(manifestFile, 'utf8')
  const broken = good.replace(/^(\s*"title": .*)$/m, '<<<<<<< HEAD\n$1\n=======\n  "title": "O Farol (outro computador)",\n>>>>>>> outro')
  await writeFile(manifestFile, broken)
  await open()
  const m = await page.evaluate(() => window.__wordelia.book.getState().manifest)
  await page.waitForSelector('.toast-message')
  const notes1 = await toastText()
  console.log(JSON.stringify({ id: m.id, title: m.title, language: m.language, notes: notes1 }))
  if (m.id !== 'bk_sample01' || m.language !== 'pt-BR' || m.title !== 'O Farol de Santa Ilha') fail('the manifest did not come back from the conflict')
  if (!notes1.some((t) => t.includes('two versions'))) fail('no note about the repaired manifest')
  const copies = (await readdir(join(book, '.wordelia'))).filter((f) => f.startsWith('wordelia.json.broken-'))
  if (copies.length !== 1 || (await readFile(join(book, '.wordelia', copies[0]), 'utf8')) !== broken) fail('the damaged manifest was not kept')
  await shot('manifest-repaired')
  await dismissToasts()
  await close()

  // 2. A chapter file that is missing for now.
  const first = join(book, 'manuscript', 'A Tempestade.md')
  const text = await readFile(first, 'utf8')
  await rm(first)
  await open()
  await page.waitForSelector('.toast-message')
  const notes2 = await toastText()
  if (!notes2.some((t) => t.includes('A Tempestade') && t.includes('missing'))) fail(`no note about the missing chapter: ${notes2.join(' / ')}`)
  await shot('chapter-missing')
  // The writer adds a chapter while the file is missing: the manifest keeps the place of the missing one.
  await page.evaluate(() => window.__wordelia.book.getState().addChapter(null, 'Epílogo'))
  await page.waitForFunction(() => window.__wordelia.book.getState().chapters.length === 2)
  await page.waitForTimeout(800)
  const files = JSON.parse(await readFile(manifestFile, 'utf8')).chapters.map((c) => c.file)
  console.log(JSON.stringify({ manifest: files }))
  if (files.join('|') !== 'A Tempestade.md|O Visitante.md|Epílogo.md') fail(`the manifest order is ${files.join(' / ')}`)
  // The sync client delivers the file: the chapter comes back in its place.
  await writeFile(first, text)
  await page.waitForFunction(() => window.__wordelia.book.getState().chapters.length === 3, null, { timeout: 10000 })
  const titles = await page.evaluate(() => window.__wordelia.book.getState().chapters.map((c) => c.title))
  console.log(JSON.stringify({ back: titles }))
  if (titles.join('|') !== 'A Tempestade|O Visitante|Epílogo') fail(`the order after the file came back is ${titles.join(' / ')}`)
  await dismissToasts()

  // 3. Some text is not on disk (the file is read-only, as when a sync client holds it): closing the book asks first.
  await chmod(first, 0o444)
  await page.locator('.manuscript').first().locator('p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' TEXTO-NAO-SALVO')
  await page.waitForSelector('.save-state.is-error', { timeout: 15000 })
  await page.locator('.titlebar-logo').click()
  await page.waitForSelector('.dialog-foot', { timeout: 5000 })
  const buttons = await page.locator('.dialog-foot button').allInnerTexts()
  console.log(JSON.stringify({ question: buttons }))
  if (buttons.join('|') !== 'Keep the book open|Close anyway') fail(`the question has the buttons ${buttons.join(' / ')}`)
  await shot('close-unsaved')
  await page.locator('.dialog-foot .btn-ghost').click()
  await page.waitForSelector('.dialog-foot', { state: 'detached' })
  if (!(await page.locator('.manuscript').count())) fail('"Keep the book open" closed the book')
  // The file can be written again: the book closes, and the text is on disk.
  await chmod(first, 0o644)
  await close()
  if (!(await readFile(first, 'utf8')).includes('TEXTO-NAO-SALVO')) fail('the text was not saved when the book closed')
}
