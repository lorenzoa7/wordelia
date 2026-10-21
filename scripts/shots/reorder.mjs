// Drag the second chapter above the first. The manifest keeps the new order, and the chapter on
// screen stays the active one. Then the chapter list: new, rename, delete and Undo, and the undo
// history of a chapter that went far from the screen.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, openBook, book, shot }) {
  const fail = (msg) => {
    throw new Error(`Chapter list: ${msg}`)
  }
  await openBook()
  const items = page.locator('.chapter-item-wrap')
  const a = await items.nth(0).boundingBox()
  const b = await items.nth(1).boundingBox()
  await page.mouse.move(b.x + 60, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 60, b.y + b.height / 2 - 10, { steps: 3 })
  await page.mouse.move(a.x + 60, a.y + 2, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(1200)
  await shot('after')
  const titles = await page.locator('.chapter-item-title').allInnerTexts()
  const manifest = JSON.parse(await readFile(join(book, 'wordelia.json'), 'utf8'))
  console.log(JSON.stringify({ titles, files: manifest.chapters.map((c) => c.file) }))
  if (titles[0] !== 'O Visitante') throw new Error('The order did not change in the list')
  if (manifest.chapters[0].file !== 'O Visitante.md') throw new Error('The order was not saved')
  // The highlighted chapter is the chapter on screen.
  const onScreen = await page.evaluate(() => {
    const desk = document.querySelector('.desk')
    const box = desk.getBoundingClientRect()
    const line = box.top + box.height * 0.3
    const sheet = [...desk.querySelectorAll('.page[data-chapter]')].find((el) => {
      const r = el.getBoundingClientRect()
      return r.top <= line && r.bottom >= line
    })
    return { screen: sheet?.dataset.chapter, active: window.__wordelia.book.getState().activeChapterId }
  })
  console.log('after the drag:', JSON.stringify(onScreen))
  if (onScreen.screen !== onScreen.active) fail('the highlighted chapter is not the chapter on screen')

  // New chapter after the first one: a title without a number, in its place; the heading says the number once.
  const first = page.locator('.chapter-item').first()
  await first.hover()
  await first.locator('.chapter-item-menu button').click()
  await page.locator('[role="menuitem"]').nth(1).click()
  await page.waitForTimeout(700)
  const added = await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const sheet = document.querySelectorAll('.page[data-chapter]')[1]
    return { title: s.chapters[1].title, label: sheet.querySelector('.chapter-label').textContent, number: sheet.querySelector('.chapter-number').textContent, focus: document.activeElement?.closest('.page[data-chapter]') === sheet }
  })
  console.log('new chapter:', JSON.stringify(added))
  if (added.title !== 'Sem título' || added.label !== 'Capítulo' || added.number !== '2') fail('the new chapter has a wrong title or heading')
  await page.keyboard.type('Texto do capítulo novo.')
  await page.waitForTimeout(600)
  await shot('new-chapter')

  // Escape in the heading cancels the new title.
  const head = page.locator('.page[data-chapter]').nth(1).locator('.chapter-title')
  await head.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' XYZ')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  if ((await page.evaluate(() => window.__wordelia.book.getState().chapters[1].title)) !== 'Sem título') fail('Escape in the heading saved the title')

  // A rename elsewhere: the rename box of the list starts from the new title, and Enter keeps it.
  await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    return s.renameChapter(s.chapters[1].id, 'Do Cabeçalho')
  })
  await page.waitForTimeout(400)
  await page.locator('.chapter-item').nth(1).dblclick()
  await page.waitForTimeout(200)
  const box = await page.locator('.chapter-item-input').inputValue()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  const kept = await page.evaluate(() => window.__wordelia.book.getState().chapters[1].title)
  console.log('rename box:', JSON.stringify({ box, kept }))
  if (box !== 'Do Cabeçalho' || kept !== 'Do Cabeçalho') fail('the rename box showed an old title')

  // Delete the chapter, then Undo: it comes back in its place, with its text.
  const del = page.locator('.chapter-item').nth(1)
  await del.hover()
  await del.locator('.chapter-item-menu button').click()
  await page.locator('[role="menuitem"]').last().click()
  await page.locator('.dialog-foot .btn-ribbon').click()
  await page.waitForTimeout(700)
  if ((await page.locator('.chapter-item').count()) !== 2) fail('the chapter was not deleted')
  await page.locator('.toast').last().getByRole('button', { name: /Undo|Desfazer/ }).click()
  await page.waitForTimeout(900)
  const back = await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    return { titles: s.chapters.map((c) => c.title), text: s.chapters[1].body }
  })
  const files = JSON.parse(await readFile(join(book, 'wordelia.json'), 'utf8')).chapters.map((c) => c.file)
  console.log('after Undo:', JSON.stringify({ ...back, files }))
  if (back.titles[1] !== 'Do Cabeçalho' || !back.text.includes('Texto do capítulo novo') || files[1] !== 'Do Cabeçalho.md') fail('Undo did not put the chapter back')

  // A chapter far from the screen has no editor, but its undo history stays.
  await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const ch = s.chapters[0]
    s.restoreChapter(ch.id, Array.from({ length: 10 }, () => ch.body.trim()).join('\n\n'))
  })
  await page.waitForTimeout(500)
  const last = page.locator('.page[data-chapter]').nth(2).locator('.manuscript p').last()
  await page.locator('.chapter-item').nth(2).click()
  await page.waitForTimeout(600)
  await last.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' DESFAZER-DEPOIS')
  await page.waitForTimeout(600)
  await page.locator('.chapter-item').nth(0).click()
  await page.waitForFunction(() => document.querySelectorAll('.page[data-chapter]')[2].classList.contains('is-asleep'), null, { timeout: 5000 }).catch(() => {})
  const slept = await page.evaluate(() => document.querySelectorAll('.page[data-chapter]')[2].classList.contains('is-asleep'))
  await page.locator('.chapter-item').nth(2).click()
  await page.waitForTimeout(800)
  await last.click()
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(800)
  const gone = await page.evaluate(() => !window.__wordelia.book.getState().chapters[2].body.includes('DESFAZER-DEPOIS'))
  console.log('undo after the editor went away:', JSON.stringify({ slept, gone }))
  if (!slept) fail('the chapter did not go far from the screen')
  if (!gone) fail('Ctrl+Z did not undo the typing of a chapter that went far from the screen')
}
