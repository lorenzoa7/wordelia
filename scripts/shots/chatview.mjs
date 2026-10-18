// The chat changes of versions 0.5 and 0.6: the thread list view, the proposal card header with a long title,
// the scroll when the user sends, the purpose strip, inline mentions in the composer, the "New thread" button,
// new threads that exist only after their first message, and a thread list with no selected row.
// Usage: node scripts/shot.mjs chatview [--en] [--dark]
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ app, page, shot, openBook, book }) {
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
  // The thread files of the book on disk.
  const threadDir = join(book, 'ai', 'threads')
  const onDisk = async () => {
    const names = (await readdir(threadDir).catch(() => [])).filter((n) => n.endsWith('.json'))
    return Promise.all(names.map(async (n) => JSON.parse(await readFile(join(threadDir, n), 'utf8'))))
  }
  const emptyOnDisk = async () => (await onDisk()).filter((th) => th.messages.length === 0).map((th) => th.id)
  // How far the chat is from its end, in pixels: scrollTop + clientHeight ≈ scrollHeight at the end.
  const gapNow = () => page.locator('.chat-scroll').evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)
  const rowTitles = () => page.locator('.thread-item-title').allInnerTexts()

  // Two empty threads that an older version saved: one blank, one with a purpose. Neither may show in the list.
  // The blank one goes away when the book opens.
  await mkdir(threadDir, { recursive: true })
  const legacy = (id, brief) => ({ id, title: 'New thread', brief, digest: '', digestedCount: 0, createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', pinned: false, route: null, messages: [], readAt: '2026-01-01T10:00:00.000Z' })
  await writeFile(join(threadDir, 'th_legacy_blank.json'), JSON.stringify(legacy('th_legacy_blank', '')))
  await writeFile(join(threadDir, 'th_legacy_brief.json'), JSON.stringify(legacy('th_legacy_brief', 'A purpose without messages')))

  // The Portuguese book with the interface in Portuguese (Brazil), as the author uses it.
  if (pt) {
    await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ language: 'pt-BR' }))
    await page.waitForTimeout(300)
  }
  await openBook()
  await setChat(400)
  await page.waitForTimeout(300)
  const atOpen = (await onDisk()).map((th) => th.id).sort()
  console.log('thread files after open:', JSON.stringify(atOpen))
  if (atOpen.includes('th_legacy_blank')) fail('the blank thread of an older version is still on disk')
  if (await page.locator('.chat-brief').count()) fail('the chat opened on an empty thread of an older version')

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

  // 2. Send a long message with a quote and two mention pills. The chat is at its very end at once, stays there
  //    when the layout changes after the first frame, and follows the reply while it streams. A scroll up stops
  //    the follow; a scroll back to the end starts it again.
  await slow(150)
  await page.evaluate((pt) => {
    const s = window.__wordelia.book.getState()
    const ch = s.chapters[0]
    const text = pt
      ? 'Elias acendeu a lâmpada do farol às seis em ponto, como fazia havia vinte e dois anos. Lá fora, o mar estava agitado, e as ondas batiam contra as pedras com uma raiva antiga, quase pessoal.'
      : 'Elias lit the lamp of the lighthouse at six sharp, as he had for twenty-two years. Outside, the sea was rough, and the waves hit the rocks with an old, almost personal anger.'
    window.__wordelia.chat.setState({ quotes: [{ id: 'q_shot', text, source: { kind: 'chapter', id: ch.id, label: ch.title } }] })
  }, pt)
  await page.waitForTimeout(200)
  await page.locator('.composer-input').click()
  await page.keyboard.type(pt ? 'Sobre este trecho, e a @Mar' : 'About this passage, and @Mar')
  await page.waitForSelector('.mention-pop .mention-option', { timeout: 5000 })
  await page.keyboard.press('Enter')
  await page.keyboard.type(pt ? 'com o @Eli' : 'with @Eli')
  await page.waitForSelector('.mention-pop .mention-option', { timeout: 5000 })
  await page.keyboard.press('Enter')
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type(pt ? `Linha ${i + 1} de uma pergunta longa sobre o ritmo do capítulo.` : `Line ${i + 1} of a long question about the pace of the chapter.`)
  }
  await page.waitForTimeout(200)
  // The measure runs in each resize step of the browser, after the chat (its observer is older), so it sees what the screen shows.
  await page.evaluate(() => {
    const box = document.querySelector('.chat-scroll')
    const list = document.querySelector('.chat-messages')
    const w = (window.__scroll = { samples: [], t0: 0 })
    w.measure = () =>
      w.samples.push({
        t: Math.round(performance.now() - w.t0),
        gap: Math.round((box.scrollHeight - box.scrollTop - box.clientHeight) * 10) / 10,
        think: Boolean(document.querySelector('.msg-ai.is-streaming .think')),
        text: Boolean(document.querySelector('.msg-ai.is-streaming .msg-ai-text'))
      })
    w.ro = new ResizeObserver(w.measure)
    w.ro.observe(box)
    w.ro.observe(list)
    w.t0 = performance.now()
  })
  // A new observer reports the sizes once at the start: that is the state before the send, not a frame after it.
  await page.waitForTimeout(100)
  await page.evaluate(() => {
    window.__scroll.samples = []
    window.__scroll.t0 = performance.now()
  })
  await page.keyboard.press('Enter')
  // The first frames after send.
  await page.waitForTimeout(60)
  const firstGap = await gapNow()
  await shot('sent-long-message')
  // A layout change after the first frame (as when a font loads late): the last message gets taller.
  await page.evaluate(() => {
    const last = [...document.querySelectorAll('.msg-user')].at(-1)
    last.style.paddingBottom = '140px'
  })
  await page.waitForTimeout(120)
  const afterLate = await gapNow()
  await page.evaluate(() => ([...document.querySelectorAll('.msg-user')].at(-1).style.paddingBottom = ''))
  await page.waitForSelector('.msg-ai.is-streaming .msg-ai-text', { timeout: 15000 })
  await page.waitForTimeout(700)
  const streamingGap = await gapNow()
  await shot('sent-reply-streams')
  const sent = await page.evaluate(() => {
    const m = [...document.querySelectorAll('.msg-user')].at(-1)
    return { pills: m.querySelectorAll('.mention-pill').length, quotes: m.querySelectorAll('.msg-quote').length, height: Math.round(m.getBoundingClientRect().height) }
  })
  console.log('scroll on send:', JSON.stringify({ firstGap, afterLate, streamingGap, sent }))
  if (sent.pills !== 2 || sent.quotes !== 1) fail('the long message has no quote or no pills')
  if (firstGap > 2) fail(`the chat is not at its end after send (${firstGap}px left)`)
  if (afterLate > 2) fail(`the chat did not stay at its end after a late layout change (${afterLate}px left)`)
  if (streamingGap > 2) fail(`the chat does not follow the reply (${streamingGap}px left)`)
  // A scroll up (the mouse wheel) stops the follow while the reply streams.
  const chatBox = await page.locator('.chat-scroll').boundingBox()
  await page.mouse.move(chatBox.x + chatBox.width / 2, chatBox.y + chatBox.height / 2)
  const mark = (key) => page.evaluate((k) => (window.__scroll[k] = performance.now() - window.__scroll.t0), key)
  await mark('upAt')
  await page.mouse.wheel(0, -500)
  // Wait until the scroll of the wheel ends (the same position for 200 ms).
  const settled = () =>
    page.locator('.chat-scroll').evaluate(async (el) => {
      let last = el.scrollTop
      for (let still = 0; still < 4; ) {
        await new Promise((r) => setTimeout(r, 50))
        still = Math.abs(el.scrollTop - last) < 0.5 ? still + 1 : 0
        last = el.scrollTop
      }
      return last
    })
  const upTop = await settled()
  await page.waitForTimeout(1200)
  const up = await page.locator('.chat-scroll').evaluate((el) => ({ top: el.scrollTop, gap: el.scrollHeight - el.scrollTop - el.clientHeight }))
  const stillStreaming = await page.locator('.msg-ai.is-streaming').count()
  console.log('after a scroll up:', JSON.stringify({ upTop, ...up, stillStreaming }))
  if (!stillStreaming) fail('the reply ended before the scroll test (make the mock slower)')
  if (Math.abs(up.top - upTop) > 1 || up.gap < 200) fail('the chat moved back to the end after the user scrolled up')
  await shot('scrolled-up-while-streaming')
  // Back to the end: the follow starts again.
  await mark('downAt')
  await page.mouse.wheel(0, 5000)
  await page.waitForTimeout(900)
  const again = await gapNow()
  console.log('back at the end, while the reply streams:', again)
  if (again > 2) fail(`the chat does not follow again after a scroll back to the end (${again}px left)`)
  await idle()
  await page.waitForTimeout(500)
  const endGap = await gapNow()
  const rec = await page.evaluate(() => {
    const w = window.__scroll
    w.ro.disconnect()
    return { samples: w.samples, upAt: w.upAt, downAt: w.downAt }
  })
  // Each resize step before the scroll up, and each one after the scroll back to the end, must be at the end.
  const before = rec.samples.filter((s) => s.t < rec.upAt)
  const after = rec.samples.filter((s) => s.t > rec.downAt + 500)
  const worst = Math.max(...before.map((s) => s.gap))
  const worstAfter = Math.max(0, ...after.map((s) => s.gap))
  console.log(
    `resize steps measured: ${rec.samples.length}; before the scroll up: ${before.length}, worst gap ${worst}px; after the scroll back: ${after.length}, worst gap ${worstAfter}px; ` +
      `thinking line seen: ${rec.samples.some((s) => s.think)}; reply text seen: ${rec.samples.some((s) => s.text)}; at the end after the reply: ${endGap}px`
  )
  if (worst > 2) console.log('samples before the scroll up:', JSON.stringify(before))
  if (worst > 2) fail(`a frame after send was not at the end (${worst}px)`)
  if (worstAfter > 2) fail(`a frame after the scroll back to the end was not at the end (${worstAfter}px)`)
  if (!rec.samples.some((s) => s.think) || !rec.samples.some((s) => s.text)) fail('the measure did not see the thinking line and the reply')
  if (endGap > 2) fail(`the chat is not at its end after the reply (${endGap}px left)`)
  await shot('reply-done-at-end')
  await slow(12)

  // 3. The purpose strip: at rest, and with messages under it.
  await page.evaluate((brief) => {
    const s = window.__wordelia.book.getState()
    const th = s.threads.find((x) => x.id === window.__wordelia.chat.getState().activeThreadId)
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
    const talk = (min, q, a) => [
      { id: `m_${min}_q`, role: 'user', content: q, createdAt: at(min + 1) },
      { id: `m_${min}_a`, role: 'assistant', content: a, createdAt: at(min) }
    ]
    const mk = (id, title, brief, min, extra = {}) => ({
      id,
      title,
      brief,
      digest: '',
      digestedCount: 0,
      createdAt: at(min),
      updatedAt: at(min),
      pinned: false,
      route: null,
      messages: talk(min, title, pt ? 'Uma resposta curta.' : 'A short reply.'),
      readAt: at(min),
      ...extra
    })
    s.saveThread(mk('th_shot1', pt ? 'Títulos para o capítulo dois' : 'Titles for chapter two', '', 90))
    s.saveThread(mk('th_shot2', pt ? 'O visitante do bote azul' : 'The visitor in the blue boat', pt ? 'Quem é ele, e o que ele quer na ilha.' : 'Who he is, and what he wants on the island.', 60 * 26, { pinned: true }))
    s.saveThread(mk('th_shot3', pt ? 'Ritmo da tempestade' : 'Pace of the storm', '', 60 * 24 * 9))
  }, pt)
  await page.waitForTimeout(300)
  await page.locator('.chat-back').click()
  await page.waitForSelector('.thread-view', { timeout: 5000 })
  // The pointer leaves the panel, so no row has the hover color.
  await page.mouse.move(700, 500)
  await page.waitForTimeout(400)
  const focused = await page.evaluate(() => document.activeElement?.classList.contains('thread-search'))
  if (!focused) fail('the search does not have the focus when the list opens')
  // No row looks selected: the open thread has no other color, and no row is marked as current.
  const look = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.thread-row')]
    return {
      rows: rows.length,
      colored: rows.filter((r) => getComputedStyle(r).backgroundColor !== 'rgba(0, 0, 0, 0)' || getComputedStyle(r.querySelector('.thread-item')).backgroundColor !== 'rgba(0, 0, 0, 0)').length,
      current: document.querySelectorAll('.thread-view [aria-current], .thread-row.is-active').length
    }
  })
  console.log('thread list rows:', JSON.stringify(look), JSON.stringify(await rowTitles()))
  if (look.rows !== 4) fail(`the list shows ${look.rows} threads, not 4 (empty threads must not show)`)
  if (look.colored || look.current) fail('a row of the thread list looks selected')
  // The "New thread" button has a tone of the panel, not the white of the paper.
  const btn = await page.evaluate(() => {
    const b = document.querySelector('.thread-new')
    const probe = document.createElement('div')
    probe.style.background = 'var(--paper)'
    document.body.append(probe)
    const paper = getComputedStyle(probe).backgroundColor
    probe.remove()
    return { bg: getComputedStyle(b).backgroundColor, paper, panel: getComputedStyle(document.querySelector('.chat-panel')).backgroundColor }
  })
  console.log('New thread button:', JSON.stringify(btn))
  if (btn.bg === btn.paper) fail('the New thread button is the white of the paper')
  await shot('thread-list')
  await crop('list-head', '.thread-view .chat-head')
  await page.locator('.thread-new').hover()
  await page.waitForTimeout(250)
  const hoverBg = await page.locator('.thread-new').evaluate((b) => getComputedStyle(b).backgroundColor)
  if (hoverBg === btn.bg) fail('the New thread button has no hover color')
  await crop('list-head-hover', '.thread-view .chat-head')
  // Hover a row: its options show in the place of the time.
  await page.locator('.thread-row').nth(1).hover()
  await page.waitForTimeout(300)
  await shot('thread-list-hover')
  // The keyboard: a focus ring on the focused row, and still no row with the color of a selection.
  await page.mouse.move(700, 500)
  await page.locator('.thread-search').focus()
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(200)
  const ring = await page.evaluate(() => {
    const el = document.activeElement
    return { row: el?.classList.contains('thread-item'), outline: getComputedStyle(el).outlineStyle, bg: getComputedStyle(el.closest('.thread-row')).backgroundColor }
  })
  console.log('keyboard focus in the list:', JSON.stringify(ring))
  if (!ring.row || ring.outline === 'none') fail('the focused row has no focus ring')
  await shot('thread-list-keyboard')
  await page.locator('.thread-search').focus()
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

  // 5. "New thread" saves nothing until the first message. Back to the list: no new row, no new file.
  await page.waitForTimeout(800)
  const filesBefore = (await onDisk()).length
  const storeBefore = (await threads()).length
  await page.locator('.chat-back').click()
  await page.waitForSelector('.thread-view', { timeout: 5000 })
  const titlesBefore = await rowTitles()
  await page.locator('.thread-new').click()
  await page.waitForSelector('.chat-thread', { timeout: 5000 })
  await page.waitForSelector('.chat-empty', { timeout: 5000 })
  // A purpose for the new thread, before its first message: it stays in memory only.
  await page.locator('.chat-title').click()
  await page.waitForSelector('.dialog textarea', { timeout: 5000 })
  await page.locator('.dialog textarea').fill(pt ? 'Um propósito antes da primeira mensagem.' : 'A purpose before the first message.')
  await page.locator('.dialog-foot .btn-primary').click()
  await page.waitForSelector('.chat-brief', { timeout: 5000 })
  await page.waitForTimeout(800)
  await shot('new-thread-blank')
  let blank = { files: (await onDisk()).length, store: (await threads()).length, empty: await emptyOnDisk() }
  console.log('a new thread, before its first message:', JSON.stringify(blank))
  if (blank.files !== filesBefore || blank.store !== storeBefore) fail('"New thread" saved a thread before its first message')
  await page.locator('.chat-back').click()
  await page.waitForSelector('.thread-view', { timeout: 5000 })
  await page.waitForTimeout(800)
  const titlesAfter = await rowTitles()
  blank = { files: (await onDisk()).length, store: (await threads()).length, empty: await emptyOnDisk() }
  console.log('back in the list:', JSON.stringify(blank), JSON.stringify(titlesAfter))
  if (JSON.stringify(titlesAfter) !== JSON.stringify(titlesBefore)) fail('the empty new thread shows in the list')
  if (blank.files !== filesBefore || blank.store !== storeBefore) fail('the empty new thread was saved')
  await shot('list-after-blank')
  // Esc goes back to the thread that was open before "New thread".
  await page.keyboard.press('Escape')
  await page.waitForSelector('.chat-thread', { timeout: 5000 })
  if (!/visitante|visitor/i.test(await page.locator('.chat-title').innerText())) fail('Esc did not go back to the open thread')

  // 6. A thread at work and a thread with a new reply: their states in the list. The first message saves the new thread.
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
  const disk = await onDisk()
  console.log('threads:', list.length, 'files:', disk.length)
  if (disk.length !== filesBefore + 1) fail('the first message did not save the new thread')
  if (!disk.some((th) => th.messages[0]?.content.startsWith(pt ? 'Sugira três' : 'Suggest three') && th.messages.length === 2)) fail('the new thread on disk does not have its messages')

  // 7. Inline mentions: "@Mar" opens the list, Enter puts a pill in the text, and the sentence goes on.
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
  const sentMention = await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const th = s.threads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    const m = th.messages.filter((x) => x.role === 'user').at(-1)
    return { content: m.content, mentions: m.mentions }
  })
  console.log('sent message:', JSON.stringify(sentMention))
  const want = pt ? 'O que você acha da @Marta neste capítulo?\nE do @Elias' : 'What do you think of @Marta in this chapter?\nAnd @Elias'
  if (sentMention.content !== want) fail(`the sent text is "${sentMention.content}"`)
  if (sentMention.mentions?.length !== 2 || sentMention.mentions.some((m) => m.kind !== 'entry' || !m.id)) fail('the sent message has the wrong mentions')
  const empty = await page.evaluate(() => document.querySelector('.composer-input').innerText.trim())
  if (empty) fail('the composer is not empty after send')
  await idle()
  await page.waitForTimeout(400)
  const inline = await page.locator('.msg-user-text .mention-pill').count()
  if (inline < 2) fail('the sent message does not show its mentions in the text')
  await shot('mention-sent')
  await crop('sent-pills', '.msg-user')

  // 8. Edit the message: the pills are in the edit box too.
  await page.locator('.msg-user-wrap').last().hover()
  await page.locator('.msg-user-wrap').last().locator('.msg-edit-btn').click()
  await page.waitForSelector('.msg-edit-input .mention-pill', { timeout: 5000 })
  await page.waitForTimeout(300)
  await shot('mention-edit')
  await page.keyboard.press('Escape')
  await crop('chat-head', '.chat-head')

  // 9. "Ask the chat about this entry" in the Plan view: a pill at the end of the draft, and the cursor after it.
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

  // 10. A narrow panel: the long placeholder makes the composer taller, and nothing is cut.
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

  // 11. Close the book while the new thread shows, and open it again: no empty thread on disk, and the chat
  //     opens on the last thread with messages.
  const newest = (await threads()).filter((th) => th.messages.length).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  await page.evaluate(() => window.__wordelia.book.getState().close())
  await page.waitForTimeout(800)
  await openBook()
  await page.waitForTimeout(400)
  const reopened = {
    title: await page.locator('.chat-title').innerText(),
    active: await page.evaluate(() => window.__wordelia.chat.getState().activeThreadId),
    blank: await page.evaluate(() => Boolean(window.__wordelia.chat.getState().blank)),
    empty: (await emptyOnDisk()).filter((id) => id !== 'th_legacy_brief'),
    files: (await onDisk()).length
  }
  console.log('after reopen:', JSON.stringify(reopened), 'newest thread with messages:', newest.id)
  if (reopened.blank) fail('the chat opened on a new thread')
  if (reopened.empty.length) fail(`empty threads on disk: ${reopened.empty.join(', ')}`)
  if (reopened.active !== newest.id) fail(`the chat opened on "${reopened.title}", not on the last thread with messages`)
  await shot('reopened')

  // 12. The bar for all the proposals of a reply, with 32 proposals and long file names, at each panel width:
  //     the title, one line of files (names with "…", then "+N") and the two buttons fit in the bar. A button
  //     that does not fit beside the text goes to its own line; no button is ever cut.
  const names = pt
    ? ['Revisão do manuscrito e da continuidade da segunda parte', 'Elias Andrade, o faroleiro de Santa Ilha desde a grande tempestade', 'Marta e o caderno de bordo do bote azul']
    : ['Manuscript review and the continuity of the second part', 'Elias Andrade, the keeper of Saint Isle since the great storm', 'Marta and the logbook of the blue boat']
  await page.evaluate((names) => {
    const book = window.__wordelia.book.getState()
    const now = new Date().toISOString()
    const creates = Array.from({ length: 32 }, (_, i) => {
      const name = i < names.length ? names[i] : `${names[i % names.length]} (${i + 1})`
      return `<create file="planning/Characters/${name}.md">\n---\nsummary: Note ${i + 1}.\n---\nText of note ${i + 1}.\n</create>`
    })
    const thread = { id: 'th_bulk', title: 'Bulk bar', brief: '', digest: '', digestedCount: 0, createdAt: now, updatedAt: now, pinned: false, route: null,
      messages: [
        { id: 'm_bulk_user', role: 'user', content: 'Update the notes.', createdAt: now },
        { id: 'm_bulk_ai', role: 'assistant', content: `Thirty-two notes.\n\n${creates.join('\n\n')}`, createdAt: now }
      ] }
    book.saveThread(thread)
    window.__wordelia.chat.getState().setActiveThread('th_bulk')
  }, names)
  await page.waitForSelector('.msg-bulk', { timeout: 10000 })
  const fullWords = pt ? 'Aplicar todas as 32' : 'Apply all 32'
  for (const w of [320, 360, 400, 520, 680]) {
    await setChat(w)
    await page.waitForTimeout(350)
    const r = await page.evaluate(() => {
      const bar = document.querySelector('.msg-bulk')
      const rect = (el) => {
        const b = el.getBoundingClientRect()
        return { l: Math.round(b.left * 10) / 10, r: Math.round(b.right * 10) / 10, t: Math.round(b.top * 10) / 10, b: Math.round(b.bottom * 10) / 10 }
      }
      const cut = (el) => el.scrollWidth > el.clientWidth + 1
      const buttons = [...bar.querySelectorAll('.msg-bulk-actions .proposal-btn')]
      const files = bar.querySelector('.msg-bulk-files')
      const more = bar.querySelector('.msg-bulk-more')
      const names = bar.querySelector('.msg-bulk-names')
      const style = getComputedStyle(bar)
      const inner = { l: bar.getBoundingClientRect().left + parseFloat(style.borderLeftWidth), r: bar.getBoundingClientRect().right - parseFloat(style.borderRightWidth) }
      return {
        bar: rect(bar),
        inner,
        count: { ...rect(bar.querySelector('.msg-bulk-count')), lines: Math.round(bar.querySelector('.msg-bulk-count').getBoundingClientRect().height / parseFloat(getComputedStyle(bar.querySelector('.msg-bulk-count')).lineHeight)) },
        files: { ...rect(files), lines: Math.round(files.getBoundingClientRect().height / parseFloat(getComputedStyle(files).fontSize) / 1.2) },
        names: { ...rect(names), ellipsis: cut(names) },
        more: more ? { ...rect(more), text: more.textContent, cut: cut(more) } : null,
        buttons: buttons.map((b) => ({ ...rect(b), text: b.textContent.trim(), cut: cut(b) })),
        scroll: { cut: document.querySelector('.chat-scroll').scrollWidth > document.querySelector('.chat-scroll').clientWidth + 1 }
      }
    })
    console.log(`reply bar at ${w}px:`, JSON.stringify(r))
    const inside = (b) => b.l >= r.inner.l - 0.5 && b.r <= r.inner.r + 0.5
    if (!inside(r.count) || !inside(r.files)) fail(`the text of the reply bar goes past the bar at ${w}px`)
    if (r.files.lines !== 1) fail(`the files of the reply bar take ${r.files.lines} lines at ${w}px`)
    if (!r.more || r.more.text !== '+29' || r.more.cut || !inside(r.more)) fail(`the count of the other files does not show at ${w}px`)
    if (r.buttons.length !== 2) fail('the reply bar has no two buttons')
    for (const b of r.buttons) {
      if (!inside(b) || b.cut) fail(`the button "${b.text}" is cut at ${w}px`)
    }
    if (!r.buttons.some((b) => b.text.includes(fullWords))) fail(`no button says "${fullWords}" at ${w}px`)
    const [a, b] = r.buttons
    if (a.t === b.t && a.r > b.l + 0.5) fail(`the two buttons overlap at ${w}px`)
    // The buttons are beside the text or under it, never on top of it.
    const meet = (p, q) => p.l < q.r - 0.5 && q.l < p.r - 0.5 && p.t < q.b - 0.5 && q.t < p.b - 0.5
    for (const btn of r.buttons) if (meet(btn, r.count) || meet(btn, r.files)) fail(`the button "${btn.text}" covers the text at ${w}px`)
    if (r.scroll.cut) fail(`the chat scrolls sideways at ${w}px`)
    await shot(`reply-bar-${w}`)
    await crop(`reply-bar-${w}`, '.msg-bulk')
  }
}
