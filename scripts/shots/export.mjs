// Export the sample book as PDF (book and manuscript presets), DOCX, Markdown and text.
// An export never changes the page of the Write view, and the Book PDF has the pages on screen.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/** The number of pages of a PDF file */
const pdfPages = async (file) => ((await readFile(file, 'latin1')).match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length

export default async function ({ page, shot, openBook }) {
  const fail = (msg) => {
    throw new Error(`Export: ${msg}`)
  }
  await openBook()
  const screen = () =>
    page.evaluate(() => {
      const s = window.__wordelia.book.getState()
      const sheet = document.querySelector('.page[data-chapter]')
      return { pageSize: s.manifest.export.pageSize, margins: JSON.stringify(s.manifest.export.margins), width: Math.round(sheet.offsetWidth) }
    })
  const before = await screen()
  // The pages on screen: the page numbers of the chapter list.
  const screenPages = (await page.locator('.chapter-item-words').allInnerTexts()).reduce((n, t) => n + parseInt(t, 10), 0)
  await page.keyboard.press('Control+Shift+E')
  await page.waitForTimeout(800)
  await shot('dialog-book')
  const exportBtn = page.locator('.dialog-foot .btn-primary')
  await exportBtn.click()
  await page.waitForSelector('.toast', { timeout: 30000 })
  const bookToast = await page.locator('.toast').first().textContent()
  console.log('pdf (book):', bookToast)
  const name = (await page.evaluate(() => window.__wordelia.book.getState().manifest.title)) || 'Book'
  const bookPdf = await pdfPages(resolve('test-results/exports', `${name}.pdf`))
  // The PDF has a title page; then the chapters, as on screen.
  console.log('pages:', JSON.stringify({ screen: screenPages, pdf: bookPdf }))
  if (Math.abs(bookPdf - 1 - screenPages) > Math.max(1, Math.round(screenPages * 0.1))) fail(`the Book PDF has ${bookPdf - 1} pages of text, the screen ${screenPages}`)
  await page.waitForTimeout(500)

  // The manuscript preset: A4, 1 in margins. The page on screen stays the page of the book.
  await page.keyboard.press('Control+Shift+E')
  await page.waitForTimeout(600)
  await page.locator('.preset').nth(1).click()
  await page.waitForTimeout(300)
  await shot('dialog-manuscript')
  await exportBtn.click()
  await page.waitForTimeout(2500)
  const after = await screen()
  console.log('page after a manuscript export:', JSON.stringify({ before, after }))
  if (after.pageSize !== before.pageSize || after.margins !== before.margins || after.width !== before.width) fail('the export changed the page of the Write view')
  const sideways = await page.evaluate(() => {
    const desk = document.querySelector('.desk')
    return desk.scrollWidth - desk.clientWidth
  })
  if (sideways > 1) fail('the desk scrolls sideways after the export')

  await page.keyboard.press('Control+Shift+E')
  await page.waitForTimeout(600)
  await page.locator('.format-card', { hasText: 'Word' }).click()
  await page.waitForTimeout(300)
  await shot('dialog-docx')
  await exportBtn.click()
  await page.waitForTimeout(2500)
  console.log('toasts:', await page.locator('.toast').allTextContents())
  await page.keyboard.press('Control+Shift+E')
  await page.waitForTimeout(600)
  await page.locator('.format-card', { hasText: 'Markdown' }).click()
  await exportBtn.click()
  await page.waitForTimeout(1500)
  console.log('toasts:', await page.locator('.toast').allTextContents())
  const md = await readFile(resolve('test-results/exports', `${name}.md`), 'utf8')
  if (/\{align=|<!-- page break|&nbsp;|\]\{/.test(md)) fail('the Markdown has marks that only Wordelia reads')

  // Plain text: real line breaks and the scene break symbol, no Markdown signs.
  await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const ch = s.chapters[1]
    s.restoreChapter(ch.id, `${ch.body.trim()}\n\nLinha um\\\nlinha dois, com \\* e \\_.\n\n* * *\n\nOutra cena.\n`)
  })
  await page.waitForTimeout(400)
  await page.keyboard.press('Control+Shift+E')
  await page.waitForTimeout(600)
  await page.locator('.format-card', { hasText: 'Plain text' }).click()
  await exportBtn.click()
  await page.waitForTimeout(1500)
  const txt = await readFile(resolve('test-results/exports', `${name}.txt`), 'utf8')
  const tail = txt.slice(txt.indexOf('Linha um'))
  console.log('plain text:', JSON.stringify(tail.slice(0, 80)))
  if (!tail.startsWith('Linha um\nlinha dois, com * e _.\n\n*  *  *\n\nOutra cena.')) fail('the plain text is not clean')
}
