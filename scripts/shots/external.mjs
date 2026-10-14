// Another program changes a chapter file. The open editor reloads it.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, openBook, book }) {
  await openBook()
  await page.waitForTimeout(800)
  const file = join(book, 'manuscript', 'A Tempestade.md')
  const src = await readFile(file, 'utf8')
  await writeFile(file, src.replace('Elias acendeu', 'Elias, cansado, acendeu'))
  await page.waitForTimeout(2000)
  const text = await page.locator('.manuscript').innerText()
  console.log('reloaded:', text.includes('Elias, cansado, acendeu'))
  if (!text.includes('Elias, cansado, acendeu')) throw new Error('The open chapter did not reload')
  // The other chapter, closed: change it, then open it.
  const other = join(book, 'manuscript', 'O Visitante.md')
  await writeFile(other, (await readFile(other, 'utf8')).replace('dormiu por dois dias', 'dormiu por três dias'))
  await page.waitForTimeout(1500)
  await page.locator('.chapter-item').nth(1).click()
  await page.waitForTimeout(800)
  const t2 = await page.locator('.manuscript').innerText()
  console.log('closed chapter updated:', t2.includes('três dias'))
  if (!t2.includes('três dias')) throw new Error('The closed chapter did not update')
}
