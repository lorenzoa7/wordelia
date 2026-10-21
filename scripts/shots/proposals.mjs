// Chat proposals that must stay safe for the book:
// 1. A reply that the author stops in the middle of a change: nothing can apply the cut change.
// 2. "Insert at cursor" puts only the prose, as a new paragraph; a selection stays.
// 3. Two proposals for the same words: the text shows the newest, and Accept in the text applies it.
// 4. A new text for a note that exists shows what it takes out, and Undo brings the note back.
// 5. A reply never moves the author while they type: "Changes ready · Show" waits for a click.
// 6. The draft of each thread, a suggestion with a draft, Enter in "Title and purpose", tokens.
// 7. Delete a thread: it goes to the trash, Undo brings it back. A reply that ends after the book
//    closed is in the thread when the book opens again.
// Usage: node scripts/shot.mjs proposals --en
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ app, page, shot, openBook, book }) {
  const fail = (what) => {
    throw new Error(`Proposals scenario: ${what}`)
  }
  const slow = (ms) => app.evaluate((_e, v) => (process.env.WORDELIA_MOCK_DELAY = String(v)), ms)
  const idle = () => page.waitForSelector('.composer-send:not(.is-stop)', { timeout: 30000 })
  const send = async (text) => {
    await page.locator('.composer-input').fill(text)
    await page.keyboard.press('Enter')
  }
  const active = () => page.evaluate(() => window.__wordelia.chat.getState().activeThreadId)
  const thread = () => page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    return s.threads.find((t) => t.id === window.__wordelia.chat.getState().activeThreadId)
  })
  const chapter = (i) => page.evaluate((n) => window.__wordelia.book.getState().chapters[n].body, i)
  // The newest toast with the text. A toast that goes away can stay in the page for a moment (its exit motion).
  const toast = (text) => page.locator('.toast', { hasText: text }).last()

  await openBook()
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ chatWidth: 400 }))
  const before = await chapter(0)

  // ---- 1. Stop in the middle of a change ----
  await slow(110)
  await send('Can you improve the opening paragraph?')
  const tid = await active()
  await page.waitForFunction(
    (id) => {
      const text = window.__wordelia.chat.getState().streaming[id]?.text ?? ''
      const at = text.indexOf('<replace>')
      return at >= 0 && text.length - at > 60 && !text.includes('</replace>')
    },
    tid,
    { timeout: 30000 }
  )
  await page.locator('.composer-send.is-stop').click()
  await idle()
  await slow(12)
  await page.waitForFunction((id) => window.__wordelia.book.getState().threads.find((t) => t.id === id)?.messages.length === 2, tid, { timeout: 10000 })
  const stopped = await page.evaluate(() => {
    const last = [...document.querySelectorAll('.msg-ai')].at(-1)
    return {
      accept: last.querySelectorAll('.proposal-btn.is-accept').length,
      note: last.querySelectorAll('.hunk-note').length,
      mark: last.querySelectorAll('.msg-stopped').length,
      error: last.querySelectorAll('.msg-error').length,
      inText: window.__inline.useInlineProposals.getState().list.length,
      insert: last.querySelectorAll('.msg-insert').length
    }
  })
  const saved = (await thread()).messages[1]
  console.log('stopped reply:', JSON.stringify({ ...stopped, stoppedFlag: saved.stopped, cut: saved.content.includes('<replace>') && !saved.content.includes('</replace>') }))
  if (!saved.stopped || saved.error) fail('the stopped reply is not marked as stopped')
  if (stopped.accept) fail('a cut change has an Accept button')
  if (!stopped.note || !stopped.mark || stopped.error) fail('the card does not say that the reply stopped, or the reply looks like an error')
  if (stopped.inText) fail('a cut change shows in the text')
  if (stopped.insert) fail('a reply with proposals has "Insert at cursor"')
  if ((await chapter(0)) !== before) fail('the chapter changed')
  await page.locator('.msg-ai').last().scrollIntoViewIfNeeded()
  await shot('stopped')

  // ---- 2. Insert at cursor: only the prose, as a new paragraph; the selection stays ----
  await send('What is the weakest part of this chapter?')
  await idle()
  await page.waitForFunction((id) => window.__wordelia.book.getState().threads.find((t) => t.id === id)?.messages.length === 4, tid, { timeout: 10000 })
  const firstPara = before.split('\n\n')[0].replace(/^---[\s\S]*?---\n/, '')
  await page.evaluate(() => {
    const ed = window.__wordelia.editor()
    // A selection of a few words in the first paragraph.
    ed.commands.setTextSelection({ from: 3, to: 12 })
  })
  await page.locator('.msg-ai').last().hover()
  await page.locator('.msg-ai').last().locator('.msg-insert').click()
  await page.waitForFunction(() => window.__wordelia.book.getState().chapters[0].body.includes('weakest part'), null, { timeout: 5000 })
  const inserted = await chapter(0)
  const paras = inserted.split('\n\n')
  console.log('after Insert:', JSON.stringify(paras.slice(0, 3).map((p) => p.slice(0, 60))))
  if (!paras[0].includes(firstPara.slice(0, 40)) || paras[0].includes('weakest')) fail('Insert changed the paragraph of the cursor (selection or join)')
  if (!paras[1].includes('weakest part')) fail('Insert did not put a new paragraph after the cursor')
  if (inserted.includes('[Proposed')) fail('Insert put proposal markers in the chapter')
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => !window.__wordelia.book.getState().chapters[0].body.includes('weakest part'), null, { timeout: 5000 }).catch(() => fail('Ctrl+Z did not undo Insert'))

  // ---- 3. Two proposals for the same words: the newest shows and applies ----
  await send('Can you improve the opening paragraph?')
  await idle()
  await page.waitForFunction((id) => window.__wordelia.book.getState().threads.find((t) => t.id === id)?.messages.length === 6, tid, { timeout: 10000 })
  await send('Can you improve the first two paragraphs?')
  await idle()
  await page.waitForFunction((id) => window.__wordelia.book.getState().threads.find((t) => t.id === id)?.messages.length === 8, tid, { timeout: 10000 })
  const ids = await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const t = s.threads.find((x) => x.id === window.__wordelia.chat.getState().activeThreadId)
    return { older: t.messages[5].id, newer: t.messages[7].id }
  })
  await page.waitForFunction((newer) => window.__inline.useInlineProposals.getState().list.some((p) => p.messageId === newer), ids.newer, { timeout: 5000 })
  const shown = await page.evaluate((ids) => {
    const list = window.__inline.useInlineProposals.getState().list
    const marks = [...document.querySelectorAll('.page[data-chapter="ch_sample01"] .pm-prop')].map((el) => el.dataset.prop)
    return { older: list.filter((p) => p.messageId === ids.older).length, newer: list.filter((p) => p.messageId === ids.newer).length, marks }
  }, ids)
  console.log('two proposals for the same words:', JSON.stringify(shown))
  if (shown.older || !shown.newer || shown.marks.some((m) => m.includes(ids.older))) fail('the text shows the older proposal')
  const replacedNote = await page.locator('.msg-ai').nth(2).locator('.hunk-note').count()
  if (!replacedNote) fail('the card of the older proposal does not say that a newer one changes the same words')
  // Copy of a reply with proposals: no markers. (A hidden window has no clipboard focus: the test keeps the text.)
  await page.evaluate(() => {
    window.__copied = null
    navigator.clipboard.writeText = async (text) => {
      window.__copied = text
    }
  })
  await page.locator('.msg-ai').last().hover()
  await page.locator('.msg-ai').last().locator('.msg-actions button').first().click()
  const copied = (await page.evaluate(() => window.__copied)) ?? ''
  if (!copied) fail('Copy gave no text')
  console.log('copied:', JSON.stringify(copied.slice(0, 80)))
  if (copied.includes('[Proposed') || copied.includes('<edit')) fail('Copy put proposal markers in the clipboard')
  await page.locator('.page[data-chapter="ch_sample01"] .pm-prop-btn.is-accept').first().click()
  await page.waitForFunction((newer) => {
    const t = window.__wordelia.book.getState().threads.find((x) => x.id === window.__wordelia.chat.getState().activeThreadId)
    return t.messages.find((m) => m.id === newer)?.hunks?.['0:0'] === 'accepted'
  }, ids.newer, { timeout: 5000 }).catch(() => fail('Accept in the text did not apply the newest proposal'))
  const olderState = await page.evaluate((older) => {
    const t = window.__wordelia.book.getState().threads.find((x) => x.id === window.__wordelia.chat.getState().activeThreadId)
    return t.messages.find((m) => m.id === older)?.hunks?.['0:0'] ?? 'pending'
  }, ids.older)
  if (olderState !== 'pending') fail('Accept in the text decided the older proposal')
  // The older card still says that a newer proposal changed the same words.
  await page.locator('.msg-ai').nth(2).locator('.hunk-note').waitFor({ timeout: 5000 }).catch(() => fail('the older card lost its note after the newer one was applied'))
  await page.locator('.msg-ai').nth(2).scrollIntoViewIfNeeded()
  await shot('older-replaced')
  // Reject has Undo.
  await page.locator('.msg-ai').last().locator('.proposal.is-create .proposal-btn').first().click()
  await toast('Rejected 1 proposal').locator('.toast-action').click()
  await page.waitForFunction((newer) => {
    const t = window.__wordelia.book.getState().threads.find((x) => x.id === window.__wordelia.chat.getState().activeThreadId)
    const h = t.messages.find((m) => m.id === newer)?.hunks ?? {}
    return Object.values(h).filter((v) => v === 'rejected').length === 0
  }, ids.newer, { timeout: 5000 }).catch(() => fail('Undo of a rejection did not bring the proposal back'))
  // The thread list counts only the proposals of the newest reply.
  await page.locator('.chat-back').click()
  const status = await page.locator('.thread-row .thread-item-sub.is-status').first().innerText()
  console.log('thread state:', status)
  if (!/^2 proposals/.test(status)) fail(`the thread state counts old proposals (${status})`)
  await page.keyboard.press('Escape')
  await page.waitForSelector('.chat-thread', { timeout: 5000 })

  // ---- 4. A new text for a note that exists ----
  await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const now = new Date().toISOString()
    const content = [
      'A shorter note for Elias.',
      '',
      '<create file="planning/Characters/Elias.md">',
      '---',
      'summary: Keeper of the lighthouse. He does not trust the visitor.',
      '---',
      '## Role',
      'The protagonist. He keeps the lighthouse.',
      '</create>'
    ].join('\n')
    s.saveThread({ id: 'th_replace', title: 'Replace test', brief: '', digest: '', digestedCount: 0, createdAt: now, updatedAt: now, pinned: false, route: null,
      messages: [{ id: 'mr_u', role: 'user', content: 'Make the note of Elias shorter.', createdAt: now }, { id: 'mr_a', role: 'assistant', content, createdAt: now }] })
    window.__wordelia.chat.getState().setActiveThread('th_replace')
  })
  await page.waitForSelector('.proposal.is-create .proposal-warn', { timeout: 5000 }).catch(() => fail('the card does not say what the note loses'))
  const card = await page.evaluate(() => {
    const c = document.querySelector('.proposal.is-create')
    const name = c.querySelector('.proposal-file span')
    const cat = c.querySelector('.proposal-cat')
    return {
      warn: c.querySelector('.proposal-warn').textContent,
      del: c.querySelectorAll('.note-diff del').length,
      nameCut: name.scrollWidth > name.clientWidth + 1,
      catCut: cat.scrollWidth > cat.clientWidth + 1
    }
  })
  console.log('replace card:', JSON.stringify(card))
  if (!card.warn.includes('the keeper') || !card.warn.includes('Personality')) fail('the card does not name the other names and the section that go')
  if (!card.del) fail('the card shows no diff of the note')
  if (card.nameCut || card.catCut) fail('the header of the card is cut')
  // The card comes in with a short motion.
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.proposal.is-create')).opacity === '1', null, { timeout: 5000 })
  await shot('replace-note')
  await page.locator('.proposal.is-create .proposal-btn.is-accept').click()
  await page.waitForFunction(() => window.__wordelia.book.getState().entries.find((e) => e.name === 'Elias').aliases.length === 0, null, { timeout: 5000 })
  await toast('Updated').locator('.toast-action').click()
  await page.waitForFunction(() => {
    const e = window.__wordelia.book.getState().entries.find((x) => x.name === 'Elias')
    return e.aliases.includes('the keeper') && e.body.includes('Personality')
  }, null, { timeout: 5000 }).catch(() => fail('Undo did not bring the note back'))

  // ---- 5. No move while the author types ----
  await page.evaluate((id) => window.__wordelia.chat.getState().setActiveThread(id), tid)
  // (b) The author types in a chapter, and a reply changes a note: the app stays in the chapter.
  await page.locator('.page[data-chapter="ch_sample02"] .manuscript p').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Quietly')
  const top = await page.evaluate(() => Math.round(document.querySelector('.desk').scrollTop))
  const inject = (content) =>
    page.evaluate((content) => {
      const s = window.__wordelia.book.getState()
      const t = s.threads.find((x) => x.id === window.__wordelia.chat.getState().activeThreadId)
      const now = new Date().toISOString()
      const n = t.messages.length
      s.saveThread({ ...t, updatedAt: now, messages: [...t.messages, { id: `m_q${n}`, role: 'user', content: 'More?', createdAt: now }, { id: `m_a${n}`, role: 'assistant', content, createdAt: now }] })
    }, content)
  await inject('A note change.\n\n<edit file="planning/Characters/Marta.md">\n<find>She nurses the visitor through his fever</find>\n<replace>She nurses the visitor through his fever, night after night,</replace>\n</edit>')
  await toast('Changes ready').waitFor({ timeout: 5000 }).catch(async () => {
    console.log('debug:', JSON.stringify(await page.evaluate(() => ({ view: window.__wordelia.book.getState().view, active: document.activeElement?.className, busy: window.__inline.authorIsBusy(), toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent), list: window.__inline.useInlineProposals.getState().list.map((p) => p.id) }))))
    fail('no "Changes ready" while the author types')
  })
  await page.keyboard.type(' and slowly')
  const view = await page.evaluate(() => window.__wordelia.book.getState().view)
  await page.waitForFunction(() => window.__wordelia.book.getState().chapters[1].body.includes('Quietly and slowly'), null, { timeout: 5000 }).catch(() => fail('the typed words did not go into the chapter'))
  console.log('while typing, a note change:', JSON.stringify({ view }))
  if (view !== 'write') fail('a reply moved the author to the Plan view while they typed')
  await shot('changes-ready')
  await toast('Changes ready').locator('.toast-action').click()
  await page.waitForFunction(() => window.__wordelia.book.getState().view === 'plan', null, { timeout: 5000 }).catch(() => fail('"Show" did not open the note'))
  await page.keyboard.press('Control+1')
  await page.waitForFunction(() => window.__wordelia.book.getState().view === 'write', null, { timeout: 5000 })
  // (a) The author types in chapter 2, and a reply changes chapter 1: the text does not scroll.
  await page.locator('.page[data-chapter="ch_sample02"] .manuscript p').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Again')
  const at = await page.evaluate(() => Math.round(document.querySelector('.desk').scrollTop))
  await inject('A chapter change.\n\n<edit file="manuscript/The Storm.md">\n<find>Elias counted the boats in the harbor, one by one</find>\n<replace>Elias counted the boats in the harbor, slowly, one by one</replace>\n</edit>')
  await toast('Changes ready').waitFor({ timeout: 5000 }).catch(() => fail('no "Changes ready" for a chapter change while the author types'))
  await page.waitForTimeout(700)
  const still = await page.evaluate(() => Math.round(document.querySelector('.desk').scrollTop))
  console.log('while typing, a chapter change:', JSON.stringify({ top, at, still }))
  if (Math.abs(still - at) > 4) fail('a reply scrolled the text while the author typed')
  await toast('Changes ready').locator('.toast-action').click()
  await page.waitForSelector('.pm-prop.is-focus', { timeout: 5000 }).catch(() => fail('"Show" did not go to the change'))

  // ---- 6. Drafts, suggestions, the title dialog, tokens ----
  await page.locator('.composer-input').fill('Half a question about Marta')
  await page.locator('.chat-head-actions .icon-btn').first().click()
  await page.waitForSelector('.chat-empty', { timeout: 5000 })
  const fresh = await page.locator('.composer-input').innerText()
  if (fresh.trim()) fail(`the new thread shows the draft of another thread (${fresh})`)
  // A suggestion with a typed draft: the draft stays.
  await page.locator('.composer-input').fill('My own words')
  await page.locator('.chat-suggestion').first().click()
  const both = await page.locator('.composer-input').innerText()
  console.log('suggestion with a draft:', JSON.stringify(both))
  if (!both.includes('My own words') || !both.includes('weakest')) fail('a suggestion took the place of the typed draft')
  // Enter in "Title and purpose" saves.
  await page.locator('.chat-title').click()
  await page.waitForSelector('.dialog input', { timeout: 5000 })
  await page.locator('.dialog input').fill('Marta doubts')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 }).catch(() => fail('Enter did not save the title'))
  if ((await page.locator('.chat-title').innerText()) !== 'Marta doubts') fail('the title was not saved')
  // Back to the first thread: its draft is there.
  await page.locator('.chat-back').click()
  await page.locator('.thread-item', { hasText: 'The opening paragraph' }).click()
  await page.waitForSelector('.chat-thread', { timeout: 5000 })
  const draft = await page.locator('.composer-input').innerText()
  if (!draft.includes('Half a question')) fail(`the draft of the thread is gone (${draft})`)
  await page.locator('.composer-input').fill('')
  const usage = await page.evaluate(() => {
    const t = window.__wordelia.book.getState().threads.find((x) => x.id === window.__wordelia.chat.getState().activeThreadId)
    return { saved: t.messages[3].usage, line: document.querySelectorAll('.msg-ai')[1]?.querySelector('.msg-model')?.textContent }
  })
  console.log('usage:', JSON.stringify(usage))
  if (!usage.saved?.inputTokens || !/tokens in/.test(usage.line ?? '')) fail('the reply has no tokens')

  // ---- 7. Delete with Undo, and a reply after the book closed ----
  await page.locator('.chat-head-actions .icon-btn').last().click()
  await page.locator('.menu-item', { hasText: 'Delete thread' }).click()
  await page.locator('.dialog-foot .btn-danger, .dialog-foot .btn-ribbon').last().click()
  await toast('trash').waitFor({ timeout: 5000 })
  const trash = (await readdir(join(book, '.wordelia', 'trash')).catch(() => [])).filter((n) => n.includes(`thread ${tid}`))
  if (!trash.length) fail('the deleted thread is not in the trash of the book')
  await toast('trash').locator('.toast-action').click()
  await page.waitForFunction((id) => window.__wordelia.book.getState().threads.some((t) => t.id === id), tid, { timeout: 5000 }).catch(() => fail('Undo did not bring the thread back'))
  await page.evaluate((id) => window.__wordelia.chat.getState().setActiveThread(id), tid)
  await page.waitForSelector('.chat-thread', { timeout: 5000 })
  await slow(60)
  await send('Suggest three titles for this chapter.')
  await page.waitForFunction((id) => (window.__wordelia.chat.getState().streaming[id]?.text ?? '').length > 10, tid, { timeout: 20000 })
  const count = (await thread()).messages.length
  await page.evaluate(() => window.__wordelia.book.getState().close())
  const file = join(book, 'ai', 'threads', `${tid}.json`)
  let after = 0
  for (let i = 0; i < 100 && after !== count + 1; i++) {
    await new Promise((r) => setTimeout(r, 150))
    after = JSON.parse(await readFile(file, 'utf8')).messages.length
  }
  await slow(12)
  console.log('reply after the book closed:', JSON.stringify({ before: count, after }))
  if (after !== count + 1) fail('the reply that ended after the book closed was lost')
  await openBook()
  const reopened = await page.evaluate((id) => window.__wordelia.book.getState().threads.find((t) => t.id === id)?.messages.length, tid)
  if (reopened !== count + 1) fail('the thread does not have the reply after the book opens again')
}
