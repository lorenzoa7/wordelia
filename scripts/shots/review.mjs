// The review of an action (Polish and the others) in the text: the passage is marked, paragraph and
// scene breaks show in the diff and stay after Accept, and the author can write in the rest of the
// chapter while the AI works and while the change waits. Also: Esc and Stop stop the request, a
// second press is a retry on the same passage, the selection comes back, one review in the book, the
// bar never covers text, and the messages of a run. Run with --en (the English sample book).
export default async function ({ app, page, shot, openBook }) {
  const fail = (msg) => {
    throw new Error(msg)
  }
  await openBook()
  await page.waitForFunction(() => window.__wordelia.editor()?.state.doc.childCount > 3)
  // Every text event of the AI, by request: a stopped request sends no more.
  await page.evaluate(() => {
    window.__events = {}
    window.__requests = []
    window.wordelia.on('ai:event', ({ requestId, event }) => {
      if (event.type !== 'text') return
      if (!(requestId in window.__events)) window.__requests.push(requestId)
      window.__events[requestId] = (window.__events[requestId] ?? 0) + 1
    })
  })
  const slow = (ms) =>
    app.evaluate((_e, ms) => {
      process.env.WORDELIA_MOCK_DELAY = ms
    }, String(ms))

  /** The top-level blocks of the chapter with the cursor */
  const blocks = () =>
    page.evaluate(() => {
      const out = []
      window.__wordelia.editor().state.doc.forEach((n, pos) => out.push({ type: n.type.name, pos, size: n.nodeSize, text: n.textContent }))
      return out
    })
  /** Select from the start of block `a` to the end of block `b` (the cursor goes into the text). */
  const selectBlocks = (a, b) =>
    page.evaluate(
      ({ a, b }) => {
        const ed = window.__wordelia.editor()
        const list = []
        ed.state.doc.forEach((n, pos) => list.push({ pos, size: n.nodeSize }))
        ed.commands.focus()
        ed.commands.setTextSelection({ from: list[a].pos + 1, to: list[b].pos + list[b].size - 1 })
        return { from: list[a].pos + 1, to: list[b].pos + list[b].size - 1 }
      },
      { a, b }
    )
  /** Select a text of the chapter with the cursor. */
  const selectText = (text) =>
    page.evaluate((text) => {
      const ed = window.__wordelia.editor()
      let found = null
      ed.state.doc.descendants((n, pos) => {
        if (found || !n.isText) return !found
        const i = n.text.indexOf(text)
        if (i >= 0) found = { from: pos + i, to: pos + i + text.length }
        return false
      })
      ed.commands.focus()
      ed.commands.setTextSelection(found)
      return found
    }, text)
  const selection = () => page.evaluate(() => ({ from: window.__wordelia.editor().state.selection.from, to: window.__wordelia.editor().state.selection.to }))
  const review = () => page.evaluate(() => {
    const r = window.__review.state()
    return r ? { id: r.id, from: r.from, to: r.to, phase: r.phase } : null
  })
  const ready = () => page.waitForSelector('.review-bar .review-accept', { timeout: 15000 })
  const closed = () => page.waitForFunction(() => !document.querySelector('.review-bar'), null, { timeout: 5000 })
  const toast = (re) =>
    page
      .waitForFunction((src) => [...document.querySelectorAll('.toast')].map((t) => t.innerText).find((t) => new RegExp(src).test(t)) ?? false, re.source, { timeout: 8000 })
      .then((h) => h.jsonValue())
      .catch(() => null)
  const addBookAction = (id, name, instructions) =>
    page.evaluate(
      ({ id, name, instructions }) => {
        const s = window.__wordelia.book.getState()
        s.setActions([...s.actions.filter((a) => a.id !== id), { id, name, icon: 'Feather', builtIn: false, route: null, contextChars: 600, instructions }])
      },
      { id, name, instructions }
    )
  const runById = (id) => page.evaluate((id) => void window.__wordelia.runAction(id), id)

  const start = await blocks()
  const shape = (list) => list.map((b) => (b.type === 'sceneBreak' ? '*' : b.type === 'paragraph' ? 'p' : b.type)).join('')
  console.log('chapter:', shape(start))
  const sceneAt = start.findIndex((b) => b.type === 'sceneBreak')
  if (sceneAt < 1) fail('The sample chapter has no scene break')
  const original = start.map((b) => b.text).join('')
  const backToStart = async () => {
    for (let i = 0; i < 6 && (await page.evaluate(() => window.__wordelia.editor().state.doc.textContent)) !== original; i++) await page.keyboard.press('Control+z')
    await page.waitForFunction((text) => window.__wordelia.editor().state.doc.textContent === text, original)
  }

  // A1: a passage with a scene break. The passage is marked, the bar does not say "+0 −0", and
  // Accept keeps the paragraphs and the scene break.
  await selectBlocks(sceneAt - 1, sceneAt + 1)
  await page.keyboard.press('Control+j')
  await ready()
  const marked = await page.evaluate(() => {
    const r = document.querySelector('.manuscript .ai-range')
    if (!r) return null
    const s = getComputedStyle(r)
    return { bg: s.backgroundColor, shadow: s.boxShadow }
  })
  const stats = (await page.locator('.review-stats').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  console.log('passage mark:', JSON.stringify(marked), 'stats:', stats)
  await shot('scene-break-review')
  if (!marked || (marked.bg === 'rgba(0, 0, 0, 0)' && marked.shadow === 'none')) fail('The reviewed passage is not marked')
  if (stats === '+0 −0') fail('The bar says +0 −0 for a real change')
  await page.keyboard.press('Enter')
  await closed()
  const afterAccept = await blocks()
  console.log('after Accept:', shape(afterAccept))
  if (shape(afterAccept) !== shape(start)) fail(`Accept changed the paragraphs or the scene break: ${shape(start)} → ${shape(afterAccept)}`)
  await backToStart()

  // A1: a joined paragraph and a removed scene break show in the diff.
  await addBookAction('act_join', 'Join', 'Make the selection one paragraph.')
  await selectBlocks(2, 3)
  await runById('act_join')
  await ready()
  const joined = await page.evaluate(() => ({ breaks: document.querySelectorAll('.manuscript .ai-del-break').length, stats: document.querySelector('.review-stats')?.innerText.replace(/\s+/g, ' ') }))
  await shot('joined-paragraphs')
  await page.keyboard.press('Escape')
  await closed()
  await selectBlocks(sceneAt - 1, sceneAt + 1)
  await runById('act_join')
  await ready()
  const sceneGone = await page.locator('.manuscript .scene-break.ai-del-block').count()
  const sceneJoin = await page.locator('.manuscript .ai-del-break').count()
  await shot('scene-break-removed')
  await page.keyboard.press('Escape')
  await closed()
  console.log('join:', JSON.stringify({ ...joined, sceneGone, sceneJoin }))
  if (!joined.breaks || /−0$/.test(joined.stats ?? '')) fail('A joined paragraph does not show in the diff')
  if (!sceneGone) fail('A removed scene break does not show in the diff')
  if (sceneJoin !== 1) fail(`The two paragraphs around the removed scene break join, but ${sceneJoin} "¶" show`)

  // A10: removed italics show, and the stacked view keeps the italics of the new text.
  await addBookAction('act_plain', 'Plain', 'Write it without italics.')
  await selectBlocks(1, 1)
  await runById('act_plain')
  await ready()
  const plain = await page.evaluate(() => ({
    del: [...document.querySelectorAll('.manuscript .ai-del')].map((e) => e.textContent).join('|'),
    ins: [...document.querySelectorAll('.manuscript .ai-ins')].map((e) => e.textContent).join('|'),
    insItalic: document.querySelectorAll('.manuscript .ai-ins em').length,
    stats: document.querySelector('.review-stats')?.innerText.replace(/\s+/g, ' ')
  }))
  await page.keyboard.press('Escape')
  await closed()
  console.log('italics:', JSON.stringify(plain))
  if (!plain.del.includes('Swallow') || !plain.ins.includes('Swallow') || plain.insItalic) fail('Removed italics do not show in the diff')
  await selectBlocks(1, 1)
  await page.keyboard.press('Control+j')
  await ready()
  await page.locator('.review-view').nth(1).click()
  const stackedItalic = await page.locator('.manuscript .ai-ins-stacked em').count()
  await shot('stacked-italics')
  await page.locator('.review-view').nth(0).click()
  await page.keyboard.press('Escape')
  await closed()
  if (!stackedItalic) fail('The stacked view does not show italics')

  // A9 and A8: the bar covers no text around the passage; Esc gives the selection back.
  const sel3 = await selectBlocks(3, 3)
  await page.keyboard.press('Control+j')
  await ready()
  const cover = await page.evaluate(() => {
    const bar = document.querySelector('.review-bar').getBoundingClientRect()
    const paras = [...document.querySelector('.manuscript').children].filter((e) => e.matches('p'))
    const hits = []
    for (const p of paras) {
      const range = document.createRange()
      range.selectNodeContents(p)
      for (const r of range.getClientRects()) if (r.width > 1 && r.left < bar.right && r.right > bar.left && r.top < bar.bottom - 1 && r.bottom > bar.top + 1) hits.push(p.textContent.slice(0, 30))
    }
    return hits
  })
  await shot('bar-room')
  await page.keyboard.press('Escape')
  await closed()
  const back = await selection()
  console.log('bar covers:', JSON.stringify(cover), 'selection after Esc:', JSON.stringify(back), 'was', JSON.stringify(sel3))
  if (cover.length) fail(`The review bar covers text: ${cover.join(' / ')}`)
  if (back.from !== sel3.from || back.to !== sel3.to) fail('Esc did not give the selection back')

  // A7: the action again during a review runs on the same passage, not on its paragraph.
  const sentence = await selectText('Elias counted the boats in the harbor, one by one')
  await page.keyboard.press('Control+j')
  await ready()
  const first = await review()
  await page.keyboard.press('Control+j')
  await page.waitForFunction((id) => window.__review.state()?.id !== id && window.__review.state()?.phase === 'ready', first.id, { timeout: 15000 })
  const second = await review()
  console.log('retry:', JSON.stringify({ first, second }))
  if (second.from !== first.from || second.to !== first.to) fail('A second press of the action made the passage larger')
  // A23: Ctrl+Enter accepts like Enter; it makes no page break.
  await page.keyboard.press('Control+Enter')
  await closed()
  const afterCtrlEnter = await blocks()
  if (afterCtrlEnter.some((b) => b.type === 'pageBreak')) fail('Ctrl+Enter made a page break during a review')
  if (afterCtrlEnter[1].text === start[1].text) fail('Ctrl+Enter did not accept the change')
  await backToStart()

  // A8 and A4: a reply without a rewrite is a message; the selection comes back.
  await addBookAction('act_comment', 'Comment', 'Give only a comment.')
  const sel0 = await selectBlocks(0, 0)
  await runById('act_comment')
  const said = await toast(/did not rewrite/)
  await closed()
  const afterComment = await selection()
  console.log('comment:', JSON.stringify({ said, afterComment }))
  if (!said || !said.includes('already reads well')) fail('A reply without a rewrite did not show as a message')
  if (afterComment.from !== sel0.from || afterComment.to !== sel0.to) fail('The selection did not come back after a reply without a rewrite')
  if ((await page.evaluate(() => window.__wordelia.editor().state.doc.textContent)) !== original) fail('A reply without a rewrite changed the text')

  // A22: the main action in an empty paragraph says what to do.
  await page.evaluate(() => {
    const ed = window.__wordelia.editor()
    ed.commands.focus()
    ed.commands.setTextSelection(ed.state.doc.content.size - 1)
  })
  await page.keyboard.press('Enter')
  await page.keyboard.press('Control+j')
  const hint = await toast(/Select some text/)
  await page.keyboard.press('Backspace')
  if (!hint) fail('The main action in an empty paragraph gave no hint')

  // A2: write in another paragraph while the AI works, and while the change waits.
  await slow(45)
  await selectBlocks(0, 0)
  await page.keyboard.press('Control+j')
  await page.waitForSelector('.review-bar')
  // The cursor goes to the end of the third paragraph: there the author goes on writing.
  await page.evaluate(() => {
    const ed = window.__wordelia.editor()
    const list = []
    ed.state.doc.forEach((n, pos) => list.push({ pos, size: n.nodeSize }))
    ed.commands.setTextSelection(list[2].pos + list[2].size - 1)
  })
  await page.keyboard.type(' Typed while the AI works.')
  const typedWhileLoading = await page
    .waitForFunction(() => window.__wordelia.editor().state.doc.textContent.includes('Typed while the AI works.'), null, { timeout: 3000 })
    .then(() => true, () => false)
  const phaseWhileTyping = (await review())?.phase
  await ready()
  // Enter outside the passage makes a new paragraph; it does not accept the change.
  await page.keyboard.press('Enter')
  await page.keyboard.type('A new line.')
  await page.waitForFunction(() => window.__wordelia.editor().state.doc.textContent.includes('A new line.'), null, { timeout: 3000 }).catch(() => null)
  const stillOpen = (await review())?.phase === 'ready'
  const afterTyping = await blocks()
  console.log(JSON.stringify({ typedWhileLoading, phaseWhileTyping, stillOpen, blocks: afterTyping.length }))
  await shot('typed-elsewhere')
  if (phaseWhileTyping !== 'loading') fail('The AI was done before the typing: the check means nothing')
  if (!typedWhileLoading) fail('Typing in another paragraph while the AI works was lost')
  if (!stillOpen) fail('Enter in another paragraph decided the review')
  if (afterTyping.length !== start.length + 1 || afterTyping[3].text !== 'A new line.') fail('Enter in another paragraph did not make a new paragraph')
  // Typing inside the passage does not change it, and gives a cue.
  const passage = await review()
  await page.evaluate((pos) => window.__wordelia.editor().commands.setTextSelection(pos), passage.from + 5)
  await page.keyboard.type('x')
  await page.waitForSelector('.review-bar[data-cue]', { timeout: 3000 }).catch(() => null)
  const cue = await page.locator('.review-bar[data-cue]').count()
  const locked = await page.evaluate(({ from, to }) => window.__wordelia.editor().state.doc.textBetween(from, to), passage)
  await shot('locked-cue')
  if (locked !== start[0].text) fail('Typing changed the locked passage')
  if (!cue) fail('Typing in the locked passage gave no cue')
  // Tab in the passage goes to the review bar (Retry and the views are there); Shift+Tab goes back.
  await page.keyboard.press('Tab')
  const inBar = await page.waitForFunction(() => Boolean(document.activeElement?.closest('.review-bar')), null, { timeout: 3000 }).then(() => true, () => false)
  await page.keyboard.press('Shift+Tab')
  const backInText = await page.waitForFunction(() => document.activeElement?.classList.contains('ProseMirror'), null, { timeout: 3000 }).then(() => true, () => false)
  if (!inBar || !backInText) fail(`Tab and Shift+Tab do not move between the passage and the bar: ${inBar} ${backInText}`)
  // Enter with the cursor in the passage accepts the change; the typed paragraphs stay.
  await page.keyboard.press('Enter')
  await closed()
  const accepted = await blocks()
  console.log('after Accept:', JSON.stringify(accepted[0].text.slice(0, 80)))
  if (accepted[0].text === start[0].text) fail('Enter in the passage did not accept the change')
  if (!accepted[2].text.endsWith('Typed while the AI works.') || accepted[3].text !== 'A new line.') fail('Accept lost the text typed elsewhere')

  // A3: Esc stops the request; a second run has its own word counter; Stop stops it too.
  const requestsBefore = await page.evaluate(() => window.__requests.length)
  await selectBlocks(1, 1)
  await page.keyboard.press('Control+j')
  await page.waitForFunction((n) => window.__requests.length > n && window.__events[window.__requests[n]] >= 3, requestsBefore, { timeout: 10000 })
  await page.keyboard.press('Escape')
  await closed()
  const run1 = await page.evaluate((n) => window.__requests[n], requestsBefore)
  const eventsAtEsc = await page.evaluate((id) => window.__events[id], run1)
  await page.evaluate(() => {
    window.__words = []
    window.__actionRun.subscribe((s) => window.__words.push(s.words))
  })
  await selectBlocks(0, 0)
  await page.keyboard.press('Control+j')
  await page.waitForFunction((n) => window.__requests.length > n + 1 && window.__events[window.__requests[n + 1]] >= 3, requestsBefore, { timeout: 10000 })
  await page.locator('.review-bar .review-btn').filter({ hasText: 'Stop' }).click()
  await closed()
  const run2 = await page.evaluate((n) => window.__requests[n + 1], requestsBefore)
  const eventsAtStop = await page.evaluate((id) => window.__events[id], run2)
  await page.waitForTimeout(500)
  const later = await page.evaluate(({ run1, run2 }) => ({ one: window.__events[run1], two: window.__events[run2], words: window.__words }), { run1, run2 })
  console.log('stop:', JSON.stringify({ eventsAtEsc, eventsAtStop, later }))
  if (later.one > eventsAtEsc + 1) fail('Esc did not stop the request')
  if (later.two > eventsAtStop + 1) fail('Stop did not stop the request')
  const counts = later.words.filter((w) => w > 0)
  if (counts.some((w, i) => i > 0 && w < counts[i - 1])) fail(`Two runs share one word counter: ${counts.join(', ')}`)

  // A6 and A5: the bar stays with its review in chapter 1 when the cursor goes to chapter 2; an
  // action shortcut in the chat composer does nothing; an action in chapter 2 ends the review of chapter 1.
  await slow('')
  await selectBlocks(1, 1)
  await page.keyboard.press('Control+j')
  await ready()
  const firstReview = await review()
  await page.locator('.manuscript').nth(1).locator('p').first().click()
  await page.waitForTimeout(150)
  const barStays = await page.evaluate(() => {
    const bar = document.querySelector('.review-bar')?.getBoundingClientRect()
    const sheet = document.querySelectorAll('.page[data-chapter]')[0].getBoundingClientRect()
    return Boolean(bar && bar.top >= sheet.top && bar.bottom <= sheet.bottom)
  })
  await page.locator('.composer-input').click()
  await page.keyboard.type('Hello')
  await page.keyboard.press('Alt+2')
  await page.waitForTimeout(300)
  const afterComposer = await review()
  await page.locator('.composer-input').fill('')
  await page.locator('.manuscript').nth(1).locator('p').first().click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.keyboard.press('Control+j')
  await page.waitForFunction((id) => window.__review.state() && window.__review.state().id !== id && window.__review.state().phase === 'ready', firstReview.id, { timeout: 15000 })
  const reviews = await page.evaluate(() => [...document.querySelectorAll('.page[data-chapter]')].map((s) => s.querySelectorAll('.ai-range, .ai-pending').length))
  await shot('one-review')
  await page.keyboard.press('Escape')
  await closed()
  console.log('one review:', JSON.stringify({ barStays, afterComposer: afterComposer?.id === firstReview.id, reviews }))
  if (!barStays) fail('The review bar did not stay with its review')
  if (afterComposer?.id !== firstReview.id) fail('An action shortcut in the chat composer ran an action')
  if (reviews[0] !== 0 || reviews[1] === 0) fail(`Two reviews at the same time: ${reviews.join(', ')}`)

  // A14: the Plan view while the AI works: no error, and the change waits in the chapter.
  await slow(45)
  await page.locator('.manuscript').first().locator('p').first().click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.keyboard.press('Control+j')
  await page.waitForSelector('.review-bar')
  await page.keyboard.press('Control+2')
  await page.waitForFunction(() => !window.__actionRun.getState().running, null, { timeout: 15000 })
  const told = await toast(/is ready in/)
  await page.keyboard.press('Control+1')
  await ready()
  await shot('back-from-plan')
  await page.keyboard.press('Escape')
  await slow('')
  if (!told) fail('The change of the action did not say that it waits in the chapter')

  // A8 and A21: an error has "Try again"; "not logged in" has "Open settings".
  await addBookAction('act_fail', 'Fail', 'scripted error: network')
  const sel1 = await selectBlocks(1, 1)
  await runById('act_fail')
  await page.waitForFunction(() => [...document.querySelectorAll('.toast-action')].some((b) => b.textContent === 'Try again'), null, { timeout: 8000 }).catch(() => null)
  const tryAgain = await page.locator('.toast-action', { hasText: 'Try again' }).count()
  const afterError = await selection()
  await addBookAction('act_login', 'Login', 'scripted error: not-logged-in')
  await runById('act_login')
  await page.waitForFunction(() => [...document.querySelectorAll('.toast-action')].some((b) => b.textContent === 'Open settings'), null, { timeout: 8000 }).catch(() => null)
  const openSettings = await page.locator('.toast-action', { hasText: 'Open settings' }).count()
  await shot('errors')
  console.log('errors:', JSON.stringify({ tryAgain, openSettings, afterError, sel1 }))
  if (!tryAgain) fail('An error of an action has no "Try again"')
  if (!openSettings) fail('"Not logged in" has no "Open settings"')
  if (afterError.from !== sel1.from || afterError.to !== sel1.to) fail('The selection did not come back after an error')
}
