// Another program changes a chapter file. The open editor reloads it, and the author keeps the
// cursor and the undo history.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, openBook, book }) {
  await openBook()
  await page.waitForTimeout(800)
  const file = join(book, 'manuscript', 'A Tempestade.md')
  // The author types at the end of the last paragraph, and the text goes to the file.
  await page.locator('.manuscript').first().locator('p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' NOVO-FIM')
  for (let i = 0; i < 40 && !(await readFile(file, 'utf8')).includes('NOVO-FIM'); i++) await page.waitForTimeout(100)
  const src = await readFile(file, 'utf8')
  if (!src.includes('NOVO-FIM')) throw new Error('The typing did not reach the file')
  await writeFile(file, src.replace('Elias acendeu', 'Elias, cansado, acendeu'))
  // Wait for the reload: the watcher waits until the file is still for a moment.
  await page.waitForFunction(() => document.querySelector('.manuscript').innerText.includes('Elias, cansado, acendeu'), null, { timeout: 5000 }).catch(() => {})
  // Each chapter has its own editor; the first one is this chapter.
  const text = await page.locator('.manuscript').first().innerText()
  console.log('reloaded:', text.includes('Elias, cansado, acendeu'))
  if (!text.includes('Elias, cansado, acendeu')) throw new Error('The open chapter did not reload')
  // The cursor is still after the typed words, not at the start of the chapter.
  const cursor = await page.evaluate(() => {
    const ed = window.__wordelia.editor()
    const $head = ed.state.selection.$head
    return { before: $head.parent.textContent.slice(0, $head.parentOffset).slice(-12), focused: ed.isFocused }
  })
  console.log('cursor after the reload:', JSON.stringify(cursor))
  if (!cursor.before.endsWith('NOVO-FIM')) throw new Error('The reload moved the cursor')
  // The undo history stays: Ctrl+Z undoes the typing, not the change from outside.
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  const undone = await page.locator('.manuscript').first().innerText()
  console.log('after Ctrl+Z:', JSON.stringify({ typing: undone.includes('NOVO-FIM'), outside: undone.includes('cansado') }))
  if (undone.includes('NOVO-FIM') || !undone.includes('cansado')) throw new Error('Ctrl+Z after a reload did not undo the typing')
  await page.keyboard.press('Control+y')
  // The other chapter, closed: change it, then open it.
  const other = join(book, 'manuscript', 'O Visitante.md')
  await writeFile(other, (await readFile(other, 'utf8')).replace('dormiu por dois dias', 'dormiu por três dias'))
  await page.waitForTimeout(1500)
  await page.locator('.chapter-item').nth(1).click()
  await page.waitForTimeout(800)
  const t2 = await page.locator('.manuscript').nth(1).innerText()
  console.log('closed chapter updated:', t2.includes('três dias'))
  if (!t2.includes('três dias')) throw new Error('The closed chapter did not update')
}
