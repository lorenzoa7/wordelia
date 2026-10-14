// Import a DOCX. Set IMPORT_FILE to the file path. The book is created in the test data folder.
export default async function ({ page, shot }) {
  const file = process.env.IMPORT_FILE
  if (!file) throw new Error('Set IMPORT_FILE')
  await page.evaluate((p) => window.__wordelia.importFile(p), file)
  await page.waitForSelector('.import-chapters', { timeout: 30000 })
  await page.waitForTimeout(600)
  await shot('import-dialog')
  await page.locator('.dialog-foot .btn-primary').click()
  await page.waitForSelector('.manuscript', { timeout: 30000 })
  await page.waitForTimeout(2500)
  await shot('imported-write')
  // Scroll into the chapter.
  await page.locator('.desk').evaluate((el) => el.scrollTo({ top: 900 }))
  await page.waitForTimeout(500)
  await shot('imported-scrolled')
  await page.locator('.chapter-item').nth(5).click()
  await page.waitForTimeout(900)
  await shot('imported-chapter6')
  const info = await page.evaluate(() => {
    const b = window.__wordelia.book.getState()
    return { root: b.root, chapters: b.chapters.map((c) => c.title + ' (' + c.body.length + ')') }
  })
  console.log(JSON.stringify(info, null, 1))
}
