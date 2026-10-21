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
  // "Hide" takes the marks out of the text, and puts them back.
  const hide = (hidden) => page.evaluate((h) => window.__commentMarks.useCommentMarks.setState({ hidden: h }), hidden)
  await hide(true)
  await until('"Hide" did not take the marks away', async () => !(await page.locator('.cm-mark, .cm-num').count()), 3000)
  await hide(false)
  await until('the marks did not come back', async () => (await numbers()).length === 3, 3000)
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

  // 5. The comments follow the text. A word typed in the passage of the open style comment goes into its
  // passage after a short pause, and the mark stays. Ctrl+Z takes the word out again. A passage that the
  // author deletes makes its comment "lost", and its mark goes away. A text from outside the editor that
  // has the passage again gives the comment its passage back.
  const style = (await comments()).find((c) => c.lens === 'style' && c.state === 'open')
  if (!style) fail('no open style comment')
  const original = await page.evaluate(() => window.__wordelia.book.getState().chapters.find((c) => c.id === 'ch_sample01').body)
  const passageOf = async (id) => (await comments()).find((c) => c.id === id)
  const rangeOf = (id) =>
    page.evaluate((i) => {
      const r = window.__commentMarks.commentRanges('ch_sample01').get(i)
      return r ? { from: r.from, to: r.to } : null
    }, id)
  const select = (sel) => page.evaluate((s) => window.__wordelia.editor().chain().focus().setTextSelection(s).run(), sel)
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
  // An older version of the chapter comes back (History → Restore): the editor loads it as a text from outside.
  await page.evaluate((body) => window.__wordelia.book.getState().restoreChapter('ch_sample01', body), original)
  await until('the restored text did not give the comment its passage back', async () => !(await passageOf(style.id)).lost, 3000)
  await until('the mark of the comment did not come back', async () => (await page.locator(`.page[data-chapter="ch_sample01"] .cm-num[data-comment="${style.id}"]`).count()) === 1, 3000)
  if ((await passageOf(style.id)).passage !== 'Elias acendeu a lâmpada do farol') fail(`the passage after the restore is "${(await passageOf(style.id)).passage}"`)
}
