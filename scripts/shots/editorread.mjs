// The editor's read: the author starts it from the toolbar or from an offer in the chat, it runs as a
// chat message in the thread of its chapter, and the comments of the reply go into the comment store.
// Usage: node scripts/shot.mjs editorread   (READ_LANG=pt-BR or es for another interface language)
export default async function ({ app, page, shot, openBook }) {
  if (process.env.READ_LANG) {
    await page.evaluate((l) => window.__wordelia.app.getState().updateSettings({ language: l }), process.env.READ_LANG)
    await page.waitForTimeout(300)
  }
  const fail = (what) => {
    throw new Error(`Editor's read scenario: ${what}`)
  }
  const slow = (ms) => app.evaluate((_e, v) => (process.env.WORDELIA_MOCK_DELAY = String(v)), ms)
  const threads = () => page.evaluate(() => window.__wordelia.book.getState().threads)
  const comments = () => page.evaluate(() => window.__wordelia.comments.getState().list)
  const idle = () => page.waitForSelector('.composer-send:not(.is-stop)', { timeout: 30000 })
  const streaming = () => page.evaluate(() => Object.values(window.__wordelia.chat.getState().streaming).some(Boolean))
  const until = async (what, check, ms = 20000) => {
    for (let i = 0; i < ms / 100; i++) {
      if (await check()) return
      await page.waitForTimeout(100)
    }
    fail(what)
  }
  const readThreads = async () => (await threads()).filter((t) => t.readChapterId === 'ch_sample01')
  const openPopover = async () => {
    await page.locator('.toolbar').getByRole('button', { name: /^(Editor's read|Leitura de editor|Lectura de editor)$/ }).click()
    await page.waitForSelector('.read-pop[data-state="open"]', { timeout: 5000 })
  }
  // The popover is closed: gone, or on its way out (its exit animation takes no time here, but its event can come late).
  const closed = () => page.waitForFunction(() => !document.querySelector('.read-pop[data-state="open"]'), null, { timeout: 5000 })
  const selectParagraph = (start) =>
    page.evaluate((text) => {
      const ed = window.__wordelia.editor()
      let range = null
      ed.state.doc.descendants((node, pos) => {
        if (!range && node.isTextblock && node.textContent.startsWith(text)) range = { from: pos + 1, to: pos + 1 + node.content.size }
      })
      ed.chain().focus().setTextSelection(range).run()
    }, start)

  const passageOf = async (id) => (await comments()).find((c) => c.id === id)
  const rangeOf = (id) =>
    page.evaluate((i) => {
      const r = window.__commentMarks.commentRanges('ch_sample01').get(i)
      return r ? { from: r.from, to: r.to } : null
    }, id)
  const select = (sel) => page.evaluate((s) => window.__wordelia.editor().chain().focus().setTextSelection(s).run(), sel)
  const card = (id) => page.locator(`.cm-column .cm-card[data-comment="${id}"]`)
  // "Discuss in chat" puts the cursor in the composer a moment later (focusComposer). A test window is hidden,
  // so that can come late: wait for it, or it takes the focus from what the next step opens.
  const composerFocused = () => page.evaluate(() => Boolean(document.activeElement?.closest('.composer-input')))
  // Some frames of the page: a change that would happen shows by then.
  const frames = (n = 2) => page.evaluate((k) => new Promise((resolve) => (function step(i) { if (i) requestAnimationFrame(() => step(i - 1)); else resolve() })(k)), n)

  await openBook()
  // The last chapter of the book is a chapter in progress, by default.
  await page.locator('.page[data-chapter="ch_sample02"] p').first().click()
  await openPopover()
  if (!/O Visitante/.test(await page.locator('.read-pop').innerText())) fail('the popover does not name the second chapter')
  if ((await page.locator('.read-pop [role="switch"]').getAttribute('aria-checked')) !== 'true') fail('"in progress" is off for the last chapter')
  await page.keyboard.press('Escape')
  await closed()
  // The cursor is in the first chapter, and the chat is closed: a read opens it.
  await page.locator('.page[data-chapter="ch_sample01"] p').first().click()
  await page.keyboard.press('Control+l')
  await page.waitForTimeout(400)
  if (await page.evaluate(() => window.__wordelia.app.getState().settings.ui.chatOpen)) fail('the chat did not close')

  // 1. The glasses button of the toolbar opens the popover: the chapter, the lens, "in progress", "Read".
  await openPopover()
  const pop = await page.locator('.read-pop').innerText()
  console.log('popover:', JSON.stringify(pop))
  if (!/A Tempestade/.test(pop)) fail('the popover does not name the chapter')
  if (await page.locator('.read-pop [role="radio"][aria-checked="true"]').first().innerText().then((x) => !/All lenses|Todos os olhares|Todas las miradas/.test(x))) fail('"All lenses" is not the default')
  // No selection: the popover reads the chapter and does not offer the selection.
  if (await page.locator('.read-pop-scope').count()) fail('the popover offers a selection that does not exist')
  // The chapter is not the last of the book: "in progress" is off.
  if (await page.locator('.read-pop [role="switch"]').getAttribute('aria-checked') !== 'false') fail('"in progress" is on for a chapter that is not the last')
  await shot('popover')

  // 2. "Read" runs the read in the thread of the chapter. The reply streams; the button is off meanwhile.
  await slow(70)
  await page.locator('.read-pop .read-pop-run').click()
  await until('the chat did not open', () => page.evaluate(() => window.__wordelia.app.getState().settings.ui.chatOpen))
  await until('the reply did not start', streaming)
  let list = await readThreads()
  if (list.length !== 1) fail(`one read thread was expected, got ${list.length}`)
  if (list[0].messages.length !== 1) fail('the read thread has no author message while the reply streams')
  const asked = list[0].messages[0]
  console.log('the message:', JSON.stringify({ content: asked.content, read: asked.read }))
  if (asked.read?.chapterId !== 'ch_sample01' || asked.read?.lens !== 'all' || asked.read?.inProgress !== false || asked.read?.selection) fail(`the read request is wrong: ${JSON.stringify(asked.read)}`)
  // A second start while the thread streams does nothing: not from the code, not from the popover.
  await page.evaluate(() => window.__wordelia.startRead({ chapterId: 'ch_sample01', lens: 'all', inProgress: false }))
  await openPopover()
  if (!(await page.locator('.read-pop .read-pop-run').isDisabled())) fail('"Read" is on while the read streams')
  await shot('popover-while-reading')
  await page.keyboard.press('Escape')
  await closed()
  await page.waitForSelector('.msg-ai .read-head', { timeout: 10000 })
  await shot('streaming')
  await idle()
  list = await readThreads()
  if (list[0].messages.length !== 2) fail(`the thread must hold the message and its reply, it holds ${list[0].messages.length}`)
  const title = await page.locator('.chat-title').innerText()
  if (!/^(Read|Leitura|Lectura) · A Tempestade$/.test(title.trim())) fail(`the thread title is "${title}"`)
  await until('the comments of the reply did not come', async () => (await comments()).length === 3)
  const first = (await comments()).filter((c) => c.chapterId === 'ch_sample01')
  console.log('comments:', JSON.stringify(first.map((c) => [c.lens, c.rank, c.passage])))
  if (first.map((c) => c.lens).join() !== 'style,structure,continuity') fail(`the lenses of the comments are ${first.map((c) => c.lens)}`)
  if (!first.every((c) => c.threadId === list[0].id && c.messageId === list[0].messages[1].id && c.state === 'open')) fail('the comments do not point to the read reply')
  const reply = await page.locator('.msg-ai').last().innerText()
  if (!/O que funciona|What works/.test(reply)) fail('the letter is not in the reply')
  if (/<note|<find/.test(reply)) fail('a tag of a comment shows in the chat')
  // The passages are marked in the text, and their numbers in the right margin of the page follow the
  // order of the chapter.
  const numbers = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.page[data-chapter="ch_sample01"] .cm-num')].map((n) => {
        const box = n.getBoundingClientRect()
        const text = n.closest('.manuscript').getBoundingClientRect()
        const sheet = n.closest('.page').getBoundingClientRect()
        return { n: n.textContent, id: n.dataset.comment, lens: n.className, inMargin: box.left > text.right && box.right < sheet.right }
      })
    )
  await until('the passages of the comments are not marked', async () => (await numbers()).length === 3)
  const marked = await numbers()
  console.log('numbers:', JSON.stringify(marked))
  if (marked.map((m) => m.n).join() !== '1,2,3' || marked.map((m) => m.id).join() !== first.map((c) => c.id).join()) fail('the numbers do not follow the order of the passages')
  if (!marked.every((m) => m.inMargin)) fail('a number is not in the right margin of the page')
  for (const lens of ['style', 'structure', 'continuity']) {
    if (!(await page.locator(`.page[data-chapter="ch_sample01"] .cm-mark.cm-${lens}`).count())) fail(`the passage of the ${lens} comment has no mark`)
  }
  if ((await page.locator('.cm-mark.cm-continuity').first().evaluate((e) => getComputedStyle(e).textDecorationStyle)) !== 'wavy') fail('the continuity mark is not a wavy line')

  // The margin. The read made room once: the chapter list closed, the page went to the left, and the cards
  // are in a column to the right of the page, inside the desk, next to their passages.
  const desk = () =>
    page.evaluate(() => {
      const d = document.querySelector('.desk')
      const box = d.getBoundingClientRect()
      const sheet = document.querySelector('.page[data-chapter="ch_sample01"]').getBoundingClientRect()
      const cards = [...document.querySelectorAll('.cm-column .cm-card')].map((c) => {
        const r = c.getBoundingClientRect()
        return { id: c.dataset.comment, left: r.left, right: r.right, top: r.top, bottom: r.bottom, visible: getComputedStyle(c).visibility === 'visible' }
      })
      return { left: box.left, right: box.left + d.clientWidth, pageLeft: sheet.left, pageRight: sheet.right, cards, sidebar: window.__wordelia.app.getState().settings.ui.sidebarOpen }
    })
  await until('the read did not close the chapter list', async () => (await desk()).sidebar === false, 5000)
  await until('the chapter list did not close', () => page.evaluate(() => document.querySelector('.book-sidebar').getBoundingClientRect().width < 1), 3000)
  await until('the cards of the comments are not in the margin', async () => {
    const d = await desk()
    return d.cards.length === 3 && d.cards.every((c) => c.visible && c.left >= d.pageRight && c.right <= d.right)
  })
  let room = await desk()
  console.log('margin:', JSON.stringify(room))
  if (room.cards.map((c) => c.id).join() !== first.map((c) => c.id).join()) fail('the cards do not follow the order of the passages')
  for (let i = 1; i < room.cards.length; i++) if (room.cards[i].top < room.cards[i - 1].bottom) fail('two cards overlap')
  // The desk of 1440 px has room for the widest column: wide cards, with their buttons on one line.
  const rows = await page.evaluate(() => [...document.querySelectorAll('.cm-column .cm-card')].map((c) => ({ width: c.getBoundingClientRect().width, row: c.querySelector('.cm-actions').getBoundingClientRect().height })))
  console.log('cards:', JSON.stringify(rows))
  if (rows.some((r) => r.width < 360)) fail('the cards are narrow on a wide desk')
  if (rows.some((r) => r.row > 30)) fail('the buttons of a card are not on one line')
  const header = await page.locator('.cm-head').innerText()
  console.log('margin header:', JSON.stringify(header))
  if (!/(Editor's comments|Comentários do editor|Comentarios del editor) · 3/i.test(header)) fail(`the margin header says "${header}"`)
  // The continuity card shows the two quotes: the passage, and the note with its label.
  const continuity = page.locator(`.cm-card[data-comment="${first[2].id}"]`)
  const quotes = await continuity.locator('.cm-quote').allInnerTexts()
  console.log('continuity quotes:', JSON.stringify(quotes))
  if (quotes.length !== 2 || !/Ch\. 1|Cap\. 1/i.test(quotes[0]) || !/Note|Nota/i.test(quotes[1])) fail('the continuity card does not show the passage and the note')
  // The numbers are easy to read: 4.5:1 or more on their background, for each lens.
  const contrast = await page.evaluate(() => {
    const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number)
    const lum = (c) => {
      const [r, g, b] = c.map((v) => {
        const x = v / 255
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    return [...document.querySelectorAll('.cm-num')].map((n) => {
      const cs = getComputedStyle(n)
      const bg = cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.documentElement).getPropertyValue('--paper') : cs.backgroundColor
      const back = bg.startsWith('#') ? [1, 3, 5].map((i) => parseInt(bg.trim().slice(i, i + 2), 16)) : rgb(bg)
      const [a, b] = [lum(rgb(cs.color)), lum(back)]
      return { lens: n.className, ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 }
    })
  })
  console.log('number contrast:', JSON.stringify(contrast))
  if (contrast.some((c) => c.ratio < 4.5)) fail('a number in the margin of the page is hard to read')
  // A click on a card selects it, and a line joins it to its passage. A click on a number selects its card.
  await page.locator(`.cm-card[data-comment="${first[1].id}"]`).click({ position: { x: 120, y: 8 } })
  await until('the click did not select the card', async () => (await page.locator(`.cm-card.is-selected[data-comment="${first[1].id}"]`).count()) === 1, 3000)
  await until('no line joins the card to its passage', async () => (await page.locator('.cm-link path').count()) === 1, 3000)
  await page.locator(`.cm-num[data-comment="${first[2].id}"]`).click()
  await until('a click on a number did not select its card', async () => (await page.locator(`.cm-card.is-selected[data-comment="${first[2].id}"]`).count()) === 1, 3000)
  // Two passages that start on one line of text: their numbers do not overlap.
  const listBefore = await comments()
  await page.evaluate(
    ([list, extra]) => window.__wordelia.comments.setState({ list: [...list, extra] }),
    [listBefore, { ...first[1], id: 'cm_sameline1', key: '9', rank: 9, lens: 'reader', passage: 'pelas frestas da janela' }]
  )
  await until('the comment on the same line has no number', async () => (await page.locator('.cm-num[data-comment="cm_sameline1"]').count()) === 1, 3000)
  const overlap = () =>
    page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.page[data-chapter="ch_sample01"] .cm-num')].map((n) => n.getBoundingClientRect())
      return boxes.some((a, i) => boxes.some((b, j) => i < j && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom))
    })
  await until('two numbers on one line overlap', async () => !(await overlap()), 3000)
  await shot('margin')
  await page.evaluate((list) => window.__wordelia.comments.setState({ list }), listBefore)
  await until('the comment on the same line did not go', async () => (await page.locator('.cm-card').count()) === 3, 3000)
  await page.evaluate(() => window.__wordelia.book.getState().selectChapter('ch_sample02'))
  await until('the chapter without comments has no header in the margin', async () => /· 0/.test((await page.locator('.cm-head').allInnerTexts()).join('')), 5000)
  if (await page.locator('.cm-card').count()) fail('a chapter without comments shows cards')
  await shot('margin-empty-chapter')
  await page.evaluate(() => window.__wordelia.book.getState().selectChapter('ch_sample01'))
  await until('the cards of the first chapter did not come back', async () => (await page.locator('.cm-column .cm-card').count()) === 3, 5000)
  // "Hide" takes the cards and the marks away, and puts the page and the chapter list back.
  await page.locator('.cm-head .cm-hide').click()
  await until('"Hide" did not take the cards and the marks away', async () => !(await page.locator('.cm-card, .cm-mark, .cm-num').count()), 3000)
  await until('"Hide" did not open the chapter list again', async () => (await desk()).sidebar === true, 3000)
  // The chapter list opens with a short animation: the page is in the middle of the desk at its end.
  await until('the chapter list did not open to its width', () => page.evaluate(() => document.querySelector('.book-sidebar').getBoundingClientRect().width >= 255), 3000)
  await until('the page is not in the middle of the desk after "Hide"', async () => {
    const d = await desk()
    return Math.abs(d.pageLeft - d.left - (d.right - d.pageRight)) <= 2
  })
  await shot('margin-hidden')
  const status = page.locator('.status-bar .status-comments')
  // Its name: in a tight status bar, the words can hide and the icon stays.
  const said = (await status.getAttribute('aria-label')) ?? ''
  console.log('status bar:', JSON.stringify(said))
  if (!/3 (editor's comments|comentários do editor|comentarios del editor)/.test(said)) fail(`the status bar says "${said}"`)
  await status.click()
  await until('the status bar did not show the comments again', async () => {
    const d = await desk()
    return d.sidebar === false && d.cards.length === 3 && d.cards.every((c) => c.visible && c.left >= d.pageRight)
  })
  await until('the marks did not come back', async () => (await numbers()).length === 3, 3000)
  await status.click()
  await until('a click on the status bar did not go to the first comment', async () => (await page.locator(`.cm-card.is-selected[data-comment="${first[0].id}"]`).count()) === 1, 3000)
  const head = await page.locator('.msg-ai .read-head').innerText()
  console.log('header:', JSON.stringify(head))
  if (!/3/.test(head) || !/Cap\. 1|Ch\. 1/.test(head)) fail(`the header card says "${head}"`)
  // A letter is not text for the book: no "Insert at cursor".
  if (await page.locator('.msg-ai .msg-insert').count()) fail('"Insert at cursor" shows for a read')
  await shot('reply')

  // 3. A second read of a selection with one lens: the same thread, the earlier comments go to the AI, and
  // the AI says that one of them looks fixed. The app asks the author, and "Mark as done" closes it.
  await selectParagraph('O vento entrava')
  await openPopover()
  if (!(await page.locator('.read-pop-scope').count())) fail('the popover does not offer the selection')
  await page.locator('.read-pop [role="radio"]', { hasText: /^(Style|Estilo)$/ }).click()
  await shot('popover-selection')
  await slow(12)
  await page.locator('.read-pop .read-pop-run').click()
  await until('the second reply did not finish', async () => (await readThreads())[0]?.messages.length === 4 && !(await streaming()), 30000)
  await idle()
  list = await readThreads()
  if ((await threads()).filter((t) => t.readChapterId).length !== 1) fail('the second read made a new thread')
  const second = list[0].messages[2]
  console.log('the second message:', JSON.stringify({ content: second.content, read: second.read }))
  if (second.read?.lens !== 'style' || !/O vento entrava/.test(second.read?.selection?.text ?? '')) fail(`the second request is wrong: ${JSON.stringify(second.read)}`)
  await until('the comment of the selection did not come', async () => (await comments()).length === 4)
  const all = await comments()
  const added = all[3]
  if (added.messageId !== list[0].messages[3].id || added.lens !== 'structure' || !/^O vento entrava/.test(added.passage)) fail(`the comment of the selection is ${JSON.stringify(added)}`)
  // The offer of the AI: one comment of the first read looks fixed. Nothing closes by itself.
  const resolved = page.locator('.toast', { hasText: /thinks 1 comment is fixed|acha que 1 comentário foi resolvido|cree que 1 comentario se resolvió/ })
  await resolved.waitFor({ timeout: 10000 })
  console.log('toast:', JSON.stringify(await resolved.innerText()))
  if (all.some((c) => c.state !== 'open')) fail('a comment closed before the author decided')
  await shot('resolved-toast')
  await resolved.locator('.toast-action').click()
  await until('"Mark as done" did not close the comment', async () => (await comments()).filter((c) => c.state === 'done').length === 1)
  if ((await comments()).find((c) => c.state === 'done').id !== first[0].id) fail('another comment closed')

  // 4. The chat offers a read: in an ordinary thread, the offer is a card, and its button runs the read in
  // the thread of the chapter. No new thread.
  await page.locator('.chat-head-actions .icon-btn').first().click()
  await page.waitForTimeout(300)
  await page.locator('.composer-input').fill('Faça uma leitura de editor do capítulo')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.read-offer', { timeout: 20000 })
  await idle()
  const offer = await page.locator('.read-offer').innerText()
  console.log('offer:', JSON.stringify(offer))
  if (!/ch\. 1|cap\. 1/i.test(offer) || !/Structure|Estrutura|Estructura/.test(offer)) fail(`the offer says "${offer}"`)
  if (await page.locator('.msg-ai .msg-insert').count()) fail('"Insert at cursor" shows for an offer')
  await shot('offer')
  const before = (await threads()).length
  await page.locator('.read-offer .read-offer-run').click()
  await until('the offered read did not start', async () => (await readThreads())[0]?.messages.length === 6 && !(await streaming()), 30000)
  await idle()
  if ((await threads()).length !== before) fail('the offered read made a new thread')
  const offered = (await readThreads())[0].messages[4]
  if (offered.read?.lens !== 'structure' || offered.read?.chapterId !== 'ch_sample01' || offered.read?.selection) fail(`the offered request is ${JSON.stringify(offered.read)}`)
  const shown = await page.locator('.chat-title').innerText()
  if (!/A Tempestade/.test(shown)) fail(`the chat shows "${shown}" after the offer`)
  await until('the comments of the offered read did not come', async () => (await comments()).length === 7)
  await shot('after-offer')

  // 5. What a comment can do. In the letter, each "(→ N)" is a link to its comment: it shows the number of
  // the comment in the margin (one numbering for the author), and a click selects its card. A closed
  // comment has a link without a number.
  const third = (await readThreads())[0].messages[5]
  const ofThird = (await comments()).filter((c) => c.messageId === third.id)
  const styleCm = ofThird.find((c) => c.rank === 1)
  const structureCm = ofThird.find((c) => c.rank === 2)
  const continuityCm = ofThird.find((c) => c.rank === 3)
  if (styleCm?.lens !== 'style' || structureCm?.lens !== 'structure' || continuityCm?.lens !== 'continuity') fail(`the comments of the third read are ${JSON.stringify(ofThird.map((c) => [c.rank, c.lens]))}`)
  const letter = page.locator('.msg-ai').last()
  const chip = letter.locator(`.read-ref[data-comment="${styleCm.id}"]`)
  await chip.waitFor({ timeout: 5000 })
  if ((await letter.locator('.read-ref').count()) !== 3) fail(`the letter has ${await letter.locator('.read-ref').count()} links to its comments`)
  const badge = (await card(styleCm.id).locator('.cm-badge').innerText()).trim()
  const chipSays = (await chip.innerText()).trim()
  console.log('letter link:', JSON.stringify({ chip: chipSays, card: badge }))
  if (chipSays !== badge) fail(`the link says "${chipSays}", its card says "${badge}"`)
  if (!(await page.locator('.msg-ai').first().locator(`.read-ref.is-closed[data-comment="${first[0].id}"]`).count())) fail('the link of a done comment shows a number')
  await chip.click()
  await until('a click on a link of the letter did not select its card', async () => (await page.locator(`.cm-card.is-selected[data-comment="${styleCm.id}"]`).count()) === 1, 3000)
  await shot('letter-links')
  // A comment of a chapter that is not in the book (a sync can bring one back after a delete) has no link,
  // and the status bar does not count it.
  const listNow = await comments()
  const openNow = listNow.filter((c) => c.state === 'open').length
  await page.evaluate(([list, id]) => window.__wordelia.comments.setState({ list: list.map((c) => (c.id === id ? { ...c, chapterId: 'ch_deleted' } : c)) }), [listNow, continuityCm.id])
  await until('a comment of a chapter that is not in the book has a link', async () => (await letter.locator('.read-ref').count()) === 2, 3000)
  const counted = (await page.locator('.status-bar .status-comments').getAttribute('aria-label')) ?? ''
  if (!counted.startsWith(`${openNow - 1} `)) fail(`the status bar counts a comment of a chapter that is not in the book: "${counted}"`)
  await page.evaluate((list) => window.__wordelia.comments.setState({ list }), listNow)
  await until('the link did not come back', async () => (await letter.locator('.read-ref').count()) === 3, 3000)

  // "Polish passage": the main action runs on the passage, with the comment as an extra instruction, in the
  // normal review. Enter accepts; a toast asks to mark the comment as done, and its Undo puts the card back
  // on the same passage.
  // The toasts of the earlier parts go first: the question after the Polish shows alone.
  for (const close of await page.locator('.toast .toast-close').all()) await close.click()
  await until('the earlier toasts stayed', async () => !(await page.locator('.toast').count()), 3000)
  const passage = await rangeOf(styleCm.id)
  await card(styleCm.id).getByRole('button', { name: /^(Polish passage|Polir trecho|Pulir fragmento)$/ }).click()
  await until('the review of the passage did not open', () => page.evaluate(() => window.__review.state()?.phase === 'ready'), 15000)
  const review = await page.evaluate(() => {
    const r = window.__review.state()
    return { from: r.from, to: r.to, proposed: r.proposed }
  })
  console.log('polish review:', JSON.stringify(review))
  if (review.from !== passage.from || review.to !== passage.to) fail('the review is not on the passage of the comment')
  // The scripted AI answers a polish with a comment this way only: the comment went to the AI.
  if (!/^Ao anoitecer, Elias acendeu/.test(review.proposed)) fail('the comment did not go to the AI with the passage')
  await shot('polish-review')
  await page.keyboard.press('Enter')
  const askDone = page.locator('.toast', { hasText: /Mark the comment as done\?|Marcar o comentário como feito\?|¿Marcar el comentario como hecho\?/ })
  await askDone.waitFor({ timeout: 5000 })
  if ((await passageOf(styleCm.id)).state !== 'open') fail('the comment closed before the author decided')
  await page.waitForFunction(() => !document.querySelector('.review-bar'), null, { timeout: 5000 })
  // The number of the comment is on the first line of its passage, also when the passage starts in the middle
  // of a line ("Ao anoitecer, Elias acendeu…").
  const onItsLine = (id) =>
    page.evaluate((i) => {
      const num = document.querySelector(`.cm-num[data-comment="${i}"]`)?.getBoundingClientRect()
      const line = document.querySelector(`.cm-mark[data-mark="${i}"]`)?.getClientRects()[0]
      if (!num || !line) return null
      return Math.abs(num.top + num.height / 2 - (line.top + line.height / 2))
    }, id)
  await until('the number of the polished comment is not on the line of its passage', async () => ((await onItsLine(styleCm.id)) ?? 99) < 6, 3000)
  // The line of the selected card starts at its number (the cards wait for the pause after typing; the line does not).
  const lineFromNumber = () =>
    page.evaluate((i) => {
      const num = document.querySelector(`.cm-num[data-comment="${i}"]`)?.getBoundingClientRect()
      const svg = document.querySelector('.cm-link')?.getBoundingClientRect()
      const m = /^M[ ]*([-\d.]+)[ ]+([-\d.]+)/.exec(document.querySelector('.cm-link path')?.getAttribute('d') ?? '')
      return num && svg && m ? Math.abs(svg.top + Number(m[2]) - (num.top + num.height / 2)) : 99
    }, styleCm.id)
  await frames()
  if ((await lineFromNumber()) >= 3) fail('the line of the selected card does not start at its number')
  await shot('polish-ask-done')
  await until('the passage of the polished comment changed', async () => (await passageOf(styleCm.id)).passage === 'Elias acendeu a lâmpada do farol', 3000)
  const polished = await rangeOf(styleCm.id)
  await askDone.locator('.toast-action').click()
  await until('"Mark as done" did not close the polished comment', async () => (await passageOf(styleCm.id)).state === 'done', 3000)
  await until('the card of the polished comment stayed', async () => !(await card(styleCm.id).count()), 3000)
  // The newest toast of a decision (an older one can still be on screen).
  await page.locator('.toast', { hasText: /Comment marked as done|Comentário marcado como feito|Comentario marcado como hecho/ }).last().locator('.toast-action').click()
  await until('Undo did not put the card back', async () => (await passageOf(styleCm.id)).state === 'open' && (await card(styleCm.id).count()) === 1, 3000)
  const back = await rangeOf(styleCm.id)
  if (back?.from !== polished?.from || back?.to !== polished?.to) fail(`the comment came back on another passage: ${JSON.stringify({ polished, back })}`)

  // "Discuss in chat": the read thread shows, with the passage as a quote and the comment in the draft.
  const readId = (await readThreads())[0].id
  const other = (await threads()).find((t) => !t.readChapterId)
  await page.evaluate((id) => window.__wordelia.chat.getState().setActiveThread(id), other.id)
  await card(structureCm.id).getByRole('button', { name: /^(Discuss in chat|Discutir no chat|Discutir en el chat)$/ }).click()
  await until('"Discuss in chat" did not show the read thread', () => page.evaluate((id) => window.__wordelia.chat.getState().activeThreadId === id, readId), 3000)
  const composer = await page.evaluate(() => {
    const s = window.__wordelia.chat.getState()
    return { quotes: s.quotes.map((q) => q.text), draft: s.draft }
  })
  console.log('discuss:', JSON.stringify(composer))
  if (!composer.quotes.includes(structureCm.passage)) fail('the composer does not quote the passage')
  if (!composer.draft.includes(structureCm.text)) fail('the draft does not name the comment')
  await page.waitForSelector('.composer .quote-chip', { timeout: 3000 })
  await until('the composer did not take the focus after "Discuss in chat"', composerFocused, 5000)
  await shot('discuss')
  await page.evaluate(() => window.__wordelia.chat.getState().clearComposer())

  // "It's intentional" on a continuity comment, with a short reason: the next reads get it.
  const continuityCards = await page.locator('.cm-column .cm-card.cm-continuity').evaluateAll((cs) => cs.map((c) => c.dataset.comment))
  if (continuityCards.length !== 2) fail(`two continuity cards were expected, there are ${continuityCards.length}`)
  const [intended, toUpdate] = continuityCards
  await card(intended).getByRole('button', { name: /^(It's intentional|É intencional|Es intencional)$/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ timeout: 3000 })
  await dialog.locator('input').fill('Elias mente para Marta')
  await shot('intentional')
  await page.keyboard.press('Enter')
  await until('"It\'s intentional" did not set the state', async () => (await passageOf(intended)).state === 'intentional', 3000)
  if ((await passageOf(intended)).reason !== 'Elias mente para Marta') fail(`the reason is "${(await passageOf(intended)).reason}"`)
  await until('the card of the intentional comment stayed', async () => !(await card(intended).count()), 3000)

  // "Update the note": a message in the read thread asks to change the planning so that it agrees with the
  // text. The reply follows the normal flow: a proposal changes nothing before the author accepts it.
  const count = (await readThreads())[0].messages.length
  await card(toUpdate).getByRole('button', { name: /^(Update the note|Atualizar a nota|Actualizar la nota)$/ }).click()
  await until('"Update the note" did not send a message', async () => (await readThreads())[0].messages.length === count + 1, 5000)
  const sent = (await readThreads())[0].messages[count]
  console.log('update the note:', JSON.stringify({ content: sent.content, mentions: sent.mentions, quotes: sent.quotes?.map((q) => q.text) }))
  if (sent.role !== 'user' || sent.read) fail('"Update the note" did not send a message of the author')
  if (!sent.mentions?.some((m) => m.kind === 'entry' && m.label === 'Marta')) fail('the message does not name the note of the comment')
  const updatedPassage = (await passageOf(toUpdate)).passage
  if (!sent.quotes?.some((q) => q.text === updatedPassage)) fail('the message does not quote the passage')
  await until('the reply to "Update the note" did not come', async () => (await readThreads())[0].messages.length === count + 2 && !(await streaming()), 30000)
  await idle()
  if ((await passageOf(toUpdate)).state !== 'open') fail('"Update the note" changed the state of the comment')
  await shot('update-note')

  // 6. The comments follow the text. A word typed in the passage of the open style comment goes into its
  // passage after a short pause, and the mark stays. Ctrl+Z takes the word out again. A passage that the
  // author deletes makes its comment "lost", and its mark goes away; Ctrl+Z brings it back. A text from
  // outside the editor that has the passage again gives the comment its passage back.
  const style = (await comments()).find((c) => c.lens === 'style' && c.state === 'open')
  if (!style) fail('no open style comment')
  const original = await page.evaluate(() => window.__wordelia.book.getState().chapters.find((c) => c.id === 'ch_sample01').body)
  await page.locator('.page[data-chapter="ch_sample01"] p').first().click()
  const at = await rangeOf(style.id)
  if (!at) fail('the style comment has no range in the text')
  await select(at.from + 'Elias acendeu'.length)
  await page.keyboard.type(' devagar')
  await until('the passage did not get the new word', async () => (await passageOf(style.id)).passage === 'Elias acendeu devagar a lâmpada do farol', 3000)
  const mark = page.locator(`.page[data-chapter="ch_sample01"] .cm-mark[data-mark="${style.id}"]`)
  if ((await mark.allInnerTexts()).join('') !== 'Elias acendeu devagar a lâmpada do farol') fail(`the mark of the style comment is on "${(await mark.allInnerTexts()).join('')}"`)
  if (!(await page.locator(`.cm-num[data-comment="${style.id}"]`).count())) fail('the number of the style comment went away')
  await shot('passage-edited')
  await page.keyboard.press('Control+z')
  await until('Ctrl+Z did not take the word out of the passage', async () => (await passageOf(style.id)).passage === 'Elias acendeu a lâmpada do farol', 3000)
  const whole = await rangeOf(style.id)
  await select(whole)
  await page.keyboard.press('Delete')
  await until('the deleted passage did not make the comment lost', async () => (await passageOf(style.id)).lost === true, 3000)
  if (await page.locator(`.cm-num[data-comment="${style.id}"], .cm-mark[data-mark="${style.id}"]`).count()) fail('the lost comment still has a mark')
  if ((await passageOf(style.id)).state !== 'open') fail('the lost comment is not open')
  await shot('passage-lost')
  // Ctrl+Z puts the words back at their place: the comment is not lost, and its mark comes back. Ctrl+Y
  // deletes them again.
  await page.keyboard.press('Control+z')
  await until('Ctrl+Z did not give the comment its passage back', async () => !(await passageOf(style.id)).lost, 3000)
  await until('the mark did not come back after Ctrl+Z', async () => (await mark.allInnerTexts()).join('') === 'Elias acendeu a lâmpada do farol', 3000)
  await page.keyboard.press('Control+y')
  await until('Ctrl+Y did not make the comment lost again', async () => (await passageOf(style.id)).lost === true, 3000)
  // An older version of the chapter comes back (History → Restore): the editor loads it as a text from outside.
  await page.evaluate((body) => window.__wordelia.book.getState().restoreChapter('ch_sample01', body), original)
  await until('the restored text did not give the comment its passage back', async () => !(await passageOf(style.id)).lost, 3000)
  await until('the mark of the comment did not come back', async () => (await page.locator(`.page[data-chapter="ch_sample01"] .cm-num[data-comment="${style.id}"]`).count()) === 1, 3000)
  if ((await passageOf(style.id)).passage !== 'Elias acendeu a lâmpada do farol') fail(`the passage after the restore is "${(await passageOf(style.id)).passage}"`)
  // A text from outside without the passage: the mark goes away, but this computer writes nothing (the
  // computer that made the edit writes it).
  await page.evaluate((body) => window.__wordelia.book.getState().restoreChapter('ch_sample01', body), original.replace('Elias acendeu a lâmpada do farol', 'Elias ligou a luz'))
  await until('the mark stayed after a text from outside without the passage', async () => !(await page.locator(`.cm-num[data-comment="${style.id}"]`).count()), 3000)
  await page.waitForTimeout(800)
  if ((await passageOf(style.id)).lost) fail('a text from outside made the comment lost')
  // On screen, the card of that comment says that the passage changed, and has only "Done" and "Ignore".
  const lostCard = page.locator(`.cm-column .cm-card[data-comment="${style.id}"]`)
  await until('the card of a comment without its passage does not say that the passage changed', async () => (await lostCard.locator('.cm-lost').count()) === 1, 3000)
  // The cards stay where they are while the author types; a move of the mouse ends the typing.
  await page.mouse.move(700, 500)
  await page.mouse.move(720, 520)
  await until('the lost card is not after the cards with a number', () =>
    page.evaluate((id) => {
      const lost = document.querySelector(`.cm-column .cm-card[data-comment="${id}"]`).getBoundingClientRect()
      const numbered = [...document.querySelectorAll('.cm-column .cm-card')].filter((c) => c.querySelector('.cm-badge'))
      return numbered.length > 0 && numbered.every((c) => c.getBoundingClientRect().bottom <= lost.top)
    }, style.id)
  )
  // The names of the buttons: a button can show only its icon in a narrow card.
  const lostButtons = await lostCard.locator('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') ?? ''))
  console.log('buttons of a lost card:', JSON.stringify(lostButtons))
  if (lostButtons.map((b) => b.trim()).join() !== 'Ignore,Done' && lostButtons.map((b) => b.trim()).join() !== 'Ignorar,Feito' && lostButtons.map((b) => b.trim()).join() !== 'Ignorar,Hecho') fail('a lost card has other buttons than "Ignore" and "Done"')
  await shot('margin-lost')
  // A comments file of a newer Wordelia: the cards show, but their state buttons are off.
  await page.evaluate(() => window.__wordelia.comments.setState({ readOnly: true }))
  await until('the state buttons are on for a comments file of a newer Wordelia', async () => (await page.locator('.cm-column .cm-card .cm-act-done[aria-disabled="true"]').count()) === (await page.locator('.cm-column .cm-card').count()), 3000)
  const before7 = (await comments()).filter((c) => c.state === 'open').length
  // A forced click: the button is off, and the click must change nothing.
  await page.locator('.cm-column .cm-card .cm-act-done').first().click({ force: true })
  await page.waitForTimeout(300)
  if ((await comments()).filter((c) => c.state === 'open').length !== before7) fail('"Done" changed a comment of a read-only file')
  // "It's intentional" is off too. "Discuss in chat" still works.
  const intentionalActs = page.locator('.cm-column .cm-card .cm-act-intentional')
  if (!(await intentionalActs.count()) || (await page.locator('.cm-column .cm-card .cm-act-intentional:not([aria-disabled="true"])').count())) fail('"It is intentional" is on for a comments file of a newer Wordelia')
  await intentionalActs.first().click({ force: true })
  await page.waitForTimeout(300)
  if (await page.getByRole('dialog').count()) fail('"It is intentional" asks for a reason in a read-only file')
  await page.locator('.cm-column .cm-card').getByRole('button', { name: /^(Discuss in chat|Discutir no chat|Discutir en el chat)$/ }).first().click()
  await until('"Discuss in chat" does not work in a read-only file', () => page.evaluate(() => window.__wordelia.chat.getState().quotes.length === 1), 3000)
  await until('the composer did not take the focus after "Discuss in chat"', composerFocused, 5000)
  await page.evaluate(() => window.__wordelia.chat.getState().clearComposer())
  await page.evaluate(() => window.__wordelia.comments.setState({ readOnly: false }))
  // "Done" on a card closes its comment, and the card leaves the margin.
  const doneId = await page.locator('.cm-column .cm-card').first().getAttribute('data-comment')
  await page.locator(`.cm-card[data-comment="${doneId}"] .cm-act-done`).click()
  await until('"Done" did not close the comment', async () => (await comments()).find((c) => c.id === doneId).state === 'done', 3000)
  await until('the card of a closed comment stayed', async () => !(await page.locator(`.cm-card[data-comment="${doneId}"]`).count()), 3000)

  // 7. A narrow window: no column. A click on a number opens its card in a popover beside it.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 800))
  await page.waitForFunction(() => Math.abs(innerWidth - 1000) < 40)
  await until('the column stayed in a narrow window', async () => !(await page.locator('.cm-column').count()), 5000)
  // The desk settles after the resize (the zoom, the place of the page): the number stays still for two frames.
  const settled = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const rect = () => JSON.stringify(document.querySelector('.page[data-chapter="ch_sample01"] .cm-num')?.getBoundingClientRect() ?? null)
          const before = rect()
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(before !== 'null' && before === rect())))
        })
    )
  await until('the numbers did not settle after the resize', settled, 5000)
  await page.locator('.page[data-chapter="ch_sample01"] .cm-num').first().click()
  await page.waitForSelector('.cm-pop .cm-card', { timeout: 5000 })
  const popped = await page.evaluate(() => {
    const pop = document.querySelector('.cm-pop').getBoundingClientRect()
    return { left: pop.left, right: pop.right, width: innerWidth }
  })
  console.log('popover:', JSON.stringify(popped))
  if (popped.left < 0 || popped.right > popped.width) fail('the popover card is not on screen')
  // The popover belongs to its comment: a scroll that makes another chapter active does not close it.
  await page.evaluate(() => window.__wordelia.book.getState().setActiveChapter('ch_sample02'))
  await frames()
  if (!(await page.locator('.cm-pop .cm-card').count())) fail('the popover closed when another chapter became active')
  await shot('narrow-popover')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.cm-pop'), null, { timeout: 5000 })
  // A link of the letter opens the card of its comment in the popover too.
  const numbered = page.locator('.msg-ai .read-ref[data-n]').last()
  const target = await numbered.getAttribute('data-comment')
  await numbered.click()
  await page.waitForSelector(`.cm-pop .cm-card[data-comment="${target}"]`, { timeout: 5000 })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.cm-pop'), null, { timeout: 5000 })
}
