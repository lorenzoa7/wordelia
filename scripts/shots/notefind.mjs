// Find in a note of the Plan view (Ctrl+F). The find bar searches the open note only: the count, the
// marks of all the matches and of the current match, Enter and Shift+Enter, the arrow buttons, the
// scroll to a match far down the note (a match on screen does not move the note), the place of the bar
// (it covers no tool at the top of the note), Esc (the cursor at the match, the focus in the note, no
// scroll), a selection that fills the box, Ctrl+H with Replace and Replace all (each one undo step; Esc
// after Replace all), and no "Replace in all chapters". Ctrl+F on a Plan page with no note (the
// overview, a category, the map, the story line) does nothing; in the Write view it still opens the
// find bar of the chapters.

/** The body of the note of Elias: long enough for a scroll, with "farol" 7 times, far apart. */
function longBody() {
  const lines = ['## Papel', '', 'O protagonista. Cuida do farol e conhece cada barco do porto.', '']
  const far = new Set([14, 20, 26, 32, 38, 44])
  for (let i = 1; i <= 46; i++) {
    const p = `Parágrafo ${i}. Elias desce a escada de pedra e conta os degraus; Marta espera no cais de Santa Ilha com o caderno aberto, e o vento do norte vira as páginas.`
    lines.push(far.has(i) ? `${p} Lá em cima, o farol pisca duas vezes.` : p, '')
  }
  return lines.join('\n')
}

