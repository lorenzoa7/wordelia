// The notes of the Plan view. Notes in a folder under a category and at the root of planning/,
// the keyboard in the sidebar, "In the manuscript" (true counts, the find bar on the name), a
// rename (the links and the mentions follow, the old name stays as an alias, Undo), [[Name#Heading]]
// and [[Name|text]], a plain click and Ctrl+click on a link, "Create it" and "Move to", Alt+← from
// the text, names that a file cannot keep, Esc, duplicate names, a shortcut that leaves the page,
// the portrait, delete and Undo (a note, a category), the natural order of names, the overview
// (counts, a new category, its icon, the sync button with the sidebar hidden, the scroll), the
// import of notes, and a book with no text.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const exists = (p) =>
  access(p).then(
    () => true,
    () => false
  )

export default async function ({ app, page, shot, openBook, book, work }) {
  const fail = (what) => {
    throw new Error(`Plan notes scenario: ${what}`)
  }
  const wait = (fn, arg, what, timeout = 5000) => page.waitForFunction(fn, arg, { timeout }).catch(() => fail(what))
  const note = (name) => page.evaluate((n) => window.__wordelia.book.getState().entries.find((e) => e.name === n) ?? null, name)
  const where = () =>
    page.evaluate(() => {
      const s = window.__wordelia.book.getState()
      return { category: s.activeCategory, entry: s.entries.find((e) => e.id === s.activeEntryId)?.name ?? null, view: s.view }
    })
  const open = async (name) => {
    await page.evaluate((n) => {
      const s = window.__wordelia.book.getState()
      s.selectEntry(s.entries.find((e) => e.name === n).id)
    }, name)
    await page.waitForSelector(`.entry-name`, { timeout: 3000 })
    await wait((n) => document.querySelector('.entry-name')?.value === n, name, `the page of ${name} did not open`)
  }
  const toast = (re) => page.locator('.toast', { hasText: re }).last()
  const closeToasts = async () => {
    for (const b of await page.locator('.toast-close').all()) await b.click({ timeout: 500 }).catch(() => {})
  }
  const rename = async (to) => {
    await page.locator('.entry-name').fill(to)
    await page.locator('.entry-name').press('Enter')
  }

  // Notes in a folder under a category, and at the root of planning/ (other apps make them).
  await mkdir(join(book, 'planning/Characters/Secundarios'), { recursive: true })
  await writeFile(join(book, 'planning/Characters/Secundarios/Pedro.md'), '---\nid: en_pedro\n---\nO pescador do porto.\n')
  await writeFile(join(book, 'planning/Solta.md'), '---\nid: en_solta\n---\nUma ideia solta.\n')
  await openBook()
  await page.keyboard.press('Control+2')
  await page.waitForSelector('.plan-sidebar .plan-cat', { timeout: 5000 })

  // 1. Every note shows: Pedro in Characters, Solta in its own group. The counts are true.
  const characters = page.locator('.plan-group', { has: page.locator('.plan-item-label', { hasText: /^Characters$/ }) })
  await characters.locator('.plan-item-main').click()
  await page.waitForTimeout(200)
  const inCharacters = await characters.locator('.plan-entry').allInnerTexts()
  if (inCharacters.join('|') !== 'Elias|Marta|Pedro') fail(`Characters lists ${inCharacters.join(', ')}`)
  if ((await page.locator('.plan-hero-count').innerText()).trim() !== '3 notes') fail('the category page does not count 3 notes')
  const outside = await page.locator('.plan-outside').count()
  if (!outside || !(await page.locator('.plan-entries .plan-entry', { hasText: 'Solta' }).count())) fail('the note at the root of planning/ is not in the sidebar')
  await page.locator('.plan-hero-tools .icon-btn').last().click()
  await page.locator('.menu .menu-item.is-danger').click()
  const message = await page.locator('.dialog').innerText()
  if (!message.includes('3 notes go')) fail(`the delete dialog says "${message}"`)
  await page.keyboard.press('Escape')
  await page.waitForSelector('.dialog', { state: 'detached' })
  await page.locator('.plan-item-top').click()
  await page.waitForSelector('.plan-section-plain', { timeout: 3000 }).catch(() => fail('the overview has no section for the notes in no category'))
  // An empty category shows no "0", as in the sidebar.
  const counts = await page.locator('.plan-section-link .plan-section-count').allInnerTexts()
  if (counts.includes('0')) fail(`the overview shows ${counts.join(', ')}`)
  await wait(() => [...document.querySelectorAll('.entry-card')].every((c) => getComputedStyle(c).opacity === '1'), null, 'the cards did not show')
  await shot('overview')

  // 2. The keyboard: a category row has two Tab stops (the row and its menu); the menu has New and Import.
  const stops = await page.evaluate(() => [...document.querySelector('.plan-cat').querySelectorAll('button')].filter((b) => b.tabIndex >= 0).length)
  if (stops !== 2) fail(`a category row has ${stops} Tab stops`)
  await page.locator('.plan-cat').first().locator('.plan-item-main').focus()
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
  if (!/^Actions of/.test(focused)) fail(`Tab from a row goes to "${focused}"`)
  await page.keyboard.press('Enter')
  await page.waitForSelector('.menu', { timeout: 2000 })
  const items = await page.locator('.menu .menu-item').allInnerTexts()
  if (!items.some((i) => /New note/.test(i)) || !items.some((i) => /Import notes/.test(i))) fail(`the menu has ${items.join(', ')}`)
  await page.keyboard.press('Escape')

  // 3. "In the manuscript": Elias (alias "Elias" too) counts each mention once. A chip opens the
  // chapter with the find bar on the name, at its first mention.
  await open('Elias')
  const chips = await page.locator('.entry-mentions .mention-link').allInnerTexts()
  console.log(JSON.stringify({ chips }))
  if (chips.length !== 2 || chips.some((c) => !c.includes('×2'))) fail(`the chips are ${chips.join(' | ')}`)
  await page.locator('.entry-mentions .mention-link').first().click()
  await wait(() => document.querySelector('.find-input')?.value === 'Elias', null, 'the find bar did not open with the name')
  await wait(
    () => {
      const ed = window.__wordelia.editor()
      if (!ed) return false
      const { from, to } = ed.state.selection
      const desk = ed.view.dom.closest('.desk')?.getBoundingClientRect()
      const top = ed.view.coordsAtPos(from).top
      return ed.state.doc.textBetween(from, to) === 'Elias' && desk && top >= desk.top && top <= desk.bottom
    },
    null,
    'the chapter does not show the first mention'
  )
  await shot('find-from-note')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+2')

  // 4. A rename: the links in the notes and the mention on the story line take the new name; the
  // summary of Elias still says "Santa Ilha", so the old name stays as an alias. Undo puts it all back.
  await page.evaluate(async () => {
    const s = window.__wordelia.book.getState()
    const elias = s.entries.find((e) => e.name === 'Elias')
    s.restoreEntry(elias.id, `${elias.body}\n\nVive em [[Santa Ilha]], perto de [[Santa Ilha#Descrição]]. Ver [[Marta#Papel]] e [[Marta|ela]]. Falta [[Porto Velho]].\n`, elias.summary)
    await s.createEntry('Plot', 'Linha da história', '# Cards\n- ^c1 @Marta chega a @Santa Ilha.\n\n# By chapter\n## A Tempestade ^k1\n^c1\n', { meta: { type: 'story-line' } })
  })
  await open('Santa Ilha')
  await rename('Ilha de Santa Clara')
  await toast(/3 links now go to the new name/).waitFor({ timeout: 5000 }).catch(() => fail('no toast with the count of links'))
  const renamed = await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const place = s.entries.find((e) => e.id === 'en_sample03')
    return {
      name: place.name,
      file: place.file,
      aliases: place.aliases,
      elias: s.entries.find((e) => e.name === 'Elias').body,
      line: s.entries.find((e) => e.meta?.type === 'story-line').body
    }
  })
  console.log(JSON.stringify(renamed))
  if (renamed.file !== 'Places/Ilha de Santa Clara.md') fail(`the file is ${renamed.file}`)
  if (!renamed.elias.includes('[[Ilha de Santa Clara]]') || !renamed.elias.includes('[[Ilha de Santa Clara#Descrição]]')) fail('the links did not follow')
  if (!renamed.line.includes('@Ilha de Santa Clara')) fail('the mention on the story line did not follow')
  if (!renamed.aliases.includes('Santa Ilha')) fail('the old name is not an alias')
  if (!(await exists(join(book, 'planning/Places/Ilha de Santa Clara.md'))) || (await exists(join(book, 'planning/Places/Santa Ilha.md')))) fail('the file did not get the new name')
  await shot('renamed')

  // 5. In the note of Elias: only the missing note is a missing link; [[Marta|ela]] shows "ela".
  await open('Elias')
  await page.waitForSelector('.entry-body .wiki-link', { timeout: 3000 })
  const links = await page.evaluate(() => ({
    missing: [...document.querySelectorAll('.entry-body .wiki-link.is-missing')].map((e) => e.dataset.wiki),
    alias: [...document.querySelectorAll('.entry-body .wiki-link')].find((e) => e.textContent === 'ela') ? 'ela' : null,
    hidden: [...document.querySelectorAll('.entry-body .wiki-syntax')].every((e) => getComputedStyle(e).display === 'none'),
    title: document.querySelector('.entry-body .wiki-link')?.getAttribute('title') ?? ''
  }))
  console.log(JSON.stringify(links))
  if (links.missing.join('|') !== 'Porto Velho') fail(`missing links: ${links.missing.join(', ')}`)
  if (links.alias !== 'ela' || !links.hidden) fail('[[Marta|ela]] does not show only "ela"')
  if (!/Ctrl\+click/.test(links.title)) fail('a link has no hint')
  await shot('links')
  // A plain click puts the caret in the link; Ctrl+click opens the note.
  await page.locator('.entry-body .wiki-link[data-wiki="Ilha de Santa Clara"]').first().click()
  await page.waitForTimeout(200)
  if ((await where()).entry !== 'Elias') fail('a plain click on a link left the note')
  await page.locator('.entry-body .wiki-link[data-heading="Papel"]').click({ modifiers: ['Control'] })
  await wait(() => document.querySelector('.entry-name')?.value === 'Marta', null, '[[Marta#Papel]] did not open Marta')
  await open('Elias')

  // Undo of the rename.
  await open('Ilha de Santa Clara')
  await toast(/3 links now go/).locator('.toast-action').click()
  await wait(
    () => {
      const s = window.__wordelia.book.getState()
      const place = s.entries.find((e) => e.id === 'en_sample03')
      return place.name === 'Santa Ilha' && !place.aliases.includes('Santa Ilha') && s.entries.find((e) => e.name === 'Elias').body.includes('[[Santa Ilha]]') && s.entries.find((e) => e.meta?.type === 'story-line').body.includes('@Santa Ilha')
    },
    null,
    'Undo did not put the rename back'
  )
  await closeToasts()

  // 6. "Create it" on a missing link: the new note goes to the category of the note of the link.
  // Its category control moves it.
  await open('Elias')
  await page.locator('.entry-body .wiki-link[data-wiki="Porto Velho"]').click({ modifiers: ['Control'] })
  await toast(/No note is called/).locator('.toast-action').click()
  await wait(() => document.querySelector('.entry-name')?.value === 'Porto Velho', null, 'Create it did not open the new note')
  if ((await note('Porto Velho')).category !== 'Characters') fail('the new note is not in the category of Elias')
  await page.locator('.entry-category').click()
  await page.locator('.menu .menu-item', { hasText: 'Places' }).click()
  await wait(() => window.__wordelia.book.getState().entries.find((e) => e.name === 'Porto Velho')?.category === 'Places', null, 'Move to did not move the note')
  await shot('moved')

  // 7. Alt+← from the text of the note goes back.
  await page.locator('.entry-body .note-text').click()
  await page.keyboard.press('Alt+ArrowLeft')
  await wait(() => document.querySelector('.entry-name')?.value === 'Elias', null, 'Alt+Left in the text did not go back')

  // 8. Names: signs that a file cannot have stay in the name; Esc puts the name back; a name of
  // signs only gets a file name in the language of the interface; the name of another note is refused.
  await open('Porto Velho')
  await rename('Dr. Silva: o médico?')
  await wait(() => window.__wordelia.book.getState().entries.some((e) => e.name === 'Dr. Silva: o médico?'), null, 'the name lost its signs')
  const silva = await note('Dr. Silva: o médico?')
  if (silva.file !== 'Places/Dr. Silva o médico.md') fail(`the file is ${silva.file}`)
  const onDisk = await readFile(join(book, 'planning/Places/Dr. Silva o médico.md'), 'utf8')
  if (!onDisk.includes('title: "Dr. Silva: o médico?"')) fail('the name is not in the front matter')
  await page.locator('.entry-name').fill('Outro nome')
  await page.locator('.entry-name').press('Escape')
  await page.waitForTimeout(200)
  if ((await page.locator('.entry-name').inputValue()) !== 'Dr. Silva: o médico?' || !(await note('Dr. Silva: o médico?'))) fail('Esc did not put the name back')
  await rename('Marta')
  await toast(/Another note is already called/).waitFor({ timeout: 3000 }).catch(() => fail('no warning for the name of another note'))
  await wait(() => document.querySelector('.entry-name')?.value === 'Dr. Silva: o médico?', null, 'the refused name stays in the box')
  await page.locator('.alias-input').fill('Elias')
  await page.locator('.alias-input').press('Enter')
  await toast(/is already a name of Elias/).waitFor({ timeout: 3000 }).catch(() => fail('no warning for an alias of another note'))
  if ((await note('Dr. Silva: o médico?')).aliases.length) fail('the alias of another note was added')

  // 9. A shortcut leaves the page: the typed name, and the typed alias, still save.
  await page.locator('.entry-name').fill('Silva')
  await page.keyboard.press('Control+1')
  await wait(() => window.__wordelia.book.getState().entries.some((x) => x.name === 'Silva'), null, 'the typed name was lost with Ctrl+1')
  await page.keyboard.press('Control+2')
  await open('Silva')
  await page.locator('.alias-input').fill('o médico')
  await page.keyboard.press('Control+1')
  await wait(() => window.__wordelia.book.getState().entries.find((x) => x.name === 'Silva')?.aliases.includes('o médico'), null, 'the typed alias was lost with Ctrl+1')
  await page.keyboard.press('Control+2')
  await closeToasts()

  // 10. The portrait: Remove, and Undo.
  await mkdir(join(book, 'planning', '_assets'), { recursive: true })
  await writeFile(join(book, 'planning', '_assets', 'silva.png'), await readFile('resources/icon.png'))
  await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    s.updateEntry(s.entries.find((e) => e.name === 'Silva').id, { image: '_assets/silva.png' })
  })
  await open('Silva')
  await page.locator('.entry-portrait').hover()
  await page.locator('.entry-portrait-remove').click()
  if ((await note('Silva')).image !== null) fail('Remove did not remove the portrait')
  await toast(/portrait is removed/).locator('.toast-action').click()
  await wait(() => window.__wordelia.book.getState().entries.find((e) => e.name === 'Silva')?.image === '_assets/silva.png', null, 'Undo did not put the portrait back')

  // 11. Delete a note, and Undo: the file comes back from the trash.
  await page.locator('.entry-tools .icon-btn').last().click()
  await page.locator('.dialog .dialog-foot .btn-ribbon').click()
  await wait(() => !window.__wordelia.book.getState().entries.some((e) => e.name === 'Silva'), null, 'the note was not deleted')
  if (await exists(join(book, 'planning/Places/Silva.md'))) fail('the file of the deleted note stays')
  await toast(/is in the trash/).locator('.toast-action').click()
  await wait(() => window.__wordelia.book.getState().entries.some((e) => e.name === 'Silva'), null, 'Undo did not bring the note back')
  if (!(await exists(join(book, 'planning/Places/Silva.md')))) fail('Undo did not bring the file back')

  // 12. Delete a category with its notes, and Undo.
  const places = page.locator('.plan-cat', { has: page.locator('.plan-item-label', { hasText: /^Places$/ }) })
  await places.hover()
  await places.locator('.plan-item-add button').last().click()
  await page.locator('.menu .menu-item.is-danger').click()
  await page.locator('.dialog .dialog-foot .btn-ribbon').click()
  await wait(() => !window.__wordelia.book.getState().manifest.planning.categories.some((c) => c.folder === 'Places'), null, 'the category was not deleted')
  await toast(/Places.*is deleted/).locator('.toast-action').click()
  await wait(
    () => {
      const s = window.__wordelia.book.getState()
      return s.manifest.planning.categories[1]?.folder === 'Places' && ['Santa Ilha', 'Silva'].every((n) => s.entries.some((e) => e.name === n && e.category === 'Places'))
    },
    null,
    'Undo did not bring the category and its notes back'
  )
  if (!(await exists(join(book, 'planning/Places/Santa Ilha.md')))) fail('the files of the category did not come back')
  await closeToasts()

  // 13. The natural order of names, and the scroll of the overview.
  await page.evaluate(async () => {
    const s = window.__wordelia.book.getState()
    for (const n of ['Nota 10', 'Nota 2', 'Nota 100']) await s.createEntry('Notes', n)
    for (let i = 0; i < 36; i++) await s.createEntry('World', `Lugar ${i + 1}`)
    s.selectCategory(null)
  })
  const notesRow = page.locator('.plan-group', { has: page.locator('.plan-item-label', { hasText: /^Notes$/ }) })
  await notesRow.locator('.plan-item-main').click()
  await page.waitForTimeout(200)
  const order = await notesRow.locator('.plan-entry').allInnerTexts()
  if (order.join('|') !== 'Nota 2|Nota 10|Nota 100') fail(`the order is ${order.join(', ')}`)
  await page.locator('.plan-item-top').click()
  await page.waitForSelector('.plan-section-title', { timeout: 3000 })
  await page.locator('.plan-scroll').evaluate((el) => el.scrollTo({ top: 1600 }))
  await wait(() => document.querySelector('.plan-scroll').scrollTop === 1600, null, 'the overview did not scroll')
  const top = await page.locator('.plan-scroll').evaluate((el) => el.scrollTop)
  const card = page.locator('.entry-card', { hasText: 'Lugar 30' })
  await card.scrollIntoViewIfNeeded()
  const scrolled = await page.locator('.plan-scroll').evaluate((el) => el.scrollTop)
  await card.click()
  await page.waitForSelector('.entry-name', { timeout: 3000 })
  await page.keyboard.press('Alt+ArrowLeft')
  await page.waitForSelector('.plan-section-title', { timeout: 3000 })
  const back = await page.locator('.plan-scroll').evaluate((el) => el.scrollTop)
  console.log(JSON.stringify({ top, scrolled, back }))
  if (Math.abs(back - scrolled) > 2) fail(`the overview came back at ${back}, not ${scrolled}`)

  // 14. A new category opens; its menu changes its icon; a name of a category is refused.
  await page.locator('.sidebar-add').click()
  await page.locator('.dialog input').fill('Objetos')
  await page.keyboard.press('Enter')
  await wait(() => window.__wordelia.book.getState().activeCategory === 'Objetos', null, 'the new category did not open')
  await page.locator('.plan-hero-tools .icon-btn').last().click()
  await page.locator('.menu .category-icon-item[data-icon="Key"]').click()
  await wait(() => window.__wordelia.book.getState().manifest.planning.categories.find((c) => c.folder === 'Objetos')?.icon === 'Key', null, 'the icon did not change')
  await page.locator('.sidebar-add').click()
  await page.locator('.dialog input').fill('characters')
  await page.keyboard.press('Enter')
  await toast(/A category is already called/).waitFor({ timeout: 3000 }).catch(() => fail('no warning for the name of another category'))
  await shot('new-category')

  // 15. With the sidebar hidden, the overview has the sync button.
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ sidebarOpen: false }))
  await page.evaluate(() => window.__wordelia.book.getState().selectCategory(null))
  await page.waitForSelector('.plan-hero .sync-btn.is-compact', { timeout: 3000 }).catch(() => fail('no sync button with the sidebar hidden'))
  // The panel closes with a motion of its width; the screenshot waits for its end.
  await wait(() => (document.querySelector('.book-sidebar')?.getBoundingClientRect().width ?? 0) < 1, null, 'the sidebar did not close')
  await page.locator('.plan-scroll').evaluate((el) => el.scrollTo({ top: 0 }))
  await wait(() => [...document.querySelectorAll('.entry-card')].slice(0, 8).every((c) => getComputedStyle(c).opacity === '1'), null, 'the cards did not show')
  await shot('sync-no-sidebar')
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ sidebarOpen: true }))
  await closeToasts()

  // 16. Import: a taken name gets " 2" and the toast says so; the tags stay; an embed of a note
  // becomes a link, an embed of an image goes without a loose space; files after the limit are named.
  const dir = join(work, 'import')
  await mkdir(dir, { recursive: true })
  const files = []
  const put = async (name, text) => {
    const p = join(dir, name)
    await writeFile(p, text)
    files.push(p)
  }
  await put('Elias.md', 'Outro Elias.\n')
  await put('Nova.md', '---\ntags: [personagem, farol]\n---\nVeja ![[Marta]] e ![[mapa.png]].\n')
  for (let i = 0; i < 4; i++) await put(`Extra ${i + 1}.md`, 'Texto.\n')
  // A limit of 4 files (200 in the app): the last 2 files are not read.
  await app.evaluate(({ dialog }, paths) => {
    process.env.WORDELIA_IMPORT_MAX = '4'
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths })
  }, files)
  await page.evaluate(() => window.__wordelia.book.getState().selectCategory('Characters'))
  await page.locator('.plan-hero-tools button', { hasText: 'Import notes' }).click()
  const imported = toast(/Imported 4 notes into Characters/)
  await imported.waitFor({ timeout: 10000 }).catch(() => fail('no toast after the import'))
  const said = await imported.innerText()
  console.log(said)
  if (!/“Elias” is now “Elias 2”/.test(said) || !/2 files were not imported: the limit is 4 files/.test(said)) fail(`the import toast says "${said}"`)
  const nova = await note('Nova')
  if (JSON.stringify(nova?.meta?.tags) !== '["personagem","farol"]') fail(`the tags are ${JSON.stringify(nova?.meta)}`)
  if (nova.body.trim() !== 'Veja [[Marta]] e.') fail(`the body is "${nova.body}"`)
  await shot('imported')

  // 17. A book with no text: no "Build the planning from the manuscript". With text, it shows.
  const empty = join(work, 'books', 'Vazio')
  await mkdir(join(empty, 'manuscript'), { recursive: true })
  const manifest = JSON.parse(await readFile(join(book, 'wordelia.json'), 'utf8'))
  manifest.id = 'bk_empty'
  manifest.title = 'Vazio'
  manifest.chapters = [{ id: 'ch_e1', file: 'Capitulo 1.md' }]
  await writeFile(join(empty, 'wordelia.json'), JSON.stringify(manifest))
  await writeFile(join(empty, 'manuscript', 'Capitulo 1.md'), '---\nid: ch_e1\ntitle: Capítulo 1\n---\n')
  await page.evaluate((p) => window.__wordelia.openBook(p), empty)
  await page.waitForSelector('.manuscript', { timeout: 10000 })
  await page.keyboard.press('Control+2')
  await page.waitForSelector('.plan-hero', { timeout: 3000 })
  if (await page.locator('.plan-hero-actions .btn-ribbon').count()) fail('a book with no text offers to build the planning')
  await page.evaluate(() => window.__wordelia.book.getState().setChapterBody('ch_e1', 'Elias acende a lâmpada.'))
  await page.waitForSelector('.plan-hero-actions .btn-ribbon', { timeout: 3000 }).catch(() => fail('a book with text does not offer to build the planning'))
  console.log('plan notes ok')
}
