// Another program changes a chapter file. The open editor reloads it, and the author keeps the
// cursor and the undo history. The same for the comments of the book (ai/comments.json).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot, openBook, book }) {
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

  // The comments of the book: a sync client delivers ai/comments.json, and the store reloads it.
  const stamp = '2026-10-21T10:00:00.000Z'
  const item = (id, state) => ({ id, chapterId: 'ch_sample01', lens: 'style', rank: 1, text: 'Repete a palavra.', passage: 'O vento entrava', sources: [], state, threadId: 'th_x', messageId: 'msg_x', key: '0', createdAt: stamp, updatedAt: stamp })
  const list = () => page.evaluate(() => window.__wordelia.comments.getState().list.map((c) => `${c.id}|${c.state}`))
  const waitFor = (expected) => page.waitForFunction((want) => JSON.stringify(window.__wordelia.comments.getState().list.map((c) => `${c.id}|${c.state}`)) === want, JSON.stringify(expected), { timeout: 5000 }).catch(() => null)
  const comments = join(book, 'ai', 'comments.json')
  await mkdir(join(book, 'ai'), { recursive: true })
  await writeFile(comments, JSON.stringify({ version: 1, comments: [item('cm_aaaaaaaa', 'open')] }, null, 2))
  await waitFor(['cm_aaaaaaaa|open'])
  console.log('comments from outside:', JSON.stringify(await list()))
  if ((await list()).join() !== 'cm_aaaaaaaa|open') throw new Error('The comments of a new file did not load')
  // A write that is not finished (the sync client still copies the file) changes nothing.
  await writeFile(comments, '{"version":1,"comments":[{"id":"cm_bb')
  await page.waitForTimeout(1500)
  if ((await list()).join() !== 'cm_aaaaaaaa|open') throw new Error('A partial comments file changed the comments')
  // The whole file arrives, with another state.
  await writeFile(comments, JSON.stringify({ version: 1, comments: [item('cm_aaaaaaaa', 'done'), item('cm_bbbbbbbb', 'open')] }, null, 2))
  await waitFor(['cm_aaaaaaaa|done', 'cm_bbbbbbbb|open'])
  console.log('comments changed from outside:', JSON.stringify(await list()))
  if ((await list()).join() !== 'cm_aaaaaaaa|done,cm_bbbbbbbb|open') throw new Error('The comments did not reload')
  // A file of a newer Wordelia is shown, the writer hears it once, and the app does not write it.
  const newer = JSON.stringify({ version: 2, comments: [item('cm_cccccccc', 'open')] }, null, 2)
  await writeFile(comments, newer)
  await waitFor(['cm_cccccccc|open'])
  await page.waitForSelector('.toast', { timeout: 3000 })
  const toasts = await page.locator('.toast').allInnerTexts()
  console.log('newer file:', JSON.stringify(toasts))
  await shot('newer-comments')
  if (!toasts.some((t) => /newer version of Wordelia|versão mais nova do Wordelia|versión más nueva de Wordelia/.test(t))) throw new Error('No toast for a file of a newer Wordelia')
  await page.waitForTimeout(800)
  if ((await readFile(comments, 'utf8')) !== newer) throw new Error('The app wrote over the file of a newer Wordelia')
  // A file with no comments: the book has none.
  await writeFile(comments, JSON.stringify({ version: 1, comments: [] }))
  await waitFor([])
  if ((await list()).length) throw new Error('A comments file with no comments did not clear the comments')
}
