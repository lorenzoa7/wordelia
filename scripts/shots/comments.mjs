// The comments of a book (ai/comments.json): a chapter that goes to the trash takes its comments along,
// they wait in the trash folder of the book, and the Undo of the delete brings them back. A damaged file
// stays as it is.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot, openBook, book }) {
  const fail = (msg) => {
    throw new Error(`Comments scenario: ${msg}`)
  }
  const stamp = '2026-10-21T10:00:00.000Z'
  const item = (id, chapterId, state) => ({ id, chapterId, lens: 'style', rank: 1, text: 'Repete a palavra.', passage: 'Elias acendeu', sources: [], state, threadId: 'th_x', messageId: 'msg_x', key: '0', createdAt: stamp, updatedAt: stamp })
  const file = join(book, 'ai', 'comments.json')
  const ids = () => page.evaluate(() => window.__wordelia.comments.getState().list.map((c) => c.id))
  const onDisk = async () => JSON.parse(await readFile(file, 'utf8')).comments.map((c) => c.id)
  const until = async (what, check) => {
    for (let i = 0; i < 60; i++) {
      if (await check()) return
      await page.waitForTimeout(100)
    }
    fail(what)
  }

  await openBook()
  // The file comes with the book: one comment for the first chapter, two for the second.
  await mkdir(join(book, 'ai'), { recursive: true })
  const all = [item('cm_aaaaaaaa', 'ch_sample01', 'open'), item('cm_bbbbbbbb', 'ch_sample02', 'open'), item('cm_cccccccc', 'ch_sample02', 'done')]
  await writeFile(file, JSON.stringify({ version: 1, comments: all }, null, 2))
  await until('the comments of the file did not load', async () => (await ids()).length === 3)

  // Delete the second chapter: its comments leave the list and the file, and go to the trash.
  await page.evaluate(async () => {
    window.__undoDelete = await window.__wordelia.book.getState().deleteChapter('ch_sample02')
  })
  if ((await ids()).join() !== 'cm_aaaaaaaa') fail(`the list after the delete is ${await ids()}`)
  await until('the file still has the comments of the deleted chapter', async () => (await onDisk()).join() === 'cm_aaaaaaaa')
  const trash = join(book, '.wordelia', 'trash')
  const kept = (await readdir(trash)).filter((f) => / comments O Visitante\.md\.json$/.test(f))
  console.log('comments in the trash:', JSON.stringify(kept))
  if (kept.length !== 1) fail('the comments of the deleted chapter are not in the trash')
  const trashed = JSON.parse(await readFile(join(trash, kept[0]), 'utf8')).comments.map((c) => c.id)
  if (trashed.join() !== 'cm_bbbbbbbb,cm_cccccccc') fail(`the trash holds ${trashed}`)

  // Undo: the chapter and its comments come back, with the state that they had.
  await page.evaluate(() => window.__undoDelete())
  await until('the Undo did not bring the comments back', async () => (await ids()).length === 3)
  const states = await page.evaluate(() => window.__wordelia.comments.getState().list.map((c) => `${c.id}|${c.state}`))
  if (states.join() !== 'cm_aaaaaaaa|open,cm_bbbbbbbb|open,cm_cccccccc|done') fail(`the comments after the Undo are ${states}`)
  await until('the file does not hold the comments after the Undo', async () => (await onDisk()).length === 3)
  console.log('after the Undo:', JSON.stringify(await onDisk()))

  // The book opens with a damaged file (the conflict marks of git): the app shows no comments, never writes
  // over the decisions in the file, and a toast tells the author.
  const damaged = ['<<<<<<< HEAD', JSON.stringify({ version: 1, comments: all }), '=======', JSON.stringify({ version: 1, comments: [] }), '>>>>>>> other', ''].join('\n')
  await page.evaluate(() => window.__wordelia.book.getState().close())
  await writeFile(file, damaged)
  await openBook()
  await page.locator('.toast', { hasText: 'ai/comments.json' }).waitFor({ timeout: 5000 })
  const store = await page.evaluate(() => {
    const s = window.__wordelia.comments.getState()
    return { comments: s.list.length, readOnly: s.readOnly, damaged: s.damaged }
  })
  console.log('a damaged file:', JSON.stringify(store))
  if (store.comments || !store.readOnly || !store.damaged) fail(`the store of a damaged file is ${JSON.stringify(store)}`)
  await shot('damaged-file')
  // The close writes everything that waits: the file is still the damaged one.
  await page.evaluate(() => window.__wordelia.book.getState().close())
  if ((await readFile(file, 'utf8')) !== damaged) fail('the app wrote over the damaged comments file')
}
