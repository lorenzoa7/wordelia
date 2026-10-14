// Type, then close the app at once. The chapter file must contain the new text.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ app, page, openBook, book }) {
  await openBook()
  await page.locator('.manuscript p').last().click()
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
  console.log('note saved:', elias.includes('NOTA-456'))
}
