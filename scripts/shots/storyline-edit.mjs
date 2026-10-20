// The story line board by hand: add a card with a mention, the card dialog, drag cards (in a
// column, to another column) and columns, add, rename and delete columns, delete a card, Undo,
// rename a chapter. And the layout: no page scroll, cards of one size with one gap, mentions in
// their card, a drag image of the size of the card.
const BODY = [
  '# Cards',
  '- ^c1 @Elias acende a lâmpada do farol; falta um barco no porto.',
  '- ^c2 @Marta sobe a escada com café e conta da tempestade.',
  '- ^c3 Vinte e dois anos antes, a primeira noite de @Elias no farol.',
  '- ^c4 Os dois veem o bote azul nas pedras.',
  '- ^c5 Um estranho está deitado no bote azul, com um anel de prata e uma carta molhada que ninguém consegue ler, nem mesmo @Marta, que conhece todas as letras de @Santa Ilha.',
  '',
  '# By chapter',
  '## A Tempestade ^k1',
  '^c1 ^c2 ^c3',
  '',
  '## O Visitante ^k2',
  '^c4 ^c5',
  '',
  '# By order',
  '## Vinte e dois anos antes ^k4',
  '^c3',
  '',
  '## A noite da tempestade ^k5',
  '^c1 ^c2 ^c4 ^c5'
].join('\n')

