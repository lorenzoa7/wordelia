// A chat proposal that adds a scene break:
// 1. The page shows the new scene break in green, in the three views of a change (words, stacked, new),
//    and the chat card shows "* * *" on a line of its own. The italics of the paragraph are no change.
// 2. Accept puts a real scene break in the chapter: the editor has a sceneBreak node, and the chapter
//    file has "* * *" between blank lines.
// 3. An addition at the end that starts with a scene break shows it, and Accept adds it.
// Usage: node scripts/shot.mjs scenebreak --en
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot, openBook, book }) {
  const fail = (what) => {
    throw new Error(`Scene break scenario: ${what}`)
  }
  const idle = () => page.waitForSelector('.composer-send:not(.is-stop)', { timeout: 30000 })
  const send = async (text) => {
    await page.locator('.composer-input').fill(text)
    await page.keyboard.press('Enter')
  }
  const sheet = '.page[data-chapter="ch_sample01"]'
  /** The blocks of the first chapter in its editor: "p" for a paragraph, "*" for a scene break. */
  const blocks = () =>
    page.evaluate(() => {
      const out = []
      window.__wordelia.editor().state.doc.forEach((n) => out.push({ type: n.type.name === 'sceneBreak' ? '*' : n.type.name === 'paragraph' ? 'p' : n.type.name, text: n.textContent }))
      return out
    })
  const shape = (list) => list.map((b) => b.type).join('')
  // The page draws its widgets and page gaps again after each measure: find the element and scroll in one step.
  const show = (selector) => page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), selector)
  const setView = (view) =>
    page.evaluate((v) => {
      const app = window.__wordelia.app.getState()
      app.updateSettings({ editor: { ...app.settings.editor, diffView: v } })
    }, view)
  const file = join(book, 'manuscript', 'The Storm.md')
  /** Wait until the chapter file on disk has the text (the app saves after a short pause). */
  const onDisk = async (text, what) => {
    for (let i = 0; i < 60; i++) {
      if ((await readFile(file, 'utf8')).replace(/\r\n/g, '\n').includes(text)) return
      await page.waitForTimeout(100)
    }
    fail(what)
  }

  await openBook()
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ chatOpen: true, chatWidth: 400 }))
  await page.locator(`${sheet} .manuscript p`).first().click()
  const start = await blocks()
  console.log('chapter before:', shape(start))
  const second = start.filter((b) => b.type === 'p')[1].text
  if (!second.startsWith('The wind came in')) fail(`the second paragraph of the sample chapter is not the expected one (${second.slice(0, 30)})`)

  // ---- 1. The page and the card show the new scene break ----
  await send('Add a scene break before the second paragraph.')
  await idle()
  await page.waitForSelector(`${sheet} .pm-prop .ai-ins-scene, ${sheet} .ai-ins-scene`, { timeout: 10000 }).catch(() => fail('the page shows no new scene break'))
  const shown = await page.evaluate((sel) => {
    const scene = document.querySelector(`${sel} .ai-ins-scene`)
    const para = scene.closest('p')
    const reply = [...document.querySelectorAll('.msg-ai')].at(-1)
    return {
      text: scene.textContent,
      inSecond: para?.textContent.includes('The wind came in') ?? false,
      green: scene.closest('.ai-ins') !== null,
      struck: document.querySelectorAll(`${sel} .ai-del, ${sel} .ai-del-block`).length,
      card: reply?.querySelector('.proposal .hunk-scene')?.textContent ?? null,
      plus: reply?.querySelector('.proposal-stats .plus')?.textContent ?? null
    }
  }, sheet)
  console.log('scene break in the page:', JSON.stringify(shown))
  if (shown.text !== '* * *' || !shown.green) fail('the new scene break is not green "* * *"')
  if (!shown.inSecond) fail('the new scene break is not before the second paragraph')
  if (shown.struck) fail('the page strikes words that the proposal keeps (the italics of the paragraph)')
  if (shown.card !== '* * *') fail('the chat card does not show the scene break')
  if (shown.plus !== '+1') fail(`the card counts ${shown.plus} for one scene break`)
  await show(`${sheet} .ai-ins-scene`)
  await shot('shown')
  for (const [view, cls] of [['stacked', 'ai-ins-stacked'], ['new', 'ai-ins-new']]) {
    await setView(view)
    await page.waitForSelector(`${sheet} .${cls} .ai-ins-scene`, { timeout: 5000 }).catch(() => fail(`the "${view}" view shows no new scene break`))
    await show(`${sheet} .${cls}`)
    await shot(view)
  }
  await setView('words')
  await page.waitForFunction((sel) => !document.querySelector(`${sel} .ai-ins-new`), sheet, { timeout: 5000 })

  // ---- 2. Accept: a real scene break, in the editor and in the file ----
  await page.locator(`${sheet} .pm-prop-btn.is-accept`).first().click()
  await page.waitForFunction((sel) => !document.querySelector(`${sel} .ai-ins-scene`), sheet, { timeout: 5000 }).catch(() => fail('the proposal stays in the page after Accept'))
  const after = await blocks()
  console.log('chapter after Accept:', shape(after))
  if (shape(after) !== `p*${shape(start).slice(1)}`) fail(`Accept did not put a scene break before the second paragraph: ${shape(start)} → ${shape(after)}`)
  if (after[2].text !== second) fail('the second paragraph changed')
  await onDisk('that night.\n\n* * *\n\nThe wind came in', 'the chapter file has no "* * *" between blank lines before the second paragraph')
  // The italics of the paragraph stay.
  await onDisk('the *Swallow* was missing', 'the italics of the paragraph are gone')
  await page.locator('.msg-ai').last().locator('.hunk-badge.is-accepted').waitFor({ timeout: 5000 }).catch(() => fail('the card does not say that the change was applied'))
  await show(`${sheet} .scene-break`)
  await shot('accepted')

  // ---- 3. An addition at the end that starts with a scene break ----
  await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const t = s.threads.find((x) => x.id === window.__wordelia.chat.getState().activeThreadId)
    const now = new Date().toISOString()
    const n = t.messages.length
    const content = 'A new scene at the end.\n\n<edit file="manuscript/The Storm.md">\n<find></find>\n<replace>* * *\n\nThe next morning, the sea was calm.</replace>\n</edit>'
    s.saveThread({ ...t, updatedAt: now, messages: [...t.messages, { id: `m_q${n}`, role: 'user', content: 'And then?', createdAt: now }, { id: `m_a${n}`, role: 'assistant', content, createdAt: now }] })
  })
  await page.waitForSelector(`${sheet} .pm-prop-append .ai-ins-scene`, { timeout: 5000 }).catch(() => fail('an addition at the end does not show its scene break'))
  const appended = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} .pm-prop-append > p`)].map((p) => p.textContent.replace(/Accept|Reject/g, '').trim()), sheet)
  console.log('addition at the end:', JSON.stringify(appended))
  if (appended.length !== 2 || appended[0] !== '* * *' || appended[1] !== 'The next morning, the sea was calm.') fail('the addition at the end does not show a scene break, then its paragraph')
  await show(`${sheet} .pm-prop-append`)
  await shot('append')
  await page.locator(`${sheet} .pm-prop-append .pm-prop-btn.is-accept`).click()
  await page.waitForFunction((sel) => !document.querySelector(`${sel} .pm-prop-append`), sheet, { timeout: 5000 })
  const end = (await blocks()).slice(-2)
  if (shape(end) !== '*p' || end[1].text !== 'The next morning, the sea was calm.') fail(`Accept of the addition did not add a scene break and its paragraph: ${shape(end)}`)
  await onDisk('* * *\n\nThe next morning, the sea was calm.', 'the chapter file has no scene break before the added paragraph')
}
