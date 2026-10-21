// Saving: steady typing reaches the disk, a failed save says so in plain words, and text typed just
// before the app closes is in the file.
import { chmod, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ app, page, shot, openBook, book }) {
  const fail = (msg) => {
    throw new Error(`Saving: ${msg}`)
  }
  await openBook()
  const file = join(book, 'manuscript', 'A Tempestade.md')
  const status = () => page.locator('.save-state').innerText()

  // Steady typing (a key every 200 ms, no pause): the status says at once that the text is not on
  // disk yet, and the file gets the text while the author types.
  await page.locator('.manuscript').first().locator('p').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type('a')
  const first = await status()
  let onDisk = -1
  for (let i = 0; i < 25; i++) {
    await page.keyboard.type('b')
    await page.waitForTimeout(160)
    if (onDisk < 0 && (await readFile(file, 'utf8')).includes('abbbbbbbbb')) onDisk = i
  }
  console.log('steady typing:', JSON.stringify({ first, onDiskAfterKeys: onDisk }))
  if (!/Saving/.test(first)) fail(`the status said "${first}" after the first key`)
  if (onDisk < 0) fail('5 seconds of steady typing did not reach the disk')

  // A file that cannot be written: a clear message once, with Try again; then the text is saved.
  await page.waitForFunction(() => document.querySelector('.save-state')?.innerText.includes('Saved'), null, { timeout: 5000 })
  await chmod(file, 0o444)
  await page.keyboard.type(' SOMENTE-LEITURA')
  await page.waitForSelector('.save-state.is-error', { timeout: 10000 })
  await page.waitForTimeout(300)
  const toasts = await page.locator('.toast.is-error').allInnerTexts()
  console.log('failed save:', JSON.stringify(toasts))
  await shot('save-failed')
  if (toasts.length !== 1 || !/read-only/.test(toasts[0])) fail('no clear message for a read-only file')
  await chmod(file, 0o644)
  await page.locator('.toast.is-error').getByRole('button', { name: /Try again/ }).click()
  await page.waitForFunction(() => document.querySelector('.save-state')?.innerText.includes('Saved'), null, { timeout: 5000 })
  if (!(await readFile(file, 'utf8')).includes('SOMENTE-LEITURA')) fail('Try again did not save the text')

  // The last paragraph of the first chapter (each chapter has its own editor).
  await page.locator('.manuscript').first().locator('p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' MARCADOR-FINAL-123')
  // Also type in a planning note.
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(500)
  await page.locator('.entry-card').first().click()
  await page.waitForTimeout(500)
  await page.locator('.note-text p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' NOTA-456')
  // Close immediately: no time for the normal debounce.
  await app.close()
  const chapter = await readFile(file, 'utf8')
  const elias = await readFile(join(book, 'planning', 'Characters', 'Elias.md'), 'utf8')
  console.log('chapter saved:', chapter.includes('MARCADOR-FINAL-123'))
  if (!chapter.includes('MARCADOR-FINAL-123') || !elias.includes('NOTA-456')) throw new Error('Text was not saved on close')
  console.log('note saved:', elias.includes('NOTA-456'))
}
