// Plan pages: a back link on every page below the overview, Alt+← goes back too.
// I18N_LANG=pt-BR (or es) shows the pages in another interface language.
// Then the category rows of the sidebar: the caret on the middle of the icon, a click anywhere on the row.
import { resolve } from 'node:path'

/** A screenshot of a part of the window, with the interface language in its name */
const shotPath = (name) => {
  const flags = `${process.argv.includes('--en') ? '-en' : ''}${process.argv.includes('--dark') ? '-dark' : ''}${process.env.I18N_LANG ? `-${process.env.I18N_LANG}` : ''}`
  return resolve('test-results/shots', `plannav${flags}-${name}.png`)
}

/** The place of the author in the Write view: the scroll, the chapter, the cursor, the text. */
const writePlace = (page) =>
  page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const ed = window.__activeEditor.getState().active
    const focused = document.activeElement?.closest('.page[data-chapter]')
    return {
      view: s.view,
      top: Math.round(document.querySelector('.desk').scrollTop),
      active: s.activeChapterId,
      focus: focused?.dataset.chapter ?? null,
      cursor: ed ? { chapter: ed.chapterId, head: ed.editor.state.selection.head } : null
    }
  })

/**
 * Write ↔ Plan keeps the place of the author, and a book opens where the author was:
 * - A new open puts the cursor in the text at once.
 * - Ctrl+2, then Ctrl+1: the same scroll, chapter, cursor and undo history.
 * - Close the book and open it again: the same chapter, scroll and cursor; then the same view.
 */
async function placeChecks(page, openBook) {
  const fail = (msg) => {
    throw new Error(`Place: ${msg}`)
  }
  // A book that opens has the cursor in the text: keys go there.
  const first = await page.evaluate(() => document.activeElement?.closest('.page[data-chapter]')?.dataset.chapter ?? null)
  const firstId = await page.evaluate(() => window.__wordelia.book.getState().chapters[0].id)
  if (first !== firstId) fail(`no cursor in the text after the book opened (focus: ${first})`)

  // Type in the middle of chapter 2, a little down the desk.
  const p2 = page.locator('.page[data-chapter]').nth(1).locator('.manuscript > p')
  const mid = p2.nth(Math.floor((await p2.count()) / 2))
  await mid.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' LUGAR-MARCADO')
  await page.evaluate(() => document.querySelector('.desk').scrollBy(0, -120))
  await page.waitForTimeout(600)
  const before = await writePlace(page)
  console.log('before Plan:', JSON.stringify(before))
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(600)
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(600)
  const back = await writePlace(page)
  console.log('back in Write:', JSON.stringify(back))
  if (Math.abs(back.top - before.top) > 2) fail(`the desk moved: ${before.top} → ${back.top}`)
  if (back.active !== before.active) fail('another chapter is active')
  if (back.focus !== before.cursor?.chapter || back.cursor?.head !== before.cursor?.head) fail('the cursor is not where it was')
  await page.keyboard.type('X')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(400)
  const undone = await page.evaluate(() => !document.querySelectorAll('.page[data-chapter]')[1].textContent.includes('LUGAR-MARCADO'))
  if (!undone) fail('Ctrl+Z did not undo the typing from before the Plan view')
  await page.keyboard.press('Control+y')
  await page.keyboard.press('Control+y')
  await page.waitForTimeout(800)

  // Close the book and open it again: the place comes back.
  const saved = await writePlace(page)
  await page.evaluate(() => window.__wordelia.book.getState().close())
  await openBook()
  await page.waitForTimeout(1500)
  const reopened = await writePlace(page)
  console.log('reopened:', JSON.stringify({ saved, reopened }))
  if (reopened.view !== 'write' || reopened.active !== saved.active) fail('the book did not open at the chapter of the author')
  if (Math.abs(reopened.top - saved.top) > 40) fail(`the book did not open at the scroll of the author: ${saved.top} → ${reopened.top}`)
  if (reopened.focus !== saved.cursor?.chapter || reopened.cursor?.head !== saved.cursor?.head) fail('the cursor did not come back')
  // The view comes back too.
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__wordelia.book.getState().close())
  await openBook()
  await page.waitForTimeout(800)
  const view = await page.evaluate(() => window.__wordelia.book.getState().view)
  if (view !== 'plan') fail(`the book did not open in the Plan view (${view})`)
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(500)
  console.log('place ok')
}

