// Type, then close the app at once. The chapter file must contain the new text.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ app, page, openBook, book }) {
  await openBook()
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
  const chapter = await readFile(join(book, 'manuscript', 'A Tempestade.md'), 'utf8')
  const elias = await readFile(join(book, 'planning', 'Characters', 'Elias.md'), 'utf8')
  console.log('chapter saved:', chapter.includes('MARCADOR-FINAL-123'))
  if (!chapter.includes('MARCADOR-FINAL-123') || !elias.includes('NOTA-456')) throw new Error('Text was not saved on close')
  console.log('note saved:', elias.includes('NOTA-456'))
}
