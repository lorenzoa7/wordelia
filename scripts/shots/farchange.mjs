// A chat change to a chapter that is far from the screen (it has no editor): Accept puts it in the text of the
// chapter, and a click on the title of the card goes there with all of the text. Before, the editor that
// came back took the state of the first editor (another schema) and the new text emptied the chapter; a
// later save wrote the empty chapter to the disk.
// Usage: node scripts/shot.mjs farchange
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot, openBook, book }) {
  const fail = (what) => {
    throw new Error(`Far change scenario: ${what}`)
  }
  const idle = () => page.waitForSelector('.composer-send:not(.is-stop)', { timeout: 30000 })
  const until = async (what, check, ms = 8000) => {
    let last
    for (let i = 0; i < ms / 100; i++) {
      last = await check()
      if (last === true) return
      await page.waitForTimeout(100)
    }
    fail(`${what}: ${JSON.stringify(last)}`)
  }
  // Chapter 2 long enough that its end is far from chapter 1.
  const file = join(book, 'manuscript', 'O Visitante.md')
  const text = await readFile(file, 'utf8')
  const extra = Array.from({ length: 70 }, (_, i) => `Parágrafo ${i + 1}. Marta anotava no caderno cada palavra do visitante, e Elias contava os barcos do porto antes de dormir.`)
  await writeFile(file, `${text.trimEnd()}\n\n${extra.join('\n\n')}\n`)

  const CH1 = 'ch_sample01'
  const editorOf = (id) =>
    page.evaluate((c) => {
      const pm = document.querySelector(`.page[data-chapter="${c}"] .ProseMirror`)
      const body = window.__wordelia.book.getState().chapters.find((x) => x.id === c).body
      return { editor: Boolean(pm), text: pm ? pm.textContent : null, body }
    }, id)

  await openBook()
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ chatOpen: true, chatWidth: 400 }))
  // Chapter 1 has an editor now; then the end of chapter 2: chapter 1 is far and loses its editor.
  await page.locator(`.page[data-chapter="${CH1}"] .manuscript p`).first().click()
  await page.evaluate((id) => window.__wordelia.book.getState().selectChapter(id), 'ch_sample02')
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    const d = document.querySelector('.desk')
    d.scrollTop = d.scrollHeight
  })
  await until('chapter 1 still has an editor at the end of chapter 2', async () => ((await editorOf(CH1)).editor ? 'mounted' : true))
  await page.locator('.page[data-chapter="ch_sample02"] .manuscript p').last().click()

  // The chat changes chapter 1, which has no editor: Accept in the card puts the change in its text.
  await page.locator('.composer-input').fill('Add a detail in the first chapter.')
  await page.keyboard.press('Enter')
  await idle()
  // A new reply can take the desk to its change: go back to the end of chapter 2, far from chapter 1.
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    const d = document.querySelector('.desk')
    d.scrollTop = d.scrollHeight
  })
  await until('chapter 1 still has an editor before Accept', async () => ((await editorOf(CH1)).editor ? 'mounted' : true))
  const card = page.locator('.msg-ai').last().locator('.proposal').first()
  await card.locator('.proposal-btn.is-accept').first().click()
  await until('the change is not in chapter 1', async () => ((await editorOf(CH1)).body.includes('cordão dourado') ? true : 'missing'))
  if ((await editorOf(CH1)).editor) fail('chapter 1 has an editor: the scenario does not test a far chapter')

  // The title of the card goes to chapter 1: its editor has all of its text, with the change.
  await card.locator('.proposal-file').click()
  await until('the editor of chapter 1 did not come back with its text', async () => {
    const s = await editorOf(CH1)
    return s.editor && s.text.includes('Elias acendeu a lâmpada do farol') && s.text.includes('cordão dourado') ? true : { editor: s.editor, chars: s.text?.length ?? null }
  })
  await shot('back-in-chapter-1')
  // A save of the editor (a key) writes the whole text, not an empty chapter.
  await page.keyboard.press('End')
  await page.keyboard.type(' Fim.')
  await page.waitForTimeout(3000)
  const disk = await readFile(join(book, 'manuscript', 'A Tempestade.md'), 'utf8')
  if (!disk.includes('Elias acendeu a lâmpada do farol') || !disk.includes('cordão dourado')) fail(`the file of chapter 1 lost its text: ${disk.length} characters`)
}
