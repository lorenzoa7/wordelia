// The chat features: the thinking line, the model menu, the bar for all the proposals of a reply,
// rewind with undo of the book changes, edit and retry, and the thread states.
// Usage: node scripts/shot.mjs chat --en   (CHAT_LANG=pt-BR or es for another interface language)
export default async function ({ app, page, shot, openBook }) {
  if (process.env.CHAT_LANG) {
    await page.evaluate((l) => window.__wordelia.app.getState().updateSettings({ language: l }), process.env.CHAT_LANG)
    await page.waitForTimeout(300)
  }
  const slow = (ms) => app.evaluate((_e, v) => (process.env.WORDELIA_MOCK_DELAY = String(v)), ms)
  const fail = (what) => {
    throw new Error(`Chat scenario: ${what}`)
  }
  const threads = () => page.evaluate(() => window.__wordelia.book.getState().threads)
  const firstParagraph = () => page.evaluate(() => window.__wordelia.book.getState().chapters[0].body.split('\n\n')[0])
  const send = async (text) => {
    await page.locator('.composer-input').fill(text)
    await page.keyboard.press('Enter')
  }
  const idle = () => page.waitForSelector('.composer-send:not(.is-stop)', { timeout: 30000 })

  await openBook()
  const before = await firstParagraph()

  // 1. The thinking line while the AI works, then the phase of the reply.
  await slow(110)
  await send('Can you improve the opening paragraph?')
  await page.waitForSelector('.think-line.is-live', { timeout: 10000 })
  await page.waitForTimeout(900)
  await shot('thinking')
  await page.locator('.think-line.is-live', { hasText: /Writing a change|Escrevendo uma mudança|Escribiendo un cambio/ }).waitFor({ timeout: 20000 })
  await page.waitForTimeout(300)
  await shot('writing-change')
  await idle()
  await slow(12)
  await page.waitForTimeout(500)
  // The thinking of the finished reply opens below its line.
  await page.locator('.msg-ai .think.is-done .think-head').first().click()
  await page.waitForTimeout(300)
  await shot('thought-process')
  await page.locator('.msg-ai .think.is-done .think-head').first().click()

  // 2. Accept the proposal: the chapter changes.
  await page.locator('.msg-ai .proposal-btn.is-accept').first().click()
  await page.waitForTimeout(500)
  const changed = await firstParagraph()
  if (changed === before) fail('the accepted proposal did not change the chapter')

  // 3. A reply with several proposals: the bar for the whole reply.
  await send('Can you improve the first two paragraphs?')
  await page.waitForSelector('.msg-bulk', { timeout: 20000 })
  await idle()
  await page.waitForTimeout(600)
  await shot('reply-bar')

  // 4. The model menu, then its Effort submenu.
  await page.locator('.composer-model').click()
  await page.waitForSelector('.model-menu', { timeout: 5000 })
  await page.waitForTimeout(300)
  await shot('model-menu')
  await page.locator('.model-sub').hover()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(400)
  await shot('effort-submenu')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  // The number key 2 picks the second model.
  await page.locator('.composer-model').click()
  await page.waitForSelector('.model-menu', { timeout: 5000 })
  await page.keyboard.press('3')
  await page.waitForTimeout(300)
  const picked = await page.locator('.composer-model').innerText()
  console.log('model after key 3:', picked)
  if (!/Sonnet 5\.5/.test(picked)) fail(`number key did not pick the model (${picked})`)

  // 5. The actions of a message of the user, on hover.
  await page.locator('.msg-user-wrap').first().hover()
  await page.waitForTimeout(300)
  await shot('user-actions')

  // 6. Rewind to the first message: the dialog offers to undo the accepted change.
  await page.locator('.msg-user-wrap').first().locator('.msg-rewind-btn').click()
  await page.waitForSelector('.rewind-changes', { timeout: 5000 })
  await page.waitForTimeout(300)
  await shot('rewind-dialog')
  await page.locator('.dialog-foot .btn-ribbon').click()
  await page.waitForTimeout(800)
  const after = await firstParagraph()
  const left = (await threads()).find((t) => t.messages.length === 1)
  console.log(JSON.stringify({ undone: after === before, messages: left?.messages.length }))
  if (after !== before) fail('rewind did not undo the book change')
  if (!left) fail('rewind did not remove the later messages')
  await shot('after-rewind')

  // 7. Edit the message and send it again: the AI answers again.
  await page.locator('.msg-user-wrap').first().hover()
  await page.locator('.msg-edit-btn').first().click()
  await page.waitForSelector('.msg-edit-input', { timeout: 5000 })
  await page.locator('.msg-edit-input').fill('What is the weakest part of this chapter?')
  await page.waitForTimeout(200)
  await shot('edit-message')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.msg-ai', { timeout: 20000 })
  await idle()
  await page.waitForTimeout(400)

  // 8. Retry the last reply.
  await page.locator('.msg-ai').last().hover()
  await page.locator('.msg-retry').click()
  await idle()
  await page.waitForTimeout(400)
  const count = (await threads()).find((t) => t.messages[0]?.content.startsWith('What is the weakest'))?.messages.length
  console.log('messages after retry:', count)
  if (count !== 2) fail('retry did not replace the last reply')
  await shot('after-retry')

  // 9. Thread states: a reply with proposals that wait, a thread at work, then a new reply not seen yet.
  await send('Can you improve the opening paragraph?')
  await idle()
  await page.locator('.chat-head-actions .icon-btn').first().click()
  await page.waitForTimeout(300)
  await slow(90)
  await send('Suggest three titles for this chapter.')
  await page.waitForSelector('.think-line', { timeout: 10000 })
  // Back to the first thread while the new one works.
  await page.locator('.thread-switch').click()
  await page.waitForSelector('.thread-pop', { timeout: 5000 })
  await page.locator('.thread-item').nth(1).click()
  await page.waitForTimeout(300)
  await page.locator('.thread-switch').click()
  await page.waitForSelector('.thread-item .status-dot.is-working', { timeout: 5000 })
  await page.waitForTimeout(300)
  await shot('threads-working')
  await page.keyboard.press('Escape')
  // The reply of the other thread ends while the user looks at this one.
  await page.waitForFunction(
    () => window.__wordelia.book.getState().threads.some((t) => t.messages[0]?.content.startsWith('Suggest three') && t.messages.length === 2),
    null,
    { timeout: 30000 }
  )
  await slow(12)
  await page.waitForTimeout(500)
  await page.locator('.thread-switch').click()
  await page.waitForSelector('.thread-item .status-dot.is-unseen', { timeout: 10000 })
  await page.waitForTimeout(300)
  await shot('threads-status')
  await page.keyboard.press('Escape')

  // 10. With the chat closed, the chat button has a dot.
  await page.keyboard.press('Control+l')
  await page.waitForTimeout(700)
  if (!(await page.locator('.chat-toggle-dot').count())) fail('no dot on the chat button')
  await shot('titlebar-dot')
  await page.keyboard.press('Control+l')
  await page.waitForTimeout(500)

  // 11. "Show in text" on a change.
  await page.locator('.hunk').first().hover()
  await page.waitForTimeout(200)
  await shot('show-in-text')
  await page.locator('.hunk-reveal').first().click()
  await page.waitForTimeout(600)
  await shot('revealed')

  // 12. The "seen" time of a thread survives when the book opens again.
  await page.evaluate(() => window.__wordelia.book.getState().close())
  // Give the library screen time to show, as a person would.
  await page.waitForTimeout(800)
  await openBook()
  const seen = (await threads()).filter((t) => typeof t.readAt === 'string').length
  console.log('threads with readAt after reopen:', seen)
  if (!seen) fail('readAt was not kept')
}
