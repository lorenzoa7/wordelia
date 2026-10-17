// The chat changes of version 0.5: the thread list view, the proposal card header with a long title,
// the scroll when the user sends, the purpose strip, and inline mentions in the composer.
// Usage: node scripts/shot.mjs chatview [--en] [--dark]
export default async function ({ app, page, shot, openBook }) {
  const fail = (what) => {
    throw new Error(`Chat view scenario: ${what}`)
  }
  const pt = !process.argv.includes('--en')
  const slow = (ms) => app.evaluate((_e, v) => (process.env.WORDELIA_MOCK_DELAY = String(v)), ms)
  const idle = () => page.waitForSelector('.composer-send:not(.is-stop)', { timeout: 30000 })
  const setChat = (width) => page.evaluate((w) => window.__wordelia.app.getState().setUi({ chatWidth: w }), width)
  const send = async (text) => {
    await page.locator('.composer-input').fill(text)
    await page.keyboard.press('Enter')
  }
  const threads = () => page.evaluate(() => window.__wordelia.book.getState().threads)
  // A close view of one element, to check small details.
  const flags = `${pt ? '' : '-en'}${process.argv.includes('--dark') ? '-dark' : ''}`
  const crop = (name, sel) => page.locator(sel).last().screenshot({ path: `test-results/shots/chatview${flags}-zoom-${name}.png` })

  // The Portuguese book with the interface in Portuguese (Brazil), as the author uses it.
  if (pt) {
    await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ language: 'pt-BR' }))
    await page.waitForTimeout(300)
  }
  await openBook()
  await setChat(400)
  await page.waitForTimeout(300)

  // A long chapter title, for the header of the proposal card.
  const long = pt ? 'A Tempestade que Chegou do Norte na Noite em que Elias Perdeu a Conta dos Barcos' : 'The Storm That Came from the North on the Night Elias Lost Count of the Boats'
  await page.evaluate(async (title) => {
    const s = window.__wordelia.book.getState()
    await s.renameChapter(s.chapters[0].id, title)
  }, long)
  await page.waitForTimeout(400)

  // 1. A reply with a proposal: the card header with the long title, at three panel widths.
  await send(pt ? 'Pode melhorar o parágrafo de abertura?' : 'Can you improve the opening paragraph?')
  await page.waitForSelector('.msg-ai .proposal', { timeout: 20000 })
  await idle()
  await page.waitForTimeout(600)
  for (const w of [320, 400, 680]) {
    await setChat(w)
    await page.waitForTimeout(350)
    const r = await page.evaluate(() => {
      const head = document.querySelector('.msg-ai .proposal-head')
      const box = (sel) => head.querySelector(sel)?.getBoundingClientRect()
      const icon = box('.proposal-file svg')
      const name = box('.proposal-file span')
      const stats = box('.proposal-stats')
      const tools = box('.proposal-tools')
      return { icon: [icon.left, icon.right], name: [name.left, name.right], stats: [stats.left, stats.right, stats.top], tools: [tools.left, tools.right, tools.top], head: head.getBoundingClientRect().right }
    })
    console.log(`card header at ${w}px:`, JSON.stringify(r))
    if (r.icon[1] > r.stats[0] || r.name[1] > r.stats[0]) fail(`the icon or the title overlaps the counts at ${w}px`)
    if (r.icon[1] - r.icon[0] < 13) fail(`the icon shrank at ${w}px`)
    if (r.tools[2] < r.stats[2] + 5 && r.tools[0] < r.stats[1]) fail(`the buttons overlap the counts at ${w}px`)
    if (r.tools[1] > r.head + 0.5) fail(`the buttons go past the card at ${w}px`)
    await page.locator('.msg-ai .proposal').first().scrollIntoViewIfNeeded()
    await shot(`card-header-${w}`)
  }
  await setChat(400)
  await page.waitForTimeout(300)

  // 2. Send a long message: the chat goes to the end at once, before the reply starts.
  await slow(400)
  const longText = Array.from({ length: 14 }, (_, i) => (pt ? `Linha ${i + 1} de uma pergunta longa sobre o capítulo.` : `Line ${i + 1} of a long question about the chapter.`)).join('\n')
  await page.locator('.composer-input').fill(longText)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(120)
  const gap = await page.locator('.chat-scroll').evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight))
  const streamed = await page.locator('.msg-ai.is-streaming .msg-ai-text').count()
  console.log('after send: distance to the end', gap, 'reply text blocks so far', streamed)
  if (gap > 4) fail(`the chat did not scroll to the end on send (${gap}px left)`)
  await shot('sent-long-message')
  await slow(12)
  await idle()

  // 3. The purpose strip: at rest, and with messages under it.
  await page.evaluate((brief) => {
    const s = window.__wordelia.book.getState()
    const th = s.threads[0]
    s.saveThread({ ...th, brief })
  }, pt ? 'O arco de Marta na parte dois: as dúvidas dela e a lealdade a Elias.' : "Marta's arc in part two: her doubts and her loyalty to Elias.")
  await page.waitForSelector('.chat-brief', { timeout: 5000 })
  await page.locator('.chat-scroll').evaluate((el) => el.scrollTo({ top: 0 }))
  await page.waitForTimeout(400)
  if (await page.locator('.chat-brief.is-scrolled').count()) fail('the purpose strip has a shadow at the top')
  await shot('purpose-top')
  await page.locator('.chat-scroll').evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
  await page.waitForTimeout(400)
  if (!(await page.locator('.chat-brief.is-scrolled').count())) fail('the purpose strip has no shadow when messages scroll under it')
  await shot('purpose-scrolled')

  // 4. More threads, then the list view.
  await page.evaluate((pt) => {
    const s = window.__wordelia.book.getState()
    const at = (min) => new Date(Date.now() - min * 60000).toISOString()
    const mk = (id, title, brief, min, extra = {}) => ({ id, title, brief, digest: '', digestedCount: 0, createdAt: at(min), updatedAt: at(min), pinned: false, route: null, messages: [], readAt: at(min), ...extra })
    s.saveThread(mk('th_shot1', pt ? 'Títulos para o capítulo dois' : 'Titles for chapter two', '', 90))
    s.saveThread(mk('th_shot2', pt ? 'O visitante do bote azul' : 'The visitor in the blue boat', pt ? 'Quem é ele, e o que ele quer na ilha.' : 'Who he is, and what he wants on the island.', 60 * 26, { pinned: true }))
    s.saveThread(mk('th_shot3', pt ? 'Ritmo da tempestade' : 'Pace of the storm', '', 60 * 24 * 9))
  }, pt)
  await page.waitForTimeout(300)
  await page.locator('.chat-back').click()
  await page.waitForSelector('.thread-view', { timeout: 5000 })
  await page.waitForTimeout(400)
  const focused = await page.evaluate(() => document.activeElement?.classList.contains('thread-search'))
  if (!focused) fail('the search does not have the focus when the list opens')
  await shot('thread-list')
  // Hover a row: its options show in the place of the time.
  await page.locator('.thread-row').nth(1).hover()
  await page.waitForTimeout(300)
  await shot('thread-list-hover')
  // Search, then open a thread with the keyboard.
  await page.keyboard.type(pt ? 'visitante' : 'visitor')
  await page.waitForTimeout(300)
  const rows = await page.locator('.thread-row').count()
  if (rows !== 1) fail(`search shows ${rows} threads, not 1`)
  await shot('thread-search')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.chat-thread', { timeout: 5000 })
  await page.waitForTimeout(400)
  const title = await page.locator('.chat-title').innerText()
  if (!/visitante|visitor/i.test(title)) fail(`the wrong thread opened (${title})`)
  await shot('thread-opened')
  // Back to the list, and Esc returns to the open thread.
  await page.locator('.chat-back').click()
  await page.waitForSelector('.thread-view', { timeout: 5000 })
  await page.keyboard.press('Escape')
  await page.waitForSelector('.chat-thread', { timeout: 5000 })

  // 5. A thread at work and a thread with a new reply: their states in the list.
  await page.locator('.chat-back').click()
  await page.waitForSelector('.thread-view', { timeout: 5000 })
  await page.locator('.thread-new').click()
  await page.waitForSelector('.chat-thread', { timeout: 5000 })
  await slow(90)
  await send(pt ? 'Sugira três títulos para este capítulo.' : 'Suggest three titles for this chapter.')
  await page.waitForSelector('.think-line', { timeout: 10000 })
  await page.locator('.chat-back').click()
  await page.waitForSelector('.thread-row .status-dot.is-working', { timeout: 5000 })
  await page.waitForTimeout(300)
  await shot('thread-list-working')
  await page.waitForFunction(() => !document.querySelector('.thread-row .status-dot.is-working'), null, { timeout: 30000 })
  await slow(12)
  await page.waitForSelector('.thread-row .status-dot.is-unseen', { timeout: 10000 })
  await page.waitForTimeout(300)
  await shot('thread-list-states')
  const list = await threads()
  console.log('threads:', list.length)

  // 6. Inline mentions: "@Mar" opens the list, Enter puts a pill in the text, and the sentence goes on.
  await page.keyboard.press('Escape')
  await page.waitForSelector('.chat-thread', { timeout: 5000 })
  await page.locator('.composer-input').click()
  await page.keyboard.type(pt ? 'O que você acha da @Mar' : 'What do you think of @Mar')
  await page.waitForSelector('.mention-pop .mention-option', { timeout: 5000 })
  await page.waitForTimeout(250)
  await shot('mention-list')
  await page.keyboard.press('Enter')
  const tail = pt ? 'neste capítulo?' : 'in this chapter?'
  await page.keyboard.type(tail)
  await page.waitForTimeout(250)
  if ((await page.locator('.composer-input .mention-pill').count()) !== 1) fail('no mention pill in the composer')
  await shot('mention-pill')
  await crop('composer-pill', '.composer')
  // Backspace just after the pill removes it as one unit. Ctrl+Z brings it back.
  await page.keyboard.press('Control+End')
  for (let i = 0; i < tail.length + 1; i++) await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(150)
  const left = await page.evaluate(() => ({ pills: document.querySelectorAll('.composer-input .mention-pill').length, text: document.querySelector('.composer-input').innerText }))
  console.log('after Backspace:', JSON.stringify(left))
  if (left.pills !== 0 || /Mar/.test(left.text)) fail('Backspace did not remove the pill as one unit')
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(150)
  if ((await page.locator('.composer-input .mention-pill').count()) !== 1) fail('Ctrl+Z did not bring the pill back')
  // Shift+Enter starts a new line, Enter sends.
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type(pt ? 'E do @Eli' : 'And @Eli')
  await page.waitForSelector('.mention-pop .mention-option', { timeout: 5000 })
  await page.keyboard.press('Tab')
  await page.waitForTimeout(150)
  await shot('mention-two-lines')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  const sent = await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const th = s.threads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    const m = th.messages.filter((x) => x.role === 'user').at(-1)
    return { content: m.content, mentions: m.mentions }
  })
  console.log('sent message:', JSON.stringify(sent))
  const want = pt ? 'O que você acha da @Marta neste capítulo?\nE do @Elias' : 'What do you think of @Marta in this chapter?\nAnd @Elias'
  if (sent.content !== want) fail(`the sent text is "${sent.content}"`)
  if (sent.mentions?.length !== 2 || sent.mentions.some((m) => m.kind !== 'entry' || !m.id)) fail('the sent message has the wrong mentions')
  const empty = await page.evaluate(() => document.querySelector('.composer-input').innerText.trim())
  if (empty) fail('the composer is not empty after send')
  await idle()
  await page.waitForTimeout(400)
  const inline = await page.locator('.msg-user-text .mention-pill').count()
  if (inline < 2) fail('the sent message does not show its mentions in the text')
  await shot('mention-sent')
  await crop('sent-pills', '.msg-user')

  // 7. Edit the message: the pills are in the edit box too.
  await page.locator('.msg-user-wrap').last().hover()
  await page.locator('.msg-user-wrap').last().locator('.msg-edit-btn').click()
  await page.waitForSelector('.msg-edit-input .mention-pill', { timeout: 5000 })
  await page.waitForTimeout(300)
  await shot('mention-edit')
  await page.keyboard.press('Escape')
  await crop('chat-head', '.chat-head')

  // 8. "Ask the chat about this entry" in the Plan view: a pill at the end of the draft, and the cursor after it.
  await page.locator('.composer-input').click()
  await page.keyboard.type(pt ? 'Releia ' : 'Read ')
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(700)
  await page.locator('.entry-card').filter({ has: page.locator('.entry-card-name', { hasText: /^Marta$/ }) }).click()
  await page.waitForTimeout(600)
  await page.locator('.entry-tools .icon-btn').first().click()
  await page.waitForTimeout(600)
  await page.keyboard.type(pt ? 'e me diga o que falta.' : 'and tell me what is missing.')
  const asked = await page.evaluate(() => ({
    pills: document.querySelectorAll('.composer-input .mention-pill').length,
    text: document.querySelector('.composer-input').innerText.replace(/\s+/g, ' ').trim()
  }))
  console.log('mention from the Plan view:', JSON.stringify(asked))
  if (asked.pills !== 1 || !/(Releia|Read) Marta (e me diga|and tell)/.test(asked.text)) fail('the mention from the Plan view is not at the end of the draft')
  await shot('mention-from-plan')
  await page.locator('.composer-input').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(600)

  // 9. A narrow panel: the long placeholder makes the composer taller, and nothing is cut.
  await setChat(320)
  await page.locator('.chat-back').click()
  await page.locator('.thread-new').click()
  await page.waitForSelector('.chat-thread', { timeout: 5000 })
  await page.waitForTimeout(400)
  const fits = await page.evaluate(() => {
    const ph = document.querySelector('.chat-input-placeholder').getBoundingClientRect()
    const row = document.querySelector('.composer-row').getBoundingClientRect()
    return { placeholderBottom: Math.round(ph.bottom), rowTop: Math.round(row.top) }
  })
  console.log('narrow composer:', JSON.stringify(fits))
  if (fits.placeholderBottom > fits.rowTop + 1) fail('the placeholder goes under the composer buttons')
  await shot('composer-narrow')
}
