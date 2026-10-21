export default async function ({ page, shot, openBook }) {
  await openBook()
  await shot('write')
  // Select the first paragraph and open the selection menu.
  await page.locator('.manuscript p').first().click()
  await page.evaluate(() => {
    const ed = window.__wordelia.editor()
    const first = ed.state.doc.firstChild
    ed.chain().focus().setTextSelection({ from: 1, to: 1 + first.content.size }).run()
  })
  await page.waitForTimeout(400)
  await shot('selection-menu')
  // Run Polish (mock AI) and wait for the review.
  await page.keyboard.press('Control+j')
  await page.waitForSelector('.review-accept', { timeout: 15000 })
  await page.waitForTimeout(500)
  await shot('inline-review')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  // Chat with a proposal.
  await page.locator('.composer-input').fill('Can you improve the opening paragraph?')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.proposal', { timeout: 15000 })
  await page.waitForTimeout(1200)
  await shot('chat-proposal')
  // Plan view
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(700)
  await shot('plan-overview')
  await page.locator('.entry-card').filter({ has: page.locator('.entry-card-name', { hasText: /^Elias$/ }) }).click()
  await page.waitForTimeout(700)
  await shot('plan-entry')

  // Back in Write: focus mode lights one paragraph, in the chapter with the cursor only.
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(500)
  await page.locator('.manuscript').first().locator('p').nth(1).click()
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ focusMode: true }))
  await page.waitForTimeout(500)
  const lit = await page.evaluate(() => [...document.querySelectorAll('.manuscript > *')].filter((el) => getComputedStyle(el).opacity === '1' && !el.matches('.pm-page-gap, .pm-page-tail')).length)
  await shot('focus-mode')
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ focusMode: false }))
  console.log('focus mode, lit paragraphs:', lit)
  if (lit !== 1) throw new Error(`Focus mode lights ${lit} paragraphs`)

  // Screen readers: the toolbar is a toolbar, the font buttons say their value, each chapter text has its own name.
  const a11y = await page.evaluate(() => ({
    role: document.querySelector('.toolbar')?.getAttribute('role'),
    font: document.querySelector('.toolbar-font')?.getAttribute('aria-label'),
    size: document.querySelector('.toolbar-size')?.getAttribute('aria-label'),
    texts: [...document.querySelectorAll('.manuscript')].map((m) => m.getAttribute('aria-label'))
  }))
  console.log('labels:', JSON.stringify(a11y))
  if (a11y.role !== 'toolbar' || !/Literata/.test(a11y.font ?? '') || !/12/.test(a11y.size ?? '') || new Set(a11y.texts).size !== a11y.texts.length) {
    throw new Error('The toolbar or the chapter texts have no clear labels')
  }

  // Spell check (Settings → General) applies at once to the chapters and the chat.
  const spell = () => page.evaluate(() => [document.querySelector('.manuscript').spellcheck, document.querySelector('.composer-input')?.spellcheck ?? null])
  const on = await spell()
  await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ editor: { ...window.__wordelia.app.getState().settings.editor, spellcheck: false } }))
  await page.waitForTimeout(300)
  const off = await spell()
  await page.evaluate(() => window.__wordelia.app.getState().updateSettings({ editor: { ...window.__wordelia.app.getState().settings.editor, spellcheck: true } }))
  console.log('spell check on, off:', JSON.stringify({ on, off }))
  if (on.some((v) => v === false) || off.some((v) => v === true)) throw new Error('The spell check switch does not apply at once')
}
