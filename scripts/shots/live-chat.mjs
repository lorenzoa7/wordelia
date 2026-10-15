// Live test with a real AI: chat about a real book, then accept the proposals it makes.
// Usage: LIVE_BOOK=<book folder> LIVE_OUT=<folder> node scripts/shot.mjs live-chat --real-ai
// LIVE_PROMPTS: prompts separated by "||" (default: a question, a chapter edit, a planning note).
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
  await page.locator('.chapter-item').nth(0).click()
  await page.waitForTimeout(600)
  // Start a new thread, as the user would for a new topic.
  await page.locator('.chat-head button[aria-label="New thread"]').click()
  await page.waitForTimeout(400)

  const prompts = (
    process.env.LIVE_PROMPTS ??
    [
      'Quem é o protagonista e o que ele quer até agora? Responda em poucas frases.',
      'Reescreva a primeira frase do capítulo 1 para ela prender mais o leitor. Mantenha o meu estilo.',
      'Crie uma nota de trama com a linha do tempo dos três primeiros capítulos.'
    ].join('||')
  ).split('||')

  const assistantCount = () =>
    page.evaluate(() =>
      window.__wordelia.book
        .getState()
        .threads.reduce((n, t) => n + t.messages.filter((m) => m.role === 'assistant').length, 0)
    )
  const report = []
  for (const [i, prompt] of prompts.entries()) {
    const before = await assistantCount()
    const chapterBefore = await page.evaluate(() => window.__wordelia.book.getState().chapters.map((c) => c.body))
    await page.locator('.composer-input').fill(prompt)
    await page.keyboard.press('Enter')
    const t0 = Date.now()
    while (Date.now() - t0 < 5 * 60_000 && (await assistantCount()) === before) await page.waitForTimeout(2000)
    const seconds = Math.round((Date.now() - t0) / 1000)
    await page.waitForTimeout(1200)
    await shot(`chat-${i + 1}`)
    const reply = await page.evaluate(() => {
      const ts = [...window.__wordelia.book.getState().threads]
      const t = ts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
      const m = t.messages.filter((x) => x.role === 'assistant').at(-1)
      return { thread: t.title, content: m.content, model: m.model, error: m.error }
    })
    // Accept every proposal in this reply.
    const accepts = page.locator('.msg-ai').last().locator('.proposal-btn.is-accept')
    const n = await accepts.count()
    for (let k = 0; k < n; k++) {
      await accepts.first().click()
      await page.waitForTimeout(400)
    }
    await page.waitForTimeout(800)
    const states = await page.locator('.msg-ai').last().locator('.hunk-badge').allInnerTexts()
    const chapterAfter = await page.evaluate(() => window.__wordelia.book.getState().chapters.map((c) => c.body))
    const changed = chapterAfter.map((b, k) => (b !== chapterBefore[k] ? k : -1)).filter((k) => k >= 0)
    if (n) await shot(`chat-${i + 1}-accepted`)
    report.push({ prompt, seconds, ...reply, proposals: n, states, changedChapters: changed })
  }
  await page.waitForTimeout(8000) // let the title and digest finish
  const threads = await page.evaluate(() =>
    window.__wordelia.book.getState().threads.map((t) => ({ title: t.title, digest: t.digest }))
  )
  await writeFile(join(out, 'chat-report.json'), JSON.stringify({ report, threads }, null, 1))
  console.log(JSON.stringify({ report, threads }, null, 1))
}