export default async function ({ page, shot, openBook }) {
  const fail = (what) => {
    throw new Error(`Story line edit scenario: ${what}`)
  }
  const body = () => page.evaluate(() => window.__wordelia.book.getState().entries.find((e) => e.meta?.type === 'story-line')?.body ?? '')
  const refs = async (title) => {
    const lines = (await body()).split('\n')
    const i = lines.findIndex((l) => l.startsWith(`## ${title} `))
    return i >= 0 && lines[i + 1]?.startsWith('^') ? lines[i + 1].split(' ') : []
  }
  const textOf = async (id) => (await body()).split('\n').find((l) => l.startsWith(`- ^${id} `))?.slice(id.length + 4) ?? null
  const view = async (name) => {
    await page.locator('.line-switch .plan-switch-btn').nth(name === 'chapter' ? 0 : 1).click()
    await page.waitForTimeout(150)
  }
  const col = (title) => page.locator('.line-board .line-col', { has: page.locator('.line-col-title span', { hasText: title }) })
  const card = (text) => page.locator('.line-board .line-card', { hasText: text })
  const center = async (loc) => {
    const b = await loc.boundingBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }
  }
  // A drag with the pointer: press, move past 5 px, go to the target, and let go.
  const drag = async (from, to, { dy = 0, check } = {}) => {
    const a = await center(from)
    const z = await center(to)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(a.x + 10, a.y + 10, { steps: 3 })
    await page.mouse.move(z.x, z.y + dy, { steps: 14 })
    await page.waitForTimeout(150)
    if (check) await check(a.b)
    await page.mouse.up()
    await page.waitForTimeout(350)
  }

  await openBook()
  await page.evaluate(async (text) => {
    const s = window.__wordelia.book.getState()
    await s.createEntry('Plot', 'Linha da história', text, { meta: { type: 'story-line' } })
  }, BODY)
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(400)
  await page.locator('.plan-switch-btn').nth(2).click()
  await page.waitForSelector('.line-board .line-card', { timeout: 5000 })
  await view('chapter')

  // 1. The layout: no page scroll; one card size; one gap; the text stays in its card.
  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.line-board .line-card')]
    const heights = [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().height)))]
    const widths = [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().width)))]
    const gaps = new Set()
    for (const colEl of document.querySelectorAll('.line-board .line-col-body')) {
      const items = [...colEl.children].map((c) => c.getBoundingClientRect())
      for (let i = 1; i < items.length; i++) gaps.add(Math.round(items[i].top - items[i - 1].bottom))
    }
    // The text box and the bottom line stay in the card; the text does not go out of its box
    // sideways (a long name wraps). Lines after the third are cut, with "…".
    const outside = cards.filter((c) => {
      const box = c.getBoundingClientRect()
      const text = c.querySelector('.line-card-text')
      const parts = [text, c.querySelector('.line-card-meta')].map((m) => m.getBoundingClientRect())
      return text.scrollWidth > text.clientWidth + 1 || parts.some((r) => r.right > box.right + 0.5 || r.left < box.left - 0.5 || r.bottom > box.bottom + 0.5)
    }).length
    const wrap = document.querySelector('.line-wrap')
    const desk = document.querySelector('.plan-desk')
    return { heights, widths, gaps: [...gaps], outside, wrap: wrap.scrollHeight - wrap.clientHeight, desk: desk.scrollHeight - desk.clientHeight, clamp: getComputedStyle(document.querySelector('.line-card-text')).webkitLineClamp }
  })
  console.log(JSON.stringify(layout))
  if (layout.heights.length !== 1 || layout.widths.length !== 1) fail(`cards of many sizes: ${layout.heights} × ${layout.widths}`)
  if (layout.gaps.length !== 1) fail(`gaps of many sizes: ${layout.gaps}`)
  if (layout.outside) fail(`${layout.outside} cards with text outside them`)
  if (layout.wrap > 0 || layout.desk > 0) fail(`the page scrolls: ${layout.wrap}, ${layout.desk}`)
  await shot('board')

  // 2. A new card with a mention: "@Mar" finds Marta; Enter puts the name in the text.
  await col('O Visitante').locator('.line-add-card').click()
  await page.keyboard.type('@Mar')
  await page.waitForSelector('.line-suggest', { timeout: 3000 })
  const offered = await page.locator('.line-suggest-item').allInnerTexts()
  if (!offered.includes('Marta')) fail(`the suggestions are ${offered.join(', ')}`)
  await shot('mention-suggest')
  await page.keyboard.press('Enter')
  await page.keyboard.type('encontra um anel de prata.')
  await page.keyboard.press('Enter')
  // The box stays open for the next card.
  await page.waitForTimeout(200)
  if (!(await page.locator('.line-card.is-new textarea').isVisible())) fail('the box of the next card is not open')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const visitor = await refs('O Visitante')
  console.log(JSON.stringify({ visitor }))
  if (visitor.length !== 3) fail(`the chapter has ${visitor.length} cards`)
  const added = visitor[2].slice(1)
  if ((await textOf(added)) !== '@Marta encontra um anel de prata.') fail(`the new card says "${await textOf(added)}"`)

  // 3. The dialog: the full text, a new text and a moment.
  await card('Marta encontra um anel').click()
  await page.waitForSelector('.line-dialog', { timeout: 3000 })
  await shot('dialog')
  // Escape with the list of notes open closes the list, not the dialog.
  await page.locator('.line-dialog textarea').press('End')
  await page.keyboard.type(' @Eli')
  await page.waitForSelector('.line-suggest', { timeout: 2000 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  if (!(await page.locator('.line-dialog').isVisible())) fail('Escape with the list open closed the dialog')
  if (await page.locator('.line-suggest').count()) fail('Escape did not close the list')
  await page.locator('.line-dialog textarea').fill('@Marta encontra um anel de prata no bolso do visitante.')
  await page.locator('.line-dialog .select').nth(1).click()
  await page.locator('.select-content .menu-item', { hasText: 'A noite da tempestade' }).click()
  await page.locator('.line-dialog .dialog-foot .btn-primary').click()
  await page.waitForTimeout(300)
  if ((await textOf(added)) !== '@Marta encontra um anel de prata no bolso do visitante.') fail('the dialog did not save the text')
  if ((await refs('A noite da tempestade')).at(-1) !== `^${added}`) fail('the dialog did not put the card in the moment')

  // 4. A click on a mention opens its note.
  await card('Um estranho está deitado').locator('.line-mention', { hasText: 'Santa Ilha' }).click()
  await page.waitForTimeout(300)
  const opened = await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    return s.entries.find((e) => e.id === s.activeEntryId)?.name ?? null
  })
  if (opened !== 'Santa Ilha') fail(`the mention opened "${opened}"`)
  await page.evaluate(() => window.__wordelia.book.getState().selectCategory(':line'))
  await page.waitForSelector('.line-board .line-card', { timeout: 3000 })

  // 5. Drag a card up in its column. The drag image has the size of the card.
  let lifted = null
  await drag(card('Vinte e dois anos antes'), card('acende a lâmpada'), {
    dy: -20,
    check: async (from) => {
      // The size of the box, without its small tilt.
      const img = await page.evaluate(() => {
        const el = document.querySelector('.line-card.is-lifted')
        return el ? { w: el.offsetWidth, h: el.offsetHeight } : null
      })
      const real = await page.evaluate(() => {
        const el = document.querySelector('.line-board .line-card')
        return { w: el.offsetWidth, h: el.offsetHeight }
      })
      lifted = img && { ...img, cw: real.w, ch: real.h, box: Math.round(from.height) }
      await shot('drag')
    }
  })
  console.log(JSON.stringify({ lifted }))
  if (!lifted || lifted.w !== lifted.cw || lifted.h !== lifted.ch) fail(`the drag image is ${JSON.stringify(lifted)}`)
  if ((await refs('A Tempestade')).join(' ') !== '^c3 ^c1 ^c2') fail(`the order is ${(await refs('A Tempestade')).join(' ')}`)
  // No dialog after a drag.
  if (await page.locator('.line-dialog').count()) fail('a drag opened the card')

  // 6. Drag a card to another column, by time.
  await view('order')
  await drag(card('Os dois veem o bote'), col('Vinte e dois anos antes').locator('.line-add-card'))
  if ((await refs('Vinte e dois anos antes')).join(' ') !== '^c3 ^c4') fail(`the moment has ${(await refs('Vinte e dois anos antes')).join(' ')}`)
  if ((await refs('O Visitante')).includes('^c4') === false) fail('the drag by time changed the chapter')

  // 7. Columns: add two moments, move one by its grip, rename it, delete one and Undo.
  await page.locator('.line-add-col-btn').click()
  await page.keyboard.type('A manhã seguinte')
  await page.keyboard.press('Enter')
  await page.keyboard.type('O enterro')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  const moments = () => page.evaluate(() => [...document.querySelectorAll('.line-board .line-col.is-moment .line-col-title span')].map((e) => e.textContent))
  if ((await moments()).join('|') !== 'Vinte e dois anos antes|A noite da tempestade|A manhã seguinte|O enterro') fail(`moments: ${(await moments()).join(', ')}`)
  await drag(col('O enterro').locator('.line-col-grip'), col('Vinte e dois anos antes').locator('.line-col-head'))
  if ((await moments())[0] !== 'O enterro') fail(`the column did not move: ${(await moments()).join(', ')}`)
  await col('O enterro').locator('.line-col-title').dblclick()
  await page.waitForFunction(() => document.activeElement?.classList.contains('line-col-input'), null, { timeout: 2000 })
  await page.keyboard.press('Control+a')
  await page.keyboard.type('O velório')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  if ((await moments())[0] !== 'O velório') fail('the rename did not work')
  await shot('columns')
  await col('A noite da tempestade').locator('.line-col-menu').click()
  await page.locator('.menu .menu-item.is-danger').click()
  await page.waitForTimeout(300)
  const tray = await page.locator('.line-col.is-tray .line-card').count()
  if (tray !== 4) fail(`the tray has ${tray} cards`)
  await shot('tray')
  await page.locator('.toast button', { hasText: /undo|desfazer/i }).first().click()
  await page.waitForTimeout(300)
  if ((await refs('A noite da tempestade')).length !== 4) fail('Undo did not bring the column back')
  if (await page.locator('.line-col.is-tray').count()) fail('the tray stays after Undo')

  // 8. Delete a card in its dialog, then Undo.
  await card('Um estranho está deitado').click()
  await page.locator('.line-dialog-delete').click()
  await page.waitForTimeout(300)
  if ((await textOf('c5')) !== null) fail('the card was not deleted')
  await page.locator('.toast button', { hasText: /undo|desfazer/i }).first().click()
  await page.waitForTimeout(300)
  if (!(await textOf('c5'))) fail('Undo did not bring the card back')

  // 9. A chapter column renames its chapter, and the column follows a rename in the book.
  await view('chapter')
  await col('O Visitante').locator('.line-col-menu').click()
  await page.locator('.menu .menu-item', { hasText: /rename the chapter|renomear o capítulo/i }).click()
  await page.waitForTimeout(150)
  if (!(await page.evaluate(() => document.activeElement?.classList.contains('line-col-input')))) fail('the title box has no focus after Rename')
  await page.keyboard.press('Control+a')
  await page.keyboard.type('O Bote Azul')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const renamed = await page.evaluate(() => window.__wordelia.book.getState().chapters.map((c) => c.title))
  if (!renamed.includes('O Bote Azul')) fail(`chapters: ${renamed.join(', ')}`)
  if (!(await body()).includes('## O Bote Azul ^k2')) fail('the column did not follow the new title')
  await shot('renamed')

  // 10. The keyboard: Space picks up a card, an arrow moves it to the next column, Space drops it.
  await view('order')
  const kb = card('Os dois veem o bote')
  await kb.focus()
  await page.keyboard.press('Space')
  await page.waitForTimeout(150)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  await page.keyboard.press('Space')
  await page.waitForTimeout(400)
  // The column to the right of "Vinte e dois anos antes".
  const after = await refs('A noite da tempestade')
  console.log(JSON.stringify({ keyboard: after }))
  if (!after.includes('^c4')) fail(`the keyboard did not move the card: ${after.join(' ')}`)
  // Enter on a card opens it.
  await card('Os dois veem o bote').focus()
  await page.keyboard.press('Enter')
  await page.waitForSelector('.line-dialog', { timeout: 2000 })
  await page.keyboard.press('Escape')
}
