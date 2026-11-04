// The author asks for a change to a proposal that waits, before they accept or reject it:
// 1. The AI gets the proposal in full in the history, and writes a new proposal with the same <find>.
//    The page shows only the new proposal; the card of the older one says that a newer proposal changes
//    the same text.
// 2. Accept in the text gives the new text, one time. The older card has no Accept any more: its text
//    would go over the new text.
// 3. The same for an addition at the end: the page shows only the newest addition, Accept adds it one
//    time, and the older addition cannot be added after it.
// Usage: node scripts/shot.mjs proposalchange --en
export default async function ({ page, shot, openBook }) {
  const fail = (what) => {
    throw new Error(`Proposal change scenario: ${what}`)
  }
  const idle = () => page.waitForSelector('.composer-send:not(.is-stop)', { timeout: 30000 })
  const send = async (text) => {
    await page.locator('.composer-input').fill(text)
    await page.keyboard.press('Enter')
  }
  const thread = () =>
    page.evaluate(() => {
      const s = window.__wordelia.book.getState()
      return s.threads.find((t) => t.id === window.__wordelia.chat.getState().activeThreadId)
    })
  const messages = (n) =>
    page
      .waitForFunction((n) => {
        const s = window.__wordelia.book.getState()
        return s.threads.find((t) => t.id === window.__wordelia.chat.getState().activeThreadId)?.messages.length === n
      }, n, { timeout: 15000 })
      .catch(() => fail(`the thread does not have ${n} messages`))
  const stateOf = (messageId) =>
    page.evaluate((id) => {
      const s = window.__wordelia.book.getState()
      const t = s.threads.find((x) => x.id === window.__wordelia.chat.getState().activeThreadId)
      return t.messages.find((m) => m.id === id)?.hunks?.['0:0'] ?? 'pending'
    }, messageId)
  const accepted = (messageId) =>
    page.waitForFunction((id) => {
      const s = window.__wordelia.book.getState()
      const t = s.threads.find((x) => x.id === window.__wordelia.chat.getState().activeThreadId)
      return t.messages.find((m) => m.id === id)?.hunks?.['0:0'] === 'accepted'
    }, messageId, { timeout: 5000 })
  /** The first change of a reply */
  const hunkOf = (content) => {
    const m = /<find>([\s\S]*?)<\/find>\s*<replace>([\s\S]*?)<\/replace>/.exec(content)
    const trim = (s) => s.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
    return m ? { find: trim(m[1]), replace: trim(m[2]) } : null
  }
  /** The proposals in the text of the page: the messages of the list, and the messages of the marks in the first chapter */
  const inText = () =>
    page.evaluate((sel) => {
      const list = window.__inline.useInlineProposals.getState().list.map((p) => p.messageId)
      const marks = [...document.querySelectorAll(`${sel} [data-prop]`)].map((el) => el.dataset.prop)
      return { list, marks }
    }, sheet)
  const body = () => page.evaluate(() => window.__wordelia.book.getState().chapters[0].body)
  const count = (text, part) => text.split(part).length - 1
  /** The card of a reply: its note, and its Accept buttons */
  const card = (i) =>
    page.evaluate((i) => {
      const reply = document.querySelectorAll('.msg-ai')[i]
      return {
        note: reply?.querySelector('.hunk-note')?.textContent ?? '',
        accept: reply?.querySelectorAll('.proposal-btn.is-accept, .hunk-icon.is-accept').length ?? -1,
        show: reply?.querySelectorAll('.hunk-reveal').length ?? -1
      }
    }, i)
  const sheet = '.page[data-chapter="ch_sample01"]'
  const ADDED = 'The lamp turned above them, slow and patient.'
  // The page draws its widgets and page gaps again after each measure: find the element and scroll in one step.
  const show = (selector) => page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), selector)

  await openBook()
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ chatOpen: true, chatWidth: 400 }))
  await page.locator(`${sheet} .manuscript p`).first().click()

  // ---- 1. A proposal, then a change to it before the decision ----
  await send('Can you improve the opening paragraph?')
  await idle()
  await messages(2)
  const older = (await thread()).messages[1]
  await page.waitForFunction((id) => window.__inline.useInlineProposals.getState().list.some((p) => p.messageId === id), older.id, { timeout: 5000 })
  await send('Change the proposal: add a sentence at the end.')
  await idle()
  await messages(4)
  const newer = (await thread()).messages[3]
  const a = hunkOf(older.content)
  const b = hunkOf(newer.content)
  console.log('older:', JSON.stringify(a?.replace.slice(-60)), 'newer:', JSON.stringify(b?.replace.slice(-60)))
  if (!a || !b) fail('a reply has no change')
  if (b.find !== a.find) fail('the new proposal does not have the <find> of the older one (the text of the file)')
  if (b.replace === a.replace || !b.replace.startsWith(a.replace) || !b.replace.endsWith(ADDED)) fail('the new proposal does not have all of the text of the older one and the change')
  await page.waitForFunction((id) => window.__inline.useInlineProposals.getState().list.some((p) => p.messageId === id), newer.id, { timeout: 5000 }).catch(() => fail('the new proposal does not show in the text'))
  const shown = await inText()
  console.log('in the text:', JSON.stringify(shown))
  if (shown.list.includes(older.id) || shown.marks.some((id) => id.includes(older.id))) fail('the older proposal shows in the text')
  if (!shown.marks.some((id) => id.includes(newer.id))) fail('the page has no marks of the new proposal')
  const green = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} .ai-ins`)].map((e) => e.textContent).join(''), sheet)
  if (!green.includes(ADDED)) fail('the green text does not have the change')
  const before = await card(0)
  console.log('older card:', JSON.stringify(before))
  if (!before.note.includes('A newer proposal changes the same text.')) fail('the older card does not say that a newer proposal changes the same text')
  await show(`${sheet} .pm-prop`)
  await shot('changed')

  // ---- 2. Accept the new one; the older one cannot go over it ----
  await page.locator(`${sheet} .pm-prop-btn.is-accept`).first().click()
  await accepted(newer.id).catch(() => fail('Accept in the text did not apply the new proposal'))
  await page.waitForFunction((t) => window.__wordelia.book.getState().chapters[0].body.includes(t), ADDED, { timeout: 5000 }).catch(() => fail('the chapter does not have the new text'))
  const text = await body()
  if (count(text, ADDED) !== 1) fail('the chapter has the new sentence more than one time')
  if (text.includes(a.find)) fail('the chapter still has the old text')
  if ((await stateOf(older.id)) !== 'pending') fail('Accept of the new proposal decided the older one')
  await page.locator('.msg-ai').first().locator('.hunk-note', { hasText: 'You accepted a newer proposal' }).waitFor({ timeout: 5000 }).catch(() => fail('the older card does not say that the author accepted a newer proposal'))
  const blocked = await card(0)
  console.log('older card after Accept:', JSON.stringify(blocked))
  if (blocked.accept) fail('the older card can still apply its text over the new text')
  if (blocked.show) fail('the older card can bring its change back into the text')
  if ((await inText()).list.includes(older.id)) fail('the older proposal came back into the text')
  await page.locator('.msg-ai').first().scrollIntoViewIfNeeded()
  await shot('older-blocked')

  // ---- 3. An addition at the end, then a change to it ----
  await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const t = s.threads.find((x) => x.id === window.__wordelia.chat.getState().activeThreadId)
    const now = new Date().toISOString()
    const content = 'A short ending.\n\n<edit file="manuscript/The Storm.md">\n<find></find>\n<replace>Elias closed the logbook and sat down.</replace>\n</edit>'
    s.saveThread({ ...t, updatedAt: now, messages: [...t.messages, { id: 'm_more', role: 'user', content: 'And then?', createdAt: now }, { id: 'm_end', role: 'assistant', content, createdAt: now }] })
  })
  await page.waitForSelector(`${sheet} .pm-prop-append`, { timeout: 5000 }).catch(() => fail('the addition at the end does not show'))
  await send('Change the proposal: add a sentence.')
  await idle()
  await messages(8)
  const last = (await thread()).messages[7]
  if (hunkOf(last.content)?.find !== '' || hunkOf(last.content)?.replace !== `Elias closed the logbook and sat down. ${ADDED}`) fail('the new addition does not have all of the text of the older one and the change')
  await page.waitForFunction((sel) => [...document.querySelectorAll(`${sel} .pm-prop-append`)].some((e) => e.textContent.includes('slow and patient')), sheet, { timeout: 5000 }).catch(() => fail('the new addition does not show at the end'))
  const additions = await page.evaluate((sel) => document.querySelectorAll(`${sel} .pm-prop-append`).length, sheet)
  if (additions !== 1) fail(`the page shows ${additions} additions at the end`)
  if (!(await card(2)).note.includes('A newer proposal changes the same text.')) fail('the card of the older addition does not say that a newer one changes it')
  await show(`${sheet} .pm-prop-append`)
  await shot('addition-changed')
  await page.locator(`${sheet} .pm-prop-append .pm-prop-btn.is-accept`).click()
  await accepted(last.id).catch(() => fail('Accept did not apply the new addition'))
  await page.waitForFunction(() => window.__wordelia.book.getState().chapters[0].body.trimEnd().endsWith('slow and patient.'), null, { timeout: 5000 }).catch(() => fail('the chapter does not end with the new addition'))
  const end = await body()
  if (count(end, 'Elias closed the logbook') !== 1) fail('the chapter has the addition more than one time')
  await page.locator('.msg-ai').nth(2).locator('.hunk-note', { hasText: 'You accepted a newer proposal' }).waitFor({ timeout: 5000 }).catch(() => fail('the card of the older addition does not say that the author accepted a newer one'))
  if ((await card(2)).accept) fail('the older addition can still be added after the new one')
}
