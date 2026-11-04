// A chat proposal that adds more text than a page holds: the green text has the pages that the text will
// have. 1. New paragraphs at the end of a chapter. 2. A long new passage inside a paragraph. While the
// proposal shows, each page has the size of the book page, and Accept gives the same number of pages.
// Usage: node scripts/shot.mjs proposalpages
export default async function ({ page, shot, openBook }) {
  const fail = (what) => {
    throw new Error(`Proposal pages scenario: ${what}`)
  }
  const idle = () => page.waitForSelector('.composer-send:not(.is-stop)', { timeout: 30000 })
  const send = async (text) => {
    await page.locator('.composer-input').fill(text)
    await page.keyboard.press('Enter')
  }
  const until = async (what, check, ms = 10000) => {
    let last
    for (let i = 0; i < ms / 100; i++) {
      last = await check()
      if (last === true) return
      await page.waitForTimeout(100)
    }
    fail(`${what}: ${JSON.stringify(last)}`)
  }
  const sheet = '.page[data-chapter="ch_sample01"]'
  // The height of each page of the first chapter: from the top of the sheet, or the end of a band between two
  // pages, to the next band, or to the end of the sheet.
  const pages = () =>
    page.evaluate((sel) => {
      const s = document.querySelector(sel).getBoundingClientRect()
      const bands = [...document.querySelectorAll(`${sel} .pm-page-band`)].map((b) => b.getBoundingClientRect()).sort((a, b) => a.top - b.top)
      const tops = [s.top, ...bands.map((b) => b.bottom)]
      const bottoms = [...bands.map((b) => b.top), s.bottom]
      return tops.map((t, i) => Math.round(bottoms[i] - t))
    }, sheet)
  /** True when all the pages have the same height; else the heights, for the message. */
  const even = async (atLeast) => {
    const h = await pages()
    return h.length >= atLeast && h.every((x) => Math.abs(x - h[0]) <= 2) ? true : h
  }

  await openBook()
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ chatOpen: true, chatWidth: 400 }))
  await page.locator(`${sheet} .manuscript p`).first().click()
  const first = await pages()
  console.log('pages before:', JSON.stringify(first))

  // 1. New paragraphs at the end: they go on to new pages, like text.
  await send('Continue the chapter with a long passage at the end.')
  await idle()
  await page.waitForSelector(`${sheet} .pm-prop-append`, { timeout: 10000 })
  await until('the new paragraphs at the end made a page taller than the others', () => even(first.length + 2))
  const preview = await pages()
  console.log('pages with the new paragraphs:', JSON.stringify(preview))
  await page.locator(`${sheet} .pm-prop-append`).scrollIntoViewIfNeeded()
  await shot('append')
  await page.locator(`${sheet} .pm-prop-append .pm-prop-btn.is-accept`).click()
  await page.waitForFunction(() => window.__wordelia.book.getState().chapters[0].body.includes('Elias desceu a escada de ferro'), null, { timeout: 5000 })
  await until('the pages after Accept are not the pages of the proposal', async () => {
    const h = await pages()
    return h.length === preview.length && h.every((x) => Math.abs(x - h[0]) <= 2) ? true : h
  })

  // 2. A long passage inside the first paragraph: the page gaps go into the new words.
  const before = await pages()
  await page.locator(`${sheet} .manuscript p`).first().click()
  await send('Make the first paragraph a long passage.')
  await idle()
  await page.waitForSelector(`${sheet} .pm-prop .ai-ins`, { timeout: 10000 }).catch(() => page.waitForSelector(`${sheet} .ai-ins`, { timeout: 5000 }))
  await until('the long passage in a paragraph made a page taller than the others', () => even(before.length + 1))
  const inside = await pages()
  console.log('pages with the long passage:', JSON.stringify(inside))
  const gapsInWords = await page.evaluate((sel) => document.querySelectorAll(`${sel} .ai-ins-host .pm-page-gap`).length, sheet)
  if (!gapsInWords) fail('no page gap is in the new words')
  await page.locator(`${sheet} .ai-ins-host .pm-page-gap`).first().scrollIntoViewIfNeeded()
  await shot('inside')
  // The other views of a change: "old over new" and "new text only". The pages stay even in each one.
  for (const [view, cls] of [['stacked', 'ai-ins-stacked'], ['new', 'ai-ins-new']]) {
    await page.evaluate((v) => {
      const app = window.__wordelia.app.getState()
      app.updateSettings({ editor: { ...app.settings.editor, diffView: v } })
    }, view)
    await page.waitForSelector(`${sheet} .${cls}`, { timeout: 5000 })
    await until(`the long passage in the "${view}" view made a page taller than the others`, () => even(before.length + 1))
    console.log(`pages in the "${view}" view:`, JSON.stringify(await pages()))
    await page.locator(`${sheet} .ai-ins-host .pm-page-gap`).first().scrollIntoViewIfNeeded()
    await shot(`inside-${view}`)
  }
  await page.evaluate(() => {
    const app = window.__wordelia.app.getState()
    app.updateSettings({ editor: { ...app.settings.editor, diffView: 'words' } })
  })
  await page.waitForFunction((sel) => !document.querySelector(`${sel} .ai-ins-new`), sheet, { timeout: 5000 })
  await page.locator(`${sheet} .pm-prop-btn.is-accept`).first().click()
  await page.waitForFunction(() => !document.querySelector('.page[data-chapter="ch_sample01"] .ai-ins'), null, { timeout: 5000 })
  await until('the pages after Accept are not the pages of the proposal', async () => {
    const h = await pages()
    return h.length === inside.length && h.every((x) => Math.abs(x - h[0]) <= 2) ? true : h
  })
  await shot('accepted')
}