export default async function ({ page, shot, openBook }) {
  if (process.env.I18N_LANG) {
    await page.evaluate((l) => window.__wordelia.app.getState().updateSettings({ language: l }), process.env.I18N_LANG)
  }
  await openBook()
  await placeChecks(page, openBook)
  const where = () =>
    page.evaluate(() => {
      const s = window.__wordelia.book.getState()
      return { category: s.activeCategory, entry: s.activeEntryId }
    })
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(700)
  if (await page.locator('.plan-back').count()) throw new Error('The overview must not have a back link')
  // From the overview, a section title opens its category.
  await page.locator('.plan-section-link').first().click()
  await page.waitForTimeout(600)
  await shot('category')
  const cat = await where()
  if (!cat.category) throw new Error('No category page')
  // A card opens the entry; its page has "← Characters".
  await page.locator('.entry-card:not(.entry-card-new)').first().click()
  await page.waitForTimeout(700)
  await shot('entry')
  await page.locator('.entry-crumbs .plan-back').hover()
  await page.waitForTimeout(900)
  await shot('entry-back-hover')
  // Alt+← goes to the category, the back link to the overview.
  await page.locator('.plan-desk').click({ position: { x: 20, y: 400 } })
  await page.keyboard.press('Alt+ArrowLeft')
  await page.waitForTimeout(500)
  const up = await where()
  if (up.entry || up.category !== cat.category) throw new Error(`Alt+Left did not go to the category: ${JSON.stringify(up)}`)
  await page.locator('.plan-hero .plan-back').click()
  await page.waitForTimeout(500)
  const top = await where()
  if (top.category || top.entry) throw new Error('The back link did not go to the overview')
  // The Writing rules are no longer a Plan page.
  if (await page.locator('.plan-item', { hasText: /Writing rules|Regras de escrita|Reglas de escritura/ }).count()) throw new Error('Writing rules still in the Plan sidebar')
  await shot('overview')

  // Category rows in the sidebar. The caret, the icon and the name share one middle.
  const fail = (msg) => {
    throw new Error(`Category rows: ${msg}`)
  }
  const offsets = await page.evaluate(() =>
    [...document.querySelectorAll('.plan-cat')].map((row) => {
      const mid = (el) => {
        const b = el.getBoundingClientRect()
        return b.top + b.height / 2
      }
      return mid(row.querySelector('.plan-caret svg')) - mid(row.querySelector('.plan-item-main svg'))
    })
  )
  if (!offsets.length || offsets.some((d) => Math.abs(d) > 0.5)) fail(`the caret is not on the middle of the icon: ${offsets.map((d) => d.toFixed(2)).join(', ')} px`)
  const row = (i) => page.locator('.plan-cat').nth(i)
  const expanded = async (i) => (await row(i).locator('.plan-item-main').getAttribute('aria-expanded')) === 'true'
  const at = async (i, fx) => {
    const box = await row(i).boundingBox()
    await page.mouse.click(box.x + box.width * fx, box.y + box.height / 2)
    await page.waitForTimeout(250)
  }
  const caret = async (i) => {
    await row(i).locator('.plan-caret').click()
    await page.waitForTimeout(250)
  }
  if (await expanded(0)) fail('the first category is open on the overview')
  // A click beside the name (the gap after the caret) shows the category page and its entries.
  const caretBox = await row(0).locator('.plan-caret').boundingBox()
  const rowBox = await row(0).boundingBox()
  await page.mouse.click(caretBox.x + caretBox.width + 4, rowBox.y + rowBox.height / 2)
  await page.waitForTimeout(250)
  const first = await where()
  if (!first.category || first.entry || !(await expanded(0))) fail(`a click beside the name did not open the category: ${JSON.stringify(first)}`)
  // On the page that shows, a click on the row folds the list, and a click in the empty middle of the row unfolds it.
  await row(0).locator('.plan-item-label').click()
  await page.waitForTimeout(250)
  if (await expanded(0)) fail('a click on the name of the open category did not fold it')
  await at(0, 0.62)
  if (!(await expanded(0))) fail('a click in the middle of the row did not unfold it')
  if ((await where()).category !== first.category) fail('a click on the open category changed the page')
  // The caret only folds and unfolds: the page stays.
  await caret(1)
  if (!(await expanded(1)) || (await where()).category !== first.category) fail('the caret of the second category did not only unfold it')
  await caret(1)
  if (await expanded(1)) fail('the caret did not fold the second category')
  // The keyboard: Enter is a click, the arrows unfold and fold. The caret is not a tab stop.
  if ((await row(0).locator('.plan-caret').getAttribute('tabindex')) !== '-1') fail('the caret is a tab stop')
  await row(0).locator('.plan-item-main').focus()
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(200)
  if (await expanded(0)) fail('ArrowLeft did not fold the category')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(200)
  if (!(await expanded(0))) fail('ArrowRight did not unfold the category')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  if (await expanded(0)) fail('Enter on the open category did not fold it')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  // From another page, a click on a category row shows its page and unfolds it.
  await at(2, 0.5)
  const third = await where()
  if (third.category === first.category || !(await expanded(2))) fail(`a click on the third category did not show its page: ${JSON.stringify(third)}`)
  await page.mouse.move(700, 880)
  await page.waitForTimeout(300)
  const nav = await page.locator('.plan-sidebar').boundingBox()
  await shot('category-rows')
  await row(2).hover()
  await page.waitForTimeout(300)
  await page.screenshot({ path: shotPath('category-rows-zoom'), clip: { x: nav.x, y: nav.y, width: nav.width, height: Math.min(nav.height, 420) } })
  console.log(`category rows ok (caret offsets ${offsets.map((d) => d.toFixed(2)).join(', ')} px)`)
  console.log('plan navigation ok')
}
