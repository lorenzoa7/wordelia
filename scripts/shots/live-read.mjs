// Live test with a real AI: the editor's read of a real chapter, the actions of its comments, a second read of
// the same chapter, the revision list, and a read of the last chapter (in progress) with one lens.
// Usage: LIVE_BOOK=<book folder> LIVE_OUT=<folder> node scripts/shot.mjs live-read --real-ai
// LIVE_CHAPTER: the index of the chapter to read (default 0). The scenario works on a copy of the book.
import { cp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot, work }) {
  const src = process.env.LIVE_BOOK
  const out = process.env.LIVE_OUT
  if (!src || !out) throw new Error('Set LIVE_BOOK and LIVE_OUT')
  const book = join(work, 'live-book')
  await cp(src, book, { recursive: true })
  await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ language: 'pt-BR' }))
  await page.evaluate((p) => window.__wordelia.openBook(p), book)
  await page.waitForSelector('.manuscript', { timeout: 30000 })
  await page.waitForTimeout(1500)

  const chapters = await page.evaluate(() => window.__wordelia.book.getState().chapters.map((c) => ({ id: c.id, title: c.title })))
  const target = chapters[Number(process.env.LIVE_CHAPTER ?? 0)]
  const last = chapters.at(-1)
  const streaming = () => page.evaluate(() => Object.values(window.__wordelia.chat.getState().streaming).some(Boolean))
  const comments = () => page.evaluate(() => window.__wordelia.comments.getState().list)
  const until = async (what, check, ms) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (await check()) return Math.round((Date.now() - t0) / 1000)
      await page.waitForTimeout(1000)
    }
    throw new Error(`live-read: ${what}`)
  }
  const card = (id) => page.locator(`.cm-column .cm-card[data-comment="${id}"]`)
  const closeToasts = async () => {
    for (let i = 0; i < 10 && (await page.locator('.toast .toast-close').count()); i++) await page.locator('.toast .toast-close').first().click({ timeout: 1000 }).catch(() => {})
  }
  const steps = []
  const log = (step, data) => {
    steps.push({ step, ...data })
    console.log(step, JSON.stringify(data))
  }

  async function read(ch, lens, inProgress, name) {
    await page.evaluate((id) => window.__wordelia.book.getState().selectChapter(id), ch.id)
    await page.waitForTimeout(1000)
    const before = (await comments()).map((c) => c.id)
    await page.evaluate((r) => window.__wordelia.startRead(r), { chapterId: ch.id, lens, inProgress })
    await until(`the read of "${name}" did not start`, streaming, 60000)
    await page.waitForTimeout(5000)
    await shot(`${name}-streaming`)
    const seconds = await until(`the read of "${name}" did not finish`, async () => !(await streaming()), 15 * 60000)
    await page.waitForTimeout(3000)
    const thread = await page.evaluate((id) => {
      const t = window.__wordelia.book.getState().threads.find((x) => x.readChapterId === id)
      const reply = t.messages.at(-1)
      const ask = t.messages.at(-2)
      return { title: t.title, ask: ask.content, read: ask.read, reply: reply.content, model: reply.model, error: reply.error, tokens: reply.usage ?? reply.tokens ?? null }
    }, ch.id)
    const made = (await comments()).filter((c) => !before.includes(c.id))
    const ranges = await page.evaluate((id) => {
      const m = window.__commentMarks?.commentRanges(id)
      return m ? [...m.keys()] : null
    }, ch.id)
    await shot(`${name}-margin`)
    await page.locator('.chat-scroll, .chat-messages').first().evaluate((el) => el.scrollTo(0, el.scrollHeight)).catch(() => {})
    await shot(`${name}-letter`)
    const result = {
      chapter: ch.title,
      lens,
      inProgress,
      seconds,
      ...thread,
      notesInReply: (thread.reply.match(/<note\b/g) || []).length,
      resolved: /<resolved ids="([^"]*)"/.exec(thread.reply)?.[1] ?? null,
      comments: made.map((c) => ({ id: c.id, lens: c.lens, rank: c.rank, text: c.text, passage: c.passage, sources: c.sources, lost: Boolean(c.lost), anchored: ranges ? ranges.includes(c.id) : null }))
    }
    log(`read:${name}`, { seconds, notesInReply: result.notesInReply, comments: result.comments.length, anchored: result.comments.filter((c) => c.anchored).length, resolved: result.resolved, error: thread.error ?? null })
    return result
  }

  // 1. A read of the chapter with all lenses.
  const first = await read(target, 'all', false, 'read1')
  await closeToasts()

  // 2. The actions. "Polish passage" on a comment of style (or reader, or proofread): the review opens on the
  // passage with the comment, then Enter accepts it, and the toast marks the comment as done.
  const open = first.comments.filter((c) => c.anchored)
  const toPolish = open.find((c) => c.lens === 'style') ?? open.find((c) => c.lens === 'reader') ?? open.find((c) => c.lens === 'proofread')
  if (toPolish && (await card(toPolish.id).count())) {
    await card(toPolish.id).click()
    await card(toPolish.id).getByRole('button', { name: /^Polir trecho$/ }).click()
    const seconds = await until('the review of the polish did not open', () => page.evaluate(() => window.__review.state()?.phase === 'ready'), 5 * 60000)
    const review = await page.evaluate(() => {
      const r = window.__review.state()
      const ed = window.__wordelia.editor()
      return { before: ed.state.doc.textBetween(r.from, r.to, '\n'), proposed: r.proposed }
    })
    await shot('polish-review')
    await page.keyboard.press('Enter')
    const ask = page.locator('.toast', { hasText: /Marcar o comentário como feito\?/ })
    await ask.waitFor({ timeout: 10000 })
    await ask.locator('.toast-action').click()
    await page.waitForTimeout(800)
    const state = (await comments()).find((c) => c.id === toPolish.id)?.state
    log('polish', { comment: toPolish.text, seconds, ...review, stateAfter: state })
  } else log('polish', { skipped: 'no anchored comment of style, reader or proofread with a card' })
  await closeToasts()

  // "It's intentional" on a continuity comment, with a reason; "Ignore" on another comment.
  const intended = (await comments()).find((c) => c.chapterId === target.id && c.state === 'open' && c.lens === 'continuity')
  if (intended && (await card(intended.id).count())) {
    await card(intended.id).getByRole('button', { name: /^É intencional$/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ timeout: 3000 })
    await dialog.locator('input').fill('Teste: o autor quer assim.')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    log('intentional', { comment: intended.text, state: (await comments()).find((c) => c.id === intended.id)?.state })
  } else log('intentional', { skipped: 'no open continuity comment with a card' })
  const ignored = (await comments()).find((c) => c.chapterId === target.id && c.state === 'open' && c.lens !== 'continuity')
  if (ignored && (await card(ignored.id).count())) {
    await card(ignored.id).getByRole('button', { name: /^Ignorar$/ }).click()
    await page.waitForTimeout(800)
    log('ignore', { comment: ignored.text, state: (await comments()).find((c) => c.id === ignored.id)?.state })
  }
  await closeToasts()

  // 3. A second read of the same chapter: it gets the earlier comments, and must not repeat the closed ones.
  const closed = (await comments()).filter((c) => c.chapterId === target.id && c.state !== 'open').map((c) => ({ id: c.id, state: c.state, passage: c.passage, text: c.text }))
  const second = await read(target, 'all', false, 'read2')
  const repeated = second.comments.filter((c) => closed.some((k) => k.passage === c.passage)).map((c) => c.passage)
  log('second read', { closedBefore: closed.length, repeatedPassages: repeated, resolved: second.resolved })
  await closeToasts()

  // 4. The revision list.
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ sidebarOpen: true }))
  await page.waitForTimeout(600)
  await page.locator('.revision-item').click()
  await page.waitForSelector('.revision', { timeout: 5000 })
  await page.waitForTimeout(600)
  await shot('revision-list')

  // 5. The last chapter, in progress, with the continuity lens.
  const third = await read(last, 'continuity', true, 'read3')

  const report = { book: src, chapters: chapters.length, steps, reads: [first, second, third], closedBeforeSecondRead: closed, finalComments: await comments() }
  await writeFile(join(out, 'read-report.json'), JSON.stringify(report, null, 1))
  console.log('report:', join(out, 'read-report.json'))
}
