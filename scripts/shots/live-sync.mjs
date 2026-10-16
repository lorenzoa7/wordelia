// Live test with a real AI: add new facts to a chapter, press Sync, and accept the proposals.
// Usage: LIVE_BOOK=<book folder with a planning> LIVE_OUT=<folder> node scripts/shot.mjs live-sync --real-ai
// LIVE_TEXT: the paragraph to add at the end of LIVE_CHAPTER (default: chapter index 3).
// LIVE_ENTRY: the entry to print after the sync (default: Elias).
import { cp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot, work }) {
  const src = process.env.LIVE_BOOK
  const out = process.env.LIVE_OUT
  if (!src || !out) throw new Error('Set LIVE_BOOK and LIVE_OUT')
  const book = join(work, 'live-book')
  await cp(src, book, { recursive: true })
  await page.evaluate((p) => window.__wordelia.openBook(p), book)
  await page.waitForTimeout(1200)

  const chapter = Number(process.env.LIVE_CHAPTER ?? 3)
  const text =
    process.env.LIVE_TEXT ??
    'Naquela noite, Elias contou a Marta que tinha uma filha, Clara, de sete anos, que morava com a avó no continente. Clara tinha os olhos claros do pai e uma cicatriz no queixo.'
  await page.locator('.chapter-item').nth(chapter).click()
  await page.waitForTimeout(900)
  await page.evaluate((t) => {
    const ed = window.__wordelia.editor()
    ed.chain().insertContentAt(ed.state.doc.content.size, { type: 'paragraph', content: [{ type: 'text', text: t }] }).run()
  }, text)
  await page.waitForTimeout(1500)

  const before = await page.evaluate(() => {
    const st = window.__wordelia.book.getState()
    const t = st.threads.find((x) => x.id === 'th_planning_sync')
    return { assistant: t ? t.messages.filter((m) => m.role === 'assistant').length : 0, entries: st.entries.length }
  })
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(600)
  await page.locator('button', { hasText: 'Sync with manuscript' }).click()
  const t0 = Date.now()
  let reply = null
  while (Date.now() - t0 < 6 * 60_000) {
    await page.waitForTimeout(3000)
    reply = await page.evaluate((n) => {
      const t = window.__wordelia.book.getState().threads.find((x) => x.id === 'th_planning_sync')
      const all = t ? t.messages.filter((m) => m.role === 'assistant') : []
      return all.length > n ? { content: all.at(-1).content, model: all.at(-1).model, error: all.at(-1).error } : null
    }, before.assistant)
    if (reply) break
  }
  const seconds = Math.round((Date.now() - t0) / 1000)
  if (!reply) throw new Error('No sync reply')
  await page.waitForTimeout(1500)
  await shot('sync-reply')
  const bulk = page.locator('.msg-bulk .proposal-btn.is-accept')
  if (await bulk.count()) await bulk.click()
  else {
    const one = page.locator('.msg-ai').last().locator('.proposal-btn.is-accept')
    for (let k = await one.count(); k > 0; k--) {
      await one.first().click()
      await page.waitForTimeout(300)
    }
  }
  await page.waitForTimeout(2500)
  await shot('accepted')
  const states = await page.locator('.msg-ai').last().locator('.hunk-badge').allInnerTexts()
  const after = await page.evaluate((name) => {
    const st = window.__wordelia.book.getState()
    const entry = st.entries.find((e) => e.name.startsWith(name))
    return { entries: st.entries.map((e) => `${e.category}/${e.name}`), entry: entry?.body }
  }, process.env.LIVE_ENTRY ?? 'Elias')
  const report = { seconds, model: reply.model, error: reply.error, reply: reply.content, states, entriesBefore: before.entries, ...after }
  await writeFile(join(out, 'sync-report.json'), JSON.stringify(report, null, 1))
  console.log(JSON.stringify({ ...report, reply: reply.content.slice(0, 4000) }, null, 1))
}
