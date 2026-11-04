// An accepted chat change stays accepted when the text that it put there changes later: by another accepted
// change or by the author. Only Undo (Ctrl+Z) makes it wait again. Before, a change in its new words made
// the app think it was undone: it came back as a proposal, and Accept put its text in a second time.
// Usage: node scripts/shot.mjs acceptedits
export default async function ({ page, shot, openBook }) {
  const fail = (what) => {
    throw new Error(`Accepted edits scenario: ${what}`)
  }
  const idle = () => page.waitForSelector('.composer-send:not(.is-stop)', { timeout: 30000 })
  const send = async (text) => {
    await page.locator('.composer-input').fill(text)
    await page.keyboard.press('Enter')
  }
  const sheet = '.page[data-chapter="ch_sample01"]'
  const body = () => page.evaluate(() => window.__wordelia.book.getState().chapters[0].body)
  // The state of the first change of each reply of the open thread, the oldest first.
  const states = () =>
    page.evaluate(() => {
      const s = window.__wordelia.book.getState()
      const t = s.threads.find((x) => x.id === window.__wordelia.chat.getState().activeThreadId)
      return t.messages.filter((m) => m.role === 'assistant').map((m) => m.hunks?.['0:0'] ?? 'pending')
    })
  const until = async (what, check, ms = 5000) => {
    let last
    for (let i = 0; i < ms / 100; i++) {
      last = await check()
      if (last === true) return
      await page.waitForTimeout(100)
    }
    fail(`${what}: ${JSON.stringify(last)}`)
  }
  const NEW = 'Na manhã seguinte, Marta encontrou o bote azul vazio na praia'
  const times = (text, part) => text.split(part).length - 1
  // The page checks its proposals again 250 ms after a change of the text.
  const settle = () => page.waitForTimeout(700)

  await openBook()
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ chatOpen: true, chatWidth: 400 }))
  await page.locator(`${sheet} .manuscript p`).first().click()

  // 1. A change that keeps the first paragraph and adds a new one after it: Accept in the page.
  await send('Write a new scene after the first paragraph.')
  await idle()
  await page.locator(`${sheet} .pm-prop-btn.is-accept`).first().click()
  await until('the new scene is not in the chapter', async () => (await body()).includes(NEW))
  await until('the first change is not accepted', async () => ((await states())[0] === 'accepted' ? true : await states()))

  // 2. A change of words inside the new scene: Accept. The first change stays accepted, and nothing comes back.
  await page.locator(`${sheet} .manuscript p`).first().click()
  await send('Change the new scene: one detail.')
  await idle()
  await page.locator(`${sheet} .pm-prop-btn.is-accept`).first().click()
  await until('the change in the new scene is not in the chapter', async () => (await body()).includes('e a corda cortada'))
  await settle()
  if ((await states())[0] !== 'accepted') fail(`a change in its new words made the first change wait again: ${JSON.stringify(await states())}`)
  if (await page.locator(`${sheet} .pm-prop`).count()) fail('an accepted change shows again as a proposal')
  if (times(await body(), NEW) !== 1) fail('the new scene is in the chapter more than one time')
  await shot('after-second-accept')

  // 3. Ctrl+Z outside the text undoes the last accepted change, and only it. Ctrl+Y does it again.
  await page.locator('.status-bar .status-left').click()
  await page.keyboard.press('Control+z')
  await until('Ctrl+Z did not undo the last accepted change', async () => ((await body()).includes('com a corda cortada') ? true : await body()))
  await until('Ctrl+Z did not make the last change wait again', async () => {
    const s = await states()
    return s[0] === 'accepted' && s[1] === 'pending' ? true : s
  })
  await page.keyboard.press('Control+y')
  await until('Ctrl+Y did not do the change again', async () => {
    const s = await states()
    return (await body()).includes('e a corda cortada') && s[0] === 'accepted' && s[1] === 'accepted' ? true : s
  })

  // 4. The author deletes words of the new scene: both changes stay accepted, and nothing comes back.
  await page.evaluate((words) => {
    const ed = window.__wordelia.editor()
    let at = null
    ed.state.doc.descendants((node, pos) => {
      if (at === null && node.isText && node.text.includes(words)) at = pos + node.text.indexOf(words)
    })
    ed.chain().focus().deleteRange({ from: at, to: at + words.length }).run()
  }, 'vazio ')
  await settle()
  if ((await states()).some((s) => s !== 'accepted')) fail(`an edit of the author made a change wait again: ${JSON.stringify(await states())}`)
  if (await page.locator(`${sheet} .pm-prop`).count()) fail('an edit of the author brought a change back as a proposal')
  await shot('after-author-edit')
}
