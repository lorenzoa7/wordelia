// The story line: build it from a planning note through the chat (the scripted AI replies with a
// <create>), accept it, and read the Line view: lanes, moments, a meeting over its lanes, mentions
// with their icons, written and planned cards, and "you are here" on the moment of the open chapter.
// Then ask the chat to move an event, drag a card, and look at the card of the Write view.
export default async function ({ page, shot, openBook }) {
  const fail = (what) => {
    throw new Error(`Story line scenario: ${what}`)
  }
  const story = () => page.evaluate(() => window.__wordelia.book.getState().entries.find((e) => e.meta?.type === 'story-line') ?? null)
  const idle = () => page.waitForSelector('.composer-send:not(.is-stop)', { timeout: 30000 })

  await openBook()
  await page.waitForTimeout(400)

  // 1. The Line view without a story line: the build button.
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(500)
  await page.locator('.plan-switch-btn').nth(2).click()
  await page.waitForSelector('.line-empty', { timeout: 5000 })
  await shot('empty')

  // 2. Build it from the note of Marta, through the chat.
  await page.locator('.line-empty .btn').click()
  await page.waitForSelector('.line-build', { timeout: 5000 })
  const options = await page.locator('.line-source').count()
  if (options !== 3) fail(`the dialog has ${options} sources`)
  await shot('build-dialog')
  await page.locator('.line-build .dialog-foot .btn-primary').click()
  await idle()
  await page.waitForSelector('.proposal.is-create', { timeout: 10000 })
  const asked = await page.locator('.msg-user').last().innerText()
  if (!/linha da história|story line/i.test(asked)) fail(`the chat got "${asked}"`)
  await page.locator('.proposal.is-create .proposal-btn.is-accept').click()
  await page.waitForTimeout(600)
  const made = await story()
  if (!made) fail('the story line was not created')
  console.log(JSON.stringify({ file: made.file }))

  // 3. The Line view: lanes, moments, cards.
  await page.waitForSelector('.line-grid', { timeout: 5000 })
  const view = await page.evaluate(() => ({
    lanes: [...document.querySelectorAll('.line-lane-name')].map((e) => e.textContent),
    moments: [...document.querySelectorAll('.line-moment-label')].map((e) => e.textContent),
    cards: document.querySelectorAll('.line-card').length,
    planned: document.querySelectorAll('.line-card.is-planned').length,
    meetings: [...document.querySelectorAll('.line-cell.is-meeting')].map((m) => Math.round(m.getBoundingClientRect().height)),
    lane: Math.round(document.querySelector('.line-lane').getBoundingClientRect().height),
    mentions: [...document.querySelectorAll('.line-card .mention-pill')].map((p) => p.textContent),
    icons: document.querySelectorAll('.line-card .mention-pill svg').length,
    here: document.querySelector('.line-moment.is-here .line-moment-label')?.textContent ?? null
  }))
  console.log(JSON.stringify(view))
  if (view.lanes.join('|') !== 'Elias|Marta|O visitante|Passado') fail(`lanes: ${view.lanes.join(', ')}`)
  if (view.moments.length !== 3) fail(`moments: ${view.moments.join(', ')}`)
  if (view.cards !== 6) fail(`${view.cards} cards`)
  if (view.planned !== 3) fail(`${view.planned} planned cards`)
  // The meeting of three lanes is as tall as three lanes.
  if (!view.meetings.some((h) => h > view.lane * 2.5)) fail(`no meeting over three lanes: ${view.meetings.join(', ')} (a lane is ${view.lane})`)
  if (!view.mentions.includes('Elias') || view.icons < view.mentions.length) fail(`mentions: ${view.mentions.join(', ')}`)
  if (view.here !== '1') fail(`you are here: ${view.here}`)
  await shot('line')

  const momentOf = (text) =>
    page.evaluate((text) => {
      const body = window.__wordelia.book.getState().entries.find((e) => e.meta?.type === 'story-line').body
      let moment = 0
      for (const line of body.split('\n')) {
        if (line.startsWith('## ')) moment++
        if (line.includes(text)) return { moment, line }
      }
      return null
    }, text)

  // 4. Ask the chat to move an event: the AI proposes an edit; the card moves when the author accepts.
  await page.locator('.composer-input').fill('Mova o último acontecimento para o começo.')
  await page.keyboard.press('Enter')
  await idle()
  await page.waitForSelector('.proposal:not(.is-create) .proposal-btn.is-accept', { timeout: 10000 })
  if ((await momentOf('O visitante acorda no farol'))?.moment !== 3) fail('the event moved before the author accepted')
  await page.locator('.proposal:not(.is-create) .proposal-btn.is-accept').last().click()
  await page.waitForTimeout(600)
  const moved = await momentOf('O visitante acorda no farol')
  console.log(JSON.stringify({ moved }))
  if (moved?.moment !== 1) fail(`the chat did not move the event: ${JSON.stringify(moved)}`)
  await shot('moved-by-chat')

  // 5. Drag a card to another moment and lane: only its line changes. The drag events go to the
  // page (a drag of the system mouse holds the hidden test window on Windows).
  const dt = await page.evaluateHandle(() => new DataTransfer())
  await page.locator('.line-card', { hasText: 'Um estranho está deitado' }).dispatchEvent('dragstart', { dataTransfer: dt })
  const zone = page.locator('.line-drop[aria-label="3 · Marta"]')
  await zone.waitFor({ timeout: 5000 })
  await zone.dispatchEvent('dragover', { dataTransfer: dt })
  await zone.dispatchEvent('drop', { dataTransfer: dt })
  await page.waitForTimeout(500)
  const dragged = await momentOf('Um estranho está deitado')
  console.log(JSON.stringify({ dragged }))
  if (dragged?.moment !== 3 || !dragged.line.startsWith('- Marta: ')) fail(`the drag did not move the card: ${JSON.stringify(dragged)}`)

  // 6. A chapter gets a new title: its links follow.
  await page.evaluate(async () => {
    const s = window.__wordelia.book.getState()
    await s.renameChapter(s.chapters.find((c) => c.title === 'O Visitante').id, 'O Bote Azul')
  })
  await page.waitForTimeout(400)
  const linked = await story()
  if (!linked.body.includes('[[O Bote Azul]]') || linked.body.includes('[[O Visitante]]')) fail('the links did not follow the new title')

  // 7. The Write view: the card of the open chapter.
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(600)
  const mini = await page.locator('.line-mini').innerText().catch(() => '')
  console.log(JSON.stringify({ mini }))
  if (!/moment(o)? 1/i.test(mini) || !mini.includes('Elias acende a lâmpada')) fail(`the Write card says "${mini}"`)
  await shot('write-card')

  // 8. The map does not show the story line: it would link to everyone.
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(400)
  await page.locator('.plan-switch-btn').nth(1).click()
  await page.waitForSelector('.map-stats', { timeout: 5000 })
  const stats = await page.locator('.map-stats').innerText()
  if (!/^3 /.test(stats)) fail(`the map shows "${stats}"`)
}
