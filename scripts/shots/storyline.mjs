// The story line board: the empty board and its banner, a fill by the AI shown as a diff on the
// board (accept and reject), the two views, "you are here", and a move asked in the chat.
export default async function ({ page, shot, openBook }) {
  const fail = (what) => {
    throw new Error(`Story line scenario: ${what}`)
  }
  const story = () => page.evaluate(() => window.__wordelia.book.getState().entries.find((e) => e.meta?.type === 'story-line') ?? null)
  const idle = () => page.waitForSelector('.composer-send:not(.is-stop)', { timeout: 30000 })
  const view = (name) => page.locator('.line-switch .plan-switch-btn').nth(name === 'chapter' ? 0 : 1).click()
  const board = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.line-board .line-col')].map((c) => ({
        key: c.dataset.column,
        title: c.querySelector('.line-col-title span')?.textContent ?? '',
        here: c.classList.contains('is-here'),
        cards: [...c.querySelectorAll('.line-card')].map((x) => x.querySelector('.line-card-text').textContent)
      }))
    )

  await openBook()
  await page.waitForTimeout(400)

  // 1. The Line view of a book without a story line: the written chapters, empty, and the banner.
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(500)
  await page.locator('.plan-switch-btn').nth(2).click()
  await page.waitForSelector('.line-board', { timeout: 5000 })
  await view('chapter')
  await page.waitForTimeout(200)
  const empty = await board()
  console.log(JSON.stringify(empty))
  if (empty.map((c) => c.title).join('|') !== 'A Tempestade|O Visitante') fail(`the empty board has ${empty.map((c) => c.title).join(', ')}`)
  if (!empty[1].here || empty[0].here) fail('you are here is not on the last chapter')
  if (!(await page.locator('.line-bar.is-banner').isVisible())) fail('no banner')
  await shot('empty')
  // The "+" column is as high as an empty column; the title and the switches are where the other modes have them.
  const geo = () =>
    page.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect()
      return { col: r('.line-col')?.height, add: r('.line-add-col')?.height, h1: r('.plan-desk h1').top, sw: r('.plan-desk .plan-switch').left }
    })
  const line = await geo()
  await page.locator('.plan-switch-btn').nth(1).click()
  await page.waitForSelector('.map-stats', { timeout: 5000 })
  const map = await geo()
  await page.locator('.plan-switch-btn').nth(2).click()
  await page.waitForSelector('.line-board', { timeout: 5000 })
  console.log(JSON.stringify({ line, map }))
  if (Math.abs(line.col - line.add) > 0.5) fail(`the "+" column is ${line.add} high, a column ${line.col}`)
  if (Math.abs(line.h1 - map.h1) > 0.5 || Math.abs(line.sw - map.sw) > 0.5) fail(`the header of the line moved: ${JSON.stringify({ line, map })}`)
  await view('order')
  await page.waitForTimeout(200)
  if ((await board()).length) fail('the empty board by time has columns')
  await shot('empty-time')
  await view('chapter')

  // 2. The banner opens a new chat thread with a draft. The author completes it and sends it.
  await page.locator('.line-bar.is-banner .btn').click()
  await page.waitForSelector('.composer-input', { timeout: 5000 })
  await page.waitForTimeout(400)
  const draft = await page.locator('.composer-input').innerText()
  if (!/^(Fill my story line|Popule minha Linha da história)/.test(draft)) fail(`the draft is "${draft}"`)
  await page.keyboard.type('Elias, Marta e o visitante do bote azul.')
  await page.keyboard.press('Enter')
  await idle()
  await page.waitForSelector('.proposal.is-line', { timeout: 10000 })
  await shot('chat-card')

  // 3. The proposal shows on the board: all new, nothing saved yet.
  await page.waitForSelector('.line-board.is-review', { timeout: 5000 })
  const added = await page.locator('.line-board.is-review .line-card.is-added').count()
  if (added !== 6) fail(`${added} new cards on the board`)
  if (await story()) fail('the story line exists before the author accepts it')
  await shot('review-chapter')
  await view('order')
  await page.waitForTimeout(200)
  await shot('review-time')

  // 4. Accept on the board.
  await page.locator('.line-bar.is-review .btn-primary').click()
  await page.waitForTimeout(600)
  const made = await story()
  if (!made) fail('the story line was not created')
  if (await page.locator('.line-board.is-review').count()) fail('the board still shows the proposal')
  const time = await board()
  console.log(JSON.stringify(time))
  if (time.map((c) => c.title).join('|') !== 'Vinte e dois anos antes|A noite da tempestade|A manhã seguinte') fail(`moments: ${time.map((c) => c.title).join(', ')}`)
  if (!time[1].here) fail('you are here is not on the moment of the last chapter')
  await shot('time')
  await view('chapter')
  await page.waitForTimeout(200)
  const chapter = await board()
  if (chapter.map((c) => c.cards.length).join(',') !== '3,2,1') fail(`cards by chapter: ${chapter.map((c) => c.cards.length).join(',')}`)
  await shot('chapter')

  const momentOf = async (id) => {
    const lines = (await story()).body.split('\n')
    let moment = null
    let inOrder = false
    for (const line of lines) {
      if (line.startsWith('# ')) inOrder = line === '# By order'
      if (inOrder && line.startsWith('## ')) moment = line.slice(3).replace(/ \^\w+$/, '')
      if (inOrder && line.split(' ').includes(`^${id}`)) return moment
    }
    return null
  }

  // 5. Ask the chat to move a card. By time, the card is red where it is and green where it goes,
  // each with Apply and Reject. One card in the chat for the reply. Apply the green one: the card moves.
  await page.locator('.composer-input').click()
  await page.keyboard.type('Mova o último acontecimento para o começo.')
  await page.keyboard.press('Enter')
  await idle()
  await page.waitForSelector('.line-bar.is-review', { timeout: 10000 })
  if ((await momentOf('c6')) !== 'A manhã seguinte') fail('the card moved before the author decided')
  const cards = await page.locator('.msg-ai').last().locator('.proposal.is-line').count()
  if (cards !== 1) fail(`${cards} story line cards in the chat for one reply`)
  await view('order')
  await page.waitForTimeout(200)
  const slots = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.line-board.is-review .line-slot:not(.is-same)')].map((s) => ({
        column: s.closest('.line-col').dataset.column,
        tone: s.classList.contains('is-add') ? 'add' : 'remove',
        text: s.querySelector('.line-card-text').textContent
      }))
    )
  const move = await slots()
  console.log(JSON.stringify(move))
  if (move.length !== 2 || !move.every((s) => s.text.startsWith('O visitante acorda'))) fail(`the move shows ${JSON.stringify(move)}`)
  if (!move.some((s) => s.tone === 'add' && s.column === 'k4') || !move.some((s) => s.tone === 'remove' && s.column === 'k6')) fail(`the move shows ${JSON.stringify(move)}`)
  if (await page.locator('.line-card.is-moved, .line-tag').count()) fail('a "moved" mark is still there')
  await shot('review-move')
  await page.locator('.line-slot.is-add .line-decide-btn.is-apply').click()
  await page.waitForTimeout(500)
  if ((await momentOf('c6')) !== 'Vinte e dois anos antes') fail(`the card is in ${await momentOf('c6')}`)
  if (await page.locator('.line-board.is-review').count()) fail('the board still shows the proposal')
  const applied = await page.locator('.msg-ai').last().locator('.proposal.is-line').innerText()
  if (!/applied|aplicad/i.test(applied)) fail(`the chat card says "${applied}"`)

  // 6. Ask again: reject the green card, apply the red one. The card leaves its moment and waits in
  // "No moment"; the rest stays.
  await page.locator('.composer-input').click()
  await page.keyboard.type('Mova o último acontecimento de novo.')
  await page.keyboard.press('Enter')
  await idle()
  await page.waitForSelector('.line-slot.is-add', { timeout: 10000 })
  const second = await slots()
  console.log(JSON.stringify(second))
  await page.locator('.line-slot.is-add .line-decide-btn:not(.is-apply)').click()
  await page.waitForTimeout(300)
  if (await page.locator('.line-slot.is-add').count()) fail('the rejected card still shows')
  if (!(await page.locator('.line-slot.is-remove').count())) fail('the other change went away with the rejected one')
  await shot('review-half')
  // The line changes by another way meanwhile (for example another proposal): a new card. It is not
  // a change of this proposal, and "Apply all" keeps it.
  await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const line = s.entries.find((e) => e.meta?.type === 'story-line')
    s.updateEntry(line.id, { body: line.body.replace('# Cards\n', '# Cards\n- ^c99 Um cartão do autor.\n') })
  })
  await page.waitForTimeout(300)
  if (await page.locator('.line-slot.is-remove', { hasText: 'Um cartão do autor' }).count()) fail('the card of the author shows as a change of the proposal')
  await page.locator('.line-bar.is-review .btn-primary').click()
  await page.waitForTimeout(500)
  if (await page.locator('.line-board.is-review').count()) fail('the board still shows the proposal')
  if (!(await story()).body.includes('Um cartão do autor.')) fail('"Apply all" deleted a card that the proposal does not have')
  // The mock moves the last card of the last moment with cards: "Um estranho…" (c5).
  if (!second.every((s) => s.text.startsWith('Um estranho'))) fail(`the second move shows ${JSON.stringify(second)}`)
  if ((await momentOf('c5')) !== null) fail(`the card is still in ${await momentOf('c5')}`)
  if (!(await page.locator('.line-col.is-tray').count())) fail('no "No moment" column')

  // 7. Ask again, and reject all on the board: nothing changes.
  const before = (await story()).body
  await page.locator('.composer-input').click()
  await page.keyboard.type('Mova o último acontecimento mais uma vez.')
  await page.keyboard.press('Enter')
  await idle()
  await page.waitForSelector('.line-bar.is-review', { timeout: 10000 })
  await page.locator('.line-bar.is-review .btn-secondary').click()
  await page.waitForTimeout(400)
  if ((await story()).body !== before) fail('a rejected proposal changed the line')
  if (await page.locator('.line-board.is-review').count()) fail('the board still shows the rejected proposal')
  const badge = await page.locator('.proposal.is-line').last().innerText()
  if (!/rejected|rejeitad/i.test(badge)) fail(`the chat card says "${badge}"`)

  // 8. A chapter gets a new title: its column follows.
  await page.evaluate(async () => {
    const s = window.__wordelia.book.getState()
    await s.renameChapter(s.chapters.find((c) => c.title === 'O Visitante').id, 'O Bote Azul')
  })
  await page.waitForTimeout(400)
  if (!(await story()).body.includes('## O Bote Azul ^k2')) fail('the column did not follow the new title')

  // 9. The Write view: the cards of the open chapter.
  await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    s.selectChapter(s.chapters[0].id)
  })
  await page.waitForTimeout(600)
  const mini = await page.locator('.line-mini').innerText().catch(() => '')
  console.log(JSON.stringify({ mini }))
  if (!/chapter 1 in the line|capítulo 1 na linha/i.test(mini) || !mini.includes('Elias acende a lâmpada')) fail(`the Write card says "${mini}"`)
  await shot('write-card')
  await page.locator('.line-mini').click()
  await page.waitForSelector('.line-board', { timeout: 3000 })

  // 10. The story line is not a note: not in the lists of Plan, not on the map.
  const plot = await page.evaluate(() => document.querySelector('.plan-nav')?.innerText ?? '')
  if (/linha da história/i.test(plot)) fail('the sidebar lists the story line')
  await page.locator('.plan-switch-btn').nth(1).click()
  await page.waitForSelector('.map-stats', { timeout: 5000 })
  const stats = await page.locator('.map-stats').innerText()
  if (!/^3 /.test(stats)) fail(`the map shows "${stats}"`)
}
