// Live test with a real AI: run actions on paragraphs of a real book and print before and after.
// Usage: LIVE_BOOK=<book folder> LIVE_OUT=<folder> node scripts/shot.mjs live-polish --real-ai
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
  const cases = (process.env.LIVE_CASES ?? 'polish:1:3:1,grammar:2:5:1,polish:1:8:3,tighten:3:4:2').split(',')
  const report = []
  // Keep every toast text: toasts close before the report is written.
  await page.evaluate(() => {
    window.__toasts = []
    new MutationObserver(() => {
      for (const t of document.querySelectorAll('.toast')) {
        const text = t.textContent.trim()
        if (text && !window.__toasts.includes(text)) window.__toasts.push(text)
      }
    }).observe(document.body, { childList: true, subtree: true })
  })

  for (const c of cases) {
    const [action, chapter, para, count] = c.split(':')
    await page.locator('.chapter-item').nth(Number(chapter)).click()
    await page.waitForTimeout(900)
    // Select `count` paragraphs that start at the `para`-th long paragraph.
    const before = await page.evaluate(
      ({ para, count }) => {
        const ed = window.__wordelia.editor()
        const blocks = []
        ed.state.doc.forEach((node, pos) => blocks.push({ node, pos }))
        const long = blocks.map((b, i) => ({ ...b, i })).filter((b) => b.node.textContent.length > 250)
        const start = long[Math.min(para, long.length - 1)]
        const end = blocks[Math.min(start.i + count - 1, blocks.length - 1)]
        const from = start.pos + 1
        const to = end.pos + end.node.nodeSize - 1
        ed.chain().focus().setTextSelection({ from, to }).run()
        window.__liveRange = { first: start.i, last: start.i + count - 1 }
        return blocks.slice(start.i, start.i + count).map((b) => b.node.textContent)
      },
      { para: Number(para), count: Number(count) }
    )
    const t0 = Date.now()
    void page.evaluate((id) => window.__wordelia.runAction(id), action)
    // Wait for the review, or for a toast that says why there is none.
    let ok = true
    try {
      await page.waitForFunction(() => document.querySelector('.review-accept') || window.__toasts.length > 0, null, { timeout: 180000 })
      ok = Boolean(await page.$('.review-accept'))
    } catch {
      ok = false
    }
    const seconds = Math.round((Date.now() - t0) / 1000)
    await page.waitForTimeout(600)
    await shot(`${action}-${chapter}-${para}`)
    if (!ok) {
      const toasts = await page.evaluate(() => window.__toasts.splice(0))
      report.push({ action, chapter, para, seconds, before, error: toasts })
      continue
    }
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    const after = await page.evaluate(() => {
      const ed = window.__wordelia.editor()
      const blocks = []
      ed.state.doc.forEach((node) => blocks.push(node.textContent))
      return blocks
    })
    // The rewrite can change the number of paragraphs; show the same span plus one.
    const first = await page.evaluate(() => window.__liveRange.first)
    report.push({ action, chapter, para, seconds, before, after: after.slice(first, first + before.length + 1) })
  }
  await writeFile(join(out, 'polish-report.json'), JSON.stringify(report, null, 1))
  console.log(JSON.stringify(report, null, 1))
}
