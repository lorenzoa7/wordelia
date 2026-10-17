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
}
