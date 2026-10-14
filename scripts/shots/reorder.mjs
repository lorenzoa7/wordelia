// Drag the second chapter above the first. The manifest keeps the new order.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, openBook, book, shot }) {
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
}