export default async function ({ page, shot, openBook }) {
  const fail = (what) => {
    throw new Error(`Note find scenario: ${what}`)
  }
  const wait = (fn, arg, what, timeout = 5000) => page.waitForFunction(fn, arg, { timeout }).catch(() => fail(what))
  const frames = (n = 3) => page.evaluate((k) => new Promise((resolve) => (function step(i) { if (i) requestAnimationFrame(() => step(i - 1)); else resolve() })(k)), n)
  const noteBar = '.book-pane-plan .find-bar'
  const writeBar = '.book-pane-write .find-bar'
  /** The note page: the find bar, the marks, the scroll, the cursor and the focus. */
  const state = () =>
    page.evaluate(() => {
      const ed = document.querySelector('.entry-body .ProseMirror')?.editor
      const scroll = document.querySelector('.plan-scroll')
      const hits = [...document.querySelectorAll('.entry-body .find-hit')]
      const cur = document.querySelector('.entry-body .find-hit.is-current')
      const box = scroll?.getBoundingClientRect()
      const r = cur?.getBoundingClientRect()
      const { from, to } = ed.state.selection
      const text = ed.state.doc.textContent
      return {
        count: document.querySelector('.book-pane-plan .find-count')?.textContent ?? null,
        hits: hits.length,
        current: cur ? hits.indexOf(cur) : -1,
        currentText: cur?.textContent ?? null,
        currentPos: cur ? ed.view.posAtDOM(cur, 0) : -1,
        onScreen: Boolean(r && box && r.top >= box.top && r.bottom <= box.bottom),
        top: Math.round(scroll.scrollTop),
        selection: ed.state.doc.textBetween(from, to),
        from,
        farol: text.match(/farol/g)?.length ?? 0,
        torre: text.match(/torre/g)?.length ?? 0,
        focusInNote: Boolean(document.activeElement?.closest('.entry-body .ProseMirror')),
        box: document.activeElement?.matches('.book-pane-plan .find-input') ? document.activeElement.value : null
      }
    })
  /** The scroll of the note page does not move for 5 frames and 200 ms: a smooth scroll is over. */
  const settled = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const el = document.querySelector('.plan-scroll')
          let last = el.scrollTop
          let since = performance.now()
          let same = 0
          ;(function step() {
            if (el.scrollTop !== last) {
              last = el.scrollTop
              since = performance.now()
              same = 0
            } else same++
            if (same >= 5 && performance.now() - since >= 200) resolve()
            else requestAnimationFrame(step)
          })()
        })
    )
  /** The current match is on the screen of the note page, and the scroll to it is over. */
  const onScreen = async (what) => {
    await wait(
      () => {
        const cur = document.querySelector('.entry-body .find-hit.is-current')?.getBoundingClientRect()
        const box = document.querySelector('.plan-scroll').getBoundingClientRect()
        return cur && cur.top >= box.top && cur.bottom <= box.bottom
      },
      null,
      `${what} did not come on screen`
    )
    await settled()
  }
  /** A screenshot after the note page and the find bars come in (their movement is not CSS: it runs in the scenarios too). */
  const still = async (name) => {
    await wait(
      () =>
        [...document.querySelectorAll('.entry-page, .find-bar')].every((el) => {
          const cs = getComputedStyle(el)
          return cs.opacity === '1' && cs.transform === 'none'
        }),
      null,
      `the page did not come to rest for the screenshot ${name}`
    )
    await shot(name)
  }
  const noBar = async (where) => {
    await page.keyboard.press('Control+f')
    await frames()
    const bars = await page.locator('.find-bar').count()
    if (bars) fail(`Ctrl+F on ${where} opened a find bar`)
  }

  await openBook()
  await page.keyboard.press('Control+2')
  await page.waitForSelector('.plan-sidebar .plan-cat', { timeout: 5000 })

  // 1. Ctrl+F on a page with no note does nothing: the overview, a category, the map, the story line.
  await noBar('the overview')
  const characters = page.locator('.plan-group', { has: page.locator('.plan-item-label', { hasText: /^Characters$/ }) })
  await characters.locator('.plan-item-main').click()
  await page.waitForSelector('.plan-hero-count', { timeout: 3000 })
  await noBar('a category page')
  await page.evaluate(() => window.__wordelia.book.getState().selectCategory(':map'))
  await page.waitForSelector('.map-wrap', { timeout: 3000 })
  await noBar('the map')
  await page.evaluate(() => window.__wordelia.book.getState().selectCategory(':line'))
  await page.waitForSelector('.line-head', { timeout: 3000 })
  await noBar('the story line')

  // 2. A long note. Ctrl+F opens the find bar of the note, with the focus in its box.
  await page.evaluate((body) => {
    const s = window.__wordelia.book.getState()
    const elias = s.entries.find((e) => e.name === 'Elias')
    s.updateEntry(elias.id, { body })
    s.selectEntry(elias.id)
  }, longBody())
  await wait(() => document.querySelector('.entry-body .ProseMirror')?.textContent.includes('Parágrafo 46.'), null, 'the long note did not open')
  await page.keyboard.press('Control+f')
  await page.waitForSelector(noteBar, { timeout: 3000 }).catch(() => fail('Ctrl+F in a note opened no find bar'))
  await wait(() => document.activeElement?.matches('.book-pane-plan .find-input'), null, 'the box of the find bar has no focus')

  // 3. A word that the note has 7 times: the count, a mark on each match, the first one current.
  await page.keyboard.type('farol')
  await wait(() => document.querySelector('.book-pane-plan .find-count')?.textContent === '1/7', null, 'the count is not 1/7')
  let s = await state()
  console.log('search:', JSON.stringify(s))
  if (s.hits !== 7 || s.current !== 0 || s.currentText !== 'farol') fail(`the marks are ${s.hits}, the current one is ${s.current} ("${s.currentText}")`)
  // Only the note: no list of other chapters, and no marks in the chapters under the Plan view.
  if (await page.locator(`${noteBar} .find-others`).count()) fail('the find bar of a note lists other chapters')
  if (await page.locator('.book-pane-write .find-hit').count()) fail('the search of the note marks the chapters')
  // A match in the middle part of the page does not move the note. At the top of the note, the bar is in the
  // margin above the page: it covers no tool of the page.
  await settled()
  const cover = await page.evaluate(() => {
    const bar = document.querySelector('.book-pane-plan .find-bar').getBoundingClientRect()
    const tools = document.querySelector('.entry-crumbs').getBoundingClientRect()
    return { bar: bar.bottom, tools: tools.top, top: document.querySelector('.plan-scroll').scrollTop }
  })
  if (cover.top !== 0) fail(`the first match, on screen, scrolled the note to ${cover.top}`)
  if (cover.bar > cover.tools + 1) fail(`the find bar covers the tools of the note (${JSON.stringify(cover)})`)
  await still('search')

  // 4. Enter goes to the next match, far down the note, and brings it on screen.
  await page.keyboard.press('Enter')
  await wait(() => document.querySelector('.book-pane-plan .find-count')?.textContent === '2/7', null, 'Enter did not go to match 2')
  await onScreen('match 2')
  s = await state()
  console.log('Enter:', JSON.stringify(s))
  if (s.current !== 1 || !s.onScreen || s.top <= 0) fail(`after Enter the current mark is ${s.current}, on screen: ${s.onScreen}, scroll: ${s.top}`)
  await still('next')

  // Shift+Enter goes back; the arrow buttons go too, and Enter again.
  await page.keyboard.press('Shift+Enter')
  await wait(() => document.querySelector('.book-pane-plan .find-count')?.textContent === '1/7', null, 'Shift+Enter did not go back to match 1')
  await page.locator(`${noteBar} .find-nav`).last().click()
  await wait(() => document.querySelector('.book-pane-plan .find-count')?.textContent === '2/7', null, 'the Next button did not go to match 2')
  await page.locator(`${noteBar} .find-input`).first().press('Enter')
  await wait(() => document.querySelector('.book-pane-plan .find-count')?.textContent === '3/7', null, 'Enter did not go to match 3')
  await onScreen('match 3')
  const before = await state()
  if (before.current !== 2 || !before.onScreen) fail(`match 3 is not on screen (${JSON.stringify(before)})`)

  // 5. Esc closes the bar: the cursor is on the match, the focus is in the note, and the note does not scroll.
  await page.keyboard.press('Escape')
  await page.waitForSelector(noteBar, { state: 'detached', timeout: 3000 }).catch(() => fail('Esc did not close the find bar'))
  await frames(6)
  s = await state()
  console.log('Esc:', JSON.stringify(s))
  if (!s.focusInNote) fail('after Esc the focus is not in the note')
  if (s.selection !== 'farol' || s.from !== before.currentPos) fail(`after Esc the cursor is at ${s.from} ("${s.selection}"), not at the match (${before.currentPos})`)
  if (Math.abs(s.top - before.top) > 1) fail(`Esc scrolled the note: ${before.top} → ${s.top}`)
  if (s.hits) fail('the marks stay after Esc')
  const where = await page.evaluate(() => window.__wordelia.book.getState().entries.find((e) => e.id === window.__wordelia.book.getState().activeEntryId)?.name)
  if (where !== 'Elias') fail(`after Esc the page is ${where}`)

  // 6. A selection in the note fills the box: "Santa Ilha" in paragraph 1.
  await page.evaluate(() => {
    const ed = document.querySelector('.entry-body .ProseMirror').editor
    let at = -1
    ed.state.doc.descendants((node, pos) => {
      if (at >= 0 || !node.isText) return at < 0
      const i = node.text.indexOf('Santa Ilha')
      if (i >= 0) at = pos + i
      return false
    })
    ed.commands.setTextSelection({ from: at, to: at + 'Santa Ilha'.length })
  })
  await page.keyboard.press('Control+f')
  await page.waitForSelector(noteBar, { timeout: 3000 }).catch(() => fail('Ctrl+F did not open the find bar again'))
  await wait(() => document.activeElement?.matches('.book-pane-plan .find-input') && document.activeElement.value === 'Santa Ilha', null, 'the selection did not fill the box')
  await wait(() => document.querySelector('.book-pane-plan .find-count')?.textContent === '1/46', null, 'the search of the selection does not start at it')
  await page.keyboard.press('Escape')
  await page.waitForSelector(noteBar, { state: 'detached', timeout: 3000 })

  // 7. Ctrl+H: Replace and Replace all in the note, each one undo step. No "Replace in all chapters".
  await page.keyboard.press('Control+h')
  await page.waitForSelector(`${noteBar} .find-row:nth-child(2)`, { timeout: 3000 }).catch(() => fail('Ctrl+H did not show the replace row'))
  if (await page.locator(`${noteBar} .find-row-all, ${noteBar} .find-link-btn`).count()) fail('the find bar of a note has "Replace in all chapters"')
  await page.locator(`${noteBar} .find-input`).first().fill('farol')
  await page.locator(`${noteBar} .find-input`).nth(1).fill('torre')
  await wait(() => document.querySelector('.book-pane-plan .find-count')?.textContent === '2/7', null, 'the search after "Santa Ilha" does not start at match 2')
  await onScreen('match 2 of the replace')
  await still('replace')
  await page.locator(`${noteBar} .find-text-btn`).first().click()
  await wait(() => document.querySelector('.book-pane-plan .find-count')?.textContent === '2/6', null, 'Replace did not go on to the next match')
  s = await state()
  if (s.farol !== 6 || s.torre !== 1) fail(`after Replace the note has farol ${s.farol}, torre ${s.torre}`)
  await page.locator(`${noteBar} .find-text-btn`).nth(1).click()
  await wait(() => document.querySelector('.entry-body .ProseMirror').textContent.match(/torre/g)?.length === 7, null, 'Replace all did not replace the 6 matches')
  // The note saves: the store has the new text.
  await wait(() => {
    const s = window.__wordelia.book.getState()
    const body = s.entries.find((e) => e.name === 'Elias').body
    return !body.includes('farol') && body.match(/torre/g)?.length === 7
  }, null, 'the note did not save the replace')
  await page.keyboard.press('Escape')
  await page.waitForSelector(noteBar, { state: 'detached', timeout: 3000 })
  await wait(() => document.activeElement?.closest('.entry-body .ProseMirror'), null, 'after Replace all and Esc the focus is not in the note')
  await page.keyboard.press('Control+z')
  await wait(() => document.querySelector('.entry-body .ProseMirror').textContent.match(/farol/g)?.length === 6, null, 'one Ctrl+Z did not undo Replace all')
  await page.keyboard.press('Control+z')
  await wait(() => document.querySelector('.entry-body .ProseMirror').textContent.match(/farol/g)?.length === 7, null, 'a second Ctrl+Z did not undo Replace')
  await wait(() => window.__wordelia.book.getState().entries.find((e) => e.name === 'Elias').body.match(/farol/g)?.length === 7, null, 'the note did not save the undo')

  // 8. The Write view: Ctrl+F still opens the find bar of the chapters, with "Replace in all chapters".
  await page.keyboard.press('Control+1')
  await wait(() => window.__wordelia.book.getState().view === 'write' && !document.querySelector('.book-pane-plan'), null, 'Ctrl+1 did not go to the Write view')
  await page.keyboard.press('Control+f')
  await page.waitForSelector(writeBar, { timeout: 3000 }).catch(() => fail('Ctrl+F in the Write view opened no find bar'))
  await wait(() => document.activeElement?.matches('.book-pane-write .find-input'), null, 'the box of the chapter find bar has no focus')
  await page.keyboard.press('Control+h')
  await page.waitForSelector(`${writeBar} .find-row-all`, { timeout: 3000 }).catch(() => fail('Ctrl+H in the Write view has no "Replace in all chapters"'))
  await page.locator(`${writeBar} .find-input`).first().fill('farol')
  await wait(() => /^\d+\/\d+$/.test(document.querySelector('.book-pane-write .find-count')?.textContent ?? ''), null, 'the chapter find bar has no count')
  await still('write')
  await page.keyboard.press('Escape')
  await page.waitForSelector(writeBar, { state: 'detached', timeout: 3000 }).catch(() => fail('Esc did not close the chapter find bar'))
}
