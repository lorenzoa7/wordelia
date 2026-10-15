// Live test with a real AI: import a DOCX, build the planning, and keep the book for later live tests.
// Usage: IMPORT_FILE=<docx> LIVE_OUT=<folder> node scripts/shot.mjs live-import --real-ai
import { cp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot }) {
  const file = process.env.IMPORT_FILE
  const out = process.env.LIVE_OUT
  if (!file || !out) throw new Error('Set IMPORT_FILE and LIVE_OUT')
  await page.evaluate((p) => window.__wordelia.importFile(p), file)
  await page.waitForSelector('.import-chapters', { timeout: 30000 })
  await page.locator('.dialog-foot .btn-primary').click()
  await page.waitForSelector('.manuscript', { timeout: 30000 })
  const t0 = Date.now()

  // Wait for the reply in the planning sync thread.
  let reply = null
  while (Date.now() - t0 < 9 * 60_000) {
    await page.waitForTimeout(5000)
    reply = await page.evaluate(() => {
      const t = window.__wordelia.book.getState().threads.find((x) => x.id === 'th_planning_sync')
      const m = t?.messages.filter((x) => x.role === 'assistant').at(-1)
      return m ? { content: m.content, model: m.model, error: m.error } : null
    })
    if (reply) break
  }
  const seconds = Math.round((Date.now() - t0) / 1000)
  if (!reply) throw new Error('No sync reply after 9 minutes')
  await page.waitForTimeout(1500)
  await shot('sync-reply')

  const root = await page.evaluate(() => window.__wordelia.book.getState().root)
  await writeFile(join(out, 'sync-reply.md'), reply.content)
  const creates = (reply.content.match(/<create file="[^"]+"/g) ?? []).map((s) => s.slice(14, -1))
  console.log(JSON.stringify({ seconds, model: reply.model, error: reply.error, chars: reply.content.length, creates }, null, 1))

  // Accept every proposal with the bar under the reply, as a user who trusts the first pass would.
  const n = await page.locator('.proposal.is-create').count()
  await page.locator('.msg-bulk').scrollIntoViewIfNeeded()
  await shot('bulk-bar')
  await page.locator('.msg-bulk .proposal-btn.is-accept').click()
  await page.waitForTimeout(3000)
  await shot('bulk-accepted')
  await page.waitForTimeout(1500)
  const entries = await page.evaluate(() =>
    window.__wordelia.book.getState().entries.map((e) => `${e.category}/${e.name} — ${e.summary}`)
  )
  console.log(JSON.stringify({ accepted: n, entries }, null, 1))
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(900)
  await shot('plan-overview')
  await page.evaluate(() => window.__wordelia.book.getState().flush?.())
  await page.waitForTimeout(1500)
  await cp(root, join(out, 'book'), { recursive: true })
  console.log('book copied to', join(out, 'book'))
}
